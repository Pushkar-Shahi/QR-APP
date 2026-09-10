import { useState } from "react";
import QRCode from "react-qr-code";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QRPanel({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const short = url.replace(/^https?:\/\//, "");

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-2xl bg-qr-bg p-4 shadow-lg ring-1 ring-border">
        <QRCode
          value={url}
          size={232}
          level="M"
          bgColor="#ffffff"
          fgColor="#0b0c10"
          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
          viewBox="0 0 256 256"
        />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Scan with the receiving device's camera, or open the link below.
      </p>
      <div className="flex w-full items-center gap-2 rounded-lg border bg-card p-1.5 pl-3">
        <Link2 className="size-4 shrink-0 text-muted-foreground" />
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{short}</code>
        <Button size="sm" variant={copied ? "secondary" : "default"} onClick={copy} className="shrink-0">
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
