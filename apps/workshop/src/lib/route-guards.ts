import { redirect } from "@tanstack/react-router";
import { canAccess, isTerminalUser, getTerminalPath } from "./rbac";

// Factory for TanStack Router `beforeLoad` guards.
//
// Usage in a route:
//   export const Route = createFileRoute("/scheduler")({
//     beforeLoad: requireAccess("/scheduler"),
//     component: SchedulerPage,
//   });
//
// Behaviour:
//   1. No user / not authenticated → parent (main) route already handles this.
//      We skip early so the auth redirect fires from the right place.
//   2. canAccess returns true → pass through.
//   3. Terminal user hitting the wrong page → redirect to their own terminal.
//      Avoids showing them a 403 screen they can't escape without logout.
//   4. Office user denied → redirect to /access-denied with the attempted path
//      as context (shown on the error page).
export function requireAccess(page: string) {
  return ({
    context,
    location,
  }: {
    context: { auth: { user: unknown } };
    location: { pathname: string };
  }) => {
    // Narrow via shared rbac helpers — they tolerate null.
    const user = (context.auth as any).user ?? null;

    if (!user) {
      // Parent route handles unauth redirect; don't double-redirect.
      return;
    }

    if (canAccess(user, page)) return;

    // Terminal-locked user — send them home to their own terminal.
    if (isTerminalUser(user)) {
      const own = getTerminalPath(user);
      if (own && own !== location.pathname) {
        throw redirect({ to: own });
      }
    }

    throw redirect({
      to: "/access-denied",
      search: { attempted: location.pathname },
    });
  };
}
