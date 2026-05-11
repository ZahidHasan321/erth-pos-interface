import { useState } from "react";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Switch } from "@repo/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { DatePicker } from "@repo/ui/date-picker";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { ChipToggle } from "@repo/ui/chip-toggle";
import { Combobox } from "@repo/ui/combobox";
import { FlagIcon } from "@repo/ui/flag-icon";
import { Button } from "@repo/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { toast } from "sonner";
import { useUnits, useCreateUnit } from "@/hooks/useUnits";
import { ROLE_LABELS, DEPARTMENT_LABELS, JOB_FUNCTION_LABELS } from "@/lib/rbac";
import { getSortedCountries } from "@/lib/countries";
import { cn } from "@/lib/utils";
import {
  UserCog, Shield, Phone, Mail, Hash,
  Store, Briefcase,
  Factory, ShoppingBag, Info, Plus,
} from "lucide-react";
import { format } from "date-fns";
import type { Role, Department, JobFunction } from "@repo/database";

const SORTED_COUNTRIES = getSortedCountries();
const PHONE_CODE_OPTIONS = SORTED_COUNTRIES.map((c) => ({
  value: c.phoneCode,
  label: `${c.name} ${c.phoneCode}`,
  node: (
    <span className="flex items-center gap-2">
      <FlagIcon code={c.code} />
      {c.name} {c.phoneCode}
    </span>
  ),
  selectedNode: (
    <span className="flex items-center gap-2">
      <FlagIcon code={c.code} />
      {c.phoneCode}
    </span>
  ),
}));
const NATIONALITY_OPTIONS = SORTED_COUNTRIES.map((c) => ({
  value: c.name,
  label: c.name,
  node: (
    <span className="flex items-center gap-2">
      <FlagIcon code={c.code} />
      {c.name}
    </span>
  ),
}));

export const ALL_BRANDS = ["erth", "sakkba", "qass"] as const;
export const BRAND_LABELS: Record<string, string> = { erth: "Erth", sakkba: "Sakkba", qass: "Qass" };
// TEMP DISABLED: "post_cutter" removed from selectable job functions (kept in DB enum)
export const JOB_FUNCTIONS: JobFunction[] = ["soaker", "cutter", /* "post_cutter", */ "sewer", "finisher", "ironer", "qc"];

export type UserFormState = {
  username: string;
  name: string;
  email: string;
  country_code: string;
  phone: string;
  role: Role;
  department: Department;
  job_functions: JobFunction[];
  brands: string[];
  is_active: boolean;
  pin: string;
  employee_id: string;
  nationality: string;
  hire_date: string;
  notes: string;
  // Sewers belong to a specific sewing unit (manager picks at create/edit).
  // Other terminal roles auto-assign to the lowest-id unit for their stage.
  sewing_unit_id: string | null;
};

export const EMPTY_USER_FORM: UserFormState = {
  username: "",
  name: "",
  email: "",
  country_code: "+965",
  phone: "",
  role: "staff",
  department: "workshop",
  job_functions: [],
  brands: [],
  is_active: true,
  pin: "",
  employee_id: "",
  nationality: "",
  hire_date: "",
  notes: "",
  sewing_unit_id: null,
};

// ── Section card ─────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card overflow-hidden">
      <header className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </header>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="text-xs font-medium text-muted-foreground">
      {children}
      {required && <span className="text-[var(--status-bad)] ml-0.5">*</span>}
    </Label>
  );
}

const DEPARTMENT_OPTIONS = [
  {
    value: "workshop" as const,
    label: (
      <span className="flex items-center gap-1.5">
        <Factory className="w-3 h-3" />
        {DEPARTMENT_LABELS.workshop}
      </span>
    ),
  },
  {
    value: "shop" as const,
    label: (
      <span className="flex items-center gap-1.5">
        <ShoppingBag className="w-3 h-3" />
        {DEPARTMENT_LABELS.shop}
      </span>
    ),
  },
] as const;

