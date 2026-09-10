import type { SelectedFile } from "./protocol";

/** Convert a FileList (possibly from a webkitdirectory input) into SelectedFiles. */
export function fromFileList(list: FileList | File[]): SelectedFile[] {
  return Array.from(list).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (cb: (e: EntryLike[]) => void, err?: (e: unknown) => void) => void };
}

async function walkEntry(entry: EntryLike, prefix: string, out: SelectedFile[]) {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((res, rej) => entry.file!(res, rej));
    out.push({ file, path: prefix ? `${prefix}/${entry.name}` : entry.name });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const dirPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    // readEntries returns batches; loop until empty.
    for (;;) {
      const batch = await new Promise<EntryLike[]>((res, rej) => reader.readEntries(res, rej));
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, dirPath, out);
    }
  }
}

/** Extract files (including dropped folders) from a drag-and-drop DataTransfer. */
export async function fromDataTransfer(dt: DataTransfer): Promise<SelectedFile[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((it) => (it as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.())
    .filter((e): e is EntryLike => !!e);

  if (entries.length === 0) return fromFileList(dt.files);

  const out: SelectedFile[] = [];
  for (const entry of entries) await walkEntry(entry, "", out);
  return out;
}

export function supportsFolderPicker(): boolean {
  if (typeof document === "undefined") return false;
  const input = document.createElement("input");
  return "webkitdirectory" in input;
}

export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android device";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux machine";
  return "Browser";
}
