import type { ApiResponse, UpsertApiResponse } from "../types/api";
import type { Customer } from "@repo/database";
import { db } from "@/lib/db";
import { sanitizeFilterValue } from "@/lib/utils";

const TABLE_NAME = "customers";

export const getCustomers = async (): Promise<ApiResponse<Customer[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*');

  if (error) {
    console.error('Error fetching customers:', error);
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: data as any };
};

export const getPaginatedCustomers = async (
  page: number,
  pageSize: number,
  search?: string
): Promise<ApiResponse<Customer[]>> => {
  // Use server-side fuzzy search RPC (pg_trgm powered)
  const { data, error } = await db.rpc('search_customers_paginated', {
    p_query: search || null,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    console.error('Error fetching paginated customers:', error);
    // Fallback to simple query if RPC doesn't exist yet
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = db.from(TABLE_NAME).select('*', { count: 'exact' })
      .order('phone', { ascending: true }).range(from, to);
    if (search) {
      const s = sanitizeFilterValue(search);
      query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,arabic_name.ilike.%${s}%,nick_name.ilike.%${s}%`);
    }
    const fb = await query;
    if (fb.error) return { status: 'error', message: fb.error.message, data: [], count: 0 };
    return { status: 'success', data: fb.data as any, count: fb.count || 0 };
  }

  const result = data as any;
  return { status: 'success', data: result?.data || [], count: result?.count || 0 };
};

export const searchCustomerByPhone = async (
  phone: string,
): Promise<ApiResponse<Customer[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*')
    .ilike('phone', `%${sanitizeFilterValue(phone)}%`)
    .limit(20);

  if (error) {
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: data as any };
};

export const fuzzySearchCustomers = async (
  query: string,
): Promise<ApiResponse<Customer[]>> => {
  // Use pg_trgm fuzzy search RPC — typo-tolerant, relevance-ranked
  const { data, error } = await db.rpc('search_customers_fuzzy', {
    p_query: query,
    p_limit: 10,
  });

  if (error) {
    // Fallback to ILIKE if RPC doesn't exist yet
    const q = sanitizeFilterValue(query);
    const fb = await db.from(TABLE_NAME).select('*')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%,arabic_name.ilike.%${q}%,nick_name.ilike.%${q}%`)
      .order('name', { ascending: true }).limit(10);
    if (fb.error) return { status: 'error', message: fb.error.message, data: [] };
    return { status: 'success', data: fb.data as any };
  }

  return { status: 'success', data: (data || []) as any };
};

export const searchPrimaryAccountByPhone = async (
  phone: string,
): Promise<ApiResponse<Customer[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*')
    .eq('phone', phone)
    .eq('account_type', 'Primary');

  if (error) {
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: data as any };
};

export const getCustomerById = async (
  id: number,
): Promise<ApiResponse<Customer>> => {
  const { data, error } = await db
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
  const { data, error } = await db
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
  const { data, error } = await db
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
/**
 * Lightweight count-only query (no row data transferred).
 */
export const getCustomerCount = async (): Promise<number> => {
  const { count, error } = await db
    .from(TABLE_NAME)
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching customer count:', error);
    return 0;
  }
  return count || 0;
};

export const upsertCustomer = async (
  customers: Partial<Customer>[],
): Promise<UpsertApiResponse<Customer>> => {
  const { data, error } = await db
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

