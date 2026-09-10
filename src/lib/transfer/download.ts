import type { FileMeta } from "./protocol";

export type SaveTier = "fsa" | "opfs" | "blob";

export interface FileSink {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface SavedFile {
  name: string;
  path: string;
  size: number;
  type: string;
  /** Object URL for a browser download (OPFS/Blob tiers). */
  url?: string;
  /** True when the file was written straight to the user's chosen location. */
  savedDirectly: boolean;
}

export interface SinkFactory {
  tier: SaveTier;
  open(meta: FileMeta): Promise<{ sink: FileSink; finish: () => Promise<SavedFile> }>;
  /** Best-effort cleanup of temp storage. */
  dispose?: () => Promise<void>;
}

// ---------- capability detection ----------

declare global {
  interface Window {
    showSaveFilePicker?: (opts?: {
      suggestedName?: string;
      types?: { description?: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
    showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function hasFileSystemAccess(): boolean {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

export function hasDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function hasOpfs(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return false;
    const root = await navigator.storage.getDirectory();
    const probe = await root.getFileHandle(".qrdrop-probe", { create: true });
    const ok = typeof (probe as FileSystemFileHandle).createWritable === "function";
    await root.removeEntry(".qrdrop-probe").catch(() => {});
    return ok;
  } catch {
    return false;
  }
}

// ---------- buffered writer (coalesce 16 KB chunks into 1 MB writes) ----------

const FLUSH_SIZE = 1024 * 1024;

class BufferedSink implements FileSink {
  private parts: Uint8Array[] = [];
  private size = 0;
  constructor(private flushFn: (data: Uint8Array) => Promise<void>, private closeFn: () => Promise<void>) {}

  async write(data: Uint8Array) {
    this.parts.push(data.slice());
    this.size += data.byteLength;
    if (this.size >= FLUSH_SIZE) await this.flush();
  }

  private async flush() {
    if (this.size === 0) return;
    const merged = new Uint8Array(this.size);
    let off = 0;
    for (const p of this.parts) {
      merged.set(p, off);
      off += p.byteLength;
    }
    this.parts = [];
    this.size = 0;
    await this.flushFn(merged);
  }

  async close() {
    await this.flush();
    await this.closeFn();
  }
}

async function resolveDirectory(root: FileSystemDirectoryHandle, path: string) {
  const segments = path.split("/").filter(Boolean);
  segments.pop(); // filename
  let dir = root;
  for (const seg of segments) dir = await dir.getDirectoryHandle(seg, { create: true });
  return dir;
}

function baseName(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "file";
}

async function writableSink(handle: FileSystemFileHandle): Promise<FileSink> {
  const writable = await handle.createWritable();
  return new BufferedSink(
    (data) => writable.write(data),
    () => writable.close(),
  );
}

// ---------- Tier 1: File System Access (Chrome/Edge desktop + Android) ----------

async function fsaSingleFactory(meta: FileMeta): Promise<SinkFactory | null> {
  if (!hasFileSystemAccess()) return null;
  try {
    const handle = await window.showSaveFilePicker!({ suggestedName: meta.name });
    return {
      tier: "fsa",
      async open(m) {
        const sink = await writableSink(handle);
        return {
          sink,
          finish: async () => ({ name: m.name, path: m.path, size: m.size, type: m.type, savedDirectly: true }),
        };
      },
    };
  } catch (err) {
    // User dismissed the picker → fall back to next tier.
    if ((err as Error).name === "AbortError") return null;
    console.warn("showSaveFilePicker failed", err);
    return null;
  }
}

async function fsaDirectoryFactory(): Promise<SinkFactory | null> {
  if (!hasDirectoryPicker()) return null;
  try {
    const root = await window.showDirectoryPicker!({ mode: "readwrite" });
    return {
      tier: "fsa",
      async open(m) {
        const dir = await resolveDirectory(root, m.path);
        const handle = await dir.getFileHandle(baseName(m.path), { create: true });
        const sink = await writableSink(handle);
        return {
          sink,
          finish: async () => ({ name: m.name, path: m.path, size: m.size, type: m.type, savedDirectly: true }),
        };
      },
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") return null;
    console.warn("showDirectoryPicker failed", err);
    return null;
  }
}

// ---------- Tier 2: OPFS (writes to sandboxed disk, zero heap) ----------

async function opfsFactory(sessionId: string): Promise<SinkFactory | null> {
  if (!(await hasOpfs())) return null;
  const root = await navigator.storage.getDirectory();
  const dirName = `qrdrop-${sessionId}`;
  const dir = await root.getDirectoryHandle(dirName, { create: true });
  return {
    tier: "opfs",
    async open(m) {
      const handle = await dir.getFileHandle(`${m.index}`, { create: true });
      const sink = await writableSink(handle);
      return {
        sink,
        finish: async () => {
          const file = await handle.getFile();
          return {
            name: m.name,
            path: m.path,
            size: file.size,
            type: m.type,
            url: URL.createObjectURL(file),
            savedDirectly: false,
          };
        },
      };
    },
    dispose: () => root.removeEntry(dirName, { recursive: true }).catch(() => {}),
  };
}

/** Remove leftover OPFS folders from previous sessions. */
export async function cleanupStaleOpfs() {
  try {
    if (!navigator.storage?.getDirectory) return;
    const root = await navigator.storage.getDirectory();
    const iter = (root as unknown as { keys(): AsyncIterable<string> }).keys?.();
    if (!iter) return;
    for await (const name of iter) {
      if (name.startsWith("qrdrop-")) await root.removeEntry(name, { recursive: true }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

// ---------- Tier 3: in-memory Blob ----------

function blobFactory(): SinkFactory {
  return {
    tier: "blob",
    async open(m) {
      const parts: Uint8Array[] = [];
      const sink: FileSink = {
        async write(data) {
          parts.push(data.slice());
        },
        async close() {},
      };
      return {
        sink,
        finish: async () => {
          const blob = new Blob(parts as BlobPart[], { type: m.type });
          return {
            name: m.name,
            path: m.path,
            size: blob.size,
            type: m.type,
            url: URL.createObjectURL(blob),
            savedDirectly: false,
          };
        },
      };
    },
  };
}

/**
 * Pick the best available save strategy. MUST be called from a user gesture
 * (the Accept click) so the native pickers are allowed to open.
 */
export async function chooseSinkFactory(files: FileMeta[], sessionId: string): Promise<SinkFactory> {
  const fsa = files.length === 1 ? await fsaSingleFactory(files[0]) : await fsaDirectoryFactory();
  if (fsa) return fsa;
  const opfs = await opfsFactory(sessionId);
  if (opfs) return opfs;
  return blobFactory();
}

export function triggerDownload(saved: SavedFile) {
  if (!saved.url) return;
  const a = document.createElement("a");
  a.href = saved.url;
  a.download = saved.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
