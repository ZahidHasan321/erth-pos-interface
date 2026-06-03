// No approve/reject in the flow (CLAUDE.md §4) — only these statuses are produced.
export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  dispatched: "Dispatched",
  received: "Received",
  partially_received: "Partially Received",
};

export const TRANSFER_STATUS_COLORS: Record<string, string> = {
  requested:          "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  dispatched:         "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  received:           "bg-[var(--status-ok-bg)]   text-[var(--status-ok)]",
  partially_received: "bg-[var(--status-warn-bg)] text-[var(--status-warn)]",
};

export const TRANSFER_DIRECTION_LABELS: Record<string, string> = {
  shop_to_workshop: "Shop \u2192 Workshop",
  workshop_to_shop: "Workshop \u2192 Shop",
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
