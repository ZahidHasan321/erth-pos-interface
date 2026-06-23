import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStockPurchases, payStockPurchase, type StockPurchaseFilter } from "@/api/purchases";

export function useStockPurchases(filter: StockPurchaseFilter = "open") {
    return useQuery({
        queryKey: ["stock-purchases", filter],
        queryFn: () => getStockPurchases(filter),
        staleTime: 1000 * 30,
    });
}

export function usePayStockPurchaseMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: payStockPurchase,
        onSuccess: (response) => {
            if (response.status === "error") {
                toast.error(`Payment failed: ${response.message}`);
                return;
            }
            // A cash settlement changes the drawer balance → refresh the register too.
            queryClient.invalidateQueries({ queryKey: ["stock-purchases"] });
            queryClient.invalidateQueries({ queryKey: ["register-session"] });
        },
        onError: (error: Error) => toast.error(`Payment failed: ${error.message}`),
    });
}
