import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useUsers, useCreateUser, useUpdateUser, useDeactivateUser, useActivateUser } from "@/hooks/useUsers";
import { useResourcesWithUsers, useLinkResourceToUser, useUnlinkResourceFromUser } from "@/hooks/useResources";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  UserCog, Plus, Search, Shield, Building2,
  Phone, Mail, Hash, Power, Pencil,
  Link2, Store, Users, Factory, ShoppingBag,
  UserX, AlertTriangle,
} from "lucide-react";
import type { User, NewUser, Role, Department } from "@repo/database";

const ALL_BRANDS = ["erth", "sakkba", "qass"] as const;
const BRAND_LABELS: Record<string, string> = { erth: "Erth", sakkba: "Sakkba", qass: "Qass" };
const BRAND_STYLE: Record<string, string> = {
  erth: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  sakkba: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  qass: "bg-orange-500/10 text-orange-700 border-orange-200",
};

export const Route = createFileRoute("/(main)/users")({
  component: UsersPage,
  head: () => ({ meta: [{ title: "User Management" }] }),
});

type UserForm = {
  username: string;
  name: string;
  email: string;
  country_code: string;
  phone: string;
  role: Role;
  department: Department;
  brands: string[];
  is_active: boolean;
  pin: string;
  link_resource_id: string;
};

const EMPTY_FORM: UserForm = {
  username: "",
  name: "",
  email: "",
  country_code: "+965",
  phone: "",
  role: "staff",
  department: "workshop",
  brands: [],
  is_active: true,
  pin: "",
  link_resource_id: "",
};

const ROLE_STYLE: Record<Role, string> = {
  admin:   "bg-red-500/10 text-red-700 border-red-200",
  manager: "bg-amber-500/10 text-amber-700 border-amber-200",
  staff:   "bg-zinc-500/10 text-zinc-600 border-zinc-200",
};

const DEPT_STYLE: Record<Department, string> = {
  workshop: "bg-violet-500/10 text-violet-700 border-violet-200",
  shop:     "bg-sky-500/10 text-sky-700 border-sky-200",
};

const AVATAR_STYLE: Record<string, string> = {
  admin: "bg-red-100 text-red-700 ring-red-200",
  manager: "bg-amber-100 text-amber-700 ring-amber-200",
  workshop: "bg-violet-100 text-violet-700 ring-violet-200",
  shop: "bg-sky-100 text-sky-700 ring-sky-200",
};

function getAvatarStyle(role: Role, department: Department) {
  if (role === "admin") return AVATAR_STYLE.admin;
  if (role === "manager") return AVATAR_STYLE.manager;
  return AVATAR_STYLE[department] ?? AVATAR_STYLE.workshop;
}

// ── User Form Sheet ─────────────────────────────────────────────────

