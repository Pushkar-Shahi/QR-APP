import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Loader2, ScanLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/qrdrop/FileDropzone";
import { FileList } from "@/components/qrdrop/FileList";
import { QRPanel } from "@/components/qrdrop/QRPanel";
import { StatusBadge } from "@/components/qrdrop/StatusBadge";
import { TransferProgress } from "@/components/qrdrop/TransferProgress";
import { useSender, type SenderStatus } from "@/hooks/useSender";
import { formatBytes } from "@/lib/transfer/metrics";

const TITLE = "QRDrop — Send files between devices with a QR code";
const DESC = "Fast, private browser-to-browser file transfer. Scan a QR code and files move directly between devices over WebRTC — no uploads, no accounts.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
    ],
  }),
  component: SendPage,
});

const badge: Record<SenderStatus, { tone: "neutral" | "waiting" | "active" | "success" | "danger"; label: string; pulse?: boolean }> = {
  idle: { tone: "neutral", label: "Ready" },
  preparing: { tone: "waiting", label: "Opening channel", pulse: true },
  waiting: { tone: "waiting", label: "Waiting for scan", pulse: true },
  "receiver-joined": { tone: "active", label: "Device connected — awaiting accept", pulse: true },
  connecting: { tone: "active", label: "Connecting peer", pulse: true },
  transferring: { tone: "active", label: "Transferring", pulse: true },
  complete: { tone: "success", label: "Delivered" },
  rejected: { tone: "danger", label: "Declined" },
  cancelled: { tone: "danger", label: "Cancelled" },
  error: { tone: "danger", label: "Failed" },
};

function SendPage() {
  const { state, start, cancel, reset } = useSender();
  const { status, meta, url, progress, error, connectionType } = state;

  if (status === "idle") {
    return (
      <div className="space-y-8">
        <section className="space-y-3">
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Drop it here.
            <br />
            <span className="text-primary">Scan it there.</span>
          </h1>
          <p className="max-w-lg text-base text-muted-foreground">
            Send files and folders of any size straight from this browser to another device. The data goes peer-to-peer — it never
            touches a server.
          </p>
        </section>
        <FileDropzone onReady={(files) => void start(files)} />
        <p className="text-center text-sm text-muted-foreground">
          Receiving on this device?{" "}
          <Link to="/scan" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            <ScanLine className="size-3.5" /> Scan a code
          </Link>
        </p>
      </div>
    );
  }

  const b = badge[status];
  const terminal = status === "complete" || status === "rejected" || status === "cancelled" || status === "error";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {terminal ? "Send something else" : "Start over"}
        </button>
        <StatusBadge tone={b.tone} label={b.label} pulse={b.pulse} />
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          {(status === "preparing" || status === "waiting" || status === "receiver-joined") && url && (
            <>
              <QRPanel url={url} />
              {status === "receiver-joined" && (
                <p className="mt-4 rounded-md bg-primary/10 px-3 py-2 text-center text-sm text-primary">
                  A device opened the link — waiting for it to accept.
                </p>
              )}
            </>
          )}
          {status === "connecting" && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="font-medium">Negotiating a direct connection…</p>
              <p className="text-xs text-muted-foreground">Exchanging network candidates via the signaling channel.</p>
            </div>
          )}
          {status === "transferring" && meta && <TransferProgress progress={progress} files={meta.files} direction="send" />}
          {status === "complete" && meta && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 className="size-12 text-success" />
                <p className="font-display text-2xl font-bold">Delivered</p>
                <p className="text-sm text-muted-foreground">
                  {meta.files.length} {meta.files.length === 1 ? "file" : "files"} · {formatBytes(meta.totalBytes)}
                  {connectionType && <> · {connectionType} connection</>}
                </p>
              </div>
              <TransferProgress progress={progress} files={meta.files} direction="send" />
            </div>
          )}
          {(status === "rejected" || status === "cancelled" || status === "error") && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <XCircle className="size-12 text-destructive" />
              <p className="font-display text-2xl font-bold">
                {status === "rejected" ? "Transfer declined" : status === "cancelled" ? "Transfer cancelled" : "Transfer failed"}
              </p>
              {error && <p className="max-w-sm text-sm text-muted-foreground">{error}</p>}
              <Button variant="outline" onClick={reset} className="mt-2">
                Try again
              </Button>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          {meta && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {meta.files.length} {meta.files.length === 1 ? "file" : "files"}
                  <span className="text-muted-foreground"> · {formatBytes(meta.totalBytes)}</span>
                </span>
              </div>
              <FileList
                className="max-h-80 overflow-y-auto"
                files={meta.files}
                activeIndex={status === "transferring" ? progress.currentFileIndex : undefined}
                doneCount={status === "complete" ? meta.files.length : status === "transferring" ? progress.filesDone : undefined}
              />
            </>
          )}
          {!terminal && (
            <Button variant="outline" className="w-full" onClick={cancel}>
              Cancel transfer
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Keep this tab open until the transfer finishes — the files stream directly from this device.</p>
        </aside>
      </div>
    </div>
  );
}
