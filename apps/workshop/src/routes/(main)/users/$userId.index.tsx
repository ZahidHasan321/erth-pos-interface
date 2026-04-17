import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useUsers, useDeactivateUser, useActivateUser } from "@/hooks/useUsers";
import { useResourcesWithUsers } from "@/hooks/useResources";
import { ROLE_LABELS, DEPARTMENT_LABELS, JOB_FUNCTION_LABELS } from "@/lib/rbac";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { cn, TIMEZONE } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft, Shield, Power, Pencil,
  Link2, Factory, ShoppingBag, Store,
  Mail, Phone, Briefcase, Globe, CalendarDays,
  Clock,
} from "lucide-react";
import type { Role, Department, JobFunction } from "@repo/database";

const BRAND_LABELS: Record<string, string> = { erth: "Erth", sakkba: "Sakkba", qass: "Qass" };

export const Route = createFileRoute("/(main)/users/$userId/")({
  component: UserDetailPage,
  head: () => ({ meta: [{ title: "User Detail" }] }),
});

function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return null;
  // date-only strings (hire_date) need noon-UTC anchor so timezone conversion keeps the same day
  const iso = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00:00+03:00" : value;
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...opts,
  });
}

// ── Spec row: left label, right value (blueprint style) ─────────────────────

function Spec({
  label,
  value,
  icon: Icon,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ComponentType<{ className?: string }>;
  mono?: boolean;
}) {
  const hasValue = value != null && value !== "";
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-dashed last:border-b-0">
      <div className="flex items-center gap-1.5 w-[110px] shrink-0">
        {Icon && <Icon className="w-3 h-3 text-muted-foreground/70" />}
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      </div>
      <span className={cn(
        "text-sm flex-1 truncate",
        hasValue ? "text-foreground" : "text-muted-foreground/50 italic",
        mono && hasValue && "font-mono tracking-tight",
      )}>
        {hasValue ? value : "—"}
      </span>
    </div>
  );
}

