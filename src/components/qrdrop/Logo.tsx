import { Link } from "@tanstack/react-router";
import brandIcon from "@/assets/qrdrop-icon.png.asset.json";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group" aria-label="QRDrop home">
      <img
        src={brandIcon.url}
        alt=""
        className="size-9 shrink-0 object-contain transition-transform group-hover:rotate-3"
      />
      <span className="font-display text-lg font-bold tracking-tight">
        QR<span className="text-primary">Drop</span>
      </span>
    </Link>
  );
}
