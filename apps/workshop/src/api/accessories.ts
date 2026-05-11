import { db } from "@/lib/db";
import type { Accessory } from '@repo/database';

export async function getAccessories(includeArchived = false): Promise<Accessory[]> {
  let query = db.from('accessories').select('*');
  if (!includeArchived) query = query.eq('is_archived', false);
  const { data, error } = await query;
  if (error) throw error;
  return data as Accessory[];
}

export async function getAccessoryById(id: number): Promise<Accessory | null> {
  const { data, error } = await db.from('accessories').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Could not load accessory: ${error.message}`);
  return (data as Accessory | null) ?? null;
}

export async function createAccessory(
  accessory: Omit<Accessory, 'id' | 'created_at'>,
): Promise<Accessory> {
  const { data, error } = await db
    .from('accessories')
    .insert(accessory)
    .select()
    .single();

  if (error) throw error;
  return data as Accessory;
}

export async function updateAccessory(
  id: number,
  accessory: Partial<Accessory>,
): Promise<Accessory> {
  const { data, error } = await db
    .from('accessories')
    .update(accessory)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Accessory;
}
