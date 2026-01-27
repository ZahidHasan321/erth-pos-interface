import { Search, X, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
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
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative group flex items-center">
        <div className="absolute left-3.5 flex items-center justify-center pointer-events-none">
          <Search className="size-4 text-primary group-focus-within:scale-110 transition-transform duration-200" />
        </div>
        <Input
          placeholder={placeholder}
          className={cn(
            "pl-11 pr-10 h-11 text-base md:text-sm bg-white border-border shadow-sm",
            "focus-visible:ring-primary/20 focus-visible:border-primary transition-all duration-200",
            "rounded-xl font-medium placeholder:font-normal placeholder:text-muted-foreground/50"
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-3 p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground font-semibold">
        <Hash className="size-3 text-primary/60" />
        <span>Use <span className="text-primary">#</span> for direct ID/Invoice lookup</span>
      </div>
    </div>
  );
}