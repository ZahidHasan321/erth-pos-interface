import type { AuthUser } from "./auth";
import type { Role } from "./schema";

// Capability engine — the reusable core for role restrictions.
//
// A "capability" is a single named thing a user may do (advance a production
// stage, edit inventory, reschedule…). Each app declares its own catalog of
// capability strings and a per-role grant table, then builds a checker with
// `makeCapabilityChecker`. Gating a button becomes one line via the app's
// `useCan(cap)` hook / `<Can cap>` guard.
//
// Roles are a fixed set (schema `roleEnum`). We are NOT building runtime custom
// roles — but adding a NEW restriction is trivial: add a capability to the
// catalog, list it in the grants of the roles that should be denied it, and
// wrap the button with `useCan`.

// How a role is granted capabilities:
//   "*"              → every capability (full access)
//   { except: [...] }→ every capability EXCEPT the listed ones (role minus a few)
//   [ ...caps ]      → only the listed capabilities
export type RoleGrant<Cap extends string> =
  | "*"
  | { except: readonly Cap[] }
  | readonly Cap[];

export type GrantTable<Cap extends string> = Record<Role, RoleGrant<Cap>>;

// Build a `hasCapability(user, cap)` checker bound to one app's grant table.
// Inactive or missing users are denied everything.
export function makeCapabilityChecker<Cap extends string>(
  grants: GrantTable<Cap>,
) {
  return function hasCapability(user: AuthUser | null, cap: Cap): boolean {
    if (!user || !user.is_active) return false;
    const grant = grants[user.role];
    if (!grant) return false;
    if (grant === "*") return true;
    if (Array.isArray(grant)) return grant.includes(cap);
    // { except: [...] }
    return !(grant as { except: readonly Cap[] }).except.includes(cap);
  };
}
