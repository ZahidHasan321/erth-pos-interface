import { cn } from "@/lib/utils";
import { X } from "lucide-react";

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
        "flex items-center gap-3 px-5 py-3 rounded-2xl",
        "bg-primary text-primary-foreground",
        "shadow-[0_8px_30px_rgb(0,0,0,0.15)] border border-white/10",
        "animate-slide-up backdrop-blur-sm",
      )}
    >
      <span className="text-sm font-bold tabular-nums">{count} selected</span>
      <div className="w-px h-5 bg-primary-foreground/20" />
      {children}
      <button
        onClick={onClear}
        className="ml-1 p-1.5 rounded-md opacity-60 hover:opacity-100 hover:bg-white/10 transition-all"
        aria-label="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
