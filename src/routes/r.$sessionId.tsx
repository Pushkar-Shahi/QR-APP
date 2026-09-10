import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Download, FolderCheck, Loader2, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileList } from "@/components/qrdrop/FileList";
import { StatusBadge } from "@/components/qrdrop/StatusBadge";
import { TransferProgress } from "@/components/qrdrop/TransferProgress";
import { useReceiver, type ReceiverStatus } from "@/hooks/useReceiver";
import { triggerDownload } from "@/lib/transfer/download";
import { formatBytes } from "@/lib/transfer/metrics";
import { isValidSessionId } from "@/lib/transfer/protocol";

const TITLE = "Receive files — QRDrop";
const DESC = "Someone is sending you files with QRDrop. Review the list and accept to receive them directly from their device.";

export const Route = createFileRoute("/r/$sessionId")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
    ],
  }),
  component: ReceivePage,
});

const badge: Record<ReceiverStatus, { tone: "neutral" | "waiting" | "active" | "success" | "danger"; label: string; pulse?: boolean }> = {
  joining: { tone: "waiting", label: "Looking for sender", pulse: true },
  "not-found": { tone: "danger", label: "Sender not found" },
  busy: { tone: "danger", label: "Session busy" },
  offer: { tone: "active", label: "Incoming transfer", pulse: true },
  connecting: { tone: "active", label: "Connecting peer", pulse: true },
  transferring: { tone: "active", label: "Receiving", pulse: true },
  complete: { tone: "success", label: "Complete" },
  rejected: { tone: "neutral", label: "Declined" },
  cancelled: { tone: "danger", label: "Cancelled" },
  error: { tone: "danger", label: "Failed" },
};

function ReceivePage() {
  const { sessionId } = Route.useParams();
  if (!isValidSessionId(sessionId)) {
    return <Invalid />;
  }
  return <Receiver sessionId={sessionId} />;
}

function Invalid() {
  return (
    <div className="mx-auto max-w-md text-center">
      <XCircle className="mx-auto size-12 text-destructive" />
      <h1 className="mt-3 font-display text-2xl font-bold">That link doesn't look right</h1>
      <p className="mt-2 text-sm text-muted-foreground">Scan the QR code again or paste the full link.</p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/scan">Scan a code</Link>
      </Button>
    </div>
  );
}

function Receiver({ sessionId }: { sessionId: string }) {
  const { state, accept, reject, cancel } = useReceiver(sessionId);
  const { status, meta, progress, saved, tier, error } = state;
  const b = badge[status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Receive</h1>
        <StatusBadge tone={b.tone} label={b.label} pulse={b.pulse} />
      </div>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        {status === "joining" && (
          <Centered>
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="font-medium">Contacting the sender…</p>
            <p className="text-xs text-muted-foreground">Make sure the QR code page is still open on the other device.</p>
          </Centered>
        )}

        {(status === "not-found" || status === "busy" || status === "error" || status === "cancelled") && (
          <Centered>
            <XCircle className="size-12 text-destructive" />
            <p className="font-display text-2xl font-bold">
              {status === "not-found" ? "No sender found" : status === "busy" ? "Someone else is receiving" : status === "cancelled" ? "Transfer cancelled" : "Transfer failed"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {status === "not-found"
                ? "This transfer isn't active. Ask the sender to keep their page open and scan the code again."
                : (error ?? "Something went wrong.")}
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button asChild variant="ghost">
                <Link to="/">Send something</Link>
              </Button>
            </div>
          </Centered>
        )}

        {status === "rejected" && (
          <Centered>
            <XCircle className="size-12 text-muted-foreground" />
            <p className="font-display text-2xl font-bold">Transfer declined</p>
            <Button asChild variant="outline" className="mt-2">
              <Link to="/">Send something</Link>
            </Button>
          </Centered>
        )}

        {status === "offer" && meta && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
                <Smartphone className="size-5" />
              </div>
              <div>
                <p className="font-medium">
                  {meta.senderName} wants to send you {meta.files.length} {meta.files.length === 1 ? "file" : "files"}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{formatBytes(meta.totalBytes)} total</p>
              </div>
            </div>
            <FileList className="max-h-72 overflow-y-auto" files={meta.files} />
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <Button size="lg" className="h-12 text-base font-semibold" onClick={() => void accept()}>
                <Download /> Accept transfer
              </Button>
              <Button size="lg" variant="outline" className="h-12" onClick={reject}>
                Decline
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Your browser may ask where to save — that lets large files stream straight to disk.
            </p>
          </div>
        )}

        {status === "connecting" && (
          <Centered>
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="font-medium">Establishing direct connection…</p>
            <p className="text-xs text-muted-foreground">Saving via {tierLabel(tier)}.</p>
          </Centered>
        )}

        {status === "transferring" && meta && (
          <div className="space-y-5">
            <TransferProgress progress={progress} files={meta.files} direction="receive" />
            <FileList className="max-h-56 overflow-y-auto" files={meta.files} activeIndex={progress.currentFileIndex} doneCount={progress.filesDone} />
            <Button variant="outline" className="w-full" onClick={cancel}>
              Cancel
            </Button>
          </div>
        )}

        {status === "complete" && meta && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              {tier === "fsa" ? <FolderCheck className="size-12 text-success" /> : <CheckCircle2 className="size-12 text-success" />}
              <p className="font-display text-2xl font-bold">{tier === "fsa" ? "Saved to your device" : "Transfer complete"}</p>
              <p className="text-sm text-muted-foreground">
                {meta.files.length} {meta.files.length === 1 ? "file" : "files"} · {formatBytes(meta.totalBytes)} · via {tierLabel(tier)}
              </p>
            </div>
            <TransferProgress progress={progress} files={meta.files} direction="receive" />
            {tier !== "fsa" && saved.length > 0 && (
              <div className="space-y-2">
                {saved.length > 1 && (
                  <Button className="w-full" size="lg" onClick={() => saved.forEach((s, i) => setTimeout(() => triggerDownload(s), i * 250))}>
                    <Download /> Download all ({saved.length})
                  </Button>
                )}
                <ul className="divide-y overflow-hidden rounded-lg border">
                  {saved.map((s) => (
                    <li key={s.path} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{s.path}</span>
                      <span className="font-mono text-xs text-muted-foreground">{formatBytes(s.size)}</span>
                      <Button size="sm" variant="secondary" onClick={() => triggerDownload(s)}>
                        <Download /> Save
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button asChild variant="ghost" className="w-full">
              <Link to="/">Send something back</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">{children}</div>;
}

function tierLabel(tier: "fsa" | "opfs" | "blob" | null) {
  switch (tier) {
    case "fsa":
      return "direct-to-disk";
    case "opfs":
      return "private browser storage";
    case "blob":
      return "in-memory download";
    default:
      return "browser download";
  }
}
