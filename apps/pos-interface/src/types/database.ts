import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  users, customers, orders, garments, measurements,
  fabrics, styles, campaigns, shelves, prices,
} from '@repo/database';

// Database row types (what you SELECT)
export type User = InferSelectModel<typeof users>;
export type Customer = InferSelectModel<typeof customers>;
export type Order = InferSelectModel<typeof orders>;
export type Garment = InferSelectModel<typeof garments>;
export type Measurement = InferSelectModel<typeof measurements>;
export type Fabric = InferSelectModel<typeof fabrics>;
export type Style = InferSelectModel<typeof styles>;
export type Campaign = InferSelectModel<typeof campaigns>;
export type Shelf = InferSelectModel<typeof shelves>;
export type Price = InferSelectModel<typeof prices>;

// Insert types (what you INSERT)
export type NewCustomer = InferInsertModel<typeof customers>;
export type NewOrder = InferInsertModel<typeof orders>;
export type NewGarment = InferInsertModel<typeof garments>;
export type NewMeasurement = InferInsertModel<typeof measurements>;

// Enum types
export type CheckoutStatus = 'draft' | 'confirmed' | 'cancelled';
export type OrderType = 'WORK' | 'SALES';
export type PaymentType = 'knet' | 'cash' | 'link_payment' | 'installments' | 'others';
export type DiscountType = 'flat' | 'referral' | 'loyalty' | 'by_value';
export type FabricSource = 'IN' | 'OUT';
export type ProductionStage =
  | 'order_at_shop' | 'sent_to_workshop' | 'order_at_workshop'
  | 'brova_and_final_dispatched_to_shop' | 'final_dispatched_to_shop'
  | 'brova_at_shop' | 'brova_accepted' | 'brova_alteration'
  | 'brova_repair_and_production' | 'brova_alteration_and_production'
  | 'final_at_shop' | 'brova_and_final_at_shop'
  | 'order_collected' | 'order_delivered';
