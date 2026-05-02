import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Droplets, Search, CalendarDays, Check, Loader2 } from "lucide-react";
import { useSoakingQueue } from "@/hooks/useWorkshopGarments";
import { useMarkSoakComplete } from "@/hooks/useGarmentMutations";
import {
  PageHeader,
  EmptyState,
  LoadingSkeleton,
  GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "@repo/ui/table";
import { BrandBadge } from "@/components/shared/StageBadge";
import { TIMEZONE } from "@/lib/utils";
import { toast } from "sonner";
import type { WorkshopGarment } from "@repo/database";

/**
 * Soak terminal — parallel track, not a piece_stage.
 * Shows every garment that needs soaking and isn't done yet, regardless of
 * its piece_stage (so finals at waiting_for_acceptance also appear). One
 * action: "Mark Done", which sets soaking_completed_at. The garment's
 * pipeline state is untouched — it remains wherever it was.
 */
function SoakTerminal() {
  const { data: garments = [], isLoading } = useSoakingQueue();
  const markMut = useMarkSoakComplete();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return garments;
    return garments.filter(
      (g) =>
        (g.customer_name ?? "").toLowerCase().includes(q) ||
        String(g.order_id).includes(q) ||
        (g.invoice_number != null && String(g.invoice_number).includes(q)) ||
        (g.customer_mobile ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
        (g.garment_id ?? "").toLowerCase().includes(q) ||
        (g.fabric_name ?? "").toLowerCase().includes(q),
    );
  }, [garments, search]);

  const handleDone = (id: string) => {
    markMut.mutate([id], {
      onError: (err) => toast.error(`Failed: ${err?.message ?? "Unknown error"}`),
    });
  };

  const total = garments.length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10 space-y-8">
      <PageHeader
        icon={Droplets}
        title="Soaking"
        subtitle={`${total} garment${total !== 1 ? "s" : ""} needing soak`}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-card border px-2.5 py-1 rounded-md">
          <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
          {new Date().toLocaleDateString("default", {
            timeZone: TIMEZONE,
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Garment, customer, order, fabric…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Droplets} message="No garments need soaking right now" />
      ) : (
        <SoakTable
          garments={filtered}
          onDone={handleDone}
          isPending={markMut.isPending}
        />
      )}
    </div>
  );
}

function SoakTable({
  garments,
  onDone,
  isPending,
}: {
  garments: WorkshopGarment[];
  onDone: (id: string) => void;
  isPending: boolean;
}) {
  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
            <TableHead className="w-[140px]">Garment</TableHead>
            <TableHead className="w-[80px]">Type</TableHead>
            <TableHead className="w-[110px]">Order / Invoice</TableHead>
            <TableHead className="w-[170px]">Customer</TableHead>
            <TableHead className="w-[160px]">Fabric</TableHead>
            <TableHead className="w-[80px]">Brand</TableHead>
            <TableHead className="w-[140px] text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="px-3 py-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-sm font-bold">
                    {g.garment_id ?? g.id.slice(0, 8)}
                  </span>
                  {g.soaking_hours != null && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full w-fit">
                      <Droplets className="w-3 h-3" /> Soak {g.soaking_hours}h
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="px-3 py-3">
                <GarmentTypeBadge type={g.garment_type ?? "final"} />
              </TableCell>
              <TableCell className="px-3 py-3 font-mono">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold">#{g.order_id}</span>
                  {g.invoice_number && (
                    <span className="text-xs text-muted-foreground">
                      INV-{g.invoice_number}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="px-3 py-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">{g.customer_name ?? "—"}</span>
                  {g.customer_mobile && (
                    <span className="text-xs font-mono text-muted-foreground">
                      {g.customer_mobile}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="px-3 py-3 text-sm">
                {g.fabric_name ? (
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium truncate">{g.fabric_name}</span>
                    {g.fabric_color && (
                      <span className="text-xs text-muted-foreground truncate">
                        {g.fabric_color}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Outside</span>
                )}
              </TableCell>
              <TableCell className="px-3 py-3">
                <BrandBadge brand={g.order_brand} />
              </TableCell>
              <TableCell className="px-3 py-3 text-right">
                <Button
                  size="sm"
                  className="h-8 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => onDone(g.id)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5 mr-1" />
                  )}
                  Mark Done
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export const Route = createFileRoute("/(main)/terminals/soaking")({
  component: SoakTerminal,
  head: () => ({ meta: [{ title: "Soaking Terminal" }] }),
});
