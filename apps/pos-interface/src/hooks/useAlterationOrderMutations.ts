import {
    createAlterationOrder,
    type CreateAlterationOrderInput,
} from "@/api/alteration-orders";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useAlterationOrderMutations() {
    const queryClient = useQueryClient();

    const createMutation = useMutation({
        mutationFn: async (input: CreateAlterationOrderInput) => {
            const res = await createAlterationOrder(input);
            if (res.status !== "success" || !res.data) {
                throw new Error(res.message ?? "Could not create alteration order");
            }
            return res.data;
        },
        onSuccess: (order, variables) => {
            queryClient.invalidateQueries({ queryKey: ["alteration-orders"], refetchType: "active" });
            queryClient.invalidateQueries({ queryKey: ["order-history"], refetchType: "active" });
            queryClient.invalidateQueries({ queryKey: ["dispatchOrders"], refetchType: "active" });
            if (variables.master_measurement_id) {
                queryClient.invalidateQueries({
                    queryKey: ["measurements", variables.customer_id],
                    refetchType: "active",
                });
            }
            if (variables.customer_id) {
                queryClient.invalidateQueries({
                    queryKey: ["customer-orders", variables.customer_id],
                    refetchType: "active",
                });
            }
            toast.success(`Alteration order #${(order as any).invoice_number ?? order.id} created`);
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : "Could not create alteration order";
            toast.error(message);
        },
    });

    return {
        createAlterationOrder: createMutation.mutateAsync,
        isCreating: createMutation.isPending,
    };
}
