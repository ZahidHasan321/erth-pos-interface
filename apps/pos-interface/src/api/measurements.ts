import type { ApiResponse } from '../types/api';
import type { Measurement } from '@repo/database';
import { db, isTransientNetworkError, withWriteRetry, describeWriteError } from "@/lib/db";

const TABLE_NAME = 'measurements';

const WRITE_RETRY_ATTEMPTS = 3;
const WRITE_RETRY_BASE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const getMeasurements = async (): Promise<ApiResponse<Measurement[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*');

  if (error) {
    return { status: 'error', message: error.message, data: [] };
  }
  return { status: 'success', data: data as Measurement[] };
};

export const getMeasurementsByCustomerId = async (customerId: number): Promise<ApiResponse<Measurement[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*')
    .eq('customer_id', customerId)
    .order('measurement_date', { ascending: false });

  if (error) {
    return { status: 'error', message: error.message, data: [], count: 0 };
  }
  return { status: 'success', data: data as Measurement[], count: data?.length || 0 };
};

/** Alias — same as getMeasurementsByCustomerId; selects id, measurement_id, customer_id (plus all fields). */
export const getMeasurementsByCustomer = getMeasurementsByCustomerId;

/**
 * Measurement UUIDs that are referenced by a garment on a CONFIRMED order for
 * this customer. Such a record is part of a committed order's signed spec, so
 * the measurement form must not edit it in place — that would silently rewrite
 * the spec of an order already in production, bypassing the brova/production
 * locks (§2.5). The form redirects those edits to "New Measurement" instead.
 * Draft orders are NOT locked (still being built).
 */
export const getLockedMeasurementIds = async (
  customerId: number,
): Promise<ApiResponse<string[]>> => {
  const { data, error } = await db
    .from('garments')
    .select('measurement_id, orders!inner(customer_id, checkout_status)')
    .eq('orders.customer_id', customerId)
    .eq('orders.checkout_status', 'confirmed')
    .not('measurement_id', 'is', null);
  if (error) {
    return { status: 'error', message: error.message, data: [] };
  }
  const ids = Array.from(
    new Set(
      (data ?? [])
        .map((g) => (g as { measurement_id: string | null }).measurement_id)
        .filter((id): id is string => id != null),
    ),
  );
  return { status: 'success', data: ids };
};

export const getMeasurementById = async (id: string): Promise<ApiResponse<Measurement>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as Measurement };
};

export const createMeasurement = async (
  measurement: Partial<Measurement>,
): Promise<ApiResponse<Measurement>> => {
  const payload: Partial<Measurement> = { ...measurement };
  const idempotencyKey: string =
    (payload.idempotency_key ?? undefined) ?? crypto.randomUUID();
  payload.idempotency_key = idempotencyKey;

  let data: Measurement | null = null;
  for (let attempt = 1; ; attempt++) {
    const res = await db
      .from(TABLE_NAME)
      .insert(payload)
      .select()
      .single();

    if (!res.error) {
      data = res.data as Measurement;
      break;
    }

    if (res.error.code === '23505') {
      const recovered = await db
        .from(TABLE_NAME)
        .select()
        .eq('idempotency_key', idempotencyKey)
        .single();
      if (!recovered.error && recovered.data) {
        data = recovered.data as Measurement;
        break;
      }
    }

    if (isTransientNetworkError(res.error) && attempt < WRITE_RETRY_ATTEMPTS) {
      await sleep(WRITE_RETRY_BASE_MS * attempt);
      continue;
    }

    console.error('createMeasurement: failed to create measurement:', res.error);
    return { status: 'error', message: describeWriteError(res.error) };
  }

  return { status: 'success', data: data as Measurement };
};

export const updateMeasurement = async (
  id: string,
  measurement: Partial<Measurement>,
): Promise<ApiResponse<Measurement>> => {
  const { data, error } = await withWriteRetry(
    () => db
      .from(TABLE_NAME)
      .update(measurement)
      .eq('id', id)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) {
    console.error('updateMeasurement: failed to update measurement:', error);
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as Measurement };
};
