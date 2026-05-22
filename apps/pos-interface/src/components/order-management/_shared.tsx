import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";

import { cn, clickableProps, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";

// Neutral chrome only. POS direction: neutral base + single brand accent — no
// per-type colour fills. Type is distinguished by its label, not by colour.
export const PILL =
    "inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground";

export const TYPE_LABEL: Record<string, string> = {
    brova: "Brova",
    final: "Final",
    alteration: "Alteration",
};

export function GarmentTypeBadge({ type }: { type?: string | null }) {
    if (!type) return null;
    return <span className={PILL}>{TYPE_LABEL[type] ?? type}</span>;
}

// Trip / alteration label. Brova at trip 4+ counts as alt (legacy threshold);
// finals + alterations at trip 2+.
export function tripLabel(
    tripNumber: number | null | undefined,
    garmentType?: string | null,
): string {
    const trip = tripNumber || 1;
    if (garmentType === "brova" && trip >= 4) return `Alt ${trip - 3}`;
    if ((garmentType === "final" || garmentType === "alteration") && trip >= 2)
        return `Alt ${trip - 1}`;
    return trip > 1 ? `Trip ${trip}` : "1st trip";
}

export function TabEmptyState({
    icon: Icon,
    title,
    subtitle,
}: {
    icon: React.ElementType;
    title: string;
    subtitle: string;
}) {
    return (
        <div className="py-16 text-center">
            <Icon className="w-7 h-7 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-base font-medium text-muted-foreground">{title}</p>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
    );
}

export function TabError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
    return (
        <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 text-center space-y-3">
                <p className="font-medium text-destructive">
                    {error instanceof Error ? error.message : "Failed to load"}
                </p>
                <Button variant="outline" size="sm" onClick={onRetry}>
                    Retry
                </Button>
            </CardContent>
        </Card>
    );
}

export function TabLoading({
    count = 3,
    height = "h-28",
}: {
    count?: number;
    height?: string;
}) {
    return (
        <div className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} className={cn(height, "w-full rounded-lg")} />
            ))}
        </div>
    );
}

export interface OrderHeader {
    orderId: number;
    invoiceNumber?: number | string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    orderDate?: string | Date | null;
    pieceCount?: number;
    brovaCount?: number;
    finalCount?: number;
    alterationCount?: number;
    hasExpress?: boolean;
    rightBadges?: React.ReactNode;
    action?: React.ReactNode;
}

interface OrderCardShellProps extends OrderHeader {
    children?: React.ReactNode;
    collapsible?: boolean;
    defaultOpen?: boolean;
    note?: React.ReactNode;
}

export function OrderCardShell({
    children,
    collapsible = false,
    defaultOpen = false,
    note,
    ...h
}: OrderCardShellProps) {
    const [isExpanded, setIsExpanded] = useState(defaultOpen);
    const orderDateStr = h.orderDate
        ? parseUtcTimestamp(h.orderDate).toLocaleDateString("en-GB", { timeZone: TIMEZONE })
        : null;
    const toggle = () => setIsExpanded((v) => !v);

    const header = (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <span className="text-[15px] font-medium text-foreground truncate">
                {h.customerName || "Unknown customer"}
            </span>
            {h.customerPhone && (
                <span className="text-sm text-muted-foreground shrink-0">{h.customerPhone}</span>
            )}
            <span className="text-sm text-muted-foreground shrink-0">#{h.orderId}</span>
            {h.invoiceNumber != null && (
                <span className="text-sm text-muted-foreground shrink-0">INV {h.invoiceNumber}</span>
            )}
            {orderDateStr && (
                <span className="text-sm text-muted-foreground shrink-0">{orderDateStr}</span>
            )}
            {h.pieceCount != null && (
                <span className="text-sm text-foreground/80 shrink-0">
                    {h.pieceCount} {h.pieceCount === 1 ? "piece" : "pieces"}
                    {h.brovaCount ? (
                        <span className="text-muted-foreground"> · {h.brovaCount} brova</span>
                    ) : null}
                    {h.finalCount ? (
                        <span className="text-muted-foreground"> · {h.finalCount} final</span>
                    ) : null}
                    {h.alterationCount ? (
                        <span className="text-muted-foreground"> · {h.alterationCount} alteration</span>
                    ) : null}
                    {h.hasExpress && <span className="text-red-700 font-medium"> · Express</span>}
                </span>
            )}
            <div className="flex items-center gap-2 ml-auto shrink-0">
                {h.rightBadges}
                {h.action}
                {collapsible && (
                    <ChevronDown
                        className={cn(
                            "size-4 text-muted-foreground transition-transform duration-300",
                            isExpanded && "rotate-180",
                        )}
                    />
                )}
            </div>
        </div>
    );

    return (
        <Card className="overflow-hidden py-0 gap-0 rounded-lg">
            <CardContent className="p-0">
                {collapsible ? (
                    <div
                        className={cn(
                            "cursor-pointer transition-colors",
                            isExpanded ? "bg-muted/30" : "hover:bg-muted/20",
                        )}
                        onClick={toggle}
                        {...clickableProps(toggle)}
                    >
                        {header}
                    </div>
                ) : (
                    <div className="bg-muted/20 border-b border-border/40">{header}</div>
                )}
                {note && (
                    <div className="px-4 py-2 border-t border-border/40 bg-muted/10">{note}</div>
                )}
                {children &&
                    (collapsible ? (
                        <div
                            className={cn(
                                "grid transition-[grid-template-rows] duration-300 ease-out",
                                isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                            )}
                        >
                            <div className="overflow-hidden">
                                <div className="border-t border-border/40">{children}</div>
                            </div>
                        </div>
                    ) : (
                        <div>{children}</div>
                    ))}
            </CardContent>
        </Card>
    );
}
