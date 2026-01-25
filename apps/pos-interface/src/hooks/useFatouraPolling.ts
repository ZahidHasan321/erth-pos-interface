import { useQuery } from "@tanstack/react-query";
import { getOrderById } from "@/api/orders";
import { useEffect, useState, useRef } from "react";
import { showFatouraNotification, requestNotificationPermission } from "@/lib/notifications";

/**
 * Hook to poll for invoice number after order is completed
 * @param orderId - The order ID
 * @param isOrderCompleted - Whether the order checkout status is "confirmed"
 * @param enabled - Whether to enable polling
 * @returns Object with invoice number, loading state, and error
 */
export function useFatouraPolling(
  orderId: number | null | undefined,
  isOrderCompleted: boolean,
  enabled = true
) {
  const [fatoura, setFatoura] = useState<number | undefined>(undefined);
  const [isPolling, setIsPolling] = useState(false);
  const hasRequestedPermission = useRef(false);
  const hasShownNotification = useRef(false);

  const shouldPoll = Boolean(enabled && isOrderCompleted && orderId && !fatoura);

  useEffect(() => {
    if (shouldPoll && !hasRequestedPermission.current) {
      hasRequestedPermission.current = true;
      requestNotificationPermission().catch((error) => {
        console.error("Failed to request notification permission:", error);
      });
    }
  }, [shouldPoll]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["order", orderId, "fatoura"],
    queryFn: () => getOrderById(orderId!),
    enabled: shouldPoll,
    refetchInterval: shouldPoll ? 2000 : false,
    retry: 3,
  });

  useEffect(() => {
    const orderData = data as any;

    if (orderData?.data?.invoice_number) {
      const invoiceNumber = orderData.data.invoice_number;
      setFatoura(invoiceNumber);
      setIsPolling(false);

      if (!hasShownNotification.current) {
        hasShownNotification.current = true;
        showFatouraNotification(invoiceNumber);
      }
    } else if (shouldPoll) {
      setIsPolling(true);
    } else {
      setIsPolling(false);
    }
  }, [data, shouldPoll]);

  useEffect(() => {
    if (!isOrderCompleted) {
      setFatoura(undefined);
      setIsPolling(false);
      hasShownNotification.current = false;
      hasRequestedPermission.current = false;
    }
  }, [isOrderCompleted, orderId]);

  return {
    fatoura,
    isLoadingFatoura: isPolling || isLoading,
    fatouraError: error,
    hasFatoura: !!fatoura,
  };
}