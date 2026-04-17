import type { Role, Department, JobFunction } from "./schema";

// Shared authentication/authorisation primitives for both apps.
//
// Hierarchy:
//   - role: rank (super_admin > admin > manager > staff)
//   - department: workshop | shop
//   - job_function: terminal specialisation for workshop staff (nullable)
//
// Null job_function = office user; access decided by role + department.
// Non-null job_function = terminal-locked user; sees only their own terminal page.
//
// Per-app code supplies its own PERMISSIONS matrix keyed on page paths.
// Shared helpers (canAccess / isAdmin / isTerminalUser / getTerminalPath)
// operate on that matrix plus the AuthUser.

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  department: Department | null;
  job_function: JobFunction | null;
  brands: string[] | null;
  is_active: boolean;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
}

export type Permission = "full" | "view" | "own" | "none";

// Matrix key format:
//   "admin"                        → super_admin or admin (rank override)
//   "manager:workshop"             → manager + department
//   "staff:workshop"               → staff + department (office staff, no job_function)
//   "terminal:sewer"               → any staff with job_function = sewer
//   "terminal"                     → any staff with a non-null job_function (wildcard)
export type PermissionMatrix = Record<string, Record<string, Permission>>;

function getUserKeys(user: AuthUser): string[] {
  const keys: string[] = [];

  // Rank override — admin/super_admin bypass department/job distinctions.
  if (user.role === "super_admin" || user.role === "admin") {
    keys.push("admin");
    return keys;
  }

  // Terminal-locked staff — add terminal-specific key first (most specific wins).
  if (user.role === "staff" && user.job_function) {
    keys.push(`terminal:${user.job_function}`);
    keys.push("terminal");
    return keys;
  }

  // Office user (staff or manager without job_function).
  if (user.department) {
    keys.push(`${user.role}:${user.department}`);
  }
  keys.push(user.role);
  return keys;
}

export function getPermission(
  user: AuthUser | null,
  page: string,
  matrix: PermissionMatrix,
): Permission {
  if (!user) return "none";
  if (!user.is_active) return "none";

  const pagePerms = matrix[page];
  if (!pagePerms) {
    // Unknown page: admins get full, everyone else denied. Forces explicit matrix
    // entries — no accidental access via missing config.
    return user.role === "super_admin" || user.role === "admin" ? "full" : "none";
  }

  const keys = getUserKeys(user);
  for (const key of keys) {
    const perm = pagePerms[key];
    if (perm) return perm;
  }
  return "none";
}

export function canAccess(
  user: AuthUser | null,
  page: string,
  matrix: PermissionMatrix,
): boolean {
  return getPermission(user, page, matrix) !== "none";
}

export function canEdit(
  user: AuthUser | null,
  page: string,
  matrix: PermissionMatrix,
): boolean {
  const p = getPermission(user, page, matrix);
  return p === "full" || p === "own";
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "super_admin" || user?.role === "admin";
}

export function isManager(user: AuthUser | null): boolean {
  return (
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "manager"
  );
}

export function isTerminalUser(user: AuthUser | null): boolean {
  return !!user && user.role === "staff" && !!user.job_function;
}

// Map job_function → terminal route path. URL slugs use hyphens;
// enum values use underscores.
const TERMINAL_PATHS: Record<JobFunction, string> = {
  soaker: "/terminals/soaking",
  cutter: "/terminals/cutting",
  post_cutter: "/terminals/post-cutting",
  sewer: "/terminals/sewing",
  finisher: "/terminals/finishing",
  ironer: "/terminals/ironing",
  qc: "/terminals/quality-check",
};

export function getTerminalPath(user: AuthUser | null): string | null {
  if (!user?.job_function) return null;
  return TERMINAL_PATHS[user.job_function] ?? null;
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  workshop: "Workshop",
  shop: "Shop",
};

export const JOB_FUNCTION_LABELS: Record<JobFunction, string> = {
  soaker: "Soaker",
  cutter: "Cutter",
  post_cutter: "Post-Cutter",
  sewer: "Sewer",
  finisher: "Finisher",
  ironer: "Ironer",
  qc: "Quality Check",
};
