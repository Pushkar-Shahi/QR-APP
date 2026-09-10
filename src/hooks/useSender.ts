import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getIceServers } from "@/lib/ice.functions";
import { getDeviceLabel } from "@/lib/transfer/files";
import { emptyProgress, SpeedMeter, type TransferProgressState } from "@/lib/transfer/metrics";
import { buildMeta, generateSessionId, type SelectedFile, type TransferMeta } from "@/lib/transfer/protocol";
import { sendFiles, TransferAborted } from "@/lib/transfer/sender";
import { createSignaling, type Signaling, type SignalMessage } from "@/lib/transfer/signaling";
import { configureChannel, createPeerConnection, DEFAULT_ICE_SERVERS, IceQueue, waitForChannelOpen } from "@/lib/transfer/webrtc";

export type SenderStatus =
  | "idle"
  | "preparing"
  | "waiting"
  | "receiver-joined"
  | "connecting"
  | "transferring"
  | "complete"
  | "rejected"
  | "cancelled"
  | "error";

export interface SenderState {
  status: SenderStatus;
  sessionId: string | null;
  url: string | null;
  meta: TransferMeta | null;
  progress: TransferProgressState;
  error: string | null;
  connectionType: string | null;
}

const initial: SenderState = {
  status: "idle",
  sessionId: null,
  url: null,
  meta: null,
  progress: emptyProgress(),
  error: null,
  connectionType: null,
};

