import {
  canAccess as canAccessShared,
  canEdit as canEditShared,
  getPermission as getPermissionShared,
  isAdmin,
  isManager,
  isTerminalUser,
  getTerminalPath,
  ROLE_LABELS,
  DEPARTMENT_LABELS,
  JOB_FUNCTION_LABELS,
  type AuthUser,
  type Permission,
  type PermissionMatrix,
} from "@repo/database";

export type { AuthUser, Permission };
export {
  isAdmin,
  isManager,
  isTerminalUser,
  getTerminalPath,
  ROLE_LABELS,
  DEPARTMENT_LABELS,
  JOB_FUNCTION_LABELS,
};

// POS permission matrix.
//
// Scope today: POS is used by shop managers + cashiers + measurement takers +
// admins (§5 shop roles). `cashier:shop` carries every shop-staff grant; the
// `staff:shop` keys stay only for legacy shop-staff users.
// Workshop terminal users (sewer, cutter, etc.) have no business here and are
// blocked at the route root (see $main/route.tsx — `isTerminalUser` redirect).
//
// Cashiering is done by cashiers/managers inside the $main shop shell (the
// `/cashier` surface = Pending / All Orders / Purchases; Order History and
// End of Day are sidebar pages). The standalone cashier terminal was removed.
const PERMISSIONS: PermissionMatrix = {
  // Office pages — full access for cashiers (= shop staff) and managers.
  // Measurement takers (§5) are order-takers: full access to orders/customers/
  // appointments, but no Store Management or Cashier (granted below = omitted here).
  "/home":            { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full", "measurement_taker:shop": "full", "manager:workshop": "view" },
  "/profile":         { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full", "measurement_taker:shop": "full", "manager:workshop": "full", "staff:workshop": "full" },
  "/cashier":         { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full" },
  "/store/inventory": { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full" },
  "/store/transfers": { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full" },
  "/store/stocktake": { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full" },
  "/store/reports":   { admin: "full", "manager:shop": "full", "staff:shop": "view", "cashier:shop": "view" },

  // Inventory type permissions — controls create/edit visibility within the inventory page.
  // Shop owns fabrics + shelf items; accessories are workshop-owned (view-only here, held as
  // transferred-in stock the shop can restock/adjust but never create).
  "inventory:fabrics":     { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full", "manager:workshop": "view" },
  "inventory:accessories": { admin: "full", "manager:shop": "view", "staff:shop": "view", "cashier:shop": "view" },
  "inventory:shelf":       { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full" },

  // Stock action permissions (apply to whichever item type the user can edit)
  "inventory:restock":     { admin: "full", "manager:shop": "full" },
  "inventory:adjust":      { admin: "full", "manager:shop": "full" },
  // Waste is staff-allowed; over the cost threshold the RPC requires a manager.
  "inventory:waste":       { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full" },
  "inventory:stocktake":   { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full" },
  "inventory:delete":      { admin: "full", "manager:shop": "full" },
  "suppliers:manage":      { admin: "full", "manager:shop": "full" },

  // Transfers — request anywhere; send (dispatch)/receive gated by side at render-time.
  // No approve step (CLAUDE.md §4): a requested transfer is sent directly.
  "transfers:request":     { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full" },
  "transfers:dispatch":    { admin: "full", "manager:shop": "full" },
  "transfers:receive":     { admin: "full", "manager:shop": "full", "staff:shop": "full", "cashier:shop": "full" },
  "transfers:cancel":      { admin: "full", "manager:shop": "full" },
};

export function getPermission(user: AuthUser | null, page: string): Permission {
  return getPermissionShared(user, page, PERMISSIONS);
}

export function canAccess(user: AuthUser | null, page: string): boolean {
  return canAccessShared(user, page, PERMISSIONS);
}

export function canEdit(user: AuthUser | null, page: string): boolean {
  return canEditShared(user, page, PERMISSIONS);
}

export { PERMISSIONS };
