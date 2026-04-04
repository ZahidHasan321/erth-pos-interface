import { useQuery } from "@tanstack/react-query";
import { getDispatchedOrders } from "@/api/orders";

/**
 * Hook to fetch and manage orders with garments dispatched to shop.
 */
export function useDispatchedOrders() {
    return useQuery({
        queryKey: ["dispatched-orders"],
        queryFn: async () => {
            const res = await getDispatchedOrders();
            if (res.status === "error") {
                throw new Error(res.message || "Failed to fetch dispatched orders");
            }
            return res.data || [];
        },
        staleTime: 1000 * 60 * 2, // 2 minutes
    });
}
