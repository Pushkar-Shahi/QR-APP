import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, Plus, QrCode, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileList } from "./FileList";
import { fromDataTransfer, fromFileList, supportsFolderPicker } from "@/lib/transfer/files";
import { formatBytes } from "@/lib/transfer/metrics";
import type { SelectedFile } from "@/lib/transfer/protocol";
import { cn } from "@/lib/utils";

export function FileDropzone({ onReady }: { onReady: (files: SelectedFile[]) => void }) {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [folderOk, setFolderOk] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => setFolderOk(supportsFolderPicker()), []);

  const add = useCallback((incoming: SelectedFile[]) => {
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.path));
      return [...prev, ...incoming.filter((f) => !seen.has(f.path))];
    });
  }, []);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    add(await fromDataTransfer(e.dataTransfer));
  };

  const total = files.reduce((n, f) => n + f.file.size, 0);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border bg-card/60 hover:border-primary/50",
        )}
      >
        <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
          <Upload className="size-6" />
        </div>
        <div>
          <p className="font-display text-lg font-semibold">Drop files or folders here</p>
          <p className="mt-1 text-sm text-muted-foreground">Any size. Nothing is uploaded to a server.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
            <Plus /> Select files
          </Button>
          {folderOk && (
            <Button type="button" variant="outline" onClick={() => folderInput.current?.click()}>
              <FolderOpen /> Select folder
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) add(fromFileList(e.target.files));
            e.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          className="sr-only"
          // @ts-expect-error non-standard attribute supported by Chromium/WebKit/Gecko
          webkitdirectory=""
          onChange={(e) => {
            if (e.target.files) add(fromFileList(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {files.length} {files.length === 1 ? "file" : "files"}
              <span className="text-muted-foreground"> · {formatBytes(total)}</span>
            </span>
            <button type="button" onClick={() => setFiles([])} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Clear all
            </button>
          </div>
          <FileList
            className="max-h-64 overflow-y-auto"
            files={files.map((f) => ({ name: f.file.name, path: f.path, size: f.file.size, type: f.file.type }))}
            onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
          />
          <Button size="lg" className="w-full font-semibold" onClick={() => onReady(files)}>
            <QrCode /> Generate QR code
          </Button>
        </div>
      )}
    </div>
  );
}
