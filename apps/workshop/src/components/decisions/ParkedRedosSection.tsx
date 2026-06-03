import { SectionCard } from "@/components/shared/PageShell";
import { ParkedRedosTable, useResumeRedo } from "@/components/shared/ParkedRedosTable";
import { useAuth } from "@/context/auth";
import { isAdmin, isManager } from "@/lib/rbac";
import type { WorkshopGarment } from "@repo/database";

/**
 * Decisions-hub section: parked redo replacements awaiting a manager decision
 * (CLAUDE.md §6) — blocked on material / customer cloth / approval. Resume
 * re-runs the deferred fabric consume. Mirrors the Scheduler's parked-redos
 * section (same table + resume hook); non-managers see the rows read-only.
 */
export function ParkedRedosSection({ garments }: { garments: WorkshopGarment[] }) {
  const { user } = useAuth();
  const canResolve = isManager(user) || isAdmin(user);
  const { resumingId, resume } = useResumeRedo();

  return (
    <SectionCard title={`Parked redos — needs decision (${garments.length})`} bodyClassName="p-0">
      <ParkedRedosTable
        garments={garments}
        resumingId={resumingId}
        onResume={canResolve ? resume : undefined}
      />
    </SectionCard>
  );
}
