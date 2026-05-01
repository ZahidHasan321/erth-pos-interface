import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useUsers, useDeactivateUser, useActivateUser } from "@/hooks/useUsers";
import { useResourcesWithUsers } from "@/hooks/useResources";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/rbac";
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
  UserCog, Plus, Search, Shield,
  Phone, Mail, Power,
  Link2, Users, Factory, ShoppingBag,
  UserX, AlertTriangle, Briefcase, Wifi,
} from "lucide-react";
import { useOnlineUserIds } from "@/hooks/useSessions";
import type { User, Role, Department } from "@repo/database";

const BRAND_LABELS: Record<string, string> = { erth: "Erth", sakkba: "Sakkba", qass: "Qass" };

export const Route = createFileRoute("/(main)/users/")({
  component: UsersPage,
  head: () => ({ meta: [{ title: "User Management" }] }),
});

const ROLE_STYLE: Record<Role, string> = {
  super_admin: "bg-foreground text-background border-foreground",
  admin:       "bg-foreground text-background border-foreground",
  manager:     "bg-muted text-foreground border-border",
  staff:       "bg-card text-muted-foreground border-border",
};

const DEPT_STYLE: Record<Department, string> = {
  workshop: "bg-card text-muted-foreground border-border",
  shop:     "bg-card text-muted-foreground border-border",
};

