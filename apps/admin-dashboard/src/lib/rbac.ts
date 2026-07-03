import {
  canAccess as canAccessShared,
  getPermission as getPermissionShared,
  isAdmin,
  ROLE_LABELS,
  DEPARTMENT_LABELS,
  type AuthUser,
  type Permission,
  type PermissionMatrix,
} from "@repo/database";

export type { AuthUser, Permission };
export { isAdmin, ROLE_LABELS, DEPARTMENT_LABELS };

// Admin Dashboard route permission matrix.
//
// This app is a cross-brand, read-only oversight tool restricted to owners. The
// only matrix key that grants access is `admin` — which the shared auth engine
// (packages/database/src/auth.ts `getUserKeys`) emits for both `super_admin`
// and `admin` (the rank override). Every other role resolves to no key here and
// is denied. Brand isolation does not apply: admins see all brands, and the
// server-side RPCs re-assert `is_admin()` (SECURITY DEFINER) so a non-super
// admin can still read cross-brand.
const PERMISSIONS: PermissionMatrix = {
  "/":         { admin: "full" },
  "/orders":   { admin: "full" },
  "/garments": { admin: "full" },
};

export const PERMISSIONS_EXPORT = PERMISSIONS;

export function canAccess(user: AuthUser | null, page: string): boolean {
  return canAccessShared(user, page, PERMISSIONS);
}

export function getPermission(user: AuthUser | null, page: string): Permission {
  return getPermissionShared(user, page, PERMISSIONS);
}
