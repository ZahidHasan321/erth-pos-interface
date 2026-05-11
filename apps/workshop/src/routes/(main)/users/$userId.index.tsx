import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useUsers, useDeactivateUser, useActivateUser, useDeleteUser } from "@/hooks/useUsers";
import { useResourcesWithUsers } from "@/hooks/useResources";
import { useUnits } from "@/hooks/useUnits";
import { ROLE_LABELS, DEPARTMENT_LABELS, JOB_FUNCTION_LABELS } from "@/lib/rbac";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@repo/ui/dialog";
import { SectionCard, StatusBanner } from "@/components/shared/PageShell";
import { cn, TIMEZONE } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft, Power, Pencil, Trash2, AlertTriangle,
  Phone, Loader2, ShieldAlert,
} from "lucide-react";
import type { Role, Department, JobFunction, ProductionStage } from "@repo/database";

const STAGE_LABELS: Record<ProductionStage, string> = {
  soaking: "Soaking",
  cutting: "Cutting",
  post_cutting: "Post-cut",
  sewing: "Sewing",
  finishing: "Finishing",
  ironing: "Ironing",
  quality_check: "QC",
};

const BRAND_LABELS: Record<string, string> = { erth: "Erth", sakkba: "Sakkba", qass: "Qass" };

export const Route = createFileRoute("/(main)/users/$userId/")({
  component: UserDetailPage,
  head: () => ({ meta: [{ title: "User Detail" }] }),
});

function formatDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const iso = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00:00+03:00" : value;
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  const has = value != null && value !== "";
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn(
        "text-sm",
        has ? "text-foreground" : "text-muted-foreground/60",
        mono && has && "font-mono",
      )}>
        {has ? value : "—"}
      </span>
    </div>
  );
}

function UserDetailPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useUsers();
  const { data: resources = [] } = useResourcesWithUsers();
  const { data: units = [] } = useUnits();
  const deactivateMut = useDeactivateUser();
  const activateMut = useActivateUser();
  const deleteMut = useDeleteUser();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const user = useMemo(() => users.find((u) => u.id === userId), [users, userId]);
  const linkedResources = useMemo(
    () => resources.filter((r) => r.user_id === userId),
    [resources, userId],
  );
  const unitNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of units) m.set(u.id, u.name);
    return m;
  }, [units]);

  const handleToggleActive = async () => {
    if (!user) return;
    try {
      if (user.is_active !== false) {
        await deactivateMut.mutateAsync(user.id);
      } else {
        await activateMut.mutateAsync(user.id);
      }
    } catch (err) {
      const action = user.is_active !== false ? "deactivate" : "activate";
      toast.error(`Could not ${action} user: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      await deleteMut.mutateAsync(user.id);
      toast.success(`User "${user.name}" deleted`);
      setDeleteOpen(false);
      navigate({ to: "/users" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <Skeleton className="h-6 w-32 mb-6" />
        <Skeleton className="h-32 rounded-md mb-4" />
        <Skeleton className="h-64 rounded-md" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="mb-4 gap-2 text-muted-foreground -ml-2">
          <Link to="/users">
            <ArrowLeft className="w-4 h-4" />
            Back to Users
          </Link>
        </Button>
        <div className="text-center py-16 rounded-md border border-dashed border-border bg-card">
          <p className="text-base font-medium mb-1">User not found</p>
          <p className="text-sm text-muted-foreground">This user may have been removed.</p>
        </div>
      </div>
    );
  }

  const role = (user.role as Role) ?? "staff";
  const department = (user.department as Department) ?? "workshop";
  const jobFunctions = ((user as unknown as { job_functions: JobFunction[] | null }).job_functions) ?? [];
  const brands = (user as unknown as { brands: string[] | null }).brands;
  const isInactive = user.is_active === false;
  const togglePending = deactivateMut.isPending || activateMut.isPending;
  const phoneValue = user.phone ? `${user.country_code ?? ""} ${user.phone}`.trim() : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground -ml-2">
        <Link to="/users">
          <ArrowLeft className="w-4 h-4" />
          Users
        </Link>
      </Button>

      {/* Header */}
      <div className="rounded-md border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className={cn(
          "w-12 h-12 rounded-md flex items-center justify-center text-base font-medium shrink-0",
          isInactive ? "bg-muted text-muted-foreground" : "bg-foreground text-background",
        )}>
          {user.name.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
            <span className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md",
              isInactive
                ? "bg-muted text-muted-foreground"
                : "bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
            )}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                isInactive ? "bg-muted-foreground/50" : "bg-[var(--status-ok)]",
              )} />
              {isInactive ? "Inactive" : "Active"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">@{user.username}</p>
        </div>

        <div className="flex gap-2 sm:shrink-0">
          <Button size="sm" asChild className="gap-1.5">
            <Link to="/users/$userId/edit" params={{ userId: user.id }}>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleActive}
            disabled={togglePending}
            className="gap-1.5"
          >
            {togglePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
            {isInactive ? "Reactivate" : "Deactivate"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={deleteMut.isPending}
            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/5"
          >
            {deleteMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete
          </Button>
        </div>
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Role & access">
            <div className="divide-y divide-border">
              <Field label="Role" value={ROLE_LABELS[role]} />
              <Field label="Department" value={DEPARTMENT_LABELS[department]} />
              {jobFunctions.length > 0 && (
                <Field label="Terminals" value={jobFunctions.map((j) => JOB_FUNCTION_LABELS[j]).join(", ")} />
              )}
              {department === "shop" && brands && brands.length > 0 && (
                <Field label="Brands" value={brands.map((b) => BRAND_LABELS[b] ?? b).join(", ")} />
              )}
            </div>
          </SectionCard>

          <SectionCard title="Contact">
            <div className="divide-y divide-border">
              <Field label="Email" value={user.email} />
              <Field label="Phone" value={phoneValue} mono />
            </div>
          </SectionCard>

          <SectionCard title="Employment">
            <div className="divide-y divide-border">
              <Field label="Employee ID" value={user.employee_id} mono />
              <Field label="Nationality" value={user.nationality} />
              <Field label="Hire date" value={formatDate(user.hire_date)} />
            </div>
          </SectionCard>

          {user.notes && (
            <SectionCard title="Notes">
              <p className="text-sm text-foreground whitespace-pre-wrap">{user.notes}</p>
            </SectionCard>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-4">
          {linkedResources.length > 0 && (
            <SectionCard
              title="Production profile"
            >
              <p className="text-xs text-muted-foreground mb-3">
                Per-stage assignments. Targets, units, and KPIs are tracked separately per stage.
              </p>
              <div className="space-y-2">
                {linkedResources.map((r) => {
                  const stageLabel = r.responsibility
                    ? STAGE_LABELS[r.responsibility as ProductionStage] ?? r.responsibility
                    : "Unassigned stage";
                  const unitName = r.unit_id ? unitNameById.get(r.unit_id) ?? null : null;
                  return (
                    <div key={r.id} className="p-3 rounded-md border border-border bg-muted/20">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm font-medium">{stageLabel}</span>
                        {r.resource_type && (
                          <span className="text-xs font-medium text-muted-foreground bg-card px-2 py-0.5 rounded-md">
                            {r.resource_type}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">Unit</span>
                        <span className={cn(unitName ? "text-foreground" : "text-muted-foreground/60")}>
                          {unitName ?? "—"}
                        </span>
                        <span className="text-muted-foreground">Daily target</span>
                        <span className={cn("tabular-nums", r.daily_target ? "text-foreground" : "text-muted-foreground/60")}>
                          {r.daily_target ?? "—"}
                        </span>
                        <span className="text-muted-foreground">Rating</span>
                        <span className={cn("tabular-nums", r.rating != null ? "text-foreground" : "text-muted-foreground/60")}>
                          {r.rating ?? "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          <SectionCard title="System">
            <div className="divide-y divide-border">
              <Field label="Created" value={formatDate(user.created_at)} />
              {user.updated_at && <Field label="Updated" value={formatDate(user.updated_at)} />}
            </div>
          </SectionCard>

          {(role === "admin" || role === "super_admin") && (
            <StatusBanner tone="warn" icon={ShieldAlert}>
              This user has elevated privileges.
            </StatusBanner>
          )}
          {!user.email && !phoneValue && (
            <StatusBanner tone="info" icon={Phone}>
              No contact information on file.
            </StatusBanner>
          )}
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--status-bad)]" />
              Delete user permanently?
            </DialogTitle>
            <DialogDescription className="text-sm">
              <span className="font-medium text-foreground">{user.name}</span> and their login will be removed for good. This cannot be undone. If they have any order or production history, the delete will be blocked — deactivate them instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="flex-1" disabled={deleteMut.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMut.isPending} className="flex-1">
              {deleteMut.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
