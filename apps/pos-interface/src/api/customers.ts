import type { ApiResponse, UpsertApiResponse } from "../types/api";
import type { Customer } from "@repo/database";
import { supabase } from "../lib/supabase";

const TABLE_NAME = "customers";

export const getCustomers = async (): Promise<ApiResponse<Customer[]>> => {
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' });

  if (error) {
    console.error('Error fetching customers:', error);
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as any, count: count || 0 };
};

export const searchCustomerByPhone = async (
  phone: string,
): Promise<ApiResponse<Customer[]>> => {
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' })
    .ilike('phone', `%${phone}%`);

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as any, count: count || 0 };
};

export const searchPrimaryAccountByPhone = async (
  phone: string,
): Promise<ApiResponse<Customer[]>> => {
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' })
    .ilike('phone', `%${phone}%`)
    .eq('account_type', 'Primary');

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as any, count: count || 0 };
};

export const getCustomerById = async (
  id: number,
): Promise<ApiResponse<Customer>> => {
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

export const createCustomer = async (
  customer: Partial<Customer>,
): Promise<ApiResponse<Customer>> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(customer)
    .select()
    .single();

  if (error) {
    console.error('Error creating customer:', error);
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as any };
};

export const updateCustomer = async (
  id: number,
  customer: Partial<Customer>,
): Promise<ApiResponse<Customer>> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(customer)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating customer:', error);
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as any };
};

/**
 * Batch Upsert or Single Upsert
 * @param customers Array of customers to upsert
 */
export const upsertCustomer = async (
  customers: Partial<Customer>[],
): Promise<UpsertApiResponse<Customer>> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(customers) // Phone is not unique anymore, default to PK (id)
    .select();

  if (error) {
    throw error;
  }

  // Map response to legacy UpsertApiResponse structure roughly
  return {
    status: 'success',
    data: {
        records: data as any,
        updatedRecords: [], // Not easily distinguished in Supabase response
        createdRecords: []
    }
  };
};

