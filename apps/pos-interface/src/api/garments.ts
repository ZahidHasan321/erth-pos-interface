import type { ApiResponse } from "../types/api";
import type { Garment } from "@repo/database";
import { supabase } from "../lib/supabase";

const TABLE_NAME = "garments";

export const createGarment = async (
  garment: Partial<Garment>
): Promise<ApiResponse<Garment>> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(garment)
    .select()
    .single();

  if (error) {
    console.error('Error creating garment:', error);
    throw error;
  }
  return { status: 'success', data: data as any };
};

export const updateGarment = async (
  id: string,
  garment: Partial<Garment>
): Promise<ApiResponse<Garment>> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(garment)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating garment:', error);
    throw error;
  }
  return { status: 'success', data: data as any };
};

export const getGarments = async (): Promise<ApiResponse<Garment[]>> => {
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' });

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as any, count: count || 0 };
};

export const getGarmentById = async (id: string): Promise<ApiResponse<Garment>> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as any };
};

export const getGarmentsByField = async (
  fields: Record<string, any>
): Promise<ApiResponse<Garment[]>> => {
  let builder = supabase.from(TABLE_NAME).select('*');
  
  Object.entries(fields).forEach(([key, value]) => {
     builder = builder.eq(key, value);
  });

  const { data, error, count } = await builder;

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as any, count: count || 0 };
};
