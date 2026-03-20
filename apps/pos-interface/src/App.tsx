import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Import the generated route tree
import { router } from "./router";
import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "./context/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 min — data stays fresh, no refetch on mount/focus
      gcTime: 1000 * 60 * 5, // 5 min — keep mobile memory usage low
      refetchOnWindowFocus: false, // don't refetch when switching tabs
      retry: 1, // only 1 retry on failure instead of 3
    },
  },
});

function InnerApp() {
  const auth = useAuth()
  return (
    <RouterProvider router={router} context={{ auth }} />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <InnerApp />
      </QueryClientProvider>
    </AuthProvider>
  )
}
