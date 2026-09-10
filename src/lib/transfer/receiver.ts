import type { FileSink, SavedFile, SinkFactory } from "./download";
import { decodeMessage, encodeError, encodeSimple, MSG, type TransferMeta } from "./protocol";

export interface ReceiveProgress {
  bytesDone: number;
  fileIndex: number;
  fileBytes: number;
  filesDone: number;
}

interface OpenFile {
  sink: FileSink;
  finish: () => Promise<SavedFile>;
  expectedChunk: number;
  bytes: number;
}

/**
 * Consumes the data channel stream, writing each file through the chosen sink
 * tier, then ACKs the sender once everything is persisted.
 */
export function receiveFiles(
  dc: RTCDataChannel,
  factory: SinkFactory,
  onMeta: (meta: TransferMeta) => void,
  onProgress: (p: ReceiveProgress) => void,
  signal: AbortSignal,
): Promise<SavedFile[]> {
  return new Promise<SavedFile[]>((resolve, reject) => {
    let meta: TransferMeta | null = null;
    const open = new Map<number, OpenFile>();
    const saved: SavedFile[] = [];
    let bytesDone = 0;
    let filesDone = 0;
    let failed = false;

    // Serialize async writes so chunks land in order even though onmessage is sync.
    let queue: Promise<void> = Promise.resolve();

    const fail = (err: Error) => {
      if (failed) return;
      failed = true;
      try {
        if (dc.readyState === "open") dc.send(encodeError(err.message));
      } catch {
        /* ignore */
      }
      reject(err);
    };

    signal.addEventListener("abort", () => fail(new Error("Transfer cancelled")), { once: true });
    dc.addEventListener("close", () => {
      if (!failed && (!meta || filesDone < meta.files.length)) {
        fail(new Error("Sender disconnected before the transfer finished"));
      }
    });

    const handle = async (buf: ArrayBuffer) => {
      if (failed) return;
      const msg = decodeMessage(buf);
      switch (msg.kind) {
        case "metadata": {
          meta = msg.meta;
          onMeta(meta);
          break;
        }
        case "chunk": {
          if (!meta) throw new Error("Chunk received before metadata");
          let f = open.get(msg.fileIndex);
          if (!f) {
            const fm = meta.files[msg.fileIndex];
            if (!fm) throw new Error(`Unknown file index ${msg.fileIndex}`);
            const opened = await factory.open(fm);
            f = { ...opened, expectedChunk: 0, bytes: 0 };
            open.set(msg.fileIndex, f);
          }
          if (msg.chunkIndex !== f.expectedChunk) {
            throw new Error(`Out-of-order chunk for file ${msg.fileIndex}`);
          }
          f.expectedChunk++;
          await f.sink.write(msg.data);
          f.bytes += msg.data.byteLength;
          bytesDone += msg.data.byteLength;
          onProgress({ bytesDone, fileIndex: msg.fileIndex, fileBytes: f.bytes, filesDone });
          break;
        }
        case "fileComplete": {
          if (!meta) throw new Error("File complete before metadata");
          let f = open.get(msg.fileIndex);
          if (!f) {
            // zero-byte file
            const fm = meta.files[msg.fileIndex];
            if (!fm) throw new Error(`Unknown file index ${msg.fileIndex}`);
            const opened = await factory.open(fm);
            f = { ...opened, expectedChunk: 0, bytes: 0 };
          }
          await f.sink.close();
          saved[msg.fileIndex] = await f.finish();
          open.delete(msg.fileIndex);
          filesDone++;
          onProgress({ bytesDone, fileIndex: msg.fileIndex, fileBytes: f.bytes, filesDone });
          break;
        }
        case "transferComplete": {
          if (!meta || filesDone !== meta.files.length) {
            throw new Error("Transfer ended with missing files");
          }
          dc.send(encodeSimple(MSG.ACK));
          resolve(saved);
          break;
        }
        case "error":
          throw new Error(msg.message);
        case "ack":
          break;
      }
    };

    dc.addEventListener("message", (e) => {
      const data = e.data as ArrayBuffer;
      queue = queue.then(() => handle(data)).catch((err) => fail(err as Error));
    });
  });
}
