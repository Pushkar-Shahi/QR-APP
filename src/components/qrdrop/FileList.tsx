import { memo } from "react";
import { File, FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo, Folder, X } from "lucide-react";
import { formatBytes } from "@/lib/transfer/metrics";
import { cn } from "@/lib/utils";

export interface FileRow {
  name: string;
  path: string;
  size: number;
  type: string;
}

function iconFor(type: string, name: string) {
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("video/")) return FileVideo;
  if (type.startsWith("audio/")) return FileAudio;
  if (/zip|tar|gzip|rar|7z/.test(type) || /\.(zip|tar|gz|rar|7z)$/i.test(name)) return FileArchive;
  if (/\.(js|ts|tsx|jsx|py|go|rs|java|c|cpp|json|html|css|md)$/i.test(name)) return FileCode;
  if (type.startsWith("text/") || type === "application/pdf") return FileText;
  return File;
}

export const FileList = memo(function FileList({
  files,
  onRemove,
  activeIndex,
  doneCount,
  className,
}: {
  files: FileRow[];
  onRemove?: (index: number) => void;
  activeIndex?: number;
  doneCount?: number;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-border overflow-hidden rounded-lg border bg-card", className)}>
      {files.map((f, i) => {
        const Icon = iconFor(f.type, f.name);
        const folder = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : null;
        const done = doneCount != null && i < doneCount;
        const active = activeIndex === i && !done;
        return (
          <li
            key={`${f.path}-${i}`}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors",
              active && "bg-primary/5",
              done && "text-muted-foreground",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{f.name}</p>
              {folder && (
                <p className="flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground">
                  <Folder className="size-3" /> {folder}
                </p>
              )}
            </div>
            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{formatBytes(f.size)}</span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${f.name}`}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
});
