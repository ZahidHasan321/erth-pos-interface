// Stable identifiers for the committed reference data. The container is fresh
// per run, so serial sequences deterministically start at 1; user UUIDs are
// pinned. seed.ts inserts exactly these; driver.ts / tests reference them.

export const ORDER_TAKER = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "ordertaker",
  name: "Order Taker",
};

export const CASHIER = {
  id: "00000000-0000-0000-0000-000000000002",
  username: "cashier",
  name: "Cashier",
};

export const MANAGER = {
  id: "00000000-0000-0000-0000-000000000003",
  username: "manager",
  name: "Manager",
};

export const BRAND = "ERTH";

// Deterministic serial ids on a fresh DB.
export const CUSTOMER_ID = 1;
export const FABRIC_A_ID = 1; // ample stock
export const FABRIC_B_ID = 2; // ample stock
export const STYLE_ID = 1;
export const SHELF_A_ID = 1;
export const SHELF_B_ID = 2;
export const CAMPAIGN_ID = 1;
