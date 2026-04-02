import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "./context/auth";
import { router } from "./router";

const queryClient = new QueryClient();

function InnerApp() {
  const auth = useAuth();

  // Don't render router until session restore completes
  if (auth.isLoading) return null;

  return <RouterProvider router={router} context={{ auth }} />;
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <InnerApp />
      </QueryClientProvider>
    </AuthProvider>
  );
}
