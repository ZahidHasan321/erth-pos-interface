import { db } from "@/lib/db";
import type { Supplier, NewSupplier } from "@repo/database";

export async function getSuppliers(includeArchived = false): Promise<Supplier[]> {
  let query = db.from("suppliers").select("*").order("name");
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load suppliers: ${error.message}`);
  return data as Supplier[];
}

export async function createSupplier(input: Pick<NewSupplier, "name"> & Partial<Pick<NewSupplier, "phone" | "email" | "notes">>): Promise<Supplier> {
  const { data, error } = await db.from("suppliers").insert(input).select().single();
  if (error) throw new Error(`Could not create supplier: ${error.message}`);
  return data as Supplier;
}

export async function updateSupplier(id: number, patch: Partial<Omit<Supplier, "id" | "created_at">>): Promise<Supplier> {
  const { data, error } = await db.from("suppliers").update(patch).eq("id", id).select().single();
  if (error) throw new Error(`Could not update supplier: ${error.message}`);
  return data as Supplier;
}

export async function archiveSupplier(id: number): Promise<void> {
  const { error } = await db.from("suppliers").update({ is_archived: true }).eq("id", id);
  if (error) throw new Error(`Could not archive supplier: ${error.message}`);
}
