import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { Garment, Order } from "@repo/database";
import { getEmployees } from "@/api/employees";
import { getFabrics } from "@/api/fabrics";
import { getMeasurementById, getMeasurementsByCustomerId } from "@/api/measurements";
import { mapGarmentToFormValues } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.mapper";
import { mapToCard2Data } from "./mapToCard2Data";
import { printCard2 } from "./printCard2";

/**
 * Builds the card2 (production card) data from a fully-loaded order and exposes a
 * `printCard` action. Shared by the order view and the cashier so the card is
 * assembled identically everywhere.
 *
 * The payment method is taken from the order's actual `payment_transactions` (the
 * real recorded methods). orders.payment_type is forced to "cash" for ERTH at
 * confirmation and must not be used as the source.
 */
export function useCard2Print(order: Order | null | undefined) {
  const { data: fabricsResponse } = useQuery({
    queryKey: ["fabrics"],
    queryFn: () => getFabrics(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const { data: employeesResponse } = useQuery({
    queryKey: ["employees"],
    queryFn: getEmployees,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const garments = React.useMemo(
    () => (order?.garments ?? []).map((g: Garment) => mapGarmentToFormValues(g)),
    [order?.garments],
  );

  const measurementId = React.useMemo(
    () => garments.find((g) => g.measurement_id)?.measurement_id ?? null,
    [garments],
  );

  const { data: measurementResponse } = useQuery({
    queryKey: ["measurement", measurementId],
    queryFn: () => getMeasurementById(measurementId as string),
    enabled: !!measurementId,
    staleTime: Infinity,
  });

  const customerId = order?.customer?.id;
  const { data: measurementsListResponse } = useQuery({
    queryKey: ["measurements", customerId],
    queryFn: () => getMeasurementsByCustomerId(Number(customerId)),
    enabled: !!customerId,
    staleTime: Infinity,
  });

  const measurementDisplayById = React.useMemo(() => {
    const list = measurementsListResponse?.data ?? [];
    const map: Record<string, string> = {};
    for (const m of list) {
      if (m.id && m.measurement_id) map[m.id] = m.measurement_id;
    }
    return map;
  }, [measurementsListResponse]);

  const card2Data = React.useMemo(() => {
    if (!order) return null;
    const employees = employeesResponse?.data ?? [];
    const orderTaker = employees.find((e) => e.id === order.order_taker_id);
    return mapToCard2Data({
      invoiceNumber: order.invoice_number ?? order.id,
      customer: {
        name: order.customer?.name ?? "",
        phone: order.customer?.phone ?? "",
      },
      orderDate: order.order_date ? String(order.order_date) : null,
      deliveryDate: order.delivery_date ? String(order.delivery_date) : null,
      garments,
      fabrics: fabricsResponse ?? [],
      measurement: measurementResponse?.data ?? null,
      measurementDisplayById,
      charges: {
        fabric: Number(order.fabric_charge ?? 0),
        stitching: Number(order.stitching_charge ?? 0),
        style: Number(order.style_charge ?? 0),
        delivery: Number(order.delivery_charge ?? 0),
        shelf: Number(order.shelf_charge ?? 0),
      },
      orderTotal: Number(order.order_total ?? 0),
      paid: Number(order.paid ?? 0),
      // Real recorded methods (not the forced orders.payment_type).
      paymentMethods: (order.payment_transactions ?? [])
        .filter((t) => t.transaction_type === "payment")
        .map((t) => t.payment_type),
      specialRequest: null,
      orderTakerName: orderTaker?.name ?? null,
      customerSignature: order.customer_signature_url ?? null,
    });
  }, [
    order,
    employeesResponse,
    garments,
    fabricsResponse,
    measurementResponse,
    measurementDisplayById,
  ]);

  const printCard = React.useCallback(() => {
    if (!card2Data) return;
    void printCard2(
      { data: card2Data },
      { documentTitle: `Card2-Order-${order?.id ?? "order"}` },
    );
  }, [card2Data, order?.id]);

  return { printCard, canPrint: !!card2Data };
}
