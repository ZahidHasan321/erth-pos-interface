import {
  canAccess as canAccessShared,
  canEdit as canEditShared,
  getPermission as getPermissionShared,
  isAdmin,
  isManager,
  isTerminalUser,
  getTerminalPath,
  getTerminalPaths,
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
  getTerminalPaths,
  ROLE_LABELS,
  DEPARTMENT_LABELS,
  JOB_FUNCTION_LABELS,
};

// Workshop route permission matrix.
//
// Matrix key format (see @repo/database/auth for precedence rules):
//   admin                — super_admin or admin (any department, any job_function)
//   manager:workshop     — workshop managers
//   manager:shop         — shop managers (rare in workshop app)
//   staff:workshop       — office workshop staff (job_function = null)
//   staff:shop           — office shop staff (job_function = null)
//   terminal:<function>  — staff with that specific job_function
//   terminal             — any staff with a non-null job_function (fallback)
//
// Terminal users are locked to their own terminal page — every non-terminal
// page denies them. The "terminal" fallback is "none" for every non-terminal
// route so new pages auto-deny terminal users until explicitly granted.
//
// NOTE: manager:workshop currently has "full" on terminal pages for testing.
// Remove later when operations are stable (see task comment at end of file).
const PERMISSIONS: PermissionMatrix = {
  // Office pages (unchanged from prior advisory matrix)
  "/users":       { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "none", "staff:shop": "none" },
  "/team":        { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "own",  "staff:shop": "none" },
  "/performance": { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "own",  "staff:shop": "none" },
  "/qc-analytics": { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "view", "staff:shop": "none" },
  "/investigations": { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "view", "staff:shop": "none" },
  "/receiving":   { admin: "full", "manager:workshop": "full", "manager:shop": "none", "staff:workshop": "none", "staff:shop": "none" },
  "/parking":     { admin: "full", "manager:workshop": "full", "manager:shop": "none", "staff:workshop": "none", "staff:shop": "none" },
  "/scheduler":   { admin: "full", "manager:workshop": "full", "manager:shop": "none", "staff:workshop": "none", "staff:shop": "none" },
  "/board":       { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "view", "staff:shop": "none" },
  "/assigned":    { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "view", "staff:shop": "none" },
  "/dispatch":    { admin: "full", "manager:workshop": "full", "manager:shop": "none", "staff:workshop": "none", "staff:shop": "none" },
  "/pricing":     { admin: "full", "manager:workshop": "full", "manager:shop": "none", "staff:workshop": "none", "staff:shop": "none" },
  "/dashboard":   { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "view", "staff:shop": "none" },
  "/completed":   { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "view", "staff:shop": "none" },
  "/store":           { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "view", "staff:shop": "none" },
  "/store/transfers": { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "view", "staff:shop": "none" },
  "/store/stocktake": { admin: "full", "manager:workshop": "full", "manager:shop": "none", "staff:workshop": "full", "staff:shop": "none" },
  "/store/reports":   { admin: "full", "manager:workshop": "full", "manager:shop": "view", "staff:workshop": "view", "staff:shop": "none" },

  // Inventory type permissions — controls create/edit visibility within the inventory page.
  // Workshop manages accessories only; fabrics and shelf items are shop-owned (fabrics are
  // view-only here as transferred-in stock; shelf items aren't shown in the workshop at all).
  "inventory:fabrics":     { admin: "full", "manager:workshop": "view", "staff:workshop": "view" },
  "inventory:accessories": { admin: "full", "manager:workshop": "full", "staff:workshop": "full" },
  "inventory:shelf":       { admin: "full" },

  // Stock action permissions
  "inventory:restock":     { admin: "full", "manager:workshop": "full" },
  "inventory:adjust":      { admin: "full", "manager:workshop": "full" },
  // Waste is staff-allowed; over the cost threshold the RPC requires a manager.
  "inventory:waste":       { admin: "full", "manager:workshop": "full", "staff:workshop": "full" },
  "inventory:stocktake":   { admin: "full", "manager:workshop": "full", "staff:workshop": "full" },
  "inventory:delete":      { admin: "full" },
  "suppliers:manage":      { admin: "full", "manager:workshop": "full" },

  // Transfers — request anywhere; send (dispatch)/receive gated by side at render-time.
  // No approve step (CLAUDE.md §4): a requested transfer is sent directly.
  "transfers:request":     { admin: "full", "manager:workshop": "full", "staff:workshop": "full" },
  "transfers:dispatch":    { admin: "full", "manager:workshop": "full" },
  "transfers:receive":     { admin: "full", "manager:workshop": "full", "staff:workshop": "full" },
  "transfers:cancel":      { admin: "full", "manager:workshop": "full" },
  "/profile":     { admin: "full", "manager:workshop": "full", "manager:shop": "full", "staff:workshop": "full", "staff:shop": "full", terminal: "full" },
  "/notifications": { admin: "full", "manager:workshop": "full", "manager:shop": "full", "staff:workshop": "full", "staff:shop": "full", terminal: "full" },

  // Terminal pages. Matched by matrix key in this order:
  //   1. admin / manager:workshop           — full for testing, revoke later
  //   2. terminal:<own function>            — full (their assigned terminal)
  //   3. terminal                           — "none" fallback so a sewer can't open
  //                                           the cutting terminal
  //   4. office staff keys — explicitly "none"
  "/terminals/soaking":       { admin: "full", "manager:workshop": "full", "terminal:soaker":      "full", terminal: "none", "staff:workshop": "none" },
  "/terminals/cutting":       { admin: "full", "manager:workshop": "full", "terminal:cutter":      "full", terminal: "none", "staff:workshop": "none" },
  "/terminals/post-cutting":  { admin: "full", "manager:workshop": "full", "terminal:post_cutter": "full", terminal: "none", "staff:workshop": "none" },
  "/terminals/sewing":        { admin: "full", "manager:workshop": "full", "terminal:sewer":       "full", terminal: "none", "staff:workshop": "none" },
  "/terminals/finishing":     { admin: "full", "manager:workshop": "full", "terminal:finisher":    "full", terminal: "none", "staff:workshop": "none" },
  "/terminals/ironing":       { admin: "full", "manager:workshop": "full", "terminal:ironer":      "full", terminal: "none", "staff:workshop": "none" },
  "/terminals/quality-check": { admin: "full", "manager:workshop": "full", "terminal:qc":          "full", terminal: "none", "staff:workshop": "none" },

  // Garment detail page inside any terminal — reachable from every terminal
  // view, so any terminal role is allowed (their own terminal already gates
  // which garments they can see via data queries).
  "/terminals/garment":       { admin: "full", "manager:workshop": "full", terminal: "full", "staff:workshop": "none", "staff:shop": "none" },
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

// TODO(access): revoke manager:workshop blanket access to terminals once workers
// are trained and terminal-only logins are rolled out. Change their value from
// "full" to "view" or "none" per stage.
