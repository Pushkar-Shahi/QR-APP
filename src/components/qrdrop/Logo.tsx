import { Link } from "@tanstack/react-router";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group" aria-label="QRDrop home">
      <span className="grid size-8 grid-cols-3 gap-[2px] rounded-md bg-primary p-[5px] transition-transform group-hover:rotate-6">
        {[1, 1, 1, 1, 0, 1, 1, 1, 0].map((on, i) => (
          <span key={i} className={on ? "rounded-[1px] bg-primary-foreground" : ""} />
        ))}
      </span>
      <span className="font-display text-lg font-bold tracking-tight">
        QR<span className="text-primary">Drop</span>
      </span>
    </Link>
  );
}
