import { useQuery } from "@tanstack/react-query";
import { getDispatchedOrders, getBrand } from "@/api/orders";

/**
 * Hook to fetch and manage orders with garments dispatched to shop.
 */
export function useDispatchedOrders() {
    return useQuery({
        queryKey: ["dispatched-orders", getBrand()],
        queryFn: async () => {
            const res = await getDispatchedOrders();
            if (res.status === "error") {
                throw new Error(`Could not fetch dispatched orders: ${res.message || "unknown error"}`);
            }
            return res.data || [];
        },
        // Realtime invalidates on garment/order changes, so navigations don't
        // need to refetch within staleTime.
        staleTime: 1000 * 60 * 5,
    });
}
