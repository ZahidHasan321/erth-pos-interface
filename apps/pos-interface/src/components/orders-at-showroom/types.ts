import type { Garment } from "@/types/garment";
import type { Order } from "@/types/order";
import type { Customer } from "@/types/customer";

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
  orderDate?: string;
  deliveryDate?: string;

  // Customer info
  customerId: string;
  customerName: string;
  customerNickName?: string;
  mobileNumber: string;

  // Order type and delivery
  orderType?: "WORK" | "SALES";
  homeDelivery?: boolean;

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
  garmentId: string;
  garmentRecordId: string;
  pieceStage: string;
  isBrova: boolean;
  deliveryDate: string;
  delayInDays: number;
  fabricSource?: string;
  style?: string;
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