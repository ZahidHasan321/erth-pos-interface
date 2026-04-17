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
// Scope today: POS is used by shop staff + managers + admins. Workshop terminal
// users (sewer, cutter, etc.) have no business here and are blocked at the
// route root (see $main/route.tsx — `isTerminalUser` redirect).
//
// Cashier page stays accessible to manager/admin for now (explicit decision —
// dedicated cashier role comes later).
const PERMISSIONS: PermissionMatrix = {
  // Office pages — full access for shop staff and managers.
  "/home":     { admin: "full", "manager:shop": "full", "staff:shop": "full", "manager:workshop": "view" },
  "/profile":  { admin: "full", "manager:shop": "full", "staff:shop": "full", "manager:workshop": "full", "staff:workshop": "full" },
  "/cashier":  { admin: "full", "manager:shop": "full", "staff:shop": "full" },
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
