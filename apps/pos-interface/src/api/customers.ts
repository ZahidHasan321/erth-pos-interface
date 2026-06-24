import type { ApiResponse, UpsertApiResponse } from "../types/api";
import type { Customer, AccountType } from "@repo/database";
import { db, isTransientNetworkError, withWriteRetry, describeWriteError } from "@/lib/db";
import { sanitizeFilterValue } from "@/lib/utils";

const TABLE_NAME = "customers";

// Customer row enriched with the aggregate fields returned by
// search_customers_paginated. The aggregates are optional because the
// fallback ILIKE query path doesn't supply them.
export type CustomerListItem = Customer & {
  orders_count?: number;
  last_order_at?: string | null;
  outstanding_total?: number | string | null;
  has_measurements?: boolean;
};

const WRITE_RETRY_ATTEMPTS = 3;
const WRITE_RETRY_BASE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const getCustomers = async (): Promise<ApiResponse<Customer[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*');

  if (error) {
    console.error('Error fetching customers:', error);
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: data as Customer[] };
};

export const getPaginatedCustomers = async (
  page: number,
  pageSize: number,
  search?: string
): Promise<ApiResponse<CustomerListItem[]>> => {
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
    return { status: 'success', data: fb.data as CustomerListItem[], count: fb.count || 0 };
  }

  const result = data as { data?: CustomerListItem[]; count?: number };
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
  return { status: 'success', data: data as Customer[] };
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
    return { status: 'success', data: fb.data as Customer[] };
  }

  return { status: 'success', data: (data || []) as Customer[] };
};

// One account that already uses a phone number, as returned by the
// find_accounts_by_phone RPC. resolved_primary_* points at the Primary this
// account belongs to (itself if it is a Primary), so the form can offer to link
// a new customer as a family member of that Primary.
export type PhoneAccountMatch = {
  id: number;
  name: string;
  phone: string | null;
  account_type: AccountType | null;
  primary_customer_id: number | null;
  resolved_primary_id: number | null;
  resolved_primary_name: string | null;
};

// Every account sharing a phone number, matched on the normalized national
// number (so formatting / spaces / leading zero / country code still match).
// Primary matches come first. Powers the demographics duplicate-phone guard.
export const findAccountsByPhone = async (
  phone: string,
): Promise<ApiResponse<PhoneAccountMatch[]>> => {
  const { data, error } = await db.rpc('find_accounts_by_phone', {
    p_phone: phone,
  });

  if (error) {
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: (data || []) as PhoneAccountMatch[] };
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
  return { status: 'success', data: data as Customer };
};

export const createCustomer = async (
  customer: Partial<Customer>,
): Promise<ApiResponse<Customer>> => {
  const payload = { ...customer } as Partial<Customer> & Record<string, unknown>;
  const idempotencyKey: string =
    (payload.idempotency_key as string | undefined) ?? crypto.randomUUID();
  payload.idempotency_key = idempotencyKey;

  let data: Customer | null = null;
  for (let attempt = 1; ; attempt++) {
    const res = await db
      .from(TABLE_NAME)
      .insert(payload)
      .select()
      .single();

    if (!res.error) {
      data = res.data as Customer;
      break;
    }

    if (res.error.code === '23505') {
      const recovered = await db
        .from(TABLE_NAME)
        .select()
        .eq('idempotency_key', idempotencyKey)
        .single();
      if (!recovered.error && recovered.data) {
        data = recovered.data as Customer;
        break;
      }
    }

    if (isTransientNetworkError(res.error) && attempt < WRITE_RETRY_ATTEMPTS) {
      await sleep(WRITE_RETRY_BASE_MS * attempt);
      continue;
    }

    console.error('Error creating customer:', res.error);
    return { status: 'error', message: describeWriteError(res.error) };
  }

  return { status: 'success', data: data as Customer };
};

export const updateCustomer = async (
  id: number,
  customer: Partial<Customer>,
): Promise<ApiResponse<Customer>> => {
  const { data, error } = await withWriteRetry(
    () => db
      .from(TABLE_NAME)
      .update(customer)
      .eq('id', id)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) {
    console.error('Error updating customer:', error);
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as Customer };
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
  const { data, error } = await withWriteRetry(
    () => db
      .from(TABLE_NAME)
      .upsert(customers) // Phone is not unique anymore, default to PK (id)
      .select(),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) {
    throw error;
  }

  // Map response to legacy UpsertApiResponse structure roughly
  return {
    status: 'success',
    data: {
        records: data as Customer[],
        updatedRecords: [], // Not easily distinguished in Supabase response
        createdRecords: []
    }
  };
};
