import type { Role, Department } from "@repo/database";

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  department: Department | null;
}

type Permission = "full" | "view" | "own" | "none";

const PERMISSIONS: Record<string, Record<string, Permission>> = {
  "/users":       { admin: "full", "manager:workshop": "view",  "manager:shop": "view",  "staff:workshop": "none", "staff:shop": "none" },
  "/team":        { admin: "full", "manager:workshop": "full",  "manager:shop": "view",  "staff:workshop": "own",  "staff:shop": "none" },
  "/performance": { admin: "full", "manager:workshop": "full",  "manager:shop": "view",  "staff:workshop": "own",  "staff:shop": "none" },
  "/receiving":   { admin: "full", "manager:workshop": "full",  "manager:shop": "none",  "staff:workshop": "none", "staff:shop": "none" },
  "/parking":     { admin: "full", "manager:workshop": "full",  "manager:shop": "none",  "staff:workshop": "none", "staff:shop": "none" },
  "/scheduler":   { admin: "full", "manager:workshop": "full",  "manager:shop": "none",  "staff:workshop": "none", "staff:shop": "none" },
  "/assigned":    { admin: "full", "manager:workshop": "full",  "manager:shop": "view",  "staff:workshop": "view", "staff:shop": "none" },
  "/dispatch":    { admin: "full", "manager:workshop": "full",  "manager:shop": "none",  "staff:workshop": "none", "staff:shop": "none" },
  "/pricing":     { admin: "full", "manager:workshop": "full",  "manager:shop": "none",  "staff:workshop": "none", "staff:shop": "none" },
  "/dashboard":   { admin: "full", "manager:workshop": "full",  "manager:shop": "view",  "staff:workshop": "view", "staff:shop": "none" },
  "/completed":   { admin: "full", "manager:workshop": "full",  "manager:shop": "view",  "staff:workshop": "view", "staff:shop": "none" },
};

function getUserKey(user: AuthUser): string {
  if (user.role === "super_admin" || user.role === "admin") return "admin";
  return `${user.role}:${user.department}`;
}

export function getPermission(user: AuthUser | null, page: string): Permission {
  if (!user) return "none";
  const pagePerms = PERMISSIONS[page];
  if (!pagePerms) return user.role === "super_admin" || user.role === "admin" ? "full" : "view";
  return pagePerms[getUserKey(user)] ?? "none";
}

export function canAccess(user: AuthUser | null, page: string): boolean {
  return getPermission(user, page) !== "none";
}

export function canEdit(user: AuthUser | null, page: string): boolean {
  const p = getPermission(user, page);
  return p === "full" || p === "own";
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "super_admin" || user?.role === "admin";
}

export function isManager(user: AuthUser | null): boolean {
  return user?.role === "super_admin" || user?.role === "admin" || user?.role === "manager";
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
