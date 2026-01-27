import type { Order, Customer, Garment } from "@repo/database";

/**
 * Order row for orders at showroom table.
 * Each row represents an order with expandable garments.
 */
export type OrderRow = {
  // Order info
  orderId: string;
  orderRecordId: string;
  fatoura?: number;
  fatouraStage: string;
  orderStatus: "Pending" | "Completed" | "Cancelled";
  orderDate?: string | null;
  deliveryDate?: string | null;

  // Customer info
  customerId: string;
  customerName: string;
  customerNickName?: string;
  mobileNumber: string;

  // Order type and delivery
  orderType?: "WORK" | "SALES" | null;
  homeDelivery?: boolean | null;

  // Financial info
  totalAmount: number;
  advance?: number;
  balance?: number;

  // Garments count
  garmentsCount: number;

  // Expandable garments
  garments: GarmentRowData[];

  // Full records for reference
  order: Order;
  customer: Customer | null;
};

/**
 * Individual garment data within an order row.
 */
export type GarmentRowData = {
  garmentId: string | null;
  garmentRecordId: string;
  pieceStage: string;
  isBrova: boolean;
  deliveryDate: string | null;
  delayInDays: number;
  fabricSource?: string | null;
  style?: string | null;
  garment: Garment;
};

/**
 * Flattened Garment Row for the table
 */
export type GarmentRow = {
  garmentId: string;
  orderId: string;
  customerName: string;
  customerNickName?: string;
  mobileNumber: string;
  orderType: string;
  pieceStage: string;
  fatouraStage: string;
  promisedDeliveryDate?: string;
  delayInDays: number;
};