import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useUsers, useDeactivateUser, useActivateUser } from "@/hooks/useUsers";
import { useResourcesWithUsers } from "@/hooks/useResources";
import { ROLE_LABELS, DEPARTMENT_LABELS, JOB_FUNCTION_LABELS } from "@/lib/rbac";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Switch } from "@repo/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@repo/ui/dialog";
import { Skeleton } from "@repo/ui/skeleton";
import { PageHeader } from "@/components/shared/PageShell";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  UserCog, Plus, Search, Shield, Power,
  Factory, ShoppingBag, UserX, AlertTriangle, Link2,
  ChevronDown, ChevronUp, Minus,
} from "lucide-react";
import { useOnlineUserIds } from "@/hooks/useSessions";
import type { User, Role, Department, JobFunction } from "@repo/database";

const BRAND_LABELS: Record<string, string> = { erth: "Erth", sakkba: "Sakkba", qass: "Qass" };

export const Route = createFileRoute("/(main)/users/")({
  component: UsersPage,
  head: () => ({ meta: [{ title: "User Management" }] }),
});

const ROLE_STYLE: Record<Role, string> = {
  super_admin: "bg-foreground text-background",
  admin:       "bg-foreground text-background",
  manager:     "bg-muted text-foreground",
  staff:       "bg-muted/40 text-muted-foreground",
  cashier:     "bg-muted/40 text-muted-foreground",
};

function getAvatarStyle(role: Role) {
  if (role === "admin" || role === "super_admin") return "bg-foreground text-background";
  if (role === "manager") return "bg-muted text-foreground";
  return "bg-muted/60 text-muted-foreground";
}

const ROLE_RANK: Record<Role, number> = { super_admin: 0, admin: 1, manager: 2, staff: 3, cashier: 4 };

// ── Deactivate Confirm Dialog ───────────────────────────────────────

