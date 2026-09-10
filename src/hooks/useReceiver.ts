import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getIceServers } from "@/lib/ice.functions";
import { chooseSinkFactory, cleanupStaleOpfs, type SavedFile, type SaveTier, type SinkFactory } from "@/lib/transfer/download";
import { emptyProgress, SpeedMeter, type TransferProgressState } from "@/lib/transfer/metrics";
import { generateSessionId, type TransferMeta } from "@/lib/transfer/protocol";
import { receiveFiles } from "@/lib/transfer/receiver";
import { createSignaling, type Signaling } from "@/lib/transfer/signaling";
import { configureChannel, createPeerConnection, DEFAULT_ICE_SERVERS, IceQueue } from "@/lib/transfer/webrtc";

export type ReceiverStatus =
  | "joining"
  | "not-found"
  | "busy"
  | "offer"
  | "connecting"
  | "transferring"
  | "complete"
  | "rejected"
  | "cancelled"
  | "error";

export interface ReceiverState {
  status: ReceiverStatus;
  meta: TransferMeta | null;
  progress: TransferProgressState;
  saved: SavedFile[];
  tier: SaveTier | null;
  error: string | null;
}

const HELLO_RETRY_MS = 1500;
const HELLO_TIMEOUT_MS = 20_000;

export function useReceiver(sessionId: string) {
  const [state, setState] = useState<ReceiverState>({
    status: "joining",
    meta: null,
    progress: emptyProgress(),
    saved: [],
    tier: null,
    error: null,
  });
  const fetchIce = useServerFn(getIceServers);

  const signalingRef = useRef<Signaling | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const factoryRef = useRef<SinkFactory | null>(null);
  const metaRef = useRef<TransferMeta | null>(null);
  const progressRef = useRef<TransferProgressState>(emptyProgress());
  const meterRef = useRef(new SpeedMeter());
  const flushTimer = useRef<number | null>(null);
  const peerId = useRef<string>("");

  const patch = useCallback((p: Partial<ReceiverState>) => setState((s) => ({ ...s, ...p })), []);

  const stopLoop = useCallback(() => {
    if (flushTimer.current) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    signalingRef.current?.close();
    signalingRef.current = null;
    stopLoop();
  }, [stopLoop]);

  // Join the session and ask the sender for its file list.
  useEffect(() => {
    let cancelled = false;
    peerId.current = generateSessionId(8);
    void cleanupStaleOpfs();

    const signaling = createSignaling(sessionId, "receiver");
    signalingRef.current = signaling;
    let helloTimer: number | null = null;
    let giveUpTimer: number | null = null;
    const stopHello = () => {
      if (helloTimer) clearInterval(helloTimer);
      if (giveUpTimer) clearTimeout(giveUpTimer);
      helloTimer = giveUpTimer = null;
    };

    const unsub = signaling.on(async (msg) => {
      if (cancelled) return;
      switch (msg.type) {
        case "meta":
          if (msg.peerId !== peerId.current) return;
          stopHello();
          metaRef.current = msg.meta;
          setState((s) =>
            s.status === "joining" || s.status === "not-found"
              ? { ...s, status: "offer", meta: msg.meta, progress: emptyProgress(msg.meta.totalBytes, msg.meta.files.length) }
              : s,
          );
          break;
        case "busy":
          stopHello();
          patch({ status: "busy", error: "Another device is already receiving this transfer." });
          break;
        case "cancel":
          stopHello();
          abortRef.current?.abort();
          patch({ status: "cancelled", error: "The sender cancelled the transfer." });
          stopLoop();
          break;
        case "offer": {
          const pc = pcRef.current;
          if (!pc) return;
          await pc.setRemoteDescription(msg.sdp);
          await iceQueueRef.current?.remoteReady();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await signaling.send({ type: "answer", sdp: answer });
          break;
        }
        case "ice":
          await iceQueueRef.current?.add(msg.candidate);
          break;
        default:
          break;
      }
    });

    signaling.ready
      .then(() => {
        if (cancelled) return;
        const sayHello = () => void signaling.send({ type: "hello", peerId: peerId.current });
        sayHello();
        helloTimer = window.setInterval(sayHello, HELLO_RETRY_MS);
        giveUpTimer = window.setTimeout(() => {
          stopHello();
          setState((s) => (s.status === "joining" ? { ...s, status: "not-found" } : s));
        }, HELLO_TIMEOUT_MS);
      })
      .catch((err: Error) => {
        if (!cancelled) patch({ status: "error", error: `Could not reach the signaling channel: ${err.message}` });
      });

    return () => {
      cancelled = true;
      stopHello();
      unsub();
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const iceQueueRef = useRef<IceQueue | null>(null);

  const accept = useCallback(async () => {
    const meta = metaRef.current;
    const signaling = signalingRef.current;
    if (!meta || !signaling) return;

    // Native pickers must open inside the click gesture — do this first.
    let factory: SinkFactory;
    try {
      factory = await chooseSinkFactory(meta.files, sessionId);
    } catch (err) {
      patch({ status: "error", error: `Could not prepare a place to save files: ${(err as Error).message}` });
      return;
    }
    factoryRef.current = factory;
    patch({ status: "connecting", tier: factory.tier });

    let iceServers = DEFAULT_ICE_SERVERS;
    try {
      iceServers = (await fetchIce()).iceServers;
    } catch {
      /* fall back */
    }

    const abort = new AbortController();
    abortRef.current = abort;

    const pc = createPeerConnection(iceServers, {
      onIceCandidate: (candidate) => void signaling.send({ type: "ice", candidate }),
      onConnectionState: (s) => {
        if (s === "failed") {
          patch({ status: "error", error: "Peer connection failed. Both devices may be behind strict firewalls (a TURN relay is required)." });
          stopLoop();
        }
      },
      onDataChannel: (channel) => {
        const dc = configureChannel(channel);
        progressRef.current = emptyProgress(meta.totalBytes, meta.files.length);
        meterRef.current.reset();
        patch({ status: "transferring", progress: progressRef.current });

        flushTimer.current = window.setInterval(() => {
          const p = progressRef.current;
          const meter = meterRef.current;
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

        receiveFiles(
          dc,
          factory,
          () => {},
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
        )
          .then((saved) => {
            stopLoop();
            const p = progressRef.current;
            patch({
              status: "complete",
              saved,
              progress: { ...p, percent: 100, speed: 0, eta: 0, elapsed: meterRef.current.elapsed },
            });
            setTimeout(() => pc.close(), 1000);
          })
          .catch((err: Error) => {
            stopLoop();
            if (abort.signal.aborted) return;
            patch({ status: "error", error: err.message });
          });
      },
    });
    pcRef.current = pc;
    iceQueueRef.current = new IceQueue(pc);

    await signaling.send({ type: "accept" });
  }, [fetchIce, patch, sessionId, stopLoop]);

  const reject = useCallback(() => {
    void signalingRef.current?.send({ type: "reject" });
    patch({ status: "rejected" });
    setTimeout(teardown, 200);
  }, [patch, teardown]);

  const cancel = useCallback(() => {
    void signalingRef.current?.send({ type: "cancel" });
    abortRef.current?.abort();
    patch({ status: "cancelled", error: null });
    stopLoop();
    setTimeout(() => {
      pcRef.current?.close();
      void factoryRef.current?.dispose?.();
    }, 200);
  }, [patch, stopLoop]);

  return { state, accept, reject, cancel };
}
