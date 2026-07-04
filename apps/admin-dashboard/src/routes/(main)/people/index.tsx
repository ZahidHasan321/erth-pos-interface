import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Users, AlertTriangle, UserCog, Factory, Contact } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterChip, FilterChipGroup } from "@/components/shared/FilterChip";
import { Button } from "@repo/ui/button";
import {
  useStaffRoster,
  useWorkshopRoster,
  useCustomersPage,
} from "@/hooks/useAdmin";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import type { StaffRow, WorkerRow, CustomerRow } from "@/api/admin";

type Tab = "staff" | "workers" | "customers";

interface PeopleSearch {
  tab?: Tab;
  q?: string;
  acct?: string;
}

export const Route = createFileRoute("/(main)/people/")({
  validateSearch: (s: Record<string, unknown>): PeopleSearch => ({
    tab: s.tab === "workers" || s.tab === "customers" ? s.tab : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    acct: s.acct === "Primary" || s.acct === "Secondary" ? s.acct : undefined,
  }),
  component: PeoplePage,
});

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "staff", label: "Staff", icon: UserCog },
  { value: "workers", label: "Workshop", icon: Factory },
  { value: "customers", label: "Customers", icon: Contact },
];

function PeoplePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab: Tab = search.tab ?? "staff";

  const patch = (next: Partial<PeopleSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <div>
      <PageHeader icon={Users} title="People" subtitle="Staff, workshop workers & customers" />

      <FilterChipGroup className="mb-4">
        {TABS.map((t) => (
          <FilterChip key={t.value} icon={t.icon} active={tab === t.value} onClick={() => patch({ tab: t.value === "staff" ? undefined : t.value, q: undefined, acct: undefined })}>
            {t.label}
          </FilterChip>
        ))}
      </FilterChipGroup>

      {tab === "staff" && <StaffTab />}
      {tab === "workers" && <WorkersTab />}
      {tab === "customers" && <CustomersTab search={search} patch={patch} />}
    </div>
  );
}

// ── Staff ────────────────────────────────────────────────────────────────────

function isOnline(lastActive: string | null): boolean {
  if (!lastActive) return false;
  const t = new Date(lastActive.endsWith("Z") || lastActive.includes("+") ? lastActive : lastActive + "Z").getTime();
  return Date.now() - t < 5 * 60_000;
}