export function UserForm({
  mode,
  form,
  setForm,
}: {
  mode: "add" | "edit";
  form: UserFormState;
  setForm: React.Dispatch<React.SetStateAction<UserFormState>>;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* LEFT COLUMN ─────────────────────────── */}
      <div className="space-y-4">
        <Section
          icon={UserCog}
          title="Identity"
          description="How this person appears in the system and to other staff."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel required>Username</FieldLabel>
              <Input
                placeholder="ahmed"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, "") }))}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Full Name</FieldLabel>
              <Input
                placeholder="Ahmed Al-Rashidi"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Email</FieldLabel>
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
            <FieldLabel>Phone</FieldLabel>
            <div className="flex gap-1.5">
              <div className="w-[120px] shrink-0">
                <Combobox
                  options={PHONE_CODE_OPTIONS}
                  value={form.country_code}
                  onChange={(v) => setForm((p) => ({ ...p, country_code: v }))}
                  placeholder="Code"
                  contentClassName="!w-[280px]"
                />
              </div>
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
        </Section>

        <Section
          icon={Briefcase}
          title="Employee record"
          description="HR details for reporting. All optional."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel>Employee ID</FieldLabel>
              <Input
                className="font-mono"
                placeholder="EMP-001"
                value={form.employee_id}
                onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Nationality</FieldLabel>
              <Combobox
                options={NATIONALITY_OPTIONS}
                value={form.nationality}
                onChange={(v) => setForm((p) => ({ ...p, nationality: v }))}
                placeholder="Select nationality"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Hire Date</FieldLabel>
            <DatePicker
              value={form.hire_date || null}
              onChange={(d) => setForm((p) => ({ ...p, hire_date: d ? format(d, "yyyy-MM-dd") : "" }))}
              placeholder="Pick hire date"
              clearable
              displayFormat="PP"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Notes</FieldLabel>
            <textarea
              placeholder="Anything else worth recording..."
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
        </Section>
      </div>

      {/* RIGHT COLUMN ────────────────────────── */}
      <div className="space-y-4">
        <Section
          icon={Shield}
          title="Access & role"
          description="What this user can see and do. Terminal workers get a focused single-page view."
        >
          <div className="space-y-1.5">
            <FieldLabel required>Department</FieldLabel>
            <div>
              <SlidingPillSwitcher
                value={form.department}
                options={DEPARTMENT_OPTIONS}
                onChange={(v) => setForm((p) => ({ ...p, department: v }))}
                size="sm"
                className="border-border"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Role</FieldLabel>
            <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v as Role }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["super_admin", "admin", "manager", "staff"] as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    <span className="flex items-center gap-2">
                      <Shield className={cn(
                        "w-3 h-3",
                        r === "super_admin" ? "text-[var(--status-warn)]"
                        : r === "admin" ? "text-foreground"
                        : r === "manager" ? "text-muted-foreground"
                        : "text-muted-foreground/50",
                      )} />
                      {ROLE_LABELS[r]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2">
            <Info className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {form.role === "super_admin" && "Full access to all pages across all apps. Can manage everything."}
              {form.role === "admin" && "Full access to all pages. Can manage users, schedules, pricing, and operations."}
              {form.role === "manager" && form.department === "workshop" && "Full workshop operations: scheduling, receiving, dispatch, team, performance."}
              {form.role === "manager" && form.department === "shop" && "View-only access to workshop data. Dashboard, tracker, performance."}
              {form.role === "staff" && form.department === "workshop" && form.job_functions.length === 0 && "Office staff — dashboard / tracker / performance access."}
              {form.role === "staff" && form.department === "workshop" && form.job_functions.length === 1 && `Terminal worker — sees only the ${JOB_FUNCTION_LABELS[form.job_functions[0]]} terminal. No sidebar.`}
              {form.role === "staff" && form.department === "workshop" && form.job_functions.length > 1 && `Cross-trained terminal worker — switches between ${form.job_functions.map((j) => JOB_FUNCTION_LABELS[j]).join(" / ")} via a tab bar. No sidebar.`}
              {form.role === "staff" && form.department === "shop" && "Shop-only access. No workshop pages."}
            </p>
          </div>

          {form.role === "staff" && form.department === "workshop" && (
            <div className="space-y-2">
              <FieldLabel>Terminal assignments</FieldLabel>
              <p className="text-xs text-muted-foreground">
                Pick every station this worker can run. One resource is created per station so the scheduler tracks each skill's capacity separately.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {JOB_FUNCTIONS.map((j) => {
                  const selected = form.job_functions.includes(j);
                  return (
                    <ChipToggle
                      key={j}
                      active={selected}
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          job_functions: selected
                            ? p.job_functions.filter((x) => x !== j)
                            : [...p.job_functions, j],
                          // Drop unit selection if sewer is being deselected
                          sewing_unit_id: selected && j === "sewer" ? null : p.sewing_unit_id,
                        }))
                      }
                    >
                      {JOB_FUNCTION_LABELS[j]}
                    </ChipToggle>
                  );
                })}
              </div>
              {form.job_functions.length === 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  No stations selected — this user will be office staff.
                </p>
              )}
              {form.job_functions.includes("sewer") && (
                <SewingUnitPicker
                  value={form.sewing_unit_id}
                  onChange={(id) => setForm((p) => ({ ...p, sewing_unit_id: id }))}
                />
              )}
            </div>
          )}

          <div className="flex items-end gap-4 pt-3 border-t border-border flex-wrap">
            <div className="space-y-1.5 w-[180px]">
              <FieldLabel required={mode === "add"}>PIN</FieldLabel>
              <div className="relative">
                <Hash className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 font-mono tracking-[0.3em]"
                  placeholder={mode === "add" ? "4-digit" : "••••"}
                  maxLength={4}
                  value={form.pin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setForm((p) => ({ ...p, pin: v }));
                  }}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 h-9 cursor-pointer select-none">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              />
              <span className={cn(
                "text-sm font-medium",
                form.is_active ? "text-foreground" : "text-muted-foreground",
              )}>
                {form.is_active ? "Active" : "Inactive"}
              </span>
            </label>
          </div>
        </Section>

        {form.department === "shop" && (
          <Section
            icon={Store}
            title="Brand access"
            description="Shop staff only see the brand interfaces they're assigned to."
          >
            <div className="space-y-2">
              <FieldLabel required>Assigned brands</FieldLabel>
              <div className="flex flex-wrap gap-2 pt-1">
                {ALL_BRANDS.map((brand) => {
                  const isSelected = form.brands.includes(brand);
                  return (
                    <ChipToggle
                      key={brand}
                      active={isSelected}
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          brands: isSelected
                            ? p.brands.filter((b) => b !== brand)
                            : [...p.brands, brand],
                        }))
                      }
                    >
                      <Store className="w-3 h-3" />
                      {BRAND_LABELS[brand]}
                    </ChipToggle>
                  );
                })}
              </div>
              {form.brands.length === 0 && (
                <p className="text-xs text-[var(--status-bad)] pt-1">Select at least one brand.</p>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

export function isUserFormValid(form: UserFormState, mode: "add" | "edit"): boolean {
  if (!form.username || !form.name) return false;
  if (!form.role || !form.department) return false;
  if (form.department === "shop" && form.brands.length === 0) return false;
  if (mode === "add" && (!form.pin || form.pin.length !== 4)) return false;
  // Sewers must be assigned to a sewing unit.
  if (
    form.role === "staff" &&
    form.department === "workshop" &&
    form.job_functions.includes("sewer") &&
    !form.sewing_unit_id
  ) {
    return false;
  }
  return true;
}

// ── Sewing unit picker ───────────────────────────────────────────────────────

function SewingUnitPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data: units = [] } = useUnits();
  const sewingUnits = units.filter((u) => u.stage === "sewing");
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-1.5 pt-3 mt-2 border-t border-border">
      <FieldLabel required>Sewing team</FieldLabel>
      <p className="text-xs text-muted-foreground">
        Which sewing unit does this sewer belong to. Other stations auto-assign to their default unit.
      </p>
      <div className="flex gap-2 pt-1">
        <div className="flex-1 min-w-0">
          <Select
            value={value ?? ""}
            onValueChange={(v) => onChange(v || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder={sewingUnits.length === 0 ? "No sewing units — create one" : "Select sewing team"} />
            </SelectTrigger>
            <SelectContent>
              {sewingUnits.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </Button>
      </div>
      <CreateSewingUnitDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          onChange(id);
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

function CreateSewingUnitDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const createMut = useCreateUnit();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await createMut.mutateAsync({ stage: "sewing", name: trimmed });
      toast.success(`Created sewing team "${created.name}"`);
      setName("");
      onCreated(created.id);
    } catch (err) {
      toast.error(`Could not create sewing team: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setName(""); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New sewing team</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <FieldLabel required>Team name</FieldLabel>
            <Input
              autoFocus
              placeholder="Team A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submit(); }
              }}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" disabled={!name.trim() || createMut.isPending} onClick={submit} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {createMut.isPending ? "Creating..." : "Create team"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
