import { db } from "@/lib/db";
import type { Accessory } from '@repo/database';

export async function getAccessories(): Promise<Accessory[]> {
  const { data, error } = await db
    .from('accessories')
    .select('*');

  if (error) throw error;
  return data as Accessory[];
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
