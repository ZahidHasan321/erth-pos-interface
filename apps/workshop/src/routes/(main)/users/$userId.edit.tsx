import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useUsers, useUpdateUser } from "@/hooks/useUsers";
import { setUserPin } from "@/api/users";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Save } from "lucide-react";
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
  const updateMut = useUpdateUser();

  const user = useMemo(() => users.find((u) => u.id === userId), [users, userId]);

  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || !user) return;
    const jobs = (user as unknown as { job_functions: JobFunction[] | null }).job_functions;
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
    });
    setInitialized(true);
  }, [user, initialized]);

  const willBeTerminalWorker = isTerminalWorker(form);

  const handleSave = async () => {
    if (!user || !isUserFormValid(form, "edit")) return;
    try {
      // The Edge Function diffs job_functions vs existing resources rows and
      // adds/removes them. Past KPI history (production_plan, worker_history)
      // is keyed by username, not resource id, so dropping a resource row
      // does not orphan attribution.
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
        <div className="text-center py-20 rounded-md border border-dashed">
          <p className="text-lg font-semibold mb-1">User not found</p>
          <p className="text-sm text-muted-foreground">This user may have been removed.</p>
        </div>
      </div>
    );
  }

  const isPending = updateMut.isPending;
  const canSave = isUserFormValid(form, "edit");

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-full">
      {/* Breadcrumb */}
      <Button variant="ghost" size="sm" asChild className="mb-3 gap-2 text-muted-foreground -ml-2">
        <Link to="/users/$userId" params={{ userId: user.id }}>
          <ArrowLeft className="w-4 h-4" />
          {user.name}
        </Link>
      </Button>

      {/* Hero */}
      <div className="rounded-md border bg-card overflow-hidden mb-4 border-l-2 border-l-amber-500">
        <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Editing record</span>
            <span className="h-px w-4 bg-border" />
            <span className="text-[10px] font-mono text-muted-foreground">{user.id.slice(0, 8)}</span>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Unsaved</span>
        </div>

        <div className="p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-md border bg-muted flex items-center justify-center shrink-0">
            <Pencil className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight leading-none mb-1 truncate">
              {user.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Update access, contact, and employee details. Changes save together.
            </p>
          </div>
        </div>

      </div>

      {/* Form */}
      <UserForm mode="edit" form={form} setForm={setForm} />

      {/* Inline footer */}
      <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t">
        <p className="text-[11px] text-muted-foreground hidden sm:block">
          {canSave ? "Ready to save." : "Fill required fields."}
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
