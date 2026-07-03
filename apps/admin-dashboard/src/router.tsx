import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { AuthContext } from "./context/auth";

interface RouterContext {
  auth: AuthContext;
}

export const router = createRouter({
  routeTree,
  context: {
    auth: undefined!,
  } as RouterContext,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
