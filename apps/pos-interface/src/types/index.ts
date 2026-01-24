// New Supabase types (snake_case)
export * from './database';

// Keep old types for files not yet migrated (outside scope)
// These will be removed later when full migration is done
export type { Order as AirtableOrder } from './order';
export type { Customer as AirtableCustomer } from './customer';
export type { Garment as AirtableGarment } from './garment';
export type { Measurement as AirtableMeasurement } from './measurement';
