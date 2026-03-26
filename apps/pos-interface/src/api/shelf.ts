import type { ApiResponse } from '../types/api';
import { db } from "@/lib/db";
import type { Shelf } from '@repo/database';

const TABLE_NAME = 'shelf';

export const getShelf = async (): Promise<ApiResponse<Shelf[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*');

  if (error) {
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: data as Shelf[] };
};

export const updateShelf = async (
  id: string,
  shelf: Partial<Shelf>,
): Promise<ApiResponse<Shelf>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .update(shelf)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating shelf:', error);
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as Shelf };
};
