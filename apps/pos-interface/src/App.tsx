import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Import the generated route tree
import { router } from "./router";
import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "./context/auth";

const queryClient = new QueryClient();

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
