import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCreateUser } from "@/hooks/useUsers";
import { useUnits } from "@/hooks/useUnits";
import { Button } from "@repo/ui/button";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Factory, Info } from "lucide-react";
import { PageHeader, StatusBanner } from "@/components/shared/PageShell";
import { UserForm, EMPTY_USER_FORM, isUserFormValid, type UserFormState } from "@/components/users/UserForm";
import { JOB_FUNCTION_LABELS } from "@/lib/rbac";
import { JOB_FUNCTION_TO_STAGE, TEAM_ASSIGNABLE_STAGES } from "@/lib/job-functions";
import type { JobFunction, ProductionStage } from "@repo/database";

type NewUserSearch = {
  stage?: ProductionStage;
  unit_id?: string;
};

// TEMP DISABLED: post_cutting hidden from production flow (kept in DB enum)
const VALID_STAGES: ProductionStage[] = [
  "soaking", "cutting", /* "post_cutting", */ "sewing", "finishing", "ironing", "quality_check",
];

const STAGE_TO_JOB_FUNCTION: Record<ProductionStage, JobFunction> = {
  soaking: "soaker",
  cutting: "cutter",
  post_cutting: "post_cutter", // legacy mapping; not selectable
  sewing: "sewer",
  finishing: "finisher",
  ironing: "ironer",
  quality_check: "qc",
};

export const Route = createFileRoute("/(main)/users/new")({
  validateSearch: (raw: Record<string, unknown>): NewUserSearch => {
    const stageRaw = raw.stage;
    const stage =
      typeof stageRaw === "string" && (VALID_STAGES as string[]).includes(stageRaw)
        ? (stageRaw as ProductionStage)
        : undefined;
    const unitRaw = raw.unit_id;
    const unit_id = typeof unitRaw === "string" && unitRaw.length > 0 ? unitRaw : undefined;
    return { stage, unit_id };
  },
  component: NewUserPage,
  head: () => ({ meta: [{ title: "New User" }] }),
});

function NewUserPage() {
  const navigate = useNavigate();
  const { stage: presetStage, unit_id: presetUnitId } = Route.useSearch();
  const createUserMut = useCreateUser();
  const { data: units = [] } = useUnits();

  const presetJobFunction = presetStage ? STAGE_TO_JOB_FUNCTION[presetStage] : undefined;
  const presetUnit = presetUnitId ? units.find((u) => u.id === presetUnitId) : undefined;

  const [form, setForm] = useState<UserFormState>(() => ({
    ...EMPTY_USER_FORM,
    role: presetJobFunction ? "staff" : EMPTY_USER_FORM.role,
    department: presetJobFunction ? "workshop" : EMPTY_USER_FORM.department,
    job_functions: presetJobFunction ? [presetJobFunction] : [],
    // If the manager came in from a team page with a preset unit, pre-fill that
    // station's team picker.
    unit_ids:
      presetStage && presetUnitId && TEAM_ASSIGNABLE_STAGES.includes(presetStage)
        ? { [presetStage]: presetUnitId }
        : {},
  }));

  // Fallback unit (lowest-id, stable) for non-team-assignable stages only —
  // i.e. soaking, which has no picker. Operational stations use the manager's
  // explicit form.unit_ids pick (Q4 / §6), never this default.
  const defaultUnitByStage = new Map<string, string>();
  for (const u of units) {
    if (TEAM_ASSIGNABLE_STAGES.includes(u.stage)) continue;
    if (!defaultUnitByStage.has(u.stage)) defaultUnitByStage.set(u.stage, u.id);
  }

  const handleSubmit = async () => {
    if (!isUserFormValid(form, "add")) return;
    const isTerminalWorker =
      form.role === "staff" &&
      form.department === "workshop" &&
      form.job_functions.length > 0;

    // Terminal workers also need one `resources` row per assigned job. Hand
    // them to the Edge Function so user + auth + pin + resources land
    // atomically (rollback if any step fails — no orphan accounts). Every
    // operational station uses the team the manager explicitly picked (Q4 / §6);
    // soaking (the only non-team-assignable station here) auto-assigns to its
    // default unit.
    const resources = isTerminalWorker
      ? form.job_functions.map((job) => {
          const stage = JOB_FUNCTION_TO_STAGE[job];
          const unit_id = TEAM_ASSIGNABLE_STAGES.includes(stage)
            ? form.unit_ids[stage] ?? null
            : defaultUnitByStage.get(stage) ?? null;
          return {
            resource_name: form.name,
            responsibility: stage,
            unit_id,
          };
        })
      : [];

    try {
      const created = await createUserMut.mutateAsync({
        username: form.username,
        name: form.name,
        email: form.email || null,
        country_code: form.country_code || null,
        phone: form.phone || null,
        role: form.role,
        department: form.department,
        job_functions: isTerminalWorker ? form.job_functions : [],
        brands: form.department === "shop" ? form.brands : null,
        is_active: form.is_active,
        pin: form.pin || undefined,
        employee_id: form.employee_id || null,
        nationality: form.nationality || null,
        hire_date: form.hire_date || null,
        notes: form.notes || null,
        resources,
      });

      toast.success(`User "${created.name}" created`);
      navigate({ to: "/users/$userId", params: { userId: created.id } });
    } catch (err) {
      toast.error(`Could not create user: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const isPending = createUserMut.isPending;
  const canSubmit = isUserFormValid(form, "add");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto min-h-full">
      <Button variant="ghost" size="sm" asChild className="mb-2 gap-2 text-muted-foreground -ml-2">
        <Link to="/users">
          <ArrowLeft className="w-4 h-4" />
          Users
        </Link>
      </Button>

      <PageHeader
        icon={UserPlus}
        title="New user"
        subtitle="Create a staff account. Terminal workers get a production profile automatically."
      />

      {(presetJobFunction || presetUnit) && (
        <div className="mb-4">
          <StatusBanner tone="info" icon={Info}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium">Pre-filled from production team.</span>
              {presetJobFunction && (
                <span className="inline-flex items-center gap-1.5">
                  <Factory className="w-3 h-3" />
                  Terminal: <span className="font-medium">{JOB_FUNCTION_LABELS[presetJobFunction]}</span>
                </span>
              )}
              {presetUnit && (
                <span>Unit: <span className="font-medium">{presetUnit.name}</span></span>
              )}
            </div>
          </StatusBanner>
        </div>
      )}

      <UserForm mode="add" form={form} setForm={setForm} />

      <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground hidden sm:block">
          {canSubmit ? "Ready to create." : "Fill required fields to continue."}
        </p>
        <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
          <Button variant="outline" asChild>
            <Link to="/users">Cancel</Link>
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending} className="gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            {isPending ? "Creating..." : "Create user"}
          </Button>
        </div>
      </div>
    </div>
  );
}
