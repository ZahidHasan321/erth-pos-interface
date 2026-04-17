import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useUsers, useUpdateUser } from "@/hooks/useUsers";
import { setUserPin } from "@/api/users";
import { useResourcesWithUsers, useCreateResource } from "@/hooks/useResources";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, Pencil, AlertTriangle, Save } from "lucide-react";
import { UserForm, EMPTY_USER_FORM, isUserFormValid, type UserFormState } from "@/components/users/UserForm";
import type { Role, Department, JobFunction, ProductionStage } from "@repo/database";

const JOB_FUNCTION_TO_STAGE: Record<JobFunction, ProductionStage> = {
  soaker: "soaking",
  cutter: "cutting",
  post_cutter: "post_cutting",
  sewer: "sewing",
  finisher: "finishing",
  ironer: "ironing",
  qc: "quality_check",
};

export const Route = createFileRoute("/(main)/users/$userId/edit")({
  component: EditUserPage,
  head: () => ({ meta: [{ title: "Edit User" }] }),
});

function isTerminalWorker(f: UserFormState): boolean {
  return f.role === "staff" && f.department === "workshop" && f.job_function !== null;
}

function EditUserPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useUsers();
  const { data: resources = [] } = useResourcesWithUsers();
  const updateMut = useUpdateUser();
  const createResourceMut = useCreateResource();

  const user = useMemo(() => users.find((u) => u.id === userId), [users, userId]);
  const linkedResource = useMemo(
    () => resources.find((r) => r.user_id === userId) ?? null,
    [resources, userId],
  );

  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || !user) return;
    setForm({
      username: user.username ?? "",
      name: user.name,
      email: user.email ?? "",
      country_code: user.country_code ?? "+965",
      phone: user.phone ?? "",
      role: (user.role as Role) ?? "staff",
      department: (user.department as Department) ?? "workshop",
      job_function: ((user as unknown as { job_function: JobFunction | null }).job_function) ?? null,
      brands: ((user as unknown as { brands: string[] | null }).brands) ?? [],
      is_active: user.is_active !== false,
      pin: "",
      employee_id: user.employee_id ?? "",
      nationality: user.nationality ?? "",
      hire_date: user.hire_date ?? "",
      notes: user.notes ?? "",
    });
    setInitialized(true);
  }, [user, initialized]);

  // Guard: user owning a resource (active terminal worker) cannot be morphed
  // into a non-terminal role without orphaning their KPI history. Correct path
  // is: create new account for new role, deactivate this one.
  const wasTerminalWorker = linkedResource !== null;
  const willBeTerminalWorker = isTerminalWorker(form);
  const jobFunctionChanged =
    wasTerminalWorker &&
    willBeTerminalWorker &&
    linkedResource?.responsibility !==
      (form.job_function ? JOB_FUNCTION_TO_STAGE[form.job_function] : null);
  const orphanTransition = wasTerminalWorker && (!willBeTerminalWorker || jobFunctionChanged);

  const handleSave = async () => {
    if (!user || !isUserFormValid(form, "edit")) return;
    if (orphanTransition) {
      toast.error(
        "This user has an active production profile. Create a new account for the new role and deactivate this one instead.",
      );
      return;
    }
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
          job_function: willBeTerminalWorker ? form.job_function : null,
          brands: form.department === "shop" ? form.brands : null,
          is_active: form.is_active,
          employee_id: form.employee_id || null,
          nationality: form.nationality || null,
          hire_date: form.hire_date || null,
          notes: form.notes || null,
        },
      });

      if (form.pin) {
        await setUserPin(user.id, form.pin);
      }

      // Office-staff → terminal-worker upgrade: create resource row now.
      if (!linkedResource && willBeTerminalWorker && form.job_function) {
        await createResourceMut.mutateAsync({
          user_id: user.id,
          resource_name: form.name,
          responsibility: JOB_FUNCTION_TO_STAGE[form.job_function],
          unit_id: null,
        });
      }

      toast.success("User updated");
      navigate({ to: "/users/$userId", params: { userId: user.id } });
    } catch (err) {
      toast.error(`Could not save user: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (isLoading || !initialized) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <Skeleton className="h-6 w-32 mb-6" />
        <Skeleton className="h-48 rounded-xl mb-4" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="mb-4 gap-2 text-muted-foreground -ml-2">
          <Link to="/users">
            <ArrowLeft className="w-4 h-4" />
            Back to Users
          </Link>
        </Button>
        <div className="text-center py-20 rounded-xl border border-dashed">
          <p className="text-lg font-semibold mb-1">User not found</p>
          <p className="text-sm text-muted-foreground">This user may have been removed.</p>
        </div>
      </div>
    );
  }

  const isPending = updateMut.isPending || createResourceMut.isPending;
  const canSave = isUserFormValid(form, "edit") && !orphanTransition;

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-zinc-100/60 min-h-full">
      {/* Breadcrumb */}
      <Button variant="ghost" size="sm" asChild className="mb-3 gap-2 text-muted-foreground -ml-2">
        <Link to="/users/$userId" params={{ userId: user.id }}>
          <ArrowLeft className="w-4 h-4" />
          {user.name}
        </Link>
      </Button>

      {/* Hero */}
      <div className="rounded-xl border border-zinc-200 bg-card shadow-sm overflow-hidden mb-4">
        <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
        <div className="flex items-center justify-between px-5 py-2 bg-zinc-50 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black tracking-[0.2em] text-muted-foreground">EDITING RECORD</span>
            <span className="h-px w-6 bg-border" />
            <span className="text-[10px] font-mono text-muted-foreground">{user.id.slice(0, 8)}</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-700">Unsaved</span>
        </div>

        <div className="p-6 flex items-center gap-5">
          <div className="h-16 w-16 rounded-xl bg-amber-50 ring-1 ring-amber-200 flex items-center justify-center shrink-0">
            <Pencil className="w-6 h-6 text-amber-800" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-none mb-1 truncate">
              {user.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Update access, contact, and employee details. Changes save together.
            </p>
          </div>
        </div>

        {orphanTransition && (
          <div className="border-t border-red-200 bg-red-50/70 px-6 py-3 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
            <div className="text-xs space-y-1 flex-1">
              <p className="text-red-900 font-black uppercase tracking-[0.1em] text-[10px]">
                Role change blocked
              </p>
              <p className="text-red-900/90 leading-relaxed">
                This user owns an active production profile
                {linkedResource?.resource_name && (
                  <> (<span className="font-semibold">{linkedResource.resource_name}</span>
                  {linkedResource.responsibility && <> · {linkedResource.responsibility}</>})</>
                )}
                . Changing role, department, or terminal would orphan their KPI history.
                Create a new account for the new role and deactivate this one instead.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Form */}
      <UserForm mode="edit" form={form} setForm={setForm} />

      {/* Inline footer */}
      <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t">
        <p className="text-[11px] text-muted-foreground hidden sm:block">
          {orphanTransition
            ? "Role change blocked — see warning above."
            : canSave ? "Ready to save." : "Fill required fields."}
        </p>
        <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
          <Button variant="outline" asChild>
            <Link to="/users/$userId" params={{ userId: user.id }}>Cancel</Link>
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isPending} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
