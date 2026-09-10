import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

type ScanState = "starting" | "scanning" | "no-camera" | "denied" | "error";

export function QRScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>("starting");
  const handled = useRef(false);

  useEffect(() => {
    let scanner: { start: () => Promise<void>; stop: () => void; destroy: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled || !videoRef.current) return;
        if (!(await QrScanner.hasCamera())) {
          setState("no-camera");
          return;
        }
        scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (handled.current) return;
            handled.current = true;
            scanner?.stop();
            onResult(result.data);
          },
          {
            returnDetailedScanResult: true,
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 12,
          },
        );
        await scanner.start();
        if (!cancelled) setState("scanning");
      } catch (err) {
        if (cancelled) return;
        const name = (err as Error)?.name ?? String(err);
        setState(/NotAllowed|Permission|denied/i.test(name + String(err)) ? "denied" : "error");
      }
    })();

    return () => {
      cancelled = true;
      scanner?.destroy();
    };
  }, [onResult]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border bg-foreground/90">
      <video ref={videoRef} className="size-full object-cover" muted playsInline />
      {state === "scanning" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative size-[62%] rounded-lg border-2 border-primary/70">
            <div className="absolute inset-x-2 top-1/2 h-0.5 bg-primary shadow-[0_0_14px_var(--color-primary)] animate-scan" />
          </div>
        </div>
      )}
      {state !== "scanning" && (
        <div className="absolute inset-0 grid place-items-center bg-card/95 p-6 text-center">
          <div className="space-y-2">
            {state === "starting" ? <Camera className="mx-auto size-7 animate-pulse text-primary" /> : <CameraOff className="mx-auto size-7 text-muted-foreground" />}
            <p className="text-sm font-medium">
              {state === "starting" && "Starting camera…"}
              {state === "no-camera" && "No camera found on this device."}
              {state === "denied" && "Camera access was blocked."}
              {state === "error" && "Couldn't start the camera."}
            </p>
            {state !== "starting" && <p className="text-xs text-muted-foreground">Paste the transfer link below instead.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