function getAvatarStyle(role: Role, _department: Department) {
  if (role === "admin" || role === "super_admin") return "bg-foreground text-background border-foreground";
  if (role === "manager") return "bg-muted text-foreground border-border";
  return "bg-card text-muted-foreground border-border";
}


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
          <div className="mx-auto w-10 h-10 rounded-md border bg-muted flex items-center justify-center mb-2">
            {isActive
              ? <AlertTriangle className="w-5 h-5 text-foreground" />
              : <Power className="w-5 h-5 text-foreground" />
            }
          </div>
          <DialogTitle className="text-center text-base font-bold">
            {isActive ? "Deactivate User" : "Reactivate User"}
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            {isActive
              ? <>
                  <span className="font-semibold text-foreground">{user?.name}</span> will no longer be able to log in. This can be reversed later.
                </>
              : <>
                  <span className="font-semibold text-foreground">{user?.name}</span> will be able to log in again.
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

// ── Stat Card ───────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border bg-card p-4", className)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-semibold leading-none tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

// ── User Card ───────────────────────────────────────────────────────

function UserCard({
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
  const brands = (user as any).brands as string[] | null;

  // Reserve three detail slots so every card has the same vertical footprint
  // regardless of which contact fields are set. Empty slots render a dash.
  const detailSlots: { icon: React.ElementType; value: string | null }[] = [
    { icon: Briefcase, value: user.employee_id ?? null },
    { icon: Mail, value: user.email ?? null },
    { icon: Phone, value: user.phone ? [user.country_code, user.phone].filter(Boolean).join(" ") : null },
  ];

  return (
    <div
      onClick={onEdit}
      className={cn(
        "group relative rounded-md border bg-card p-4 transition-colors cursor-pointer flex flex-col h-full",
        isInactive
          ? "opacity-60 bg-muted/30 border-dashed"
          : "hover:border-foreground/40",
      )}
    >
      {/* Action buttons - top right */}
      <div className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
          className={cn(
            "p-1.5 rounded-sm transition-colors",
            isInactive
              ? "text-muted-foreground hover:text-emerald-700 hover:bg-muted"
              : "text-muted-foreground hover:text-destructive hover:bg-muted",
          )}
          title={isInactive ? "Reactivate" : "Deactivate"}
        >
          <Power className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Avatar + Name */}
      <div className="flex items-start gap-3 mb-3">
        <div className="relative shrink-0">
          <div className={cn(
            "w-10 h-10 rounded-md flex items-center justify-center text-sm font-semibold border",
            getAvatarStyle(role, department),
          )}>
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          {/* Online indicator dot */}
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
            isInactive ? "bg-muted-foreground/30" : isOnline ? "bg-emerald-500" : "bg-muted-foreground/30",
          )} />
        </div>
        <div className="min-w-0 flex-1 pr-8">
          <p className="text-sm font-semibold truncate leading-tight">{user.name}</p>
          {user.username && (
            <p className="text-[11px] text-muted-foreground truncate">@{user.username}</p>
          )}
        </div>
      </div>

      {/* Details — reserved 3 slots for consistent height */}
      <div className="space-y-1 mb-3">
        {detailSlots.map((slot, i) => {
          const Icon = slot.icon;
          return (
            <div key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
              <Icon className="w-3 h-3 shrink-0" />
              {slot.value ? (
                <span className="truncate">{slot.value}</span>
              ) : (
                <span className="text-muted-foreground/50">—</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Badges — pinned to bottom via mt-auto */}
      <div className="mt-auto pt-2 border-t border-dashed space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border",
            ROLE_STYLE[role],
          )}>
            <Shield className="w-2.5 h-2.5" />
            {ROLE_LABELS[role]}
          </span>
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border",
            DEPT_STYLE[department],
          )}>
            {department === "workshop" ? <Factory className="w-2.5 h-2.5" /> : <ShoppingBag className="w-2.5 h-2.5" />}
            {DEPARTMENT_LABELS[department]}
          </span>
          {department === "shop" && brands && brands.map((b) => (
            <span
              key={b}
              className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm border bg-card text-muted-foreground border-border"
            >
              {BRAND_LABELS[b] ?? b}
            </span>
          ))}
        </div>

        {/* Linked worker profile indicator — always reserved so cards stay same height */}
        <div className={cn(
          "flex items-center gap-1.5 text-[10px] rounded-md px-2 py-1 border",
          linkedResourceName
            ? "text-muted-foreground bg-muted/60 border-border"
            : "text-muted-foreground/50 bg-transparent border-dashed",
        )}>
          <Link2 className="w-3 h-3 shrink-0" />
          <span className="font-medium truncate">
            {linkedResourceName ? `Linked: ${linkedResourceName}` : "No worker profile linked"}
          </span>
        </div>
      </div>
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

  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  const getLinkedResourceName = (userId: string) => {
    const linked = resources.find((r) => r.user_id === userId);
    return linked?.resource_name ?? null;
  };

  // Filtered users
  const filtered = useMemo(() => {
    let list = users;
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
    return list;
  }, [users, search, deptFilter, roleFilter, showInactive]);

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        icon={UserCog}
        title="User Management"
        subtitle="Manage staff accounts, roles, and department access"
      >
        <Button asChild size="default" className="gap-2 shrink-0">
          <Link to="/users/new">
            <Plus className="w-4 h-4" />
            Add User
          </Link>
        </Button>
      </PageHeader>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total Users" value={stats.total} icon={Users} />
        <StatCard label="Active" value={stats.active} icon={UserCog} />
        <StatCard label="Online Now" value={stats.online} icon={Wifi} />
        <StatCard label="Workshop" value={stats.workshop} icon={Factory} />
        <StatCard label="Shop" value={stats.shop} icon={ShoppingBag} />
      </div>

      {/* Toolbar */}
      <div className="rounded-md border bg-card p-3 mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-10 bg-muted/40 border-muted-foreground/20 focus-visible:bg-background"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Department toggle pills */}
          <div className="flex rounded-sm border bg-muted p-0.5">
            {(["all", "workshop", "shop"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDeptFilter(d)}
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold uppercase tracking-wide rounded-sm transition-colors",
                  deptFilter === d
                    ? "bg-background text-foreground border border-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d === "all" ? "All" : DEPARTMENT_LABELS[d]}
              </button>
            ))}
          </div>

          {/* Role filter */}
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | Role)}>
            <SelectTrigger className="w-[140px] h-9 bg-muted border-border">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {(["super_admin", "admin", "manager", "staff"] as Role[]).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Inactive toggle */}
          <label
            htmlFor="show-inactive"
            className={cn(
              "flex items-center gap-2 px-3 h-9 rounded-sm border cursor-pointer transition-colors",
              showInactive
                ? "bg-foreground text-background border-foreground"
                : "bg-muted border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
              className="scale-75 origin-left"
            />
            <span className="text-xs font-semibold whitespace-nowrap">
              Show inactive
            </span>
          </label>
        </div>
      </div>

      {/* User Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-md border bg-card p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-md shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-sm" />
                <Skeleton className="h-5 w-20 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-md border bg-muted flex items-center justify-center mb-4">
            <UserX className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No users found</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Try adjusting your search or filters, or add a new user to get started.
          </p>
          <Button asChild variant="outline" className="mt-4 gap-2">
            <Link to="/users/new">
              <Plus className="w-4 h-4" />
              Add User
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
          {filtered.map((u) => (
            <UserCard
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

      {/* Footer count */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground mt-4 text-center">
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
