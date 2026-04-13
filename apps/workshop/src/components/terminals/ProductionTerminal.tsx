import React, { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTerminalGarments } from "@/hooks/useWorkshopGarments";
import { PageHeader, EmptyState, LoadingSkeleton, GarmentTypeBadge } from "@/components/shared/PageShell";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer } from "@repo/ui/table";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { cn, clickableProps, formatDate, getDeliveryUrgency } from "@/lib/utils";
import type { WorkshopGarment, TripHistoryEntry } from "@repo/database";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays, Clock, Zap, Package, Wrench, PlayCircle, Search, Droplets, Home,
} from "lucide-react";

interface ProductionTerminalProps {
  terminalStage: string;
  icon: React.ComponentType<{ className?: string }>;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function hasQcFailThisTrip(g: WorkshopGarment): boolean {
  const trip = g.trip_number ?? 1;
  const hist = g.trip_history as TripHistoryEntry[] | null;
  const entry = hist?.find((t) => t.trip === trip);
  return !!entry?.qc_attempts?.some((a) => a.result === "fail");
}

/** Alt label for a returning garment. Priority: QC-fail (alt_p) > trip-based (alt_N). */
function getAltLabel(g: WorkshopGarment): string | null {
  if (hasQcFailThisTrip(g)) return "alt_p";
  const trip = g.trip_number ?? 1;
  if (trip >= 2) return `alt_${trip - 1}`;
  return null;
}

function isAlterationRow(g: WorkshopGarment): boolean {
  return (g.trip_number ?? 1) >= 2 || hasQcFailThisTrip(g);
}

function isWorking(g: WorkshopGarment): boolean {
  return !!g.in_production || !!g.start_time;
}

type SectionKey = "working" | "express" | "brova" | "final" | "alterations";

/** Exclusive assignment: each garment lands in one section. Currently working wins. */
function classify(g: WorkshopGarment): SectionKey {
  if (isWorking(g)) return "working";
  if (g.express) return "express";
  if (isAlterationRow(g)) return "alterations";
  return g.garment_type === "brova" ? "brova" : "final";
}

// ── alt badge ────────────────────────────────────────────────────────────────

function AltBadge({ label }: { label: string }) {
  const isQc = label === "alt_p";
  return (
    <Badge
      className={cn(
        "font-semibold text-xs uppercase tracking-wide border-0 text-white",
        isQc ? "bg-red-600" : "bg-orange-500",
      )}
    >
      {label}
    </Badge>
  );
}

// ── row ──────────────────────────────────────────────────────────────────────

function GarmentRow({
  garment,
  onClick,
  showAlt,
  showExpressFlag,
}: {
  garment: WorkshopGarment;
  onClick?: () => void;
  showAlt?: boolean;
  showExpressFlag?: boolean;
}) {
  const urgency = getDeliveryUrgency(garment.delivery_date_order);
  const altLabel = showAlt ? getAltLabel(garment) : null;
  const working = isWorking(garment);

  return (
    <TableRow
      {...(onClick ? clickableProps(onClick) : {})}
      className={cn(
        onClick && "cursor-pointer hover:bg-muted/40",
        working && "bg-emerald-50/40",
      )}
    >
      <TableCell className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-sm font-bold">
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {showExpressFlag && garment.express && <ExpressBadge />}
            {garment.soaking && (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full">
                <Droplets className="w-3 h-3" /> Soak
              </span>
            )}
            {working && (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                <PlayCircle className="w-3 h-3" /> Working
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="px-3 py-3">
        <GarmentTypeBadge type={garment.garment_type ?? "final"} />
      </TableCell>
      {showAlt && (
        <TableCell className="px-3 py-3">
          {altLabel && <AltBadge label={altLabel} />}
        </TableCell>
      )}
      <TableCell className="px-3 py-3 font-mono">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">#{garment.order_id}</span>
          {garment.invoice_number && (
            <span className="text-xs text-muted-foreground">INV-{garment.invoice_number}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{garment.customer_name ?? "—"}</span>
          {garment.customer_mobile && (
            <span className="text-xs font-mono text-muted-foreground">{garment.customer_mobile}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3 text-sm">
        {garment.fabric_name ? (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-medium truncate">{garment.fabric_name}</span>
            {garment.fabric_color && (
              <span className="text-xs text-muted-foreground truncate">{garment.fabric_color}</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Outside</span>
        )}
      </TableCell>
      <TableCell className="px-3 py-3 text-sm">
        <span className="truncate block max-w-[160px]">{garment.style_name ?? garment.style ?? "—"}</span>
      </TableCell>
      <TableCell className="px-3 py-3">
        <BrandBadge brand={garment.order_brand} />
      </TableCell>
      <TableCell className="px-3 py-3 text-center">
        {garment.delivery_date_order ? (
          <span className={cn("text-xs font-bold tabular-nums inline-flex items-center gap-1", urgency.text)}>
            <Clock className="w-3 h-3" />
            {formatDate(garment.delivery_date_order)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {garment.home_delivery && (
          <div>
            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-violet-600 px-2 py-0.5 rounded-full mt-1">
              <Home className="w-3 h-3" /> Home
            </span>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ── section table ────────────────────────────────────────────────────────────

function SectionTable({
  garments,
  onRowClick,
  showAlt,
  showExpressFlag,
}: {
  garments: WorkshopGarment[];
  onRowClick?: (g: WorkshopGarment) => void;
  showAlt?: boolean;
  showExpressFlag?: boolean;
}) {
  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
            <TableHead className="w-[120px]">Garment</TableHead>
            <TableHead className="w-[80px]">Type</TableHead>
            {showAlt && <TableHead className="w-[80px]">Alt</TableHead>}
            <TableHead className="w-[110px]">Order / Invoice</TableHead>
            <TableHead className="w-[170px]">Customer</TableHead>
            <TableHead className="w-[160px]">Fabric</TableHead>
            <TableHead className="w-[160px]">Style</TableHead>
            <TableHead className="w-[80px]">Brand</TableHead>
            <TableHead className="w-[130px] text-center">Delivery</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => (
            <GarmentRow
              key={g.id}
              garment={g}
              onClick={onRowClick ? () => onRowClick(g) : undefined}
              showAlt={showAlt}
              showExpressFlag={showExpressFlag}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ── section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  count,
  accent,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-base text-foreground">{title}</h2>
        <Badge variant="secondary" className={cn("text-xs", accent)}>
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}

// ── sort helper ──────────────────────────────────────────────────────────────

const sortByAssigned = (a: WorkshopGarment, b: WorkshopGarment) => {
  const da = a.assigned_date ?? "";
  const db = b.assigned_date ?? "";
  return da.localeCompare(db);
};

// ── main ─────────────────────────────────────────────────────────────────────

export function ProductionTerminal({ terminalStage, icon: Icon }: ProductionTerminalProps) {
  const { data: stageGarments = [], isLoading } = useTerminalGarments(terminalStage);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const stageLabel = PIECE_STAGE_LABELS[terminalStage as keyof typeof PIECE_STAGE_LABELS] ?? terminalStage;

  const searchFilter = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return (g: WorkshopGarment) =>
      (g.customer_name ?? "").toLowerCase().includes(q) ||
      String(g.order_id).includes(q) ||
      (g.invoice_number != null && String(g.invoice_number).includes(q)) ||
      (g.customer_mobile ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
      (g.garment_id ?? "").toLowerCase().includes(q) ||
      (g.fabric_name ?? "").toLowerCase().includes(q) ||
      (g.style_name ?? "").toLowerCase().includes(q);
  }, [search]);

  const sections = useMemo(() => {
    const base: Record<SectionKey, WorkshopGarment[]> = {
      working: [], express: [], brova: [], final: [], alterations: [],
    };
    for (const g of stageGarments) {
      if (searchFilter && !searchFilter(g)) continue;
      base[classify(g)].push(g);
    }
    for (const k of Object.keys(base) as SectionKey[]) {
      base[k].sort(sortByAssigned);
    }
    return base;
  }, [stageGarments, searchFilter]);

  const handleClick = (g: WorkshopGarment) => {
    navigate({ to: "/terminals/garment/$garmentId", params: { garmentId: g.id } });
  };

  const total = stageGarments.length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10 space-y-8">
      <PageHeader
        icon={Icon}
        title={stageLabel}
        subtitle={`${total} garment${total !== 1 ? "s" : ""} at this station`}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-card border px-2.5 py-1 rounded-md">
          <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
          {new Date().toLocaleDateString("default", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </div>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Garment, customer, order, fabric, style…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* ── Currently Working ── */}
          <Section
            title="Currently Working"
            icon={PlayCircle}
            count={sections.working.length}
            accent="bg-emerald-100 text-emerald-700"
          >
            {sections.working.length === 0 ? (
              <EmptyState icon={PlayCircle} message="Nothing in production right now" />
            ) : (
              <SectionTable
                garments={sections.working}
                onRowClick={handleClick}
                showAlt
                showExpressFlag
              />
            )}
          </Section>

          {/* ── Express ── */}
          <Section
            title="Express"
            icon={Zap}
            count={sections.express.length}
            accent="bg-orange-100 text-orange-700"
          >
            {sections.express.length === 0 ? (
              <EmptyState icon={Zap} message="No express garments waiting" />
            ) : (
              <SectionTable garments={sections.express} onRowClick={handleClick} />
            )}
          </Section>

          {/* ── Brova ── */}
          <Section
            title="Brova"
            icon={Package}
            count={sections.brova.length}
            accent="bg-amber-100 text-amber-700"
          >
            {sections.brova.length === 0 ? (
              <EmptyState icon={Package} message="No brova garments waiting" />
            ) : (
              <SectionTable garments={sections.brova} onRowClick={handleClick} />
            )}
          </Section>

          {/* ── Final ── */}
          <Section
            title="Final"
            icon={Package}
            count={sections.final.length}
            accent="bg-emerald-100 text-emerald-700"
          >
            {sections.final.length === 0 ? (
              <EmptyState icon={Package} message="No final garments waiting" />
            ) : (
              <SectionTable garments={sections.final} onRowClick={handleClick} />
            )}
          </Section>

          {/* ── Alterations ── */}
          <Section
            title="Alterations"
            icon={Wrench}
            count={sections.alterations.length}
            accent="bg-purple-100 text-purple-700"
          >
            {sections.alterations.length === 0 ? (
              <EmptyState icon={Wrench} message="No alterations waiting" />
            ) : (
              <SectionTable
                garments={sections.alterations}
                onRowClick={handleClick}
                showAlt
                showExpressFlag
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
