export interface TransferProgressState {
  bytesDone: number;
  totalBytes: number;
  percent: number;
  /** bytes per second, smoothed */
  speed: number;
  /** seconds remaining, or null if unknown */
  eta: number | null;
  /** seconds elapsed */
  elapsed: number;
  currentFileIndex: number;
  currentFileBytes: number;
  currentFileSize: number;
  filesDone: number;
  totalFiles: number;
}

export function emptyProgress(totalBytes = 0, totalFiles = 0): TransferProgressState {
  return {
    bytesDone: 0,
    totalBytes,
    percent: 0,
    speed: 0,
    eta: null,
    elapsed: 0,
    currentFileIndex: 0,
    currentFileBytes: 0,
    currentFileSize: 0,
    filesDone: 0,
    totalFiles,
  };
}

/** Rolling-window throughput meter (last ~3 s). */
export class SpeedMeter {
  private samples: { t: number; bytes: number }[] = [];
  private startedAt = performance.now();
  private windowMs: number;

  constructor(windowMs = 3000) {
    this.windowMs = windowMs;
  }

  reset() {
    this.samples = [];
    this.startedAt = performance.now();
  }

  record(totalBytes: number) {
    const now = performance.now();
    this.samples.push({ t: now, bytes: totalBytes });
    const cutoff = now - this.windowMs;
    while (this.samples.length > 2 && (this.samples[0]?.t ?? Infinity) < cutoff) this.samples.shift();
  }

  get speed(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last) return 0;
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return 0;
    return (last.bytes - first.bytes) / dt;
  }

  get elapsed(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  eta(bytesDone: number, totalBytes: number): number | null {
    const s = this.speed;
    if (s <= 0 || totalBytes <= bytesDone) return null;
    return (totalBytes - bytesDone) / s;
  }
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : decimals)} ${units[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}
