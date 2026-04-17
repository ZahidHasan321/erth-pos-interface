import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCreateUser } from "@/hooks/useUsers";
import { useCreateResource } from "@/hooks/useResources";
import { useUnits } from "@/hooks/useUnits";
import { Button } from "@repo/ui/button";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Factory, Sparkles } from "lucide-react";
import { UserForm, EMPTY_USER_FORM, isUserFormValid, type UserFormState } from "@/components/users/UserForm";
import { JOB_FUNCTION_LABELS } from "@/lib/rbac";
import type { JobFunction, ProductionStage } from "@repo/database";

type NewUserSearch = {
  stage?: ProductionStage;
  unit_id?: string;
};

const VALID_STAGES: ProductionStage[] = [
  "soaking", "cutting", "post_cutting", "sewing", "finishing", "ironing", "quality_check",
];

const STAGE_TO_JOB_FUNCTION: Record<ProductionStage, JobFunction> = {
  soaking: "soaker",
  cutting: "cutter",
  post_cutting: "post_cutter",
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
  const createResourceMut = useCreateResource();
  const { data: units = [] } = useUnits();

  const presetJobFunction = presetStage ? STAGE_TO_JOB_FUNCTION[presetStage] : undefined;
  const presetUnit = presetUnitId ? units.find((u) => u.id === presetUnitId) : undefined;

  const [form, setForm] = useState<UserFormState>(() => ({
    ...EMPTY_USER_FORM,
    role: presetJobFunction ? "staff" : EMPTY_USER_FORM.role,
    department: presetJobFunction ? "workshop" : EMPTY_USER_FORM.department,
    job_function: presetJobFunction ?? null,
  }));

  const handleSubmit = async () => {
    if (!isUserFormValid(form, "add")) return;
    const isTerminalWorker =
      form.role === "staff" &&
      form.department === "workshop" &&
      form.job_function !== null;

    try {
      const created = await createUserMut.mutateAsync({
        username: form.username,
        name: form.name,
        email: form.email || null,
        country_code: form.country_code || null,
        phone: form.phone || null,
        role: form.role,
        department: form.department,
        job_function: isTerminalWorker ? form.job_function : null,
        brands: form.department === "shop" ? form.brands : null,
        is_active: form.is_active,
        pin: form.pin || undefined,
        employee_id: form.employee_id || null,
        nationality: form.nationality || null,
        hire_date: form.hire_date || null,
        notes: form.notes || null,
      });

      if (isTerminalWorker && form.job_function) {
        const stage = Object.entries(STAGE_TO_JOB_FUNCTION).find(
          ([, jf]) => jf === form.job_function,
        )?.[0] as ProductionStage | undefined;
        await createResourceMut.mutateAsync({
          user_id: created.id,
          resource_name: form.name,
          responsibility: stage ?? null,
          unit_id: presetUnitId ?? null,
        });
      }

      toast.success(`User "${created.name}" created`);
      navigate({ to: "/users/$userId", params: { userId: created.id } });
    } catch (err) {
      toast.error(`Could not create user: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const isPending = createUserMut.isPending || createResourceMut.isPending;
  const canSubmit = isUserFormValid(form, "add");

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-zinc-100/60 min-h-full">
      {/* Breadcrumb */}
      <Button variant="ghost" size="sm" asChild className="mb-3 gap-2 text-muted-foreground -ml-2">
        <Link to="/users">
          <ArrowLeft className="w-4 h-4" />
          Users
        </Link>
      </Button>

      {/* Hero */}
      <div className="rounded-xl border border-zinc-200 bg-card shadow-sm overflow-hidden mb-4">
        <div className="h-1 bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-900" />
        <div className="flex items-center justify-between px-5 py-2 bg-zinc-50 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black tracking-[0.2em] text-muted-foreground">NEW PERSONNEL</span>
            <span className="h-px w-6 bg-border" />
            <span className="text-[10px] font-mono text-muted-foreground">FORM · 001</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Draft</span>
        </div>

        <div className="p-6 flex items-center gap-5">
          <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-700 flex items-center justify-center ring-1 ring-border shrink-0">
            <UserPlus className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-none mb-1">
              Create Account
            </h1>
            <p className="text-sm text-muted-foreground">
              Set up a new staff account. Terminal workers get a production profile automatically.
            </p>
          </div>
        </div>

        {/* Prefill banner */}
        {(presetJobFunction || presetUnit) && (
          <div className="border-t border-amber-200 bg-amber-50/60 px-6 py-3 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs space-y-0.5 flex-1">
              <p className="text-amber-900 font-bold uppercase tracking-[0.1em] text-[10px]">
                Pre-filled from production team
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-amber-900 pt-0.5">
                {presetJobFunction && (
                  <span className="inline-flex items-center gap-1.5">
                    <Factory className="w-3 h-3" />
                    <span className="opacity-70">Terminal:</span>
                    <span className="font-semibold">{JOB_FUNCTION_LABELS[presetJobFunction]}</span>
                  </span>
                )}
                {presetUnit && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="opacity-70">Unit:</span>
                    <span className="font-semibold">{presetUnit.name}</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] text-amber-800/80 pt-0.5">
                Production profile will be created on save.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Form */}
      <UserForm mode="add" form={form} setForm={setForm} />

      {/* Inline footer actions */}
      <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t">
        <p className="text-[11px] text-muted-foreground hidden sm:block">
          {canSubmit ? "Ready to create." : "Fill required fields to continue."}
        </p>
        <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
          <Button variant="outline" asChild>
            <Link to="/users">Cancel</Link>
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending} className="gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            {isPending ? "Creating..." : "Create User"}
          </Button>
        </div>
      </div>
    </div>
  );
}
