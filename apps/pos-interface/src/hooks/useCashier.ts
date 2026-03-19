import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    searchOrderForCashier,
    getPaymentTransactions,
    recordPaymentTransaction,
    collectGarments,
    updateOrderDiscount,
} from "@/api/cashier";

export function useCashierOrderSearch(query: string) {
    return useQuery({
        queryKey: ["cashier-order", query],
        queryFn: () => searchOrderForCashier(query),
        enabled: query.trim().length >= 1,
        staleTime: 1000 * 30,
    });
}

export function usePaymentTransactions(orderId: number | undefined) {
    return useQuery({
        queryKey: ["payment-transactions", orderId],
        queryFn: () => getPaymentTransactions(orderId!),
        enabled: !!orderId,
    });
}

export function usePaymentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: recordPaymentTransaction,
        onSuccess: (response, variables) => {
            if (response.status === "error") {
                toast.error(`Payment failed: ${response.message}`);
                return;
            }
            toast.success(
                variables.transactionType === "refund"
                    ? "Refund recorded successfully"
                    : "Payment recorded successfully"
            );
            queryClient.invalidateQueries({ queryKey: ["payment-transactions", variables.orderId] });
            queryClient.invalidateQueries({ queryKey: ["cashier-order"] });
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            queryClient.invalidateQueries({ queryKey: ["showroom-orders"] });
            queryClient.invalidateQueries({ queryKey: ["order-history"] });
        },
        onError: (error) => {
            toast.error(`Payment error: ${error.message}`);
        },
    });
}

export function useUpdateDiscountMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateOrderDiscount,
        onSuccess: (response) => {
            if (response.status === "error") {
                toast.error(`Discount update failed: ${response.message}`);
                return;
            }
            toast.success("Discount updated successfully");
            queryClient.invalidateQueries({ queryKey: ["cashier-order"] });
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            queryClient.invalidateQueries({ queryKey: ["showroom-orders"] });
            queryClient.invalidateQueries({ queryKey: ["order-history"] });
        },
        onError: (error) => {
            toast.error(`Discount error: ${error.message}`);
        },
    });
}

export function useCollectGarmentsMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: collectGarments,
        onSuccess: (response, variables) => {
            if (response.status === "error") {
                toast.error(`Collection failed: ${response.message}`);
                return;
            }
            const result = response.data as any;
            toast.success(`${result.updated_count} garment(s) collected successfully`);
            queryClient.invalidateQueries({ queryKey: ["cashier-order"] });
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            queryClient.invalidateQueries({ queryKey: ["showroom-orders"] });
            queryClient.invalidateQueries({ queryKey: ["payment-transactions", variables.orderId] });
        },
        onError: (error) => {
            toast.error(`Collection error: ${error.message}`);
        },
    });
}
