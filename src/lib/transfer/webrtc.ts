export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

export interface PeerHandlers {
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onDataChannel?: (channel: RTCDataChannel) => void;
}

export function createPeerConnection(iceServers: RTCIceServer[], handlers: PeerHandlers) {
  const pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
  pc.onicecandidate = (e) => {
    if (e.candidate) handlers.onIceCandidate(e.candidate.toJSON());
  };
  pc.onconnectionstatechange = () => handlers.onConnectionState(pc.connectionState);
  if (handlers.onDataChannel) {
    pc.ondatachannel = (e) => handlers.onDataChannel?.(e.channel);
  }
  return pc;
}

/** Buffers ICE candidates that arrive before the remote description is set. */
export class IceQueue {
  private pending: RTCIceCandidateInit[] = [];
  private remoteSet = false;

  constructor(private pc: RTCPeerConnection) {}

  async add(candidate: RTCIceCandidateInit) {
    if (!this.remoteSet) {
      this.pending.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("addIceCandidate failed", err);
    }
  }

  async remoteReady() {
    this.remoteSet = true;
    const queued = this.pending;
    this.pending = [];
    for (const c of queued) await this.add(c);
  }
}

export function waitForChannelOpen(dc: RTCDataChannel, timeoutMs = 30_000): Promise<void> {
  if (dc.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening data channel")), timeoutMs);
    dc.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    dc.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Data channel error"));
    };
  });
}

export function configureChannel(dc: RTCDataChannel) {
  dc.binaryType = "arraybuffer";
  return dc;
}
