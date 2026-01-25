import type { ApiResponse } from '../types/api';
import { supabase } from '../lib/supabase';
import type { Shelf } from '@repo/database';

const TABLE_NAME = 'shelf';

export const getShelves = async (): Promise<ApiResponse<Shelf[]>> => {
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' });

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as Shelf[], count: count || 0 };
};

export const updateShelf = async (
  id: string,
  shelf: Partial<Shelf>,
): Promise<ApiResponse<Shelf>> => {
  const { data, error } = await supabase
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