export function useSender() {
  const [state, setState] = useState<SenderState>(initial);
  const fetchIce = useServerFn(getIceServers);

  const signalingRef = useRef<Signaling | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const filesRef = useRef<SelectedFile[]>([]);
  const metaRef = useRef<TransferMeta | null>(null);
  const receiverRef = useRef<string | null>(null);
  const progressRef = useRef<TransferProgressState>(emptyProgress());
  const meterRef = useRef(new SpeedMeter());
  const flushTimer = useRef<number | null>(null);

  const patch = useCallback((p: Partial<SenderState>) => setState((s) => ({ ...s, ...p })), []);

  const teardown = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    signalingRef.current?.close();
    signalingRef.current = null;
    if (flushTimer.current) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const startProgressLoop = useCallback(() => {
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = window.setInterval(() => {
      const meter = meterRef.current;
      const p = progressRef.current;
      meter.record(p.bytesDone);
      patch({
        progress: {
          ...p,
          speed: meter.speed,
          eta: meter.eta(p.bytesDone, p.totalBytes),
          elapsed: meter.elapsed,
          percent: p.totalBytes ? (p.bytesDone / p.totalBytes) * 100 : 100,
        },
      });
    }, 200);
  }, [patch]);

  const stopProgressLoop = useCallback(() => {
    if (flushTimer.current) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
    const p = progressRef.current;
    patch({
      progress: {
        ...p,
        speed: 0,
        eta: 0,
        elapsed: meterRef.current.elapsed,
        percent: p.totalBytes ? (p.bytesDone / p.totalBytes) * 100 : 100,
      },
    });
  }, [patch]);

  const beginTransfer = useCallback(
    async (signaling: Signaling) => {
      const meta = metaRef.current!;
      patch({ status: "connecting" });

      let iceServers = DEFAULT_ICE_SERVERS;
      try {
        iceServers = (await fetchIce()).iceServers;
      } catch {
        /* fall back to public STUN */
      }

      const abort = new AbortController();
      abortRef.current = abort;

      const pc = createPeerConnection(iceServers, {
        onIceCandidate: (candidate) => void signaling.send({ type: "ice", candidate }),
        onConnectionState: (s) => {
          if (s === "failed") {
            patch({ status: "error", error: "Peer connection failed. Both devices may be behind strict firewalls (a TURN relay is required)." });
            teardown();
          }
        },
      });
      pcRef.current = pc;
      const iceQueue = new IceQueue(pc);

      const dc = configureChannel(pc.createDataChannel("qrdrop", { ordered: true }));

      const unsub = signaling.on(async (msg) => {
        if (msg.type === "answer") {
          await pc.setRemoteDescription(msg.sdp);
          await iceQueue.remoteReady();
        } else if (msg.type === "ice") {
          await iceQueue.add(msg.candidate);
        }
      });

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await signaling.send({ type: "offer", sdp: offer });
        await waitForChannelOpen(dc);

        // Figure out whether we're direct or relayed (informational).
        try {
          const stats = await pc.getStats();
          stats.forEach((r) => {
            if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) {
              const local = stats.get(r.localCandidateId);
              patch({ connectionType: local?.candidateType === "relay" ? "relayed" : "direct" });
            }
          });
        } catch {
          /* ignore */
        }

        progressRef.current = emptyProgress(meta.totalBytes, meta.files.length);
        meterRef.current.reset();
        patch({ status: "transferring", progress: progressRef.current });
        startProgressLoop();

        await sendFiles(
          dc,
          filesRef.current,
          meta,
          (p) => {
            const fm = meta.files[p.fileIndex];
            progressRef.current = {
              ...progressRef.current,
              bytesDone: p.bytesDone,
              currentFileIndex: p.fileIndex,
              currentFileBytes: p.fileBytes,
              currentFileSize: fm?.size ?? 0,
              filesDone: p.filesDone,
            };
          },
          abort.signal,
        );

        stopProgressLoop();
        patch({ status: "complete" });
        void signaling.send({ type: "bye" });
      } catch (err) {
        stopProgressLoop();
        if (err instanceof TransferAborted) return;
        patch({ status: "error", error: (err as Error).message });
      } finally {
        unsub();
        // keep pc open briefly so the ACK/bye lands, then close
        setTimeout(() => pc.close(), 1000);
      }
    },
    [fetchIce, patch, startProgressLoop, stopProgressLoop, teardown],
  );

  const start = useCallback(
    async (files: SelectedFile[]) => {
      teardown();
      receiverRef.current = null;
      const sessionId = generateSessionId();
      const meta = buildMeta(files, getDeviceLabel());
      filesRef.current = files;
      metaRef.current = meta;
      const url = `${window.location.origin}/r/${sessionId}`;
      setState({ ...initial, status: "preparing", sessionId, url, meta, progress: emptyProgress(meta.totalBytes, files.length) });

      const signaling = createSignaling(sessionId, "sender");
      signalingRef.current = signaling;

      signaling.on((msg: SignalMessage) => {
        switch (msg.type) {
          case "hello": {
            if (receiverRef.current && receiverRef.current !== msg.peerId) {
              void signaling.send({ type: "busy" });
              return;
            }
            receiverRef.current = msg.peerId;
            void signaling.send({ type: "meta", meta, peerId: msg.peerId });
            setState((s) => (s.status === "waiting" || s.status === "preparing" ? { ...s, status: "receiver-joined" } : s));
            break;
          }
          case "accept":
            void beginTransfer(signaling);
            break;
          case "reject":
            patch({ status: "rejected" });
            teardown();
            break;
          case "cancel":
            abortRef.current?.abort();
            patch({ status: "cancelled", error: "The receiver cancelled the transfer." });
            teardown();
            break;
          default:
            break;
        }
      });

      try {
        await signaling.ready;
        patch({ status: "waiting" });
      } catch (err) {
        patch({ status: "error", error: `Could not open a signaling channel: ${(err as Error).message}` });
      }
    },
    [beginTransfer, patch, teardown],
  );

  const cancel = useCallback(() => {
    void signalingRef.current?.send({ type: "cancel" });
    abortRef.current?.abort();
    setTimeout(teardown, 200);
    patch({ status: "cancelled", error: null });
  }, [patch, teardown]);

  const reset = useCallback(() => {
    teardown();
    setState(initial);
  }, [teardown]);

  return { state, start, cancel, reset };
}
