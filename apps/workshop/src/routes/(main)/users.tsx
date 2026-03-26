import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useUsers, useCreateUser, useUpdateUser, useDeactivateUser, useActivateUser } from "@/hooks/useUsers";
import { useResources } from "@/hooks/useResources";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  UserCog, Plus, Search, Shield, Building2,
  Phone, Mail, Hash, Power, Pencil,
  ChevronRight, Link2, CircleDot, Store,
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
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base font-black uppercase tracking-wider">
            {mode === "add" ? "New User" : "Edit User"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-6">
          {/* Identity */}
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Identity</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Username <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. ahmed"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, "") }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Full Name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. Ahmed Al-Rashidi"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground/30" />
                  <Input
                    className="pl-8"
                    placeholder="email@example.com"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Phone</Label>
                <div className="flex gap-1.5">
                  <Input
                    className="w-[72px] shrink-0 text-center text-xs"
                    placeholder="+965"
                    value={form.country_code}
                    onChange={(e) => setForm((p) => ({ ...p, country_code: e.target.value }))}
                  />
                  <div className="relative flex-1">
                    <Phone className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground/30" />
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

          <Separator />

          {/* Access */}
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Access & Role</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Role <span className="text-red-500">*</span></Label>
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
                <Label className="text-xs font-bold">Department <span className="text-red-500">*</span></Label>
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
                <Label className="text-xs font-bold">PIN (optional)</Label>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground/30" />
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
                <Label className="text-xs font-bold">Status</Label>
                <div className="flex items-center gap-3 h-9 px-3 border rounded-md bg-background">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                  />
                  <span className={cn("text-xs font-bold", form.is_active ? "text-emerald-600" : "text-muted-foreground/40")}>
                    {form.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Brand Access — for shop users */}
          {form.department === "shop" && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Brand Access</p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Assigned Brands <span className="text-red-500">*</span></Label>
                  <p className="text-[10px] text-muted-foreground/50">
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
                            "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all duration-150",
                            isSelected
                              ? BRAND_STYLE[brand]
                              : "bg-muted/20 text-muted-foreground/40 border-transparent hover:bg-muted/40",
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
            </>
          )}

          {/* Resource Link — conditional */}
          {showResourceLink && unlinkedResources.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Production Profile</p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Link to Worker Profile</Label>
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
                  <p className="text-[10px] text-muted-foreground/50">
                    Links this user account to an existing workshop worker record for KPI tracking.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!form.username || !form.name || !form.role || !form.department || (form.department === "shop" && form.brands.length === 0) || isPending}
            className="flex-1"
          >
            {mode === "add" ? "Create User" : "Save Changes"}
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
          <DialogTitle className="text-sm font-black uppercase tracking-wider">
            {isActive ? "Deactivate User" : "Reactivate User"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isActive
              ? `${user?.name} will no longer be able to log in. This can be reversed later.`
              : `${user?.name} will be able to log in again.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={isActive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function UsersPage() {
  const { data: users = [], isLoading } = useUsers();
  const { data: resources = [] } = useResources();
  const createMut = useCreateUser();
  const updateMut = useUpdateUser();
  const deactivateMut = useDeactivateUser();
  const activateMut = useActivateUser();

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

  // Unlinked resources for the link dropdown
  const unlinkedResources = useMemo(() =>
    resources
      .filter((r) => !(r as any).user_id)
      .map((r) => ({ id: r.id, name: r.resource_name, responsibility: r.responsibility })),
    [resources],
  );

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
      link_resource_id: "",
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
      if (sheetMode === "add") {
        await createMut.mutateAsync(payload);
        toast.success(`${form.name} created`);
      } else if (editingId) {
        await updateMut.mutateAsync({ id: editingId, updates: payload });
        toast.success(`${form.name} updated`);
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

  const formatDate = (d?: string | Date | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-2.5">
            <UserCog className="w-5 h-5" />
            User Management
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{stats.active}</span> active users
            </span>
            <span className="w-px h-3 bg-border" />
            <span className="text-xs text-muted-foreground">
              <span className="font-bold text-violet-600">{stats.workshop}</span> workshop
            </span>
            <span className="text-xs text-muted-foreground">
              <span className="font-bold text-sky-600">{stats.shop}</span> shop
            </span>
          </div>
        </div>
        <Button onClick={openAdd} className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground/40" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Department toggle */}
        <div className="flex rounded-lg border bg-muted/30 p-0.5">
          {(["all", "workshop", "shop"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDeptFilter(d)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-150",
                deptFilter === d
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50 active:bg-background/80 active:scale-[0.97]",
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
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors",
            showInactive
              ? "bg-zinc-100 border-zinc-300 text-zinc-700"
              : "bg-background text-muted-foreground/50 hover:text-muted-foreground",
          )}
        >
          <Power className="w-3 h-3" />
          {showInactive ? "Showing inactive" : "Show inactive"}
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/40">
          <UserCog className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">No users found</p>
          <p className="text-xs mt-1">Try adjusting your filters or add a new user.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          {/* Column headers */}
          <div className="hidden md:grid grid-cols-[1fr_120px_90px_90px_70px_100px_60px] gap-2 px-4 py-2.5 bg-muted/40 border-b">
            {["User", "Phone", "Role", "Dept", "Status", "Created", ""].map((h) => (
              <span key={h} className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/50">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((u) => {
            const isInactive = u.is_active === false;
            return (
              <div
                key={u.id}
                onClick={() => openEdit(u)}
                className={cn(
                  "border-b last:border-b-0 transition-colors cursor-pointer group",
                  isInactive ? "opacity-50 bg-muted/10" : "hover:bg-muted/20",
                )}
              >
                {/* Desktop row */}
                <div className="hidden md:grid grid-cols-[1fr_120px_90px_90px_70px_100px_60px] gap-2 px-4 py-2.5 items-center">
                  {/* Name + avatar */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0",
                      u.role === "admin" ? "bg-red-100 text-red-700"
                        : u.role === "manager" ? "bg-amber-100 text-amber-700"
                        : u.department === "workshop" ? "bg-violet-100 text-violet-700"
                        : "bg-sky-100 text-sky-700",
                    )}>
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{u.name}</p>
                      {u.email && <p className="text-[10px] text-muted-foreground/50 truncate">{u.email}</p>}
                    </div>
                  </div>

                  {/* Phone */}
                  <span className="text-xs text-muted-foreground font-medium truncate">
                    {u.phone ? [u.country_code, u.phone].filter(Boolean).join(" ") : "—"}
                  </span>

                  {/* Role badge */}
                  <div>
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
                      ROLE_STYLE[(u.role as Role) ?? "staff"],
                    )}>
                      {ROLE_LABELS[(u.role as Role) ?? "staff"]}
                    </span>
                  </div>

                  {/* Department + Brands */}
                  <div className="flex flex-col gap-0.5">
                    <span className={cn(
                      "inline-flex items-center text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border w-fit",
                      DEPT_STYLE[(u.department as Department) ?? "workshop"],
                    )}>
                      {DEPARTMENT_LABELS[(u.department as Department) ?? "workshop"]}
                    </span>
                    {u.department === "shop" && (u as any).brands?.length > 0 && (
                      <div className="flex gap-0.5 flex-wrap">
                        {((u as any).brands as string[]).map((b) => (
                          <span
                            key={b}
                            className={cn(
                              "text-[9px] font-bold uppercase px-1 py-0 rounded border",
                              BRAND_STYLE[b] ?? "bg-muted/20 text-muted-foreground/40 border-transparent",
                            )}
                          >
                            {BRAND_LABELS[b] ?? b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Status dot */}
                  <div className="flex items-center gap-1.5">
                    <CircleDot className={cn("w-3 h-3", isInactive ? "text-zinc-300" : "text-emerald-500")} />
                    <span className="text-[10px] font-bold text-muted-foreground/50">
                      {isInactive ? "Off" : "On"}
                    </span>
                  </div>

                  {/* Created */}
                  <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                    {formatDate(u.created_at)}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(u); }}
                      className="p-1.5 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeactivateTarget(u);
                        setDeactivateDialogOpen(true);
                      }}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        isInactive
                          ? "text-muted-foreground/30 hover:text-emerald-500 hover:bg-emerald-50"
                          : "text-muted-foreground/30 hover:text-red-500 hover:bg-red-50",
                      )}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Mobile row */}
                <div className="md:hidden px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0",
                        u.role === "admin" ? "bg-red-100 text-red-700"
                          : u.role === "manager" ? "bg-amber-100 text-amber-700"
                          : u.department === "workshop" ? "bg-violet-100 text-violet-700"
                          : "bg-sky-100 text-sky-700",
                      )}>
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{u.name}</p>
                        <p className="text-[10px] text-muted-foreground/50">{u.phone || u.email || "No contact"}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/20 shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
                      ROLE_STYLE[(u.role as Role) ?? "staff"],
                    )}>
                      {ROLE_LABELS[(u.role as Role) ?? "staff"]}
                    </span>
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
                      DEPT_STYLE[(u.department as Department) ?? "workshop"],
                    )}>
                      {DEPARTMENT_LABELS[(u.department as Department) ?? "workshop"]}
                    </span>
                    {u.department === "shop" && (u as any).brands?.length > 0 && (
                      ((u as any).brands as string[]).map((b) => (
                        <span
                          key={b}
                          className={cn(
                            "text-[9px] font-bold uppercase px-1 py-0 rounded border",
                            BRAND_STYLE[b] ?? "bg-muted/20 text-muted-foreground/40 border-transparent",
                          )}
                        >
                          {BRAND_LABELS[b] ?? b}
                        </span>
                      ))
                    )}
                    <CircleDot className={cn("w-3 h-3 ml-auto", isInactive ? "text-zinc-300" : "text-emerald-500")} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer count */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-[10px] text-muted-foreground/40 mt-2 px-1">
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
        isPending={createMut.isPending || updateMut.isPending}
        unlinkedResources={unlinkedResources}
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
