import { createRouter } from "@tanstack/react-router";
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools'


import { routeTree } from './routeTree.gen';
import { FullScreenLoader } from "@/components/global/full-screen-loader";

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // Show the loader almost immediately while a route's loader runs, instead of
  // the old page sitting frozen for up to a second (TanStack's default
  // pendingMs is 1000ms). This gives instant click feedback and prevents the
  // double-click-because-nothing-happened problem. pendingMs is small but
  // non-zero so genuinely instant (cached/preloaded) navigations don't flash.
  defaultPendingComponent: FullScreenLoader,
  defaultPendingMs: 100,
  defaultPendingMinMs: 400,
  scrollRestoration: true,
  context: {
    auth: undefined!,
    queryClient: undefined!,
  },
})


