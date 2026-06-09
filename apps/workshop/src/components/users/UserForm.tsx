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
import { Tooltip, TooltipTrigger, TooltipContent } from "@repo/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { toast } from "sonner";
import { useUnits, useCreateUnit } from "@/hooks/useUnits";
import { JOB_FUNCTION_TO_STAGE, TEAM_ASSIGNABLE_STAGES, STAGE_TEAM_LABELS } from "@/lib/job-functions";
import { ROLE_LABELS, DEPARTMENT_LABELS, JOB_FUNCTION_LABELS } from "@/lib/rbac";
import { getSortedCountries } from "@/lib/countries";
import { cn } from "@/lib/utils";
import {
  UserCog, Shield, Phone, Mail, Hash,
  Store, Briefcase,
  Factory, ShoppingBag, Info, Plus,
} from "lucide-react";
import { format } from "date-fns";
import type { Role, Department, JobFunction, ProductionStage } from "@repo/database";

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
  // Explicit team (unit) assignment per operational station this worker runs,
  // keyed by production_stage (Q4 / §6). The manager picks each one — never a
  // silent default. Soaking is excluded (auto-assigned); see TEAM_ASSIGNABLE_STAGES.
  unit_ids: Partial<Record<ProductionStage, string | null>>;
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
  unit_ids: {},
};

// ── Section card ─────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card overflow-hidden">
      <header className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <h3 className="text-sm font-medium">{title}</h3>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="ml-0.5 text-muted-foreground/60 hover:text-muted-foreground" aria-label={`About ${title}`}>
                <Info className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
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

function describeAccess(role: Role, department: Department, jobFunctions: JobFunction[]): { label: string; detail: string } {
  if (role === "super_admin") return { label: "Full access: all apps", detail: "Full access to all pages across all apps. Can manage everything." };
  if (role === "admin") return { label: "Full access", detail: "Full access to all pages. Can manage users, schedules, pricing, and operations." };
  if (role === "manager" && department === "workshop") return { label: "Workshop manager", detail: "Full workshop operations: scheduling, receiving, dispatch, team, performance." };
  if (role === "manager" && department === "shop") return { label: "Shop manager: workshop view-only", detail: "View-only access to workshop data. Dashboard, tracker, performance." };
  if (role === "staff" && department === "shop") return { label: "Shop staff", detail: "Shop-only access. No workshop pages." };
  // staff + workshop
  if (jobFunctions.length === 0) return { label: "Office staff", detail: "Dashboard / tracker / performance access. No terminals." };
  if (jobFunctions.length === 1) {
    const station = JOB_FUNCTION_LABELS[jobFunctions[0]];
    return { label: `Terminal: ${station}`, detail: `Sees only the ${station} terminal. No sidebar.` };
  }
  const stations = jobFunctions.map((j) => JOB_FUNCTION_LABELS[j]).join(" / ");
  return { label: `Cross-trained: ${stations}`, detail: `Switches between ${stations} via a tab bar. No sidebar.` };
}

