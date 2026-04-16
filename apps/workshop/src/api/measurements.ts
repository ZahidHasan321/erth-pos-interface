import { db } from '@/lib/db';

/** Measurement row shape — mirrors measurements table columns used by the
 *  Add Garment form. Columns not listed here (created_at, etc.) are managed
 *  by the DB. */
export interface MeasurementRow {
  id: string;
  customer_id: string | null;
  measurement_date: string | null;
  [key: string]: unknown;
}

export const getMeasurementById = async (id: string): Promise<MeasurementRow | null> => {
  const { data, error } = await db
    .from('measurements')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`getMeasurementById: failed to fetch measurement ${id}: ${error.message}`);
  }
  return (data as MeasurementRow) ?? null;
};

/** Clone an existing measurement row, applying overrides. Drops server-managed
 *  columns (id, created_at, updated_at) and stamps a fresh measurement_date. */
export const cloneMeasurement = async (
  sourceId: string,
  overrides: Record<string, unknown>,
): Promise<{ id: string }> => {
  const source = await getMeasurementById(sourceId);
  if (!source) throw new Error(`cloneMeasurement: source measurement ${sourceId} not found`);
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = source as Record<string, unknown>;
  void _id; void _c; void _u;
  const row = {
    ...rest,
    ...overrides,
    measurement_date: new Date().toISOString(),
  };
  const { data, error } = await db
    .from('measurements')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(`cloneMeasurement: failed to insert cloned measurement: ${error.message}`);
  if (!data) throw new Error('cloneMeasurement: insert returned no row');
  return data as { id: string };
};

/** Insert a brand-new measurement row for a customer with the given fields. */
export const createMeasurement = async (
  customerId: string,
  fields: Record<string, unknown>,
): Promise<{ id: string }> => {
  const row = {
    ...fields,
    customer_id: customerId,
    measurement_date: new Date().toISOString(),
  };
  const { data, error } = await db
    .from('measurements')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(`createMeasurement: failed to insert measurement: ${error.message}`);
  if (!data) throw new Error('createMeasurement: insert returned no row');
  return data as { id: string };
};

/** Fetch the latest measurement on file for a customer. Used to prefill the
 *  Add Garment form when no original garment is being replaced. */
export const getLatestMeasurementForCustomer = async (
  customerId: string,
): Promise<MeasurementRow | null> => {
  const { data, error } = await db
    .from('measurements')
    .select('*')
    .eq('customer_id', customerId)
    .order('measurement_date', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw new Error(`getLatestMeasurementForCustomer: failed to fetch latest measurement for customer ${customerId}: ${error.message}`);
  return (data?.[0] as MeasurementRow | undefined) ?? null;
};
