import { cn } from "@/lib/utils";

interface BatchActionBarProps {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function BatchActionBar({ count, onClear, children }: BatchActionBarProps) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl",
        "bg-foreground text-background border border-border/20",
        "animate-fade-in",
      )}
    >
      <span className="text-sm font-bold">{count} selected</span>
      <div className="w-px h-5 bg-background/20" />
      {children}
      <button
        onClick={onClear}
        className="text-xs font-semibold opacity-60 hover:opacity-100 transition-opacity ml-1"
      >
        Clear
      </button>
    </div>
  );
}
