import { useCallback, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRScanner } from "@/components/qrdrop/QRScanner";
import { isValidSessionId } from "@/lib/transfer/protocol";

const TITLE = "Scan to receive — QRDrop";
const DESC = "Point your camera at a QRDrop code to receive files directly from another device, or paste the transfer link.";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
    ],
  }),
  component: ScanPage,
});

function extractSessionId(text: string): string | null {
  const trimmed = text.trim();
  const m = trimmed.match(/\/r\/([a-z0-9]{6,32})/i);
  if (m?.[1]) return m[1].toLowerCase();
  if (isValidSessionId(trimmed.toLowerCase())) return trimmed.toLowerCase();
  return null;
}

function ScanPage() {
  const navigate = useNavigate();
  const [manual, setManual] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const go = useCallback(
    (text: string) => {
      const id = extractSessionId(text);
      if (!id) {
        setErr("That doesn't look like a QRDrop link.");
        return;
      }
      void navigate({ to: "/r/$sessionId", params: { sessionId: id } });
    },
    [navigate],
  );

  return (
    <div className="mx-auto w-full max-w-full max-w-md space-y-6 overflow-x-hidden">
      <div className="max-w-full">
        <h1 className="font-display text-3xl font-bold tracking-tight">Scan to receive</h1>
        <p className="mt-1 max-w-full text-sm text-muted-foreground">Point the camera at the QR code on the sending device.</p>
      </div>

      <QRScanner onResult={go} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(manual);
        }}
        className="space-y-2"
      >
        <label htmlFor="manual-link" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Or paste the link / code
        </label>
        <div className="flex gap-2">
          <Input
            id="manual-link"
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              setErr(null);
            }}
            placeholder="https://…/r/abc123 or abc123"
            className="font-mono"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={!manual.trim()} aria-label="Open transfer">
            <ArrowRight />
          </Button>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </form>
    </div>
  );
}
