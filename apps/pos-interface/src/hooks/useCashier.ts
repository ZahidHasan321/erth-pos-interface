import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    searchOrderForCashier,
    getPaymentTransactions,
    recordPaymentTransaction,
    updateOrderDiscount,
    toggleHomeDelivery,
    getRecentCashierOrders,
    searchCashierOrderList,
    getCashierSummary,
} from "@/api/cashier";

/**
 * Invalidate cashier-related + order queries.
 * refetchType: "active" = only refetch queries that are currently rendered.
 */
function invalidateCashierQueries(queryClient: QueryClient, orderId?: number) {
    if (orderId) {
        queryClient.invalidateQueries({ queryKey: ["payment-transactions", orderId], refetchType: "active" });
    }
    queryClient.invalidateQueries({ queryKey: ["cashier-order"], refetchType: "active" });
    queryClient.invalidateQueries({ queryKey: ["cashier-summary"], refetchType: "active" });
    queryClient.invalidateQueries({ queryKey: ["cashier-recent-orders"], refetchType: "active" });
    // Mark order lists as stale but only refetch if currently visible
    queryClient.invalidateQueries({ queryKey: ["orders"], refetchType: "active" });
    queryClient.invalidateQueries({ queryKey: ["showroom-orders"], refetchType: "active" });
    queryClient.invalidateQueries({ queryKey: ["order-history"], refetchType: "active" });
}

export function useCashierOrderSearch(query: string) {
    return useQuery({
        queryKey: ["cashier-order", query],
        queryFn: () => searchOrderForCashier(query),
        enabled: query.trim().length >= 1,
        staleTime: 1000 * 30,
    });
}

export function useRecentCashierOrders(filter: import("@/api/cashier").CashierFilter = "all") {
    return useQuery({
        queryKey: ["cashier-recent-orders", filter],
        queryFn: () => getRecentCashierOrders(filter),
        staleTime: 1000 * 60,
    });
}

export function useCashierSummary() {
    return useQuery({
        queryKey: ["cashier-summary"],
        queryFn: () => getCashierSummary(),
        staleTime: 1000 * 60,
    });
}

export function useCashierOrderListSearch(query: string) {
    return useQuery({
        queryKey: ["cashier-order-list-search", query],
        queryFn: () => searchCashierOrderList(query),
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
            invalidateCashierQueries(queryClient, variables.orderId);
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
            invalidateCashierQueries(queryClient);
        },
        onError: (error) => {
            toast.error(`Discount error: ${error.message}`);
        },
    });
}

export function useToggleHomeDeliveryMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: toggleHomeDelivery,
        onSuccess: (response) => {
            if (response.status === "error") {
                toast.error(`Failed to update delivery type: ${response.message}`);
                return;
            }
            invalidateCashierQueries(queryClient);
        },
        onError: (error) => {
            toast.error(`Delivery toggle error: ${error.message}`);
        },
    });
}