function AccessSummary({ role, department, jobFunctions }: { role: Role; department: Department; jobFunctions: JobFunction[] }) {
  const { label, detail } = describeAccess(role, department, jobFunctions);
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>Result: <span className="text-foreground font-medium">{label}</span></span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground" aria-label="Access detail">
            <Info className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">{detail}</TooltipContent>
      </Tooltip>
    </div>
  );
}

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
        <Section icon={UserCog} title="Identity">
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

        <Section icon={Briefcase} title="Employee record" hint="Optional HR details for reporting.">
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
        <Section icon={Shield} title="Access & role" hint="What this user can see and do. Terminal workers get a focused single-page view.">
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

          <AccessSummary role={form.role} department={form.department} jobFunctions={form.job_functions} />

          {form.role === "staff" && form.department === "workshop" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <FieldLabel>Terminal assignments</FieldLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground" aria-label="About terminal assignments">
                      <Info className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    Pick every station this worker can run. One resource per station so the scheduler tracks each skill's capacity separately.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {JOB_FUNCTIONS.map((j) => {
                  const selected = form.job_functions.includes(j);
                  return (
                    <ChipToggle
                      key={j}
                      active={selected}
                      onClick={() =>
                        setForm((p) => {
                          // Deselecting a station drops its team assignment too.
                          const nextUnitIds = { ...p.unit_ids };
                          if (selected) delete nextUnitIds[JOB_FUNCTION_TO_STAGE[j]];
                          return {
                            ...p,
                            job_functions: selected
                              ? p.job_functions.filter((x) => x !== j)
                              : [...p.job_functions, j],
                            unit_ids: nextUnitIds,
                          };
                        })
                      }
                    >
                      {JOB_FUNCTION_LABELS[j]}
                    </ChipToggle>
                  );
                })}
              </div>
              {form.job_functions.length === 0 && (
                <p className="text-xs text-muted-foreground pt-1">No stations, office staff.</p>
              )}
              {/* One explicit, required team picker per selected operational
                  station (Q4 / §6). Soaking has no picker (auto-assigned). */}
              {form.job_functions
                .filter((j) => TEAM_ASSIGNABLE_STAGES.includes(JOB_FUNCTION_TO_STAGE[j]))
                .map((j) => {
                  const stage = JOB_FUNCTION_TO_STAGE[j];
                  return (
                    <UnitPicker
                      key={stage}
                      stage={stage}
                      value={form.unit_ids[stage] ?? null}
                      onChange={(id) =>
                        setForm((p) => ({ ...p, unit_ids: { ...p.unit_ids, [stage]: id } }))
                      }
                    />
                  );
                })}
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
          <Section icon={Store} title="Brand access" hint="Shop staff only see the brand interfaces they're assigned to.">
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
  // Every operational station the worker runs needs an explicit team (Q4 / §6).
  if (form.role === "staff" && form.department === "workshop") {
    for (const job of form.job_functions) {
      const stage = JOB_FUNCTION_TO_STAGE[job];
      if (TEAM_ASSIGNABLE_STAGES.includes(stage) && !form.unit_ids[stage]) return false;
    }
  }
  return true;
}

// ── Team (unit) picker — one per operational station (Q4 / §6) ────────────────

function UnitPicker({
  stage,
  value,
  onChange,
}: {
  stage: ProductionStage;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data: units = [] } = useUnits();
  const stageUnits = units.filter((u) => u.stage === stage);
  const [createOpen, setCreateOpen] = useState(false);
  const label = STAGE_TEAM_LABELS[stage];

  return (
    <div className="space-y-1.5 pt-3 mt-2 border-t border-border">
      <div className="flex items-center gap-1.5">
        <FieldLabel required>{label}</FieldLabel>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground/60 hover:text-muted-foreground" aria-label={`About ${label}`}>
              <Info className="w-3 h-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            Which team this worker belongs to for this station. Pick it explicitly. It is never defaulted, so editing the worker won't silently move them to another team.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex gap-2 pt-1">
        <div className="flex-1 min-w-0">
          <Select
            value={value ?? ""}
            onValueChange={(v) => onChange(v || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder={stageUnits.length === 0 ? "No teams, create one" : "Select team"} />
            </SelectTrigger>
            <SelectContent>
              {stageUnits.map((u) => (
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
      <CreateUnitDialog
        stage={stage}
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

function CreateUnitDialog({
  stage,
  open,
  onOpenChange,
  onCreated,
}: {
  stage: ProductionStage;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const createMut = useCreateUnit();
  const label = STAGE_TEAM_LABELS[stage];

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await createMut.mutateAsync({ stage, name: trimmed });
      toast.success(`Created ${label.toLowerCase()} "${created.name}"`);
      setName("");
      onCreated(created.id);
    } catch (err) {
      toast.error(`Could not create ${label.toLowerCase()}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setName(""); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New {label.toLowerCase()}</DialogTitle>
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
