import { cn } from "./lib/utils";

export type OrderType = "WORK" | "SALES" | "ALTERATION";

const STYLES: Record<OrderType, { label: string; className: string }> = {
  WORK: { label: "WORK", className: "bg-primary/10 text-primary" },
  SALES: { label: "SALES", className: "bg-amber-100 text-amber-700" },
  ALTERATION: { label: "ALTER", className: "bg-purple-100 text-purple-700" },
};

export function OrderTypeBadge({
  type,
  className,
}: {
  type: OrderType | string;
  className?: string;
}) {
  const style = STYLES[type as OrderType] ?? STYLES.WORK;
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider leading-none",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
