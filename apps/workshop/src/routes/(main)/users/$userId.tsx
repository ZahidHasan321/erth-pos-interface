import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useUsers, useUpdateUser, useDeactivateUser, useActivateUser } from "@/hooks/useUsers";
import { useResourcesWithUsers, useLinkResourceToUser, useUnlinkResourceFromUser } from "@/hooks/useResources";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/rbac";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Switch } from "@repo/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Skeleton } from "@repo/ui/skeleton";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft, UserCog, Shield, Building2,
  Phone, Mail, Hash, Power, Briefcase,
  Link2, CalendarDays, Globe,
} from "lucide-react";
import type { Role, Department } from "@repo/database";

const ALL_BRANDS = ["erth", "sakkba", "qass"] as const;
const BRAND_LABELS: Record<string, string> = { erth: "Erth", sakkba: "Sakkba", qass: "Qass" };

export const Route = createFileRoute("/(main)/users/$userId")({
  component: UserDetailPage,
  head: () => ({ meta: [{ title: "User Detail" }] }),
});

function UserDetailPage() {

  const { userId } = Route.useParams();
  const { data: users = [], isLoading } = useUsers();
  const { data: resources = [] } = useResourcesWithUsers();
  const updateMut = useUpdateUser();
  const deactivateMut = useDeactivateUser();
  const activateMut = useActivateUser();
  const linkMut = useLinkResourceToUser();
  const unlinkMut = useUnlinkResourceFromUser();

  const user = useMemo(() => users.find((u) => u.id === userId), [users, userId]);

  const linkedResource = useMemo(
    () => resources.find((r) => r.user_id === userId) ?? null,
    [resources, userId],
  );

  const unlinkedResources = useMemo(() =>
    resources
      .filter((r) => !r.user_id || r.user_id === userId)
      .map((r) => ({ id: r.id, name: r.resource_name, responsibility: r.responsibility })),
    [resources, userId],
  );

  // Edit state
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  const startEditing = () => {
    if (!user) return;
    setForm({
      username: user.username ?? "",
      name: user.name,
      email: user.email ?? "",
      country_code: user.country_code ?? "+965",
      phone: user.phone ?? "",
      role: user.role ?? "staff",
      department: user.department ?? "workshop",
      brands: (user as any).brands ?? [],
      is_active: user.is_active !== false,
      pin: user.pin ?? "",
      employee_id: user.employee_id ?? "",
      nationality: user.nationality ?? "",
      hire_date: user.hire_date ?? "",
      notes: user.notes ?? "",
      link_resource_id: linkedResource?.id ?? "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!user || !form.name) return;
    try {
      await updateMut.mutateAsync({
        id: user.id,
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
          pin: form.pin || null,
          employee_id: form.employee_id || null,
          nationality: form.nationality || null,
          hire_date: form.hire_date || null,
          notes: form.notes || null,
        },
      });

      // Handle resource linking
      if (form.department === "workshop" && form.role === "staff") {
        const newLinkId = form.link_resource_id || "";
        if (linkedResource && linkedResource.id !== newLinkId) {
          await unlinkMut.mutateAsync(linkedResource.id);
        }
        if (newLinkId && (!linkedResource || linkedResource.id !== newLinkId)) {
          await linkMut.mutateAsync({ resourceId: newLinkId, userId: user.id });
        }
      }

      setEditing(false);
    } catch (err) {
      toast.error(`Could not save user: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="mb-4 gap-2 text-muted-foreground">
          <Link to="/users">
            <ArrowLeft className="w-4 h-4" />
            Back to Users
          </Link>
        </Button>
        <div className="text-center py-20">
          <p className="text-lg font-semibold mb-1">User not found</p>
          <p className="text-sm text-muted-foreground">This user may have been removed.</p>
        </div>
      </div>
    );
  }

  const role = (user.role as Role) ?? "staff";
  const department = (user.department as Department) ?? "workshop";
  const brands = (user as any).brands as string[] | null;
  const isInactive = user.is_active === false;

  // View mode helper
  const Field = ({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: React.ComponentType<{ className?: string }> }) => (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        <span className={value ? "text-foreground" : "text-muted-foreground italic"}>{value || "Not set"}</span>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      {/* Back + Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 gap-2 text-muted-foreground -ml-2">
          <Link to="/users">
            <ArrowLeft className="w-4 h-4" />
            Users
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold",
              isInactive ? "bg-zinc-100 text-zinc-400" : role === "admin" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500",
            )}>
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold">{user.name}</h1>
              <p className="text-sm text-muted-foreground">@{user.username}</p>
            </div>
            {isInactive && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-zinc-100 text-zinc-500">Inactive</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <>
                <Button variant="outline" size="sm" onClick={handleToggleActive}>
                  <Power className="w-3.5 h-3.5 mr-1.5" />
                  {isInactive ? "Reactivate" : "Deactivate"}
                </Button>
                <Button size="sm" onClick={startEditing}>Edit</Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={updateMut.isPending || linkMut.isPending}>
                  {updateMut.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        /* ── Edit Mode ── */
        <div className="space-y-6">
          {/* Identity */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <UserCog className="w-3.5 h-3.5" /> Identity
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Username</Label>
                <Input value={form.username} onChange={(e) => setForm((p: any) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, "") }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Full Name</Label>
                <Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Email</Label>
                <Input value={form.email} onChange={(e) => setForm((p: any) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Phone</Label>
                <div className="flex gap-1.5">
                  <Input className="w-[68px] shrink-0 text-center text-xs" value={form.country_code} onChange={(e) => setForm((p: any) => ({ ...p, country_code: e.target.value }))} />
                  <Input value={form.phone} onChange={(e) => setForm((p: any) => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* Access */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" /> Access & Role
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm((p: any) => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["super_admin", "admin", "manager", "staff"] as Role[]).map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Department</Label>
                <Select value={form.department} onValueChange={(v) => setForm((p: any) => ({ ...p, department: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["workshop", "shop"] as Department[]).map((d) => (
                      <SelectItem key={d} value={d}>{DEPARTMENT_LABELS[d]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">PIN</Label>
                <Input maxLength={4} value={form.pin} onChange={(e) => setForm((p: any) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Status</Label>
                <div className="flex items-center gap-3 h-9 px-3 border rounded-md bg-background">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p: any) => ({ ...p, is_active: v }))} />
                  <span className="text-xs font-semibold">{form.is_active ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>

            {/* Brand access for shop users */}
            {form.department === "shop" && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-medium">Brand Access</Label>
                <div className="flex gap-2">
                  {ALL_BRANDS.map((brand) => {
                    const isSelected = form.brands?.includes(brand);
                    return (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setForm((p: any) => ({
                          ...p,
                          brands: isSelected ? p.brands.filter((b: string) => b !== brand) : [...(p.brands || []), brand],
                        }))}
                        className={cn(
                          "px-4 py-2 rounded-lg border text-xs font-semibold transition-all",
                          isSelected ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:bg-muted",
                        )}
                      >
                        {BRAND_LABELS[brand]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Resource link for workshop staff */}
            {form.department === "workshop" && form.role === "staff" && unlinkedResources.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-medium">Production Profile Link</Label>
                <Select value={form.link_resource_id || "none"} onValueChange={(v) => setForm((p: any) => ({ ...p, link_resource_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="No link" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No link</SelectItem>
                    {unlinkedResources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}{r.responsibility ? ` (${r.responsibility})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Employee Details */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5" /> Employee Details
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Employee ID</Label>
                <Input value={form.employee_id} onChange={(e) => setForm((p: any) => ({ ...p, employee_id: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Nationality</Label>
                <Input value={form.nationality} onChange={(e) => setForm((p: any) => ({ ...p, nationality: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Hire Date</Label>
                <Input type="date" value={form.hire_date} onChange={(e) => setForm((p: any) => ({ ...p, hire_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notes</Label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>
          </div>
        </div>
      ) : (
        /* ── View Mode ── */
        <div className="space-y-6">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full border",
              role === "admin" ? "bg-zinc-900 text-white border-zinc-900" : role === "manager" ? "bg-zinc-200 text-zinc-800 border-zinc-300" : "bg-zinc-100 text-zinc-500 border-zinc-200",
            )}>
              <Shield className="w-2.5 h-2.5" />
              {ROLE_LABELS[role]}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full border bg-zinc-100 text-zinc-600 border-zinc-200">
              <Building2 className="w-2.5 h-2.5" />
              {DEPARTMENT_LABELS[department]}
            </span>
            {brands && brands.map((b) => (
              <span key={b} className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border bg-zinc-100 text-zinc-600 border-zinc-200">
                {BRAND_LABELS[b] ?? b}
              </span>
            ))}
            {linkedResource && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full border bg-muted/50 text-muted-foreground">
                <Link2 className="w-2.5 h-2.5" />
                Linked: {linkedResource.resource_name}
              </span>
            )}
          </div>

          {/* Contact */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-4">Contact</p>
            <div className="grid grid-cols-2 gap-6">
              <Field label="Email" value={user.email} icon={Mail} />
              <Field label="Phone" value={user.phone ? `${user.country_code ?? ""} ${user.phone}` : null} icon={Phone} />
            </div>
          </div>

          {/* Employee Details */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-4">Employee Details</p>
            <div className="grid grid-cols-2 gap-6">
              <Field label="Employee ID" value={user.employee_id} icon={Briefcase} />
              <Field label="Nationality" value={user.nationality} icon={Globe} />
              <Field label="Hire Date" value={user.hire_date ? new Date(user.hire_date + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null} icon={CalendarDays} />
              <Field label="PIN" value={user.pin ? "****" : null} icon={Hash} />
            </div>
            {user.notes && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{user.notes}</p>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="text-xs text-muted-foreground">
            Created {user.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "unknown"}
            {user.updated_at && ` · Updated ${new Date(user.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`}
          </div>
        </div>
      )}
    </div>
  );
}
