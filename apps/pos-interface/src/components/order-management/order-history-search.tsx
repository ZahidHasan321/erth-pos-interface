import { Search, X, Hash } from "lucide-react";
import { Input } from "@repo/ui/input";
import { cn } from "@/lib/utils";

interface OrderHistorySearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function OrderHistorySearch({
  value,
  onChange,
  placeholder = "Search by customer, phone, or ID...",
  className,
}: OrderHistorySearchProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="relative group flex items-center">
        <div className="absolute left-3 flex items-center justify-center pointer-events-none">
          <Search className="size-3.5 text-primary group-focus-within:scale-110 transition-transform duration-200" />
        </div>
        <Input
          placeholder={placeholder}
          className={cn(
            "pl-9 pr-9 h-9 text-sm bg-white border-border shadow-sm",
            "focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-200",
            "rounded-lg font-medium placeholder:font-normal placeholder:text-muted-foreground/50"
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2.5 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground font-medium">
        <Hash className="size-2.5 text-primary/60" />
        <span>Use <span className="text-primary font-bold">#</span> for ID/Invoice lookup</span>
      </div>
    </div>
  );
}