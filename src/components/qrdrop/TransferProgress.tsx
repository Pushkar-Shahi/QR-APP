import { formatBytes, formatDuration, formatSpeed, type TransferProgressState } from "@/lib/transfer/metrics";
import type { FileMeta } from "@/lib/transfer/protocol";
import { cn } from "@/lib/utils";

function Stat({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-base font-semibold tabular-nums", mono && "font-mono")}>{value}</p>
    </div>
  );
}

export function TransferProgress({
  progress,
  files,
  direction,
}: {
  progress: TransferProgressState;
  files: FileMeta[];
  direction: "send" | "receive";
}) {
  const pct = Math.min(100, Math.max(0, progress.percent));
  const current = files[progress.currentFileIndex];
  const done = pct >= 100 && progress.filesDone >= files.length;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-end justify-between">
          <span className="font-display text-4xl font-bold tabular-nums tracking-tight">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatBytes(progress.bytesDone)} / {formatBytes(progress.totalBytes)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative h-3 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full bg-primary transition-[width] duration-200 ease-linear", !done && "shadow-[0_0_12px_var(--color-primary)]")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Speed" value={done ? "—" : formatSpeed(progress.speed)} />
        <Stat label="ETA" value={done ? "Done" : formatDuration(progress.eta)} />
        <Stat label="Elapsed" value={formatDuration(progress.elapsed)} />
        <Stat label="Files" value={`${Math.min(progress.filesDone, files.length)} / ${files.length}`} />
      </div>

      {current && !done && (
        <div className="rounded-md border border-dashed px-3 py-2 text-xs">
          <p className="mb-1 flex justify-between gap-2 text-muted-foreground">
            <span className="truncate">
              {direction === "send" ? "Sending" : "Receiving"} <span className="font-medium text-foreground">{current.path}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              {formatBytes(progress.currentFileBytes)} / {formatBytes(current.size)}
            </span>
          </p>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary/70 transition-[width] duration-200"
              style={{ width: `${current.size ? (progress.currentFileBytes / current.size) * 100 : 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
