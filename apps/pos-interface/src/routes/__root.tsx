// src/routes/__root.tsx
import { ScrollToTopButton } from "@/components/animation/scrollToTop";
import { ErrorBoundary } from "@/components/global/error-boundary";
import { NotFoundPage } from "@/components/not-found-page";
import type { AuthContext } from "@/context/auth";
import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";

interface MyRouterContext {
  auth: AuthContext;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  return (
    <>
      <HeadContent />
      <ErrorBoundary>
          <Outlet />
          <Toaster position="bottom-right" richColors closeButton expand/>
      <ScrollToTopButton />
      </ErrorBoundary>
    </>
  );
}
