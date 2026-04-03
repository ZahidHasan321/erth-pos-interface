export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  dispatched: "Dispatched",
  received: "Received",
  partially_received: "Partially Received",
};

export const TRANSFER_STATUS_COLORS: Record<string, string> = {
  requested: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  dispatched: "bg-amber-100 text-amber-700",
  received: "bg-green-100 text-green-700",
  partially_received: "bg-orange-100 text-orange-700",
};

export const ITEM_TYPE_LABELS: Record<string, string> = {
  fabric: "Fabrics",
  shelf: "Shelf Items",
  accessory: "Accessories",
};

export const ACCESSORY_CATEGORY_LABELS: Record<string, string> = {
  buttons: "Buttons",
  zippers: "Zippers",
  thread: "Thread",
  lining: "Lining",
  elastic: "Elastic",
  interlining: "Interlining",
  other: "Other",
};

export const UNIT_OF_MEASURE_LABELS: Record<string, string> = {
  pieces: "pcs",
  meters: "m",
  rolls: "rolls",
  kg: "kg",
};
