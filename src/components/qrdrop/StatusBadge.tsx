import { cn } from "@/lib/utils";

type Tone = "neutral" | "waiting" | "active" | "success" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  waiting: "bg-warning/15 text-warning-foreground dark:text-warning",
  active: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  danger: "bg-destructive/15 text-destructive",
};

const dots: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  waiting: "bg-warning",
  active: "bg-primary",
  success: "bg-success",
  danger: "bg-destructive",
};

export function StatusBadge({ tone, label, pulse }: { tone: Tone; label: string; pulse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-xs font-medium uppercase tracking-wider", tones[tone])}>
      <span className="relative flex size-2">
        {pulse && <span className={cn("absolute inline-flex size-full rounded-full animate-pulse-ring", dots[tone])} />}
        <span className={cn("relative inline-flex size-2 rounded-full", dots[tone])} />
      </span>
      {label}
    </span>
  );
}
