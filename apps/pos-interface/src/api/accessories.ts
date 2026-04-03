import type { ApiResponse } from '../types/api';
import { db } from "@/lib/db";
import type { Accessory } from '@repo/database';

export const getAccessories = async (): Promise<ApiResponse<Accessory[]>> => {
  const { data, error } = await db
    .from('accessories')
    .select('*');

  if (error) {
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: data as Accessory[] };
};

export const createAccessory = async (
  accessory: Omit<Accessory, 'id' | 'created_at'>,
): Promise<ApiResponse<Accessory>> => {
  const { data, error } = await db
    .from('accessories')
    .insert(accessory)
    .select()
    .single();

  if (error) {
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as Accessory };
};

export const updateAccessory = async (
  id: number,
  accessory: Partial<Accessory>,
): Promise<ApiResponse<Accessory>> => {
  const { data, error } = await db
    .from('accessories')
    .update(accessory)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as Accessory };
};