function UserDetailPage() {
  const { userId } = Route.useParams();
  const { data: users = [], isLoading } = useUsers();
  const { data: resources = [] } = useResourcesWithUsers();
  const deactivateMut = useDeactivateUser();
  const activateMut = useActivateUser();

  const user = useMemo(() => users.find((u) => u.id === userId), [users, userId]);
  const linkedResource = useMemo(
    () => resources.find((r) => r.user_id === userId) ?? null,
    [resources, userId],
  );

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

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 ">
        <Skeleton className="h-6 w-32 mb-6" />
        <Skeleton className="h-48 rounded-xl mb-4" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 ">
        <Button variant="ghost" size="sm" asChild className="mb-4 gap-2 text-muted-foreground -ml-2">
          <Link to="/users">
            <ArrowLeft className="w-4 h-4" />
            Back to Users
          </Link>
        </Button>
        <div className="text-center py-20 rounded-xl border border-dashed">
          <p className="text-lg font-semibold mb-1">User not found</p>
          <p className="text-sm text-muted-foreground">This user may have been removed.</p>
        </div>
      </div>
    );
  }

  const role = (user.role as Role) ?? "staff";
  const department = (user.department as Department) ?? "workshop";
  const jobFunction = (user as unknown as { job_function: JobFunction | null }).job_function;
  const brands = (user as unknown as { brands: string[] | null }).brands;
  const isInactive = user.is_active === false;
  const togglePending = deactivateMut.isPending || activateMut.isPending;

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-zinc-100/60 min-h-full">
      {/* Breadcrumb */}
      <Button variant="ghost" size="sm" asChild className="mb-3 gap-2 text-muted-foreground -ml-2">
        <Link to="/users">
          <ArrowLeft className="w-4 h-4" />
          Users
        </Link>
      </Button>

      {/* Hero / Dossier */}
      <div className={cn(
        "rounded-xl border overflow-hidden mb-4",
        isInactive ? "bg-muted/20" : "bg-card",
      )}>
        <div className="flex items-center justify-between px-5 py-2 bg-muted/40 border-b">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black tracking-[0.2em] text-muted-foreground">PERSONNEL FILE</span>
            <span className="h-px w-6 bg-border" />
            <span className="text-[10px] font-mono text-muted-foreground">{user.id.slice(0, 8)}</span>
          </div>
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded",
            isInactive
              ? "bg-zinc-200 text-zinc-600"
              : "bg-emerald-100 text-emerald-700",
          )}>
            {isInactive ? "Inactive" : "Active"}
          </span>
        </div>

        <div className="p-6 flex flex-col sm:flex-row gap-6 items-start">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className={cn(
              "w-20 h-20 rounded-xl flex items-center justify-center text-2xl font-black tracking-tight ring-1 ring-border",
              isInactive ? "bg-zinc-100 text-zinc-400"
              : role === "admin" || role === "super_admin" ? "bg-zinc-900 text-white"
              : role === "manager" ? "bg-zinc-200 text-zinc-800"
              : "bg-zinc-100 text-zinc-600",
            )}>
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            {role === "super_admin" && (
              <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-400 text-amber-950 rounded">
                S·A
              </span>
            )}
          </div>

          {/* Name block */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-none mb-1">{user.name}</h1>
            <p className="text-sm font-mono text-muted-foreground mb-3">@{user.username}</p>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn(
                "inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] px-2 py-1 rounded border",
                role === "super_admin" ? "bg-amber-50 text-amber-800 border-amber-200"
                : role === "admin" ? "bg-zinc-900 text-white border-zinc-900"
                : role === "manager" ? "bg-zinc-200 text-zinc-800 border-zinc-300"
                : "bg-zinc-100 text-zinc-600 border-zinc-200",
              )}>
                <Shield className="w-2.5 h-2.5" />
                {ROLE_LABELS[role]}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] px-2 py-1 rounded border bg-zinc-100 text-zinc-600 border-zinc-200">
                {department === "workshop" ? <Factory className="w-2.5 h-2.5" /> : <ShoppingBag className="w-2.5 h-2.5" />}
                {DEPARTMENT_LABELS[department]}
              </span>
              {jobFunction && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] px-2 py-1 rounded border bg-amber-50 text-amber-800 border-amber-200">
                  <span className="font-black">◆</span>
                  {JOB_FUNCTION_LABELS[jobFunction]} Terminal
                </span>
              )}
              {department === "shop" && brands && brands.map((b) => (
                <span key={b} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded border bg-background text-muted-foreground border-border">
                  <Store className="w-2.5 h-2.5" />
                  {BRAND_LABELS[b] ?? b}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
            <Button size="sm" asChild className="gap-1.5 flex-1 sm:flex-none">
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
              className="gap-1.5 flex-1 sm:flex-none"
            >
              <Power className="w-3.5 h-3.5" />
              {isInactive ? "Reactivate" : "Deactivate"}
            </Button>
          </div>
        </div>
      </div>

      {/* Spec sheet: Contact + HR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-2.5 bg-muted/30 border-b flex items-center justify-between">
            <span className="text-[10px] font-black tracking-[0.2em] text-muted-foreground">CONTACT</span>
            <span className="text-[10px] font-mono text-muted-foreground">01</span>
          </div>
          <div className="px-5 py-2">
            <Spec label="Email" value={user.email} icon={Mail} />
            <Spec
              label="Phone"
              value={user.phone ? `${user.country_code ?? ""} ${user.phone}`.trim() : null}
              icon={Phone}
              mono
            />
          </div>
        </section>

        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-2.5 bg-muted/30 border-b flex items-center justify-between">
            <span className="text-[10px] font-black tracking-[0.2em] text-muted-foreground">EMPLOYEE RECORD</span>
            <span className="text-[10px] font-mono text-muted-foreground">02</span>
          </div>
          <div className="px-5 py-2">
            <Spec label="Emp ID" value={user.employee_id} icon={Briefcase} mono />
            <Spec label="Nationality" value={user.nationality} icon={Globe} />
            <Spec label="Hired" value={formatDate(user.hire_date)} icon={CalendarDays} />
          </div>
        </section>
      </div>

      {/* Notes */}
      {user.notes && (
        <section className="mt-4 rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-2.5 bg-muted/30 border-b flex items-center justify-between">
            <span className="text-[10px] font-black tracking-[0.2em] text-muted-foreground">NOTES</span>
            <span className="text-[10px] font-mono text-muted-foreground">03</span>
          </div>
          <p className="px-5 py-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">{user.notes}</p>
        </section>
      )}

      {/* Production profile link */}
      {linkedResource && (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
          <div className="px-5 py-2.5 bg-amber-100/60 border-b border-amber-200 flex items-center justify-between">
            <span className="text-[10px] font-black tracking-[0.2em] text-amber-800">PRODUCTION PROFILE</span>
            <Link2 className="w-3 h-3 text-amber-700" />
          </div>
          <div className="px-5 py-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-amber-200/60 flex items-center justify-center">
              <Factory className="w-4 h-4 text-amber-800" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{linkedResource.resource_name}</p>
              <p className="text-[11px] text-amber-800/80">
                Linked worker · KPI history attached to this account
              </p>
            </div>
          </div>
        </section>
      )}

      {/* System metadata */}
      <div className="mt-5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>Created {formatDate(user.created_at) ?? "—"}</span>
        {user.updated_at && (
          <>
            <span className="opacity-40">·</span>
            <span>Updated {formatDate(user.updated_at)}</span>
          </>
        )}
      </div>
    </div>
  );
}
