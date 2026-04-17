import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Switch } from "@repo/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { DatePicker } from "@repo/ui/date-picker";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { ChipToggle } from "@repo/ui/chip-toggle";
import { ROLE_LABELS, DEPARTMENT_LABELS, JOB_FUNCTION_LABELS } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import {
  UserCog, Shield, Phone, Mail, Hash,
  Store, Briefcase,
  Factory, ShoppingBag, Info,
} from "lucide-react";
import { format } from "date-fns";
import type { Role, Department, JobFunction } from "@repo/database";

export const ALL_BRANDS = ["erth", "sakkba", "qass"] as const;
export const BRAND_LABELS: Record<string, string> = { erth: "Erth", sakkba: "Sakkba", qass: "Qass" };
export const JOB_FUNCTIONS: JobFunction[] = ["soaker", "cutter", "post_cutter", "sewer", "finisher", "ironer", "qc"];

export type UserFormState = {
  username: string;
  name: string;
  email: string;
  country_code: string;
  phone: string;
  role: Role;
  department: Department;
  job_function: JobFunction | null;
  brands: string[];
  is_active: boolean;
  pin: string;
  employee_id: string;
  nationality: string;
  hire_date: string;
  notes: string;
};

export const EMPTY_USER_FORM: UserFormState = {
  username: "",
  name: "",
  email: "",
  country_code: "+965",
  phone: "",
  role: "staff",
  department: "workshop",
  job_function: null,
  brands: [],
  is_active: true,
  pin: "",
  employee_id: "",
  nationality: "",
  hire_date: "",
  notes: "",
};

// ── Section card ─────────────────────────────────────────────────────────────

function Section({
  number,
  icon: Icon,
  title,
  description,
  children,
}: {
  number: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-card shadow-sm overflow-hidden">
      <header className="px-5 pt-4 pb-3 border-b border-zinc-200 bg-zinc-50/60">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-black tracking-[0.2em] text-zinc-400 tabular-nums">
            {number}
          </span>
          <span className="h-px w-4 bg-zinc-300" />
          <Icon className="w-3.5 h-3.5 text-zinc-500" />
          <h3 className="text-sm font-bold tracking-tight">{title}</h3>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
      </header>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
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
        {/* 01 · Identity */}
        <Section
          number="01"
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
              <Input
                className="w-[72px] shrink-0 text-center font-mono text-xs"
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
        </Section>

        {/* 03 · HR */}
        <Section
          number={form.department === "shop" ? "04" : "03"}
          icon={Briefcase}
          title="Employee Record"
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
              <Input
                placeholder="Kuwaiti"
                value={form.nationality}
                onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))}
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
        {/* 02 · Access */}
        <Section
          number="02"
          icon={Shield}
          title="Access & Role"
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
                        r === "super_admin" ? "text-amber-500"
                        : r === "admin" ? "text-zinc-900"
                        : r === "manager" ? "text-zinc-500"
                        : "text-zinc-300",
                      )} />
                      {ROLE_LABELS[r]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2">
            <Info className="w-3 h-3 text-zinc-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              {form.role === "super_admin" && "Full access to all pages across all apps. Can manage everything."}
              {form.role === "admin" && "Full access to all pages. Can manage users, schedules, pricing, and operations."}
              {form.role === "manager" && form.department === "workshop" && "Full workshop operations: scheduling, receiving, dispatch, team, performance."}
              {form.role === "manager" && form.department === "shop" && "View-only access to workshop data. Dashboard, tracker, performance."}
              {form.role === "staff" && form.department === "workshop" && !form.job_function && "Office staff — dashboard / tracker / performance access."}
              {form.role === "staff" && form.department === "workshop" && form.job_function && `Terminal worker — sees only the ${JOB_FUNCTION_LABELS[form.job_function]} terminal. No sidebar.`}
              {form.role === "staff" && form.department === "shop" && "Shop-only access. No workshop pages."}
            </p>
          </div>

          {form.role === "staff" && form.department === "workshop" && (
            <div className="space-y-1.5">
              <FieldLabel>Terminal Assignment</FieldLabel>
              <Select
                value={form.job_function ?? "none"}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    job_function: v === "none" ? null : (v as JobFunction),
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (office staff)</SelectItem>
                  {JOB_FUNCTIONS.map((j) => (
                    <SelectItem key={j} value={j}>{JOB_FUNCTION_LABELS[j]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-end gap-4 pt-2 border-t border-dashed flex-wrap">
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
                "text-xs font-semibold",
                form.is_active ? "text-foreground" : "text-muted-foreground",
              )}>
                {form.is_active ? "Active" : "Inactive"}
              </span>
            </label>
          </div>
        </Section>

        {/* 03 · Brands (shop only) */}
        {form.department === "shop" && (
          <Section
            number="03"
            icon={Store}
            title="Brand Access"
            description="Shop staff only see the brand interfaces they're assigned to."
          >
            <div className="space-y-2">
              <FieldLabel required>Assigned Brands</FieldLabel>
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
                <p className="text-[11px] text-red-500 pt-1">Select at least one brand.</p>
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
  return true;
}
