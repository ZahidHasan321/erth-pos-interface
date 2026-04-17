import { db } from "@/lib/db";
import type { Unit, NewUnit } from "@repo/database";

export const getUnits = async (): Promise<Unit[]> => {
  const { data, error } = await db
    .from("units")
    .select("*")
    .order("stage")
    .order("name");
  if (error) throw new Error(`getUnits: failed to fetch units: ${error.message}`);
  return data ?? [];
};

export const createUnit = async (
  unit: Pick<NewUnit, "stage" | "name"> & Partial<Pick<NewUnit, "notes">>,
): Promise<Unit> => {
  const { data, error } = await db
    .from("units")
    .insert(unit)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(`A unit named "${unit.name}" already exists in ${unit.stage}.`);
    }
    throw new Error(`createUnit: failed to insert unit: ${error.message}`);
  }
  return data;
};

export const updateUnit = async (
  id: string,
  updates: Partial<Pick<NewUnit, "name" | "notes">>,
): Promise<Unit> => {
  const { data, error } = await db
    .from("units")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(`A unit with that name already exists in this stage.`);
    }
    throw new Error(`updateUnit: failed to update unit ${id}: ${error.message}`);
  }
  return data;
};

// Guarded delete: block when workers are still assigned so the admin
// consciously reassigns or removes them first.
export const deleteUnit = async (id: string): Promise<void> => {
  const { count, error: countErr } = await db
    .from("resources")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", id);
  if (countErr) {
    throw new Error(`deleteUnit: failed to check worker count: ${countErr.message}`);
  }
  if ((count ?? 0) > 0) {
    throw new Error(
      `Cannot delete unit: ${count} worker${count === 1 ? " is" : "s are"} still assigned. Move or remove them first.`,
    );
  }
  const { error } = await db.from("units").delete().eq("id", id);
  if (error) throw new Error(`deleteUnit: failed to delete unit ${id}: ${error.message}`);
};
