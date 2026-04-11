import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useUsers, useCreateUser, useUpdateUser, useDeactivateUser, useActivateUser } from "@/hooks/useUsers";
import { setUserPin } from "@/api/users";
import { useResourcesWithUsers, useLinkResourceToUser, useUnlinkResourceFromUser } from "@/hooks/useResources";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/rbac";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Switch } from "@repo/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@repo/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@repo/ui/dialog";
import { Skeleton } from "@repo/ui/skeleton";
import { PageHeader } from "@/components/shared/PageShell";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  UserCog, Plus, Search, Shield, Building2,
  Phone, Mail, Hash, Power, Pencil,
  Link2, Store, Users, Factory, ShoppingBag,
  UserX, AlertTriangle, Briefcase, CalendarDays, Globe, Wifi,
} from "lucide-react";
import { useOnlineUserIds } from "@/hooks/useSessions";
import type { User, Role, Department } from "@repo/database";

const ALL_BRANDS = ["erth", "sakkba", "qass"] as const;
const BRAND_LABELS: Record<string, string> = { erth: "Erth", sakkba: "Sakkba", qass: "Qass" };

export const Route = createFileRoute("/(main)/users/")({
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
  employee_id: string;
  nationality: string;
  hire_date: string;
  notes: string;
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
  employee_id: "",
  nationality: "",
  hire_date: "",
  notes: "",
};

const ROLE_STYLE: Record<Role, string> = {
  super_admin: "bg-zinc-950 text-white border-zinc-950",
  admin:   "bg-zinc-900 text-white border-zinc-900",
  manager: "bg-zinc-200 text-zinc-800 border-zinc-300",
  staff:   "bg-zinc-100 text-zinc-500 border-zinc-200",
};

const DEPT_STYLE: Record<Department, string> = {
  workshop: "bg-zinc-100 text-zinc-600 border-zinc-200",
  shop:     "bg-zinc-100 text-zinc-600 border-zinc-200",
};

function getAvatarStyle(role: Role, _department: Department) {
  if (role === "admin") return "bg-zinc-900 text-white ring-zinc-400";
  if (role === "manager") return "bg-zinc-200 text-zinc-700 ring-zinc-300";
  return "bg-zinc-100 text-zinc-500 ring-zinc-200";
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
          <div className="space-y-4">
            <div className="flex items-center gap-2">
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
                  <Mail className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
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
                    <Phone className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
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
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Access & Role</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Role <span className="text-red-500">*</span></Label>
                <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v as Role }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["super_admin", "admin", "manager", "staff"] as Role[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        <span className="flex items-center gap-2">
                          <Shield className={cn("w-3 h-3", r === "super_admin" ? "text-amber-500" : r === "admin" ? "text-zinc-900" : r === "manager" ? "text-zinc-500" : "text-zinc-300")} />
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
            {/* Role description */}
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
              {form.role === "super_admin" && "Full access to all pages across all apps. Can manage everything."}
              {form.role === "admin" && "Full access to all pages. Can manage users, schedules, pricing, and all operations."}
              {form.role === "manager" && form.department === "workshop" && "Full access to workshop operations: scheduling, receiving, dispatch, team management, and performance."}
              {form.role === "manager" && form.department === "shop" && "View-only access to workshop data. Can view team, performance, production tracker, and dashboard."}
              {form.role === "staff" && form.department === "workshop" && "Can view own performance and team data. Access to production terminals."}
              {form.role === "staff" && form.department === "shop" && "Shop-only access. No workshop pages."}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">PIN <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
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
                  <span className={cn("text-xs font-semibold", form.is_active ? "text-foreground" : "text-muted-foreground")}>
                    {form.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Details */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee Details</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Employee ID</Label>
                <Input
                  placeholder="e.g. EMP-001"
                  value={form.employee_id}
                  onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Nationality</Label>
                <div className="relative">
                  <Globe className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="e.g. Kuwaiti"
                    value={form.nationality}
                    onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Hire Date</Label>
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="date"
                    className="pl-8"
                    value={form.hire_date}
                    onChange={(e) => setForm((p) => ({ ...p, hire_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notes</Label>
              <textarea
                placeholder="Any additional notes..."
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>
          </div>

          {/* Brand Access -- for shop users */}
          {form.department === "shop" && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Store className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand Access</span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Assigned Brands <span className="text-red-500">*</span></Label>
                <p className="text-[11px] text-muted-foreground">
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
                            ? "bg-foreground text-background border-foreground"
                            : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
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
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Production Profile</span>
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
                          <Link2 className="w-3 h-3 text-muted-foreground" />
                          {r.name}
                          {r.responsibility && (
                            <span className="text-muted-foreground text-[10px]">({r.responsibility})</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
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
            disabled={!form.username || !form.name || !form.role || (form.role !== "super_admin" && !form.department) || (form.department === "shop" && form.brands.length === 0) || isPending}
            className="flex-1"
          >
            {isPending ? "Saving..." : mode === "add" ? "Create User" : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
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
            isActive ? "bg-zinc-100" : "bg-zinc-100",
          )}>
            {isActive
              ? <AlertTriangle className="w-6 h-6 text-zinc-900" />
              : <Power className="w-6 h-6 text-zinc-900" />
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
    <div className={cn("rounded-xl border bg-card p-5 shadow-sm", className)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-black leading-none tabular-nums tracking-tight">{value}</p>
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
          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          title="Edit user"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            isInactive
              ? "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"
              : "text-muted-foreground hover:text-red-600 hover:bg-red-50",
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
          {/* Online indicator dot */}
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card",
            isInactive ? "bg-zinc-300" : isOnline ? "bg-emerald-500" : "bg-zinc-300",
          )} />
        </div>
        <div className="min-w-0 flex-1 pr-14">
          <p className="text-sm font-semibold truncate leading-tight">{user.name}</p>
          {user.username && (
            <p className="text-[11px] text-muted-foreground truncate">@{user.username}</p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-1 mb-3">
        {user.employee_id && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
            <Briefcase className="w-3 h-3 shrink-0" />
            <span className="truncate">{user.employee_id}</span>
          </div>
        )}
        {user.email && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
            <Mail className="w-3 h-3 shrink-0" />
            <span className="truncate">{user.email}</span>
          </div>
        )}
        {user.phone && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Phone className="w-3 h-3 shrink-0" />
            <span>{[user.country_code, user.phone].filter(Boolean).join(" ")}</span>
          </div>
        )}
        {user.nationality && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Globe className="w-3 h-3 shrink-0" />
            <span>{user.nationality}</span>
          </div>
        )}
        {!user.email && !user.phone && !user.employee_id && (
          <p className="text-[11px] text-muted-foreground italic">No contact info</p>
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
              className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full border bg-zinc-100 text-zinc-600 border-zinc-200"
            >
              {BRAND_LABELS[b] ?? b}
            </span>
          ))}
        </div>
      )}

      {/* Linked worker profile indicator */}
      {linkedResourceName && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 border rounded-lg px-2 py-1">
          <Link2 className="w-3 h-3" />
          <span className="font-medium truncate">Linked: {linkedResourceName}</span>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function UsersPage() {
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useUsers();
  const { data: resources = [] } = useResourcesWithUsers();
  const onlineUserIds = useOnlineUserIds();
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

  const openAdd = () => {
    setSheetMode("add");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };


  const handleSubmit = async () => {
    if (!form.name) return;

    try {
      let userId = editingId;
      if (sheetMode === "add") {
        // Create via Edge Function (handles Supabase Auth + users table + PIN hashing)
        const created = await createMut.mutateAsync({
          username: form.username,
          name: form.name,
          email: form.email || null,
          country_code: form.country_code || null,
          phone: form.phone || null,
          role: form.role,
          department: form.department,
          brands: form.department === "shop" ? form.brands : null,
          is_active: form.is_active,
          pin: form.pin || undefined,
          employee_id: form.employee_id || null,
          nationality: form.nationality || null,
          hire_date: form.hire_date || null,
          notes: form.notes || null,
        });
        userId = created.id;
      } else if (editingId) {
        // Update non-auth fields directly
        await updateMut.mutateAsync({
          id: editingId,
          updates: {
            username: form.username,
            name: form.name,
            email: form.email || null,
            country_code: form.country_code || null,
            phone: form.phone || null,
            role: form.role,
            department: form.department,
            brands: form.department === "shop" ? form.brands : null,
            is_active: form.is_active,
            employee_id: form.employee_id || null,
            nationality: form.nationality || null,
            hire_date: form.hire_date || null,
            notes: form.notes || null,
          },
        });

        // Update PIN via Edge Function if changed
        if (form.pin) {
          await setUserPin(editingId, form.pin);
        }
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
      toast.error(`Could not save user: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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
        <Button onClick={openAdd} size="default" className="shadow-sm gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Add User
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
              {(["super_admin", "admin", "manager", "staff"] as Role[]).map((r) => (
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
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <UserX className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No users found</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
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
