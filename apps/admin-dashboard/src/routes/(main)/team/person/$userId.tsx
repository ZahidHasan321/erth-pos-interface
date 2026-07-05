import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, UserCog, AlertTriangle } from "lucide-react";
import {
  PageHeader, SectionCard, EmptyState, LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { useTeamRoster } from "@/hooks/useAdmin";
import { titleCase } from "@/lib/format";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { TeamPerson } from "@/api/admin";

export const Route = createFileRoute("/(main)/team/person/$userId")({
  component: PersonProfilePage,
});

const ROLE_LABEL: Record<string, string> = {
  measurement_taker: "Measurement taker",
  super_admin: "Owner",
};
const roleLabel = (r: string) => ROLE_LABEL[r] ?? titleCase(r);

function PersonProfilePage() {
  const { userId } = Route.useParams();
  // No per-person profile RPC: profile-only people are read straight off the
  // roster (small, cached). Fetch the full roster and pick this user out.
  const { data, isLoading, isError, error } = useTeamRoster(null, null);

  const person = useMemo(
    () => data?.data.find((p) => p.user_id === userId) ?? null,
    [data, userId],
  );

  return (
    <div>
      <Link to="/team" search={{ location: "", role: "" }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to team
      </Link>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load person"} />
      ) : isLoading ? (
        <LoadingSkeleton count={3} />
      ) : !person ? (
        <EmptyState icon={UserCog} message="Person not found" />
      ) : (
        <PersonProfileView p={person} />
      )}
    </div>
  );
}

function PersonProfileView({ p }: { p: TeamPerson }) {
  const locationLabel = p.location ? titleCase(p.location) : "Owner";
  return (
    <div>
      <PageHeader
        icon={UserCog}
        title={p.name}
        subtitle={[roleLabel(p.role ?? ""), p.employee_id ? `#${p.employee_id}` : null].filter(Boolean).join(" · ") || undefined}
      >
        {p.is_active ? <StatusPill color="green">Active</StatusPill> : <StatusPill color="zinc">Inactive</StatusPill>}
      </PageHeader>

      <SectionCard title="Profile" className="mb-4">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Field label="Role" value={p.role ? roleLabel(p.role) : null} />
          <Field label="Location" value={locationLabel} />
          <Field
            label="Brands"
            node={p.brands.length ? (
              <span className="inline-flex flex-wrap gap-1">
                {p.brands.map((b) => <BrandBadge key={b} brand={b.toUpperCase()} />)}
              </span>
            ) : undefined}
          />
          <Field label="Phone" value={p.phone} mono />
          <Field label="Email" value={p.email} />
          <Field label="Nationality" value={p.nationality} />
          <Field label="Hire date" value={p.hire_date ? formatDate(p.hire_date) : null} />
          <Field label="Last active" value={p.last_active_at ? formatDateTime(p.last_active_at) : null} />
        </dl>
      </SectionCard>

      {p.job_functions.length > 0 && (
        <SectionCard title="Job functions">
          <div className="flex flex-wrap gap-1.5">
            {p.job_functions.map((f) => (
              <span key={f} className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                {titleCase(f)}
              </span>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function Field({ label, value, node, mono }: { label: string; value?: string | null; node?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "tabular-nums" : ""}>{node ?? value ?? "-"}</dd>
    </div>
  );
}
