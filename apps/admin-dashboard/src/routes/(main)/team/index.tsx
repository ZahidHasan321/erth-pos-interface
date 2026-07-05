import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Users,
  AlertTriangle,
  Factory,
  Store,
  ChevronRight,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { FilterBar, FilterField, Segmented, FilterSelect } from "@/components/shared/FilterBar";
import { useTeamRoster } from "@/hooks/useAdmin";
import { titleCase } from "@/lib/format";
import type { TeamPerson } from "@/api/admin";

type LocationFilter = "" | "shop" | "workshop";

interface TeamSearch {
  location: LocationFilter;
  role: string;
}

export const Route = createFileRoute("/(main)/team/")({
  validateSearch: (s: Record<string, unknown>): TeamSearch => ({
    location: s.location === "shop" || s.location === "workshop" ? s.location : "",
    role: typeof s.role === "string" ? s.role : "",
  }),
  component: TeamPage,
});

const LOCATION_OPTIONS = [
  { value: "" as const, label: "All" },
  { value: "shop" as const, label: "Shop" },
  { value: "workshop" as const, label: "Workshop" },
];

const STAGE_LABEL: Record<string, string> = {
  soaking: "Soaking",
  cutting: "Cutting",
  post_cutting: "Post-cutting",
  sewing: "Sewing",
  finishing: "Finishing",
  ironing: "Ironing",
  quality_check: "QC",
};

const ROLE_LABEL: Record<string, string> = {
  terminal: "Terminal worker",
  measurement_taker: "Measurement taker",
  super_admin: "Owner",
};

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? titleCase(role);
}

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? titleCase(stage);
}

/** Terminal people are ordered by stage; a few roles sort first among office. */
function TeamPage() {
  const { location, role } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const patch = (next: Partial<TeamSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const { data, isLoading, isError, error, isFetching } = useTeamRoster(
    location || null,
    role || null,
  );

  // Role options from the unfiltered facets, so the dropdown never hides a role
  // just because the current location filter excludes it.
  const roleOptions = useMemo(() => {
    const roles = data ? Object.keys(data.facets.role) : [];
    return roles
      .sort((a, b) => roleLabel(a).localeCompare(roleLabel(b)))
      .map((r) => ({ value: r, label: `${roleLabel(r)} (${data!.facets.role[r]})` }));
  }, [data]);

  const shopCount = data?.facets.location.shop ?? 0;
  const workshopCount = data?.facets.location.workshop ?? 0;

  return (
    <div>
      <PageHeader icon={Users} title="Team" subtitle="Everyone across the shop and workshop" />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatsCard icon={Users} value={data?.facets.total ?? 0} label="People" color="blue" />
        <StatsCard icon={Store} value={shopCount} label="Shop" color="emerald" dimOnZero />
        <StatsCard icon={Factory} value={workshopCount} label="Workshop" color="purple" dimOnZero />
      </div>

      <FilterBar>
        <FilterField label="Location">
          <Segmented
            value={location}
            onChange={(v) => patch({ location: v })}
            options={LOCATION_OPTIONS}
          />
        </FilterField>
        <FilterField label="Role">
          <FilterSelect
            value={role}
            onChange={(v) => patch({ role: v })}
            options={roleOptions}
            allLabel="All roles"
            placeholder="All roles"
            className="min-w-[11rem]"
          />
        </FilterField>
      </FilterBar>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load team"} />
      ) : isLoading || !data ? (
        <LoadingSkeleton count={8} />
      ) : data.data.length === 0 ? (
        <EmptyState icon={Users} message="No one matches these filters" />
      ) : (
        <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <SectionCard bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2.5 px-4 font-medium">Name</th>
                    <th className="py-2.5 px-3 font-medium">Role</th>
                    <th className="py-2.5 px-3 font-medium">Location</th>
                    <th className="py-2.5 px-3 font-medium">Units / Brands</th>
                    <th className="py-2.5 px-3 font-medium">Contact</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3 font-medium w-8" />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((p) => <PersonRow key={p.person_key} p={p} />)}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-border text-xs text-muted-foreground">
              {data.data.length} of {data.facets.total} people
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

/** The detail surface for a person, decided by classification + role. Terminal
 *  people get the workshop performance drilldown; shop order-takers get their
 *  order-taking detail; managers/supervisors/owners get a profile only. */
function detailLink(p: TeamPerson): React.ReactNode {
  const label = p.name;
  if (p.classification === "terminal") {
    const stage = p.stages[0] ?? "";
    return (
      <Link
        to="/team/worker/$workerName"
        params={{ workerName: p.name }}
        search={{ stage, preset: "week" }}
        className="font-medium hover:underline"
      >
        {label}
      </Link>
    );
  }
  const isOrderTaker =
    p.role === "staff" || p.role === "measurement_taker" || p.role === "cashier";
  if (isOrderTaker && p.user_id) {
    return (
      <Link
        to="/team/staff/$userId"
        params={{ userId: p.user_id }}
        search={{ preset: "month" }}
        className="font-medium hover:underline"
      >
        {label}
      </Link>
    );
  }
  if (p.user_id) {
    return (
      <Link
        to="/team/person/$userId"
        params={{ userId: p.user_id }}
        className="font-medium hover:underline"
      >
        {label}
      </Link>
    );
  }
  return <span className="font-medium">{label}</span>;
}

function PersonRow({ p }: { p: TeamPerson }) {
  const roleText =
    p.classification === "terminal"
      ? p.stages.map(stageLabel).join(", ") || "Terminal worker"
      : roleLabel(p.role ?? "");

  return (
    <tr className={"border-b border-border/60 hover:bg-muted/40 transition-colors " + (p.is_active ? "" : "opacity-50")}>
      <td className="py-2.5 px-4">{detailLink(p)}</td>
      <td className="py-2.5 px-3 text-muted-foreground">{roleText || "-"}</td>
      <td className="py-2.5 px-3">
        {p.location === "shop" ? (
          <StatusPill color="emerald">Shop</StatusPill>
        ) : p.location === "workshop" ? (
          <StatusPill color="violet">Workshop</StatusPill>
        ) : (
          <span className="text-muted-foreground/50">-</span>
        )}
      </td>
      <td className="py-2.5 px-3">
        {p.classification === "terminal" ? (
          p.units.length ? (
            <span className="text-muted-foreground">{p.units.join(", ")}</span>
          ) : <span className="text-muted-foreground/50">-</span>
        ) : p.brands.length ? (
          <span className="inline-flex flex-wrap gap-1">
            {p.brands.map((b) => <BrandBadge key={b} brand={b.toUpperCase()} />)}
          </span>
        ) : <span className="text-muted-foreground/50">-</span>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground">
        {p.phone ? <span className="tabular-nums">{p.phone}</span> : p.email ? p.email : <span className="text-muted-foreground/50">-</span>}
      </td>
      <td className="py-2.5 px-3">
        {p.is_active ? <StatusPill color="green">Active</StatusPill> : <StatusPill color="zinc">Inactive</StatusPill>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground/40">
        <ChevronRight className="w-4 h-4" />
      </td>
    </tr>
  );
}
