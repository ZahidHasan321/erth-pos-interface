import type { LucideIcon } from "lucide-react";
import { Label } from "@repo/ui/label";
import { cn } from "@/lib/utils";

// Shared building blocks for the inventory stock dialogs (Restock / Adjust /
// Damage-Waste) so the three read identically: a labelled section with an
// optional right-aligned hint, and the Shop/Workshop location toggle.

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function LocationOption({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/5 text-primary" : "border-input bg-card hover:bg-muted text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
