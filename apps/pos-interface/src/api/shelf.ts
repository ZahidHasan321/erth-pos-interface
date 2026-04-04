import { db } from "@/lib/db";
import type { Shelf } from '@repo/database';

export const getShelf = async (): Promise<Shelf[]> => {
  const { data, error } = await db
    .from('shelf')
    .select('*');

  if (error) throw error;
  return data as Shelf[];
};

export const updateShelf = async (
  id: string,
  shelf: Partial<Shelf>,
): Promise<Shelf> => {
  const { data, error } = await db
    .from('shelf')
    .update(shelf)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Shelf;
};
