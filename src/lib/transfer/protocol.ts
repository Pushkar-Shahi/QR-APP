// Wire protocol for QRDrop DataChannel messages.
//
//  METADATA          [0x01][JSON utf-8]
//  CHUNK             [0x02][fileIndex u16 BE][chunkIndex u32 BE][data ≤ 16 KB]
//  FILE_COMPLETE     [0x03][fileIndex u16 BE]
//  TRANSFER_COMPLETE [0x04]
//  ERROR             [0x05][message utf-8]
//  ACK               [0x06]   (receiver → sender: everything saved)

export const CHUNK_SIZE = 16 * 1024; // 16 KB — safe on iOS Safari / all SCTP stacks
export const READ_BLOCK_SIZE = 1024 * 1024; // read files from disk in 1 MB blocks
export const BUFFER_HIGH_WATERMARK = 1024 * 1024; // pause sending above 1 MB buffered
export const BUFFER_LOW_THRESHOLD = 64 * 1024; // resume once below 64 KB
export const CHUNK_HEADER_SIZE = 7;

export const MSG = {
  METADATA: 0x01,
  CHUNK: 0x02,
  FILE_COMPLETE: 0x03,
  TRANSFER_COMPLETE: 0x04,
  ERROR: 0x05,
  ACK: 0x06,
} as const;

export interface FileMeta {
  index: number;
  name: string;
  /** Relative path including folder segments, e.g. "photos/2024/a.jpg" */
  path: string;
  size: number;
  type: string;
}

export interface TransferMeta {
  files: FileMeta[];
  totalBytes: number;
  senderName: string;
}

export interface SelectedFile {
  file: File;
  path: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeMetadata(meta: TransferMeta): ArrayBuffer {
  const json = encoder.encode(JSON.stringify(meta));
  const out = new Uint8Array(1 + json.byteLength);
  out[0] = MSG.METADATA;
  out.set(json, 1);
  return out.buffer;
}

export function encodeChunk(fileIndex: number, chunkIndex: number, data: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(CHUNK_HEADER_SIZE + data.byteLength);
  const view = new DataView(out.buffer);
  out[0] = MSG.CHUNK;
  view.setUint16(1, fileIndex);
  view.setUint32(3, chunkIndex);
  out.set(data, CHUNK_HEADER_SIZE);
  return out.buffer;
}

export function encodeFileComplete(fileIndex: number): ArrayBuffer {
  const out = new Uint8Array(3);
  out[0] = MSG.FILE_COMPLETE;
  new DataView(out.buffer).setUint16(1, fileIndex);
  return out.buffer;
}

export function encodeSimple(type: typeof MSG.TRANSFER_COMPLETE | typeof MSG.ACK): ArrayBuffer {
  return new Uint8Array([type]).buffer;
}

export function encodeError(message: string): ArrayBuffer {
  const text = encoder.encode(message);
  const out = new Uint8Array(1 + text.byteLength);
  out[0] = MSG.ERROR;
  out.set(text, 1);
  return out.buffer;
}

export type DecodedMessage =
  | { kind: "metadata"; meta: TransferMeta }
  | { kind: "chunk"; fileIndex: number; chunkIndex: number; data: Uint8Array }
  | { kind: "fileComplete"; fileIndex: number }
  | { kind: "transferComplete" }
  | { kind: "error"; message: string }
  | { kind: "ack" };

export function decodeMessage(buf: ArrayBuffer): DecodedMessage {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  switch (bytes[0]) {
    case MSG.METADATA:
      return { kind: "metadata", meta: JSON.parse(decoder.decode(bytes.subarray(1))) };
    case MSG.CHUNK:
      return {
        kind: "chunk",
        fileIndex: view.getUint16(1),
        chunkIndex: view.getUint32(3),
        data: bytes.subarray(CHUNK_HEADER_SIZE),
      };
    case MSG.FILE_COMPLETE:
      return { kind: "fileComplete", fileIndex: view.getUint16(1) };
    case MSG.TRANSFER_COMPLETE:
      return { kind: "transferComplete" };
    case MSG.ERROR:
      return { kind: "error", message: decoder.decode(bytes.subarray(1)) };
    case MSG.ACK:
      return { kind: "ack" };
    default:
      throw new Error(`Unknown message type ${bytes[0]}`);
  }
}

export function buildMeta(files: SelectedFile[], senderName: string): TransferMeta {
  const metas = files.map((f, index) => ({
    index,
    name: f.file.name,
    path: f.path,
    size: f.file.size,
    type: f.file.type || "application/octet-stream",
  }));
  return { files: metas, totalBytes: metas.reduce((n, f) => n + f.size, 0), senderName };
}

const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function generateSessionId(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

export function isValidSessionId(id: string): boolean {
  return /^[a-z0-9]{6,32}$/.test(id);
}
