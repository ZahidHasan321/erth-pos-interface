import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUsers, useUpdateUser } from "@/hooks/useUsers";
import { useUnits } from "@/hooks/useUnits";
import { setUserPin } from "@/api/users";
import { getResources } from "@/api/resources";
import { JOB_FUNCTION_TO_STAGE } from "@/lib/job-functions";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Save } from "lucide-react";
import { PageHeader } from "@/components/shared/PageShell";
import { UserForm, EMPTY_USER_FORM, isUserFormValid, type UserFormState } from "@/components/users/UserForm";
import type { Role, Department, JobFunction } from "@repo/database";

export const Route = createFileRoute("/(main)/users/$userId/edit")({
  component: EditUserPage,
  head: () => ({ meta: [{ title: "Edit User" }] }),
});

function isTerminalWorker(f: UserFormState): boolean {
  return f.role === "staff" && f.department === "workshop" && f.job_functions.length > 0;
}

function EditUserPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useUsers();
  const { data: units = [] } = useUnits();
  // Pull resources directly (rather than the joined hook) so we get the raw
  // unit_id field cheaply on edit.
  const { data: allResources = [] } = useQuery({
    queryKey: ["resources"],
    queryFn: getResources,
    staleTime: 60_000,
  });
  const updateMut = useUpdateUser();

  const user = useMemo(() => users.find((u) => u.id === userId), [users, userId]);
  const userResources = useMemo(
    () => allResources.filter((r) => r.user_id === userId),
    [allResources, userId],
  );

  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || !user) return;
    const jobs = (user as unknown as { job_functions: JobFunction[] | null }).job_functions;
    const sewingResource = userResources.find((r) => r.responsibility === "sewing");
    setForm({
      username: user.username ?? "",
      name: user.name,
      email: user.email ?? "",
      country_code: user.country_code ?? "+965",
      phone: user.phone ?? "",
      role: (user.role as Role) ?? "staff",
      department: (user.department as Department) ?? "workshop",
      job_functions: Array.isArray(jobs) ? jobs : [],
      brands: ((user as unknown as { brands: string[] | null }).brands) ?? [],
      is_active: user.is_active !== false,
      pin: "",
      employee_id: user.employee_id ?? "",
      nationality: user.nationality ?? "",
      hire_date: user.hire_date ?? "",
      notes: user.notes ?? "",
      sewing_unit_id: sewingResource?.unit_id ?? null,
    });
    setInitialized(true);
  }, [user, userResources, initialized]);

  const willBeTerminalWorker = isTerminalWorker(form);

  // Default unit per non-sewer stage = lowest-id unit (mirrors create flow).
  // Sewing pulls from form.sewing_unit_id.
  const defaultUnitByStage = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of units) {
      if (u.stage === "sewing") continue;
      if (!map.has(u.stage)) map.set(u.stage, u.id);
    }
    return map;
  }, [units]);

  const handleSave = async () => {
    if (!user || !isUserFormValid(form, "edit")) return;
    try {
      // The Edge Function diffs job_functions vs existing resources rows and
      // adds/removes them. We also pass per-stage unit_ids so the edge
      // function can set them on new inserts AND reassign existing rows
      // (e.g. sewer moved to a new sewing team). Past KPI history
      // (production_plan, worker_history) is keyed by username, not
      // resource id, so dropping a resource row does not orphan attribution.
      const resources = willBeTerminalWorker
        ? form.job_functions.map((job) => {
            const stage = JOB_FUNCTION_TO_STAGE[job];
            const unit_id =
              stage === "sewing"
                ? form.sewing_unit_id
                : defaultUnitByStage.get(stage) ?? null;
            return { responsibility: stage, unit_id };
          })
        : [];

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
          job_functions: willBeTerminalWorker ? form.job_functions : [],
          brands: form.department === "shop" ? form.brands : null,
          is_active: form.is_active,
          employee_id: form.employee_id || null,
          nationality: form.nationality || null,
          hire_date: form.hire_date || null,
          notes: form.notes || null,
          resources,
        },
      });

      if (form.pin) {
        await setUserPin(user.id, form.pin);
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
        <Skeleton className="h-40 rounded-md mb-4" />
        <Skeleton className="h-64 rounded-md" />
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
        <div className="text-center py-16 rounded-md border border-dashed border-border">
          <p className="text-base font-medium mb-1">User not found</p>
          <p className="text-sm text-muted-foreground">This user may have been removed.</p>
        </div>
      </div>
    );
  }

  const isPending = updateMut.isPending;
  const canSave = isUserFormValid(form, "edit");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto min-h-full">
      <Button variant="ghost" size="sm" asChild className="mb-2 gap-2 text-muted-foreground -ml-2">
        <Link to="/users/$userId" params={{ userId: user.id }}>
          <ArrowLeft className="w-4 h-4" />
          {user.name}
        </Link>
      </Button>

      <PageHeader
        icon={Pencil}
        title={user.name}
        subtitle="Update access, contact, and employee details. Changes save together."
      />

      <UserForm mode="edit" form={form} setForm={setForm} />

      <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground hidden sm:block">
          {canSave ? "Ready to save." : "Fill required fields."}
        </p>
        <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
          <Button variant="outline" asChild>
            <Link to="/users/$userId" params={{ userId: user.id }}>Cancel</Link>
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isPending} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
