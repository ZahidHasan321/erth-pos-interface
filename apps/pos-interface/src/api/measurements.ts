import type { ApiResponse } from '../types/api';
import type { Measurement } from '@repo/database';
import { supabase } from '../lib/supabase';

const TABLE_NAME = 'measurements';

export const getMeasurements = async (): Promise<ApiResponse<Measurement[]>> => {
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' });

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as any, count: count || 0 };
};

export const getMeasurementsByCustomerId = async (customerId: number): Promise<ApiResponse<Measurement[]>> => {
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' })
    .eq('customer_id', customerId);

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as any, count: count || 0 };
};

export const getMeasurementById = async (id: string): Promise<ApiResponse<Measurement>> => {
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

export const createMeasurement = async (
  measurement: Partial<Measurement>,
): Promise<ApiResponse<Measurement>> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(measurement)
    .select()
    .single();

  if (error) {
    console.error('Error creating measurement:', error);
    throw error;
  }
  return { status: 'success', data: data as any };
};

export const updateMeasurement = async (
  id: string,
  measurement: Partial<Measurement>,
): Promise<ApiResponse<Measurement>> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(measurement)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating measurement:', error);
    throw error;
  }
  return { status: 'success', data: data as any };
};
