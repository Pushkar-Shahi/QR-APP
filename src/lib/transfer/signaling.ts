import { supabase } from "@/integrations/supabase/client";
import type { TransferMeta } from "./protocol";

export type Role = "sender" | "receiver";

export type SignalMessage =
  | { type: "hello"; peerId: string }
  | { type: "meta"; meta: TransferMeta; peerId: string }
  | { type: "busy" }
  | { type: "accept" }
  | { type: "reject" }
  | { type: "cancel" }
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "bye" };

interface Envelope {
  role: Role;
  msg: SignalMessage;
}

export interface Signaling {
  ready: Promise<void>;
  send: (msg: SignalMessage) => Promise<void>;
  on: (fn: (msg: SignalMessage) => void) => () => void;
  close: () => void;
}

/**
 * Realtime broadcast channel used purely for WebRTC signaling.
 * No data ever touches the server except SDP/ICE/control messages.
 */
export function createSignaling(sessionId: string, role: Role): Signaling {
  const listeners = new Set<(msg: SignalMessage) => void>();
  const channel = supabase.channel(`qrdrop:${sessionId}`, {
    config: { broadcast: { self: false, ack: false } },
  });

  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    const env = payload as Envelope;
    if (!env || env.role === role) return;
    console.debug(`[qrdrop:${role}] <- ${env.msg.type}`);
    for (const fn of listeners) fn(env.msg);
  });

  const ready = new Promise<void>((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        reject(err ?? new Error("Could not connect to signaling channel"));
      }
    });
  });

  return {
    ready,
    async send(msg) {
      await ready;
      const payload: Envelope = { role, msg };
      await channel.send({ type: "broadcast", event: "signal", payload });
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      listeners.clear();
      void supabase.removeChannel(channel);
    },
  };
}
