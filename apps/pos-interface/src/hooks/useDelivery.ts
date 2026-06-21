import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getDeliveryOrders, deliverOrder, type DeliveryStatus } from "@/api/delivery";

export function useDeliveryOrders(status: DeliveryStatus) {
    return useQuery({
        queryKey: ["delivery-orders", status],
        queryFn: () => getDeliveryOrders(status),
        staleTime: 1000 * 30,
    });
}

export function useDeliverOrderMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: deliverOrder,
        onSuccess: (response) => {
            if (response.status === "error") {
                toast.error(`Could not deliver order: ${response.message}`);
                return;
            }
            toast.success("Order delivered");
            queryClient.invalidateQueries({ queryKey: ["delivery-orders"], refetchType: "active" });
            queryClient.invalidateQueries({ queryKey: ["showroom-orders"], refetchType: "active" });
            queryClient.invalidateQueries({ queryKey: ["order-history"], refetchType: "active" });
        },
        onError: (error) => toast.error(`Delivery error: ${error.message}`),
    });
}