function StaffTab() {
  const { data, isLoading, isError, error } = useStaffRoster();
  const active = data?.filter((u) => u.is_active).length ?? 0;

  if (isError) return <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load staff"} />;
  if (isLoading || !data) return <LoadingSkeleton count={6} />;
  if (data.length === 0) return <EmptyState icon={UserCog} message="No staff found" />;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatsCard icon={UserCog} value={data.length} label="Users" color="blue" />
        <StatsCard icon={UserCog} value={active} label="Active" color="green" />
        <StatsCard icon={UserCog} value={data.length - active} label="Inactive" color="zinc" dimOnZero />
      </div>
      <SectionCard bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2.5 px-4 font-medium">Name</th>
                <th className="py-2.5 px-3 font-medium">Role</th>
                <th className="py-2.5 px-3 font-medium">Dept</th>
                <th className="py-2.5 px-3 font-medium">Brands</th>
                <th className="py-2.5 px-3 font-medium">Contact</th>
                <th className="py-2.5 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => <StaffRowView key={u.id} u={u} />)}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

function StaffRowView({ u }: { u: StaffRow }) {
  const online = isOnline(u.last_active_at);
  return (
    <tr className={"border-b border-border/60 hover:bg-muted/40 transition-colors " + (u.is_active ? "" : "opacity-50")}>
      <td className="py-2.5 px-4">
        <div className="font-medium">{u.name}</div>
        <div className="text-xs text-muted-foreground">@{u.username}{u.employee_id ? ` · ${u.employee_id}` : ""}</div>
      </td>
      <td className="py-2.5 px-3">{u.role ? <StatusPill color="violet">{titleCase(u.role)}</StatusPill> : "—"}</td>
      <td className="py-2.5 px-3 text-muted-foreground">{u.department ? titleCase(u.department) : "—"}</td>
      <td className="py-2.5 px-3">
        <span className="inline-flex flex-wrap gap-1">
          {(u.brands ?? []).map((b) => <BrandBadge key={b} brand={b.toUpperCase()} />)}
          {(!u.brands || u.brands.length === 0) && <span className="text-muted-foreground/50">—</span>}
        </span>
      </td>
      <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{u.phone ?? u.email ?? "—"}</td>
      <td className="py-2.5 px-3">
        {!u.is_active ? <StatusPill color="zinc">Inactive</StatusPill>
          : online ? <StatusPill color="green">Online</StatusPill>
          : <span className="text-xs text-muted-foreground">{u.last_active_at ? formatDate(u.last_active_at) : "—"}</span>}
      </td>
    </tr>
  );
}

// ── Workshop workers ─────────────────────────────────────────────────────────

function WorkersTab() {
  const { data, isLoading, isError, error } = useWorkshopRoster();

  if (isError) return <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load workers"} />;
  if (isLoading || !data) return <LoadingSkeleton count={6} />;
  if (data.length === 0) return <EmptyState icon={Factory} message="No workshop workers found" />;

  return (
    <SectionCard bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2.5 px-4 font-medium">Worker</th>
              <th className="py-2.5 px-3 font-medium">Unit</th>
              <th className="py-2.5 px-3 font-medium">Stage</th>
              <th className="py-2.5 px-3 font-medium">Brand</th>
              <th className="py-2.5 px-3 font-medium text-right">Rating</th>
              <th className="py-2.5 px-3 font-medium text-right">Daily target</th>
              <th className="py-2.5 px-3 font-medium">Linked user</th>
            </tr>
          </thead>
          <tbody>
            {data.map((w) => <WorkerRowView key={w.id} w={w} />)}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-border text-xs text-muted-foreground">{formatNum(data.length)} workers</div>
    </SectionCard>
  );
}

function WorkerRowView({ w }: { w: WorkerRow }) {
  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-4">
        <div className="font-medium">{w.resource_name}</div>
        {w.resource_type && <div className="text-xs text-muted-foreground">{titleCase(w.resource_type)}</div>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground">{w.unit_name ?? "—"}</td>
      <td className="py-2.5 px-3 text-muted-foreground">{w.stage ? titleCase(w.stage) : "—"}</td>
      <td className="py-2.5 px-3">{w.brand ? <BrandBadge brand={w.brand} /> : <span className="text-muted-foreground/50">—</span>}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{w.rating ?? "—"}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{w.daily_target ?? "—"}</td>
      <td className="py-2.5 px-3 text-muted-foreground">
        {w.user_name ? (
          <span className="inline-flex items-center gap-1.5">
            {w.user_name}
            {w.user_active === false && <StatusPill color="zinc">Inactive</StatusPill>}
          </span>
        ) : <span className="text-muted-foreground/50">—</span>}
      </td>
    </tr>
  );
}

// ── Customers ────────────────────────────────────────────────────────────────

function CustomersTab({ search, patch }: { search: PeopleSearch; patch: (n: Partial<PeopleSearch>) => void }) {
  const filters = useMemo(
    () => ({ accountType: search.acct ?? null, search: search.q ?? null }),
    [search.acct, search.q],
  );
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } =
    useCustomersPage(filters);

  const rows: CustomerRow[] = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const stats = data?.pages[0]?.stats ?? null;

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <FilterChipGroup>
          <FilterChip active={!search.acct} onClick={() => patch({ acct: undefined })}>All</FilterChip>
          <FilterChip active={search.acct === "Primary"} onClick={() => patch({ acct: "Primary" })}>Primary</FilterChip>
          <FilterChip active={search.acct === "Secondary"} onClick={() => patch({ acct: "Secondary" })}>Secondary</FilterChip>
        </FilterChipGroup>
        <SearchInput
          value={search.q ?? ""}
          onChange={(v) => patch({ q: v || undefined })}
          placeholder="Name, Arabic name, phone…"
          className="sm:w-72"
        />
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatsCard icon={Contact} value={stats.total_customers} label="Customers" color="blue" />
          <StatsCard icon={Contact} value={stats.primary_count} label="Primary" color="green" />
          <StatsCard icon={Contact} value={stats.secondary_count} label="Secondary" color="purple" dimOnZero />
        </div>
      )}

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load customers"} />
      ) : isLoading ? (
        <LoadingSkeleton count={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Contact} message="No customers match" />
      ) : (
        <SectionCard bodyClassName="p-0">
          <div className={"overflow-x-auto " + (isFetching && !isFetchingNextPage ? "opacity-60 transition-opacity" : "")}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Customer</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Phone</th>
                  <th className="py-2.5 px-3 font-medium text-right">Orders</th>
                  <th className="py-2.5 px-3 font-medium text-right">Spend</th>
                  <th className="py-2.5 px-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => <CustomerRowView key={c.id} c={c} />)}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Showing {formatNum(rows.length)}{stats ? ` of ${formatNum(stats.total_customers)}` : ""}</span>
            {hasNextPage && (
              <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </SectionCard>
      )}
    </>
  );
}

function CustomerRowView({ c }: { c: CustomerRow }) {
  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-4">
        <div className="font-medium">{c.name}</div>
        <div className="text-xs text-muted-foreground">
          {c.arabic_name ? <span dir="rtl">{c.arabic_name}</span> : null}
          {c.account_type === "Secondary" && c.primary_name ? (
            <span>{c.arabic_name ? " · " : ""}{c.relation ? `${titleCase(c.relation)} of ` : "of "}{c.primary_name}</span>
          ) : null}
        </div>
      </td>
      <td className="py-2.5 px-3">
        {c.account_type === "Secondary"
          ? <StatusPill color="purple">Secondary</StatusPill>
          : <span className="text-muted-foreground">Primary</span>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{c.phone ?? "—"}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">{formatNum(c.orders_count)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">{formatKwd(c.total_spend)}</td>
      <td className="py-2.5 px-3 text-right">
        {c.phone && (
          <Link to="/orders" search={{ q: c.phone }} className="text-xs text-[var(--status-info)] hover:underline">
            Orders
          </Link>
        )}
      </td>
    </tr>
  );
}
