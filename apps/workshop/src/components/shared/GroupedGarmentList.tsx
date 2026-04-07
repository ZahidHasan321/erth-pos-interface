import { useMemo } from "react";
import { GarmentCard } from "./GarmentCard";
import type { WorkshopGarment } from "@repo/database";

interface GroupedGarmentListProps {
  garments: WorkshopGarment[];
  onCardClick?: (garment: WorkshopGarment) => void;
  emptyIcon?: React.ReactNode;
  emptyText?: string;
}

export function GroupedGarmentList({
  garments,
  onCardClick,
  emptyIcon,
  emptyText = "No garments",
}: GroupedGarmentListProps) {
  const groups = useMemo(() => {
    const map = new Map<number, WorkshopGarment[]>();
    for (const g of garments) {
      if (!map.has(g.order_id)) map.set(g.order_id, []);
      map.get(g.order_id)!.push(g);
    }
    return Array.from(map.entries());
  }, [garments]);

  if (garments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-2xl bg-muted/20 animate-fade-in motion-reduce:animate-none">
        {emptyIcon && <div className="opacity-20 mb-3 scale-150">{emptyIcon}</div>}
        <p className="font-semibold text-muted-foreground/70">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 stagger-children">
      {groups.map(([orderId, orderGarments]) => (
        <div key={orderId}>
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-sm font-bold text-foreground/70">
              #{orderGarments[0].invoice_number ?? orderId}
            </span>
            {orderGarments[0].customer_name && (
              <span className="text-sm text-muted-foreground">
                {orderGarments[0].customer_name}
              </span>
            )}
            <div className="flex-1 h-px bg-border/60" />
            <span className="text-xs text-muted-foreground/60">
              {orderGarments.length} piece{orderGarments.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {orderGarments.map((g, i) => (
              <GarmentCard
                key={g.id}
                garment={g}
                showPipeline={false}
                compact
                index={i}
                onClick={onCardClick ? () => onCardClick(g) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