function UserFormSheet({
  open,
  onOpenChange,
  mode,
  form,
  setForm,
  onSubmit,
  isPending,
  unlinkedResources,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "add" | "edit";
  form: UserForm;
  setForm: React.Dispatch<React.SetStateAction<UserForm>>;
  onSubmit: () => void;
  isPending: boolean;
  unlinkedResources: { id: string; name: string; responsibility: string | null }[];
}) {
  const showResourceLink = form.department === "workshop" && form.role === "staff";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-lg font-bold flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              {mode === "add" ? <Plus className="w-4 h-4 text-primary" /> : <Pencil className="w-4 h-4 text-primary" />}
            </div>
            {mode === "add" ? "New User" : "Edit User"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Identity Section */}
          <div className="rounded-xl bg-muted/30 border p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <UserCog className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identity</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Username <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. ahmed"
                  value={form.username}
                  onChange={(e) => setForm((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, "") }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. Ahmed Al-Rashidi"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground/40" />
                  <Input
                    className="pl-8"
                    placeholder="email@example.com"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Phone</Label>
                <div className="flex gap-1.5">
                  <Input
                    className="w-[68px] shrink-0 text-center text-xs"
                    placeholder="+965"
                    value={form.country_code}
                    onChange={(e) => setForm((p) => ({ ...p, country_code: e.target.value }))}
                  />
                  <div className="relative flex-1">
                    <Phone className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground/40" />
                    <Input
                      className="pl-8"
                      placeholder="Phone number"
                      value={form.phone}
                      onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Access & Role Section */}
          <div className="rounded-xl bg-muted/30 border p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Access & Role</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Role <span className="text-red-500">*</span></Label>
                <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v as Role }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["admin", "manager", "staff"] as Role[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        <span className="flex items-center gap-2">
                          <Shield className={cn("w-3 h-3", r === "admin" ? "text-red-500" : r === "manager" ? "text-amber-500" : "text-zinc-400")} />
                          {ROLE_LABELS[r]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Department <span className="text-red-500">*</span></Label>
                <Select value={form.department} onValueChange={(v) => setForm((p) => ({ ...p, department: v as Department }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["workshop", "shop"] as Department[]).map((d) => (
                      <SelectItem key={d} value={d}>
                        <span className="flex items-center gap-2">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          {DEPARTMENT_LABELS[d]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">PIN (optional)</Label>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground/40" />
                  <Input
                    className="pl-8"
                    placeholder="4-digit"
                    maxLength={4}
                    value={form.pin}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setForm((p) => ({ ...p, pin: v }));
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Status</Label>
                <div className="flex items-center gap-3 h-9 px-3 border rounded-md bg-background">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                  />
                  <span className={cn("text-xs font-semibold", form.is_active ? "text-emerald-600" : "text-muted-foreground/50")}>
                    {form.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Brand Access -- for shop users */}
          {form.department === "shop" && (
            <div className="rounded-xl bg-muted/30 border p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Store className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand Access</span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Assigned Brands <span className="text-red-500">*</span></Label>
                <p className="text-[11px] text-muted-foreground/60">
                  Select which brand interfaces this user can access.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {ALL_BRANDS.map((brand) => {
                    const isSelected = form.brands.includes(brand);
                    return (
                      <button
                        key={brand}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            brands: isSelected
                              ? p.brands.filter((b) => b !== brand)
                              : [...p.brands, brand],
                          }))
                        }
                        className={cn(
                          "flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-semibold transition-all duration-150",
                          isSelected
                            ? cn(BRAND_STYLE[brand], "ring-1 ring-offset-1", brand === "erth" ? "ring-emerald-300" : brand === "sakkba" ? "ring-indigo-300" : "ring-orange-300")
                            : "bg-background text-muted-foreground/50 border-border hover:bg-muted/40 hover:text-muted-foreground",
                        )}
                      >
                        <Store className="w-3 h-3" />
                        {BRAND_LABELS[brand]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Resource Link -- conditional */}
          {showResourceLink && unlinkedResources.length > 0 && (
            <div className="rounded-xl bg-violet-50/50 border border-violet-200/50 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Link2 className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-violet-600">Production Profile</span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Link to Worker Profile</Label>
                <Select
                  value={form.link_resource_id || "none"}
                  onValueChange={(v) => setForm((p) => ({ ...p, link_resource_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No link" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">No link</span>
                    </SelectItem>
                    {unlinkedResources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="flex items-center gap-2">
                          <Link2 className="w-3 h-3 text-violet-500" />
                          {r.name}
                          {r.responsibility && (
                            <span className="text-muted-foreground/50 text-[10px]">({r.responsibility})</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground/60">
                  Links this user account to an existing workshop worker record for KPI tracking.
                </p>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!form.username || !form.name || !form.role || !form.department || (form.department === "shop" && form.brands.length === 0) || isPending}
            className="flex-1"
          >
            {isPending ? "Saving..." : mode === "add" ? "Create User" : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
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
          <div className={cn(
            "mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2",
            isActive ? "bg-red-100" : "bg-emerald-100",
          )}>
            {isActive
              ? <AlertTriangle className="w-6 h-6 text-red-600" />
              : <Power className="w-6 h-6 text-emerald-600" />
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
    <div className={cn("flex items-center gap-3 rounded-xl border bg-card px-4 py-3", className)}>
      <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── User Card ───────────────────────────────────────────────────────

function UserCard({
  user,
  linkedResourceName,
  onEdit,
  onToggleActive,
}: {
  user: User;
  linkedResourceName: string | null;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const isInactive = user.is_active === false;
  const role = (user.role as Role) ?? "staff";
  const department = (user.department as Department) ?? "workshop";
  const brands = (user as any).brands as string[] | null;

  return (
    <div
      onClick={onEdit}
      className={cn(
        "group relative rounded-xl border bg-card p-4 transition-all duration-200 cursor-pointer",
        isInactive
          ? "opacity-50 bg-muted/20 border-dashed"
          : "hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5",
      )}
    >
      {/* Action buttons - top right */}
      <div className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
          title="Edit user"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            isInactive
              ? "text-muted-foreground/40 hover:text-emerald-600 hover:bg-emerald-50"
              : "text-muted-foreground/40 hover:text-red-600 hover:bg-red-50",
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
            "w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold ring-2 ring-offset-1",
            getAvatarStyle(role, department),
          )}>
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          {/* Active indicator dot */}
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card",
            isInactive ? "bg-zinc-300" : "bg-emerald-500",
          )} />
        </div>
        <div className="min-w-0 flex-1 pr-14">
          <p className="text-sm font-semibold truncate leading-tight">{user.name}</p>
          {user.username && (
            <p className="text-[11px] text-muted-foreground/60 truncate">@{user.username}</p>
          )}
        </div>
      </div>

      {/* Contact info */}
      <div className="space-y-1 mb-3">
        {user.email && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 truncate">
            <Mail className="w-3 h-3 shrink-0" />
            <span className="truncate">{user.email}</span>
          </div>
        )}
        {user.phone && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <Phone className="w-3 h-3 shrink-0" />
            <span>{[user.country_code, user.phone].filter(Boolean).join(" ")}</span>
          </div>
        )}
        {!user.email && !user.phone && (
          <p className="text-[11px] text-muted-foreground/40 italic">No contact info</p>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border",
          ROLE_STYLE[role],
        )}>
          <Shield className="w-2.5 h-2.5" />
          {ROLE_LABELS[role]}
        </span>
        <span className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border",
          DEPT_STYLE[department],
        )}>
          {department === "workshop" ? <Factory className="w-2.5 h-2.5" /> : <ShoppingBag className="w-2.5 h-2.5" />}
          {DEPARTMENT_LABELS[department]}
        </span>
      </div>

      {/* Brand badges for shop users */}
      {department === "shop" && brands && brands.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {brands.map((b) => (
            <span
              key={b}
              className={cn(
                "text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full border",
                BRAND_STYLE[b] ?? "bg-muted/20 text-muted-foreground/40 border-transparent",
              )}
            >
              {BRAND_LABELS[b] ?? b}
            </span>
          ))}
        </div>
      )}

      {/* Linked worker profile indicator */}
      {linkedResourceName && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-violet-600 bg-violet-50 border border-violet-200/50 rounded-lg px-2 py-1">
          <Link2 className="w-3 h-3" />
          <span className="font-medium truncate">Linked: {linkedResourceName}</span>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function UsersPage() {
  const { data: users = [], isLoading } = useUsers();
  const { data: resources = [] } = useResourcesWithUsers();
  const createMut = useCreateUser();
  const updateMut = useUpdateUser();
  const deactivateMut = useDeactivateUser();
  const activateMut = useActivateUser();
  const linkMut = useLinkResourceToUser();
  const unlinkMut = useUnlinkResourceFromUser();

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<"all" | Department>("all");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [showInactive, setShowInactive] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);

  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  // Unlinked resources for the link dropdown (plus the currently-linked one when editing)
  const unlinkedResources = useMemo(() =>
    resources
      .filter((r) => !r.user_id)
      .map((r) => ({ id: r.id, name: r.resource_name, responsibility: r.responsibility })),
    [resources],
  );

  // Find resource currently linked to a user
  const getLinkedResourceId = (userId: string) => {
    const linked = resources.find((r) => r.user_id === userId);
    return linked?.id ?? "";
  };

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
    workshop: users.filter((u) => u.department === "workshop" && u.is_active !== false).length,
    shop: users.filter((u) => u.department === "shop" && u.is_active !== false).length,
  }), [users]);

  const openAdd = () => {
    setSheetMode("add");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };

  const openEdit = (u: User) => {
    setSheetMode("edit");
    setEditingId(u.id);
    setForm({
      username: u.username ?? "",
      name: u.name,
      email: u.email ?? "",
      country_code: u.country_code ?? "+965",
      phone: u.phone ?? "",
      role: (u.role as Role) ?? "staff",
      department: (u.department as Department) ?? "workshop",
      brands: (u as any).brands ?? [],
      is_active: u.is_active !== false,
      pin: u.pin ?? "",
      link_resource_id: getLinkedResourceId(u.id),
    });
    setSheetOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name) return;
    const payload: Omit<NewUser, "id" | "created_at" | "updated_at"> = {
      username: form.username,
      name: form.name,
      email: form.email || null,
      country_code: form.country_code || null,
      phone: form.phone || null,
      role: form.role,
      department: form.department,
      brands: form.department === "shop" ? form.brands : null,
      is_active: form.is_active,
      pin: form.pin || null,
    };

    try {
      let userId = editingId;
      if (sheetMode === "add") {
        const created = await createMut.mutateAsync(payload);
        userId = created.id;
        toast.success(`${form.name} created`);
      } else if (editingId) {
        await updateMut.mutateAsync({ id: editingId, updates: payload });
        toast.success(`${form.name} updated`);
      }

      // Handle resource linking/unlinking
      if (userId && form.department === "workshop" && form.role === "staff") {
        const previouslyLinked = resources.find((r) => r.user_id === userId);
        const newLinkId = form.link_resource_id || "";

        if (previouslyLinked && previouslyLinked.id !== newLinkId) {
          await unlinkMut.mutateAsync(previouslyLinked.id);
        }
        if (newLinkId && (!previouslyLinked || previouslyLinked.id !== newLinkId)) {
          await linkMut.mutateAsync({ resourceId: newLinkId, userId });
        }
      }

      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save user");
    }
  };

  const handleToggleActive = async () => {
    if (!deactivateTarget) return;
    try {
      if (deactivateTarget.is_active !== false) {
        await deactivateMut.mutateAsync(deactivateTarget.id);
        toast.success(`${deactivateTarget.name} deactivated`);
      } else {
        await activateMut.mutateAsync(deactivateTarget.id);
        toast.success(`${deactivateTarget.name} reactivated`);
      }
      setDeactivateDialogOpen(false);
      setDeactivateTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <UserCog className="w-6 h-6 text-primary" />
            User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage staff accounts, roles, and department access
          </p>
        </div>
        <Button onClick={openAdd} size="default" className="shadow-sm gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Users" value={stats.total} icon={Users} />
        <StatCard label="Active" value={stats.active} icon={UserCog} />
        <StatCard label="Workshop" value={stats.workshop} icon={Factory} />
        <StatCard label="Shop" value={stats.shop} icon={ShoppingBag} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <Input
            className="pl-9 h-10"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Department toggle pills */}
          <div className="flex rounded-lg border bg-muted/30 p-0.5">
            {(["all", "workshop", "shop"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDeptFilter(d)}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all duration-150",
                  deptFilter === d
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d === "all" ? "All" : DEPARTMENT_LABELS[d]}
              </button>
            ))}
          </div>

          {/* Role filter */}
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | Role)}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {(["admin", "manager", "staff"] as Role[]).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Inactive toggle */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-background">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
              className="scale-75 origin-left"
            />
            <label htmlFor="show-inactive" className="text-xs font-medium text-muted-foreground cursor-pointer whitespace-nowrap">
              Show inactive
            </label>
          </div>
        </div>
      </div>

      {/* User Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="w-11 h-11 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <UserX className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No users found</h3>
          <p className="text-sm text-muted-foreground/60 max-w-xs">
            Try adjusting your search or filters, or add a new user to get started.
          </p>
          <Button onClick={openAdd} variant="outline" className="mt-4 gap-2">
            <Plus className="w-4 h-4" />
            Add User
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              linkedResourceName={getLinkedResourceName(u.id)}
              onEdit={() => openEdit(u)}
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
        <p className="text-xs text-muted-foreground/50 mt-4 text-center">
          Showing {filtered.length} of {users.length} user{users.length !== 1 ? "s" : ""}
        </p>
      )}

      <UserFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        isPending={createMut.isPending || updateMut.isPending || linkMut.isPending || unlinkMut.isPending}
        unlinkedResources={
          // Include the currently-linked resource in the dropdown when editing
          editingId
            ? (() => {
                const linked = resources.find((r) => r.user_id === editingId);
                if (linked && !unlinkedResources.some((u) => u.id === linked.id)) {
                  return [{ id: linked.id, name: linked.resource_name, responsibility: linked.responsibility }, ...unlinkedResources];
                }
                return unlinkedResources;
              })()
            : unlinkedResources
        }
      />

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
