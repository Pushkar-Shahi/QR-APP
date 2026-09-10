import {
  BUFFER_HIGH_WATERMARK,
  BUFFER_LOW_THRESHOLD,
  CHUNK_SIZE,
  READ_BLOCK_SIZE,
  decodeMessage,
  encodeChunk,
  encodeFileComplete,
  encodeMetadata,
  encodeSimple,
  MSG,
  type SelectedFile,
  type TransferMeta,
} from "./protocol";

export interface SendProgress {
  bytesDone: number;
  fileIndex: number;
  fileBytes: number;
  filesDone: number;
}

export class TransferAborted extends Error {
  constructor() {
    super("Transfer cancelled");
    this.name = "TransferAborted";
  }
}

function waitForDrain(dc: RTCDataChannel, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      dc.removeEventListener("bufferedamountlow", onLow);
      signal.removeEventListener("abort", onAbort);
      clearInterval(poll);
    };
    const onLow = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new TransferAborted());
    };
    // Safety net: some engines don't reliably fire bufferedamountlow.
    const poll = setInterval(() => {
      if (dc.readyState !== "open") {
        cleanup();
        reject(new Error("Connection closed during transfer"));
      } else if (dc.bufferedAmount <= BUFFER_LOW_THRESHOLD) {
        onLow();
      }
    }, 50);
    dc.addEventListener("bufferedamountlow", onLow, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Streams every file over the data channel in 16 KB chunks with backpressure,
 * then waits for the receiver's ACK.
 */
export async function sendFiles(
  dc: RTCDataChannel,
  files: SelectedFile[],
  meta: TransferMeta,
  onProgress: (p: SendProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  dc.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

  const ackPromise = new Promise<void>((resolve, reject) => {
    dc.addEventListener("message", (e) => {
      try {
        const msg = decodeMessage(e.data as ArrayBuffer);
        if (msg.kind === "ack") resolve();
        else if (msg.kind === "error") reject(new Error(msg.message));
      } catch {
        /* ignore */
      }
    });
    dc.addEventListener("close", () => reject(new Error("Receiver disconnected")), { once: true });
    signal.addEventListener("abort", () => reject(new TransferAborted()), { once: true });
  });
  // Avoid unhandled rejection noise if we bail before awaiting.
  ackPromise.catch(() => {});

  dc.send(encodeMetadata(meta));

  let bytesDone = 0;
  let filesDone = 0;

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const { file } = files[fileIndex];
    let offset = 0;
    let chunkIndex = 0;
    let fileBytes = 0;

    while (offset < file.size) {
      if (signal.aborted) throw new TransferAborted();
      const block = new Uint8Array(
        await file.slice(offset, offset + READ_BLOCK_SIZE).arrayBuffer(),
      );
      for (let i = 0; i < block.byteLength; i += CHUNK_SIZE) {
        if (dc.bufferedAmount > BUFFER_HIGH_WATERMARK) {
          await waitForDrain(dc, signal);
        }
        if (dc.readyState !== "open") throw new Error("Connection closed during transfer");
        const piece = block.subarray(i, Math.min(i + CHUNK_SIZE, block.byteLength));
        dc.send(encodeChunk(fileIndex, chunkIndex++, piece));
        bytesDone += piece.byteLength;
        fileBytes += piece.byteLength;
        onProgress({ bytesDone, fileIndex, fileBytes, filesDone });
      }
      offset += block.byteLength;
    }

    // Empty files still need a completion marker.
    dc.send(encodeFileComplete(fileIndex));
    filesDone++;
    onProgress({ bytesDone, fileIndex, fileBytes, filesDone });
  }

  dc.send(encodeSimple(MSG.TRANSFER_COMPLETE));
  await ackPromise;
}