function DeactivateDialog({
  open,
  onOpenChange,
  user,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: User | null;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const isActive = user?.is_active !== false;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-medium flex items-center gap-2">
            {isActive
              ? <AlertTriangle className="w-4 h-4 text-[var(--status-warn)]" />
              : <Power className="w-4 h-4 text-muted-foreground" />
            }
            {isActive ? "Deactivate user" : "Reactivate user"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isActive
              ? <>
                  <span className="font-medium text-foreground">{user?.name}</span> will no longer be able to log in. This can be reversed later.
                </>
              : <>
                  <span className="font-medium text-foreground">{user?.name}</span> will be able to log in again.
                </>
            }
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
          <Button
            variant={isActive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1"
          >
            {isPending ? "Processing..." : isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Stat tile (uniform grid, no wrap border issues) ─────────────────

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-medium tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

// ── User row ────────────────────────────────────────────────────────

function UserRow({
  user,
  linkedResourceName,
  isOnline,
  onEdit,
  onToggleActive,
}: {
  user: User;
  linkedResourceName: string | null;
  isOnline: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const isInactive = user.is_active === false;
  const role = (user.role as Role) ?? "staff";
  const department = (user.department as Department) ?? "workshop";
  const brands = (user as unknown as { brands: string[] | null }).brands;
  const jobFunctions = (user as unknown as { job_functions: JobFunction[] | null }).job_functions ?? [];

  const subline = department === "shop"
    ? (brands && brands.length > 0 ? brands.map((b) => BRAND_LABELS[b] ?? b).join(" · ") : "—")
    : (jobFunctions.length > 0 ? jobFunctions.map((j) => JOB_FUNCTION_LABELS[j]).join(" · ") : "Office staff");

  return (
    <div
      onClick={onEdit}
      className={cn(
        "group grid grid-cols-[minmax(0,1.6fr)_120px_140px_minmax(0,1.4fr)_90px_44px] gap-3 px-4 py-2.5 items-center cursor-pointer border-b last:border-b-0 border-border transition-colors",
        isInactive ? "opacity-60" : "hover:bg-muted/30",
      )}
    >
      {/* Name + avatar */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative shrink-0">
          <div className={cn(
            "w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium",
            getAvatarStyle(role),
          )}>
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-card",
              isInactive
                ? "bg-muted-foreground/30"
                : isOnline
                  ? "bg-[var(--status-ok)]"
                  : "bg-muted-foreground/30",
            )}
          />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">{user.name}</p>
          {user.username && (
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
          )}
        </div>
      </div>

      {/* Role */}
      <span className={cn(
        "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md w-fit",
        ROLE_STYLE[role],
      )}>
        <Shield className="w-3 h-3" />
        {ROLE_LABELS[role]}
      </span>

      {/* Department */}
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        {department === "workshop"
          ? <Factory className="w-3.5 h-3.5" />
          : <ShoppingBag className="w-3.5 h-3.5" />
        }
        {DEPARTMENT_LABELS[department]}
      </span>

      {/* Stations / Brands subline */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-muted-foreground truncate">{subline}</span>
        {linkedResourceName && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70 truncate">
            <Link2 className="w-2.5 h-2.5" />
            {linkedResourceName}
          </span>
        )}
      </div>

      {/* Status */}
      <span className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        isInactive
          ? "text-muted-foreground"
          : isOnline
            ? "text-[var(--status-ok)]"
            : "text-muted-foreground",
      )}>
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            isInactive
              ? "bg-muted-foreground/40"
              : isOnline
                ? "bg-[var(--status-ok)]"
                : "bg-muted-foreground/40",
          )}
        />
        {isInactive ? "Inactive" : isOnline ? "Online" : "Offline"}
      </span>

      {/* Action */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
        className={cn(
          "p-1.5 rounded-md text-muted-foreground transition-colors opacity-0 group-hover:opacity-100",
          isInactive ? "hover:text-[var(--status-ok)]" : "hover:text-destructive",
          "hover:bg-muted",
        )}
        title={isInactive ? "Reactivate" : "Deactivate"}
      >
        <Power className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function UsersPage() {
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useUsers();
  const { data: resources = [] } = useResourcesWithUsers();
  const onlineUserIds = useOnlineUserIds();
  const deactivateMut = useDeactivateUser();
  const activateMut = useActivateUser();

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<"all" | Department>("all");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [showInactive, setShowInactive] = useState(false);
  type SortKey = "name" | "role" | "department" | "status";
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  const getLinkedResourceName = (userId: string) => {
    const linked = resources.find((r) => r.user_id === userId);
    return linked?.resource_name ?? null;
  };

  const filtered = useMemo(() => {
    let list = users.slice();
    if (!showInactive) list = list.filter((u) => u.is_active !== false);
    if (deptFilter !== "all") list = list.filter((u) => u.department === deptFilter);
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q),
      );
    }
    const statusRank = (u: User) => {
      if (u.is_active === false) return 2;
      return onlineUserIds.has(u.id) ? 0 : 1;
    };
    list.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "role":
          cmp = (ROLE_RANK[(a.role as Role) ?? "staff"] ?? 99) - (ROLE_RANK[(b.role as Role) ?? "staff"] ?? 99);
          break;
        case "department":
          cmp = ((a.department as string) ?? "").localeCompare((b.department as string) ?? "");
          break;
        case "status":
          cmp = statusRank(a) - statusRank(b);
          break;
      }
      if (cmp === 0) cmp = a.name.localeCompare(b.name);
      return cmp * dir;
    });
    return list;
  }, [users, search, deptFilter, roleFilter, showInactive, sortBy, sortDir, onlineUserIds]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.is_active !== false).length,
    online: users.filter((u) => onlineUserIds.has(u.id)).length,
    workshop: users.filter((u) => u.department === "workshop" && u.is_active !== false).length,
    shop: users.filter((u) => u.department === "shop" && u.is_active !== false).length,
  }), [users, onlineUserIds]);

  const handleToggleActive = async () => {
    if (!deactivateTarget) return;
    try {
      if (deactivateTarget.is_active !== false) {
        await deactivateMut.mutateAsync(deactivateTarget.id);
      } else {
        await activateMut.mutateAsync(deactivateTarget.id);
      }
      setDeactivateDialogOpen(false);
      setDeactivateTarget(null);
    } catch (err) {
      const action = deactivateTarget.is_active !== false ? "deactivate" : "activate";
      toast.error(`Could not ${action} user: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={UserCog}
        title="Users"
        subtitle="Staff accounts, roles, and department access"
      >
        <Button asChild size="default" className="gap-2 shrink-0">
          <Link to="/users/new">
            <Plus className="w-4 h-4" />
            New user
          </Link>
        </Button>
      </PageHeader>

      {/* Stats strip — grid prevents border-wrap on small screens */}
      <div className="bg-card border border-border rounded-md grid grid-cols-2 sm:grid-cols-5 divide-x divide-border">
        <StatTile label="Total" value={stats.total} />
        <StatTile label="Active" value={stats.active} />
        <StatTile label="Online" value={stats.online} />
        <StatTile label="Workshop" value={stats.workshop} />
        <StatTile label="Shop" value={stats.shop} />
      </div>

      {/* Toolbar — flat row, no card */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Search name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex border border-border rounded-md bg-card p-0.5">
            {(["all", "workshop", "shop"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDeptFilter(d)}
                className={cn(
                  "px-3 py-1 text-sm font-medium rounded-sm transition-colors",
                  deptFilter === d
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d === "all" ? "All" : DEPARTMENT_LABELS[d]}
              </button>
            ))}
          </div>

          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | Role)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {(["super_admin", "admin", "manager", "staff"] as Role[]).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 px-3 h-9 rounded-md border border-border bg-card cursor-pointer">
            <Switch
              checked={showInactive}
              onCheckedChange={setShowInactive}
              className="scale-75 origin-left"
            />
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              Show inactive
            </span>
          </label>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="border border-border rounded-md bg-card divide-y divide-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="w-8 h-8 rounded-md" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/5" />
              </div>
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-md bg-card">
          <UserX className="w-6 h-6 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium">No users found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your search or filters.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3 gap-1.5">
            <Link to="/users/new">
              <Plus className="w-3.5 h-3.5" />
              New user
            </Link>
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-md bg-card overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_120px_140px_minmax(0,1.4fr)_90px_44px] gap-3 px-4 py-2 bg-muted/30 border-b border-border text-sm font-medium text-muted-foreground">
            {([
              { key: "name" as const, label: "Name" },
              { key: "role" as const, label: "Role" },
              { key: "department" as const, label: "Department" },
              null,
              { key: "status" as const, label: "Status" },
              null,
            ]).map((col, i) =>
              col === null ? (
                <span key={`x-${i}`}>{i === 3 ? "Stations / brands" : ""}</span>
              ) : (
                <button
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    "flex items-center gap-1 text-left transition-colors",
                    sortBy === col.key ? "text-foreground" : "hover:text-foreground",
                  )}
                >
                  {col.label}
                  {sortBy === col.key
                    ? sortDir === "asc"
                      ? <ChevronUp className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />
                    : <Minus className="w-2.5 h-2.5 opacity-40" />
                  }
                </button>
              )
            )}
          </div>
          {filtered.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              linkedResourceName={getLinkedResourceName(u.id)}
              isOnline={onlineUserIds.has(u.id)}
              onEdit={() => navigate({ to: "/users/$userId", params: { userId: u.id } })}
              onToggleActive={() => {
                setDeactivateTarget(u);
                setDeactivateDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          Showing {filtered.length} of {users.length} user{users.length !== 1 ? "s" : ""}
        </p>
      )}

      <DeactivateDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        user={deactivateTarget}
        onConfirm={handleToggleActive}
        isPending={deactivateMut.isPending || activateMut.isPending}
      />
    </div>
  );
}
