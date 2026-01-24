/**
 * Fatoura (Order) Stages
 * Represents the workflow stages for an entire order.
 */
export const FatouraStage = {
  OrderAtShop: "Order At Shop",
  SentToWorkshop: "Sent To Workshop",
  OrderAtWorkshop: "Order At Workshop",
  BrovaAndFinalDispatchedToShop: "Brova And Final Dispatched To Shop",
  FinalDispatchedToShop: "Final Dispatched To Shop",
  BrovaAtShop: "Brova At Shop",
  BrovaAccepted: "Brova Accepted",
  BrovaAlteration: "Brova Alteration",
  BrovaRepairAndProduction: "Brova Repair And Production",
  BrovaAlterationAndProduction: "Brova Alteration And Production",
  FinalAtShop: "Final At Shop",
  BrovaAndFinalAtShop: "Brova And Final At Shop",
  OrderCollected: "Order Collected",
  OrderDelivered: "Order Delivered",
} as const;

export type FatouraStage = (typeof FatouraStage)[keyof typeof FatouraStage];

/**
 * Piece (Garment) Stages
 * Represents the production workflow stages for individual garment pieces.
 */
export const PieceStage = {
  GarmentAtShop: "Garment At Shop",
  GarmentAtWorkshop: "Garment At Workshop",
  Soaking: "Soaking",
  WaitingCut: "Waiting Cut",
  BrovaDispatchedToShop: "Brova Dispatched To Shop",
  BrovaAtShop: "Brova At Shop",
  BrovaCollected: "Brova Collected",
  ConfirmedBrovaAtShop: "Confirmed Brova At Shop",
  Redo: "Redo",
  FabricDelivered: "Fabric Delivered",
  FabricCollected: "Fabric Collected",
  BrovaRepair: "Brova Repair",
} as const;

export type PieceStage = (typeof PieceStage)[keyof typeof PieceStage];

/**
 * Mapping from Fatoura stage codes to enum values
 * Replace these keys (e.g., "F01") with your actual database IDs/Codes
 */
export const FatouraStageCodeMap: Record<string, FatouraStage> = {
  "F01": FatouraStage.OrderAtShop,
  "F02": FatouraStage.SentToWorkshop,
  "F03": FatouraStage.OrderAtWorkshop,
  "F04": FatouraStage.BrovaAndFinalDispatchedToShop,
  "F05": FatouraStage.FinalDispatchedToShop,
  "F06": FatouraStage.BrovaAtShop,
  "F07": FatouraStage.BrovaAccepted,
  "F08": FatouraStage.BrovaAlteration,
  "F09": FatouraStage.BrovaRepairAndProduction,
  "F10": FatouraStage.BrovaAlterationAndProduction,
  "F11": FatouraStage.FinalAtShop,
  "F12": FatouraStage.BrovaAndFinalAtShop,
  "F13": FatouraStage.OrderCollected,
  "F14": FatouraStage.OrderDelivered,
};

/**
 * Mapping from Piece stage codes to enum values
 */
export const PieceStageCodeMap: Record<string, PieceStage> = {
  "P00": PieceStage.GarmentAtShop,
  "P00A": PieceStage.GarmentAtWorkshop,
  "P01": PieceStage.Soaking,
  "P02": PieceStage.WaitingCut,
  "P03": PieceStage.BrovaDispatchedToShop,
  "P04": PieceStage.BrovaAtShop,
  "P05": PieceStage.BrovaCollected,
  "P06": PieceStage.ConfirmedBrovaAtShop,
  "P07": PieceStage.Redo,
  "P08": PieceStage.FabricDelivered,
  "P09": PieceStage.FabricCollected,
  "P10": PieceStage.BrovaRepair,
};

/**
 * Mapping from enum values back to codes
 */
export const FatouraStageToCode: Record<FatouraStage, string> = Object.fromEntries(
  Object.entries(FatouraStageCodeMap).map(([code, stage]) => [stage, code])
) as Record<FatouraStage, string>;

/**
 * Mapping from enum values back to codes
 */
export const PieceStageToCode: Record<PieceStage, string> = Object.fromEntries(
  Object.entries(PieceStageCodeMap).map(([code, stage]) => [stage, code])
) as Record<PieceStage, string>;

/**
 * Human-readable labels for Fatoura stages
 */
export const FatouraStageLabels: Record<FatouraStage, string> = {
  [FatouraStage.OrderAtShop]: "Order At Shop",
  [FatouraStage.SentToWorkshop]: "Sent To Workshop",
  [FatouraStage.OrderAtWorkshop]: "Order At Workshop",
  [FatouraStage.BrovaAndFinalDispatchedToShop]: "Brova & Final Dispatched to Shop",
  [FatouraStage.FinalDispatchedToShop]: "Final Dispatched to Shop",
  [FatouraStage.BrovaAtShop]: "Brova At Shop",
  [FatouraStage.BrovaAccepted]: "Brova Accepted",
  [FatouraStage.BrovaAlteration]: "Brova Alteration",
  [FatouraStage.BrovaRepairAndProduction]: "Brova Repair & Production",
  [FatouraStage.BrovaAlterationAndProduction]: "Brova Alteration & Production",
  [FatouraStage.FinalAtShop]: "Final At Shop",
  [FatouraStage.BrovaAndFinalAtShop]: "Brova & Final At Shop",
  [FatouraStage.OrderCollected]: "Order Collected",
  [FatouraStage.OrderDelivered]: "Order Delivered",
};

/**
 * Human-readable labels for Piece stages
 */
export const PieceStageLabels: Record<PieceStage, string> = {
  [PieceStage.GarmentAtShop]: "Garment At Shop",
  [PieceStage.GarmentAtWorkshop]: "Garment At Workshop",
  [PieceStage.Soaking]: "Soaking",
  [PieceStage.WaitingCut]: "Waiting Cut",
  [PieceStage.BrovaDispatchedToShop]: "Brova Dispatched to Shop",
  [PieceStage.BrovaAtShop]: "Brova At Shop",
  [PieceStage.BrovaCollected]: "Brova Collected",
  [PieceStage.ConfirmedBrovaAtShop]: "Confirmed Brova At Shop",
  [PieceStage.Redo]: "Redo",
  [PieceStage.FabricDelivered]: "Fabric Delivered",
  [PieceStage.FabricCollected]: "Fabric Collected",
  [PieceStage.BrovaRepair]: "Brova Repair",
};

// New Supabase stages (snake_case)
export const CheckoutStatus = {
  draft: 'draft',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
} as const;

export const ProductionStage = {
  order_at_shop: 'order_at_shop',
  sent_to_workshop: 'sent_to_workshop',
  order_at_workshop: 'order_at_workshop',
  brova_and_final_dispatched_to_shop: 'brova_and_final_dispatched_to_shop',
  final_dispatched_to_shop: 'final_dispatched_to_shop',
  brova_at_shop: 'brova_at_shop',
  brova_accepted: 'brova_accepted',
  brova_alteration: 'brova_alteration',
  brova_repair_and_production: 'brova_repair_and_production',
  brova_alteration_and_production: 'brova_alteration_and_production',
  final_at_shop: 'final_at_shop',
  brova_and_final_at_shop: 'brova_and_final_at_shop',
  order_collected: 'order_collected',
  order_delivered: 'order_delivered',
} as const;

// Conversion helpers (for migration period)
export const airtableToSupabaseStatus = {
  'Pending': 'draft',
  'Completed': 'confirmed',
  'Cancelled': 'cancelled',
} as const;
