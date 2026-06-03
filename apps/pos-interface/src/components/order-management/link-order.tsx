"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowUp,
  Check,
  CornerDownRight,
  Link as LinkIcon,
  X,
  Crown,
  Search,
  Loader2,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/dialog";
import { Checkbox } from "@repo/ui/checkbox";
import { Input } from "@repo/ui/input";
import { toast } from "sonner";

import {
  getOrdersForLinking,
  getOrderForLinking,
  updateOrder,
} from "@/api/orders";
import { fuzzySearchCustomers } from "@/api/customers";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import { cn, parseUtcTimestamp } from "@/lib/utils";
import { ErrorBoundary } from "../global/error-boundary";
import { LinkConfigurationPanel } from "./link-configuration-panel";

import type { Customer, Order } from "@repo/database";

type SelectedOrder = {
  id: number;
  invoiceNumber?: number | null;
  orderDate?: string | Date | null;
  deliveryDate?: string | Date | null;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  orderPhase?: string | null;
  isExistingPrimary?: boolean;
  isExistingChild?: boolean;
};

export default function LinkOrder() {
  const queryClient = useQueryClient();

  const [selectedOrders, setSelectedOrders] = useState<SelectedOrder[]>([]);
  const [primaryOrderId, setPrimaryOrderId] = useState<number | null>(null);

  // Dialog (customer → pick orders to add)
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogCustomer, setDialogCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [selectedDialogIds, setSelectedDialogIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCustomerOrders, setIsLoadingCustomerOrders] = useState(false);

  function validateOrder(order: Order): boolean {
    if (order.checkout_status !== "confirmed") {
      toast.warning("Only confirmed orders can be linked.");
      return false;
    }
    if (order.order_type !== "WORK") {
      toast.warning("Only work orders can be linked.");
      return false;
    }
    return true;
  }

  function mapOrderToSelected(order: Order): SelectedOrder {
    return {
      id: order.id,
      invoiceNumber: order.invoice_number,
      orderDate: order.order_date,
      deliveryDate: order.delivery_date,
      customerId: order.customer_id ?? undefined,
      customerName: order.customer?.name,
      customerPhone: order.customer?.phone ?? undefined,
      orderPhase: order.order_phase,
      isExistingPrimary: order.child_orders && order.child_orders.length > 0,
      isExistingChild: !!order.linked_order_id,
    };
  }

  async function addOrdersToSelection(ordersToProcess: Order[]) {
    const ordersMap = new Map<number, SelectedOrder>();
    const idsToFetch = new Set<number>();

    for (const order of ordersToProcess) {
      if (selectedOrders.some((o) => o.id === order.id)) continue;
      ordersMap.set(order.id, mapOrderToSelected(order));

      if (order.linked_order_id) idsToFetch.add(order.linked_order_id);
      if (order.child_orders) {
        order.child_orders.forEach((c) => idsToFetch.add(c.id));
      }
    }

    const finalFetchIds = Array.from(idsToFetch).filter(
      (id) => !ordersMap.has(id) && !selectedOrders.some((o) => o.id === id),
    );

    if (finalFetchIds.length > 0) {
      try {
        const results = await Promise.all(
          finalFetchIds.map((id) => getOrderForLinking(id)),
        );
        for (const res of results) {
          if (res.status === "success" && res.data) {
            ordersMap.set(res.data.id, mapOrderToSelected(res.data));
          }
        }
      } catch (err) {
        toast.error(
          `addOrdersToSelection: could not sync linked-group members: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const newItems = Array.from(ordersMap.values());
    if (newItems.length === 0) return;

    setSelectedOrders((prev) => {
      const existingIds = new Set(prev.map((o) => o.id));
      return [...prev, ...newItems.filter((item) => !existingIds.has(item.id))];
    });

    if (!primaryOrderId) {
      const existingPrimary = newItems.find((o) => o.isExistingPrimary);
      setPrimaryOrderId(existingPrimary?.id ?? newItems[0].id);
    }
  }

  async function handleOrderLookup(idOrInvoice: number) {
    try {
      const res = await getOrderForLinking(idOrInvoice);
      if (res.status === "error" || !res.data) {
        toast.error(`No confirmed work order found for #${idOrInvoice}`);
        return;
      }
      if (validateOrder(res.data)) {
        await addOrdersToSelection([res.data]);
      }
    } catch (err) {
      toast.error(
        `lookupOrder: could not fetch #${idOrInvoice}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async function handleCustomerPick(customer: Customer) {
    setIsLoadingCustomerOrders(true);
    try {
      const res = await getOrdersForLinking(customer.id);
      const orders = res.data ?? [];
      if (orders.length === 0) {
        toast.info(`${customer.name} has no confirmed orders to link.`);
        return;
      }
      setDialogCustomer(customer);
      setCustomerOrders(orders);
      setSelectedDialogIds([]);
      setIsDialogOpen(true);
    } catch (err) {
      toast.error(
        `fetchCustomerOrders: could not load orders for ${customer.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsLoadingCustomerOrders(false);
    }
  }

  function removeOrder(id: number) {
    setSelectedOrders((prev) => prev.filter((o) => o.id !== id));
    if (primaryOrderId === id) setPrimaryOrderId(null);
  }

  function toggleDialogSelection(id: number) {
    setSelectedDialogIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  function handleDialogConfirm() {
    const ordersToAdd = customerOrders.filter((o) => selectedDialogIds.includes(o.id));
    addOrdersToSelection(ordersToAdd);
    setIsDialogOpen(false);
  }

  async function handleLinkOrders(reviseDate: Date) {
    if (!primaryOrderId) {
      toast.error("Please select a primary order.");
      return;
    }
    if (selectedOrders.length < 2) {
      toast.error("Please select at least 2 orders to link.");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      await Promise.all(
        selectedOrders.map((order) => {
          const isPrimary = order.id === primaryOrderId;
          const updateData: Partial<Order> = { delivery_date: reviseDate };
          if (isPrimary) {
            updateData.linked_order_id = null;
            updateData.unlinked_date = null;
          } else {
            updateData.linked_order_id = primaryOrderId;
            updateData.linked_date = now;
            updateData.unlinked_date = null;
          }
          return updateOrder(updateData, order.id);
        }),
      );

      handleClear();
      queryClient.invalidateQueries({ queryKey: ["orders"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["order-history"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["showroom-orders"], refetchType: "active" });
    } catch (err) {
      toast.error(
        `linkOrders: could not link selected orders: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClear() {
    setSelectedOrders([]);
    setPrimaryOrderId(null);
    setCustomerOrders([]);
    setSelectedDialogIds([]);
    setDialogCustomer(null);
  }

  const hasOrders = selectedOrders.length > 0;
  const primaryOrder = selectedOrders.find((o) => o.id === primaryOrderId) ?? null;
  const childOrders = selectedOrders.filter((o) => o.id !== primaryOrderId);

  return (
    <ErrorBoundary>
      <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-5">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">Link orders</h1>
            <p className="text-sm text-muted-foreground">
              Connect orders for synchronized production and delivery
            </p>
          </div>
          <UnifiedSearch
            onPickCustomer={handleCustomerPick}
            onLookupOrder={handleOrderLookup}
            isBusy={isLoadingCustomerOrders}
          />
        </div>

        <MergePreviewBanner
          selectedCount={selectedOrders.length}
          primaryId={primaryOrder?.id ?? null}
          childCount={hasOrders ? childOrders.length : 0}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b flex justify-between items-center">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Selected orders</h3>
                  {hasOrders && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {selectedOrders.length}
                    </span>
                  )}
                </div>
                {hasOrders && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              {!hasOrders ? (
                <div className="py-16 text-center">
                  <LinkIcon className="w-7 h-7 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-base font-medium text-muted-foreground">
                    No orders selected
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Search a customer, or type{" "}
                    <span className="font-mono">#order</span> /{" "}
                    <span className="font-mono">#invoice</span> to look one up
                  </p>
                </div>
              ) : (
                <div>
                  <SectionLabel>
                    {primaryOrder ? "Primary" : "Pick a primary order"}
                  </SectionLabel>
                  {primaryOrder ? (
                    <PrimaryOrderRow
                      order={primaryOrder}
                      onRemove={() => removeOrder(primaryOrder.id)}
                    />
                  ) : (
                    <div className="px-4 py-3 text-sm text-muted-foreground bg-muted/10">
                      Promote one of the orders below — children inherit its identity.
                    </div>
                  )}

                  {childOrders.length > 0 && (
                    <>
                      <SectionLabel>
                        {primaryOrder
                          ? `Joining as children (${childOrders.length})`
                          : `Candidates (${childOrders.length})`}
                      </SectionLabel>
                      <div className="divide-y divide-border/50">
                        {childOrders.map((order) => (
                          <ChildOrderRow
                            key={order.id}
                            order={order}
                            hasPrimary={!!primaryOrder}
                            onPromote={() => setPrimaryOrderId(order.id)}
                            onRemove={() => removeOrder(order.id)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <LinkConfigurationPanel
              hasOrders={hasOrders}
              primaryOrderId={primaryOrderId}
              onLinkOrders={handleLinkOrders}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>

        <ErrorBoundary>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="!w-[95vw] sm:!w-[90vw] md:!w-[80vw] !max-w-4xl max-h-[85vh]">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">
                  Select orders to link
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confirmed work orders for {dialogCustomer?.name ?? "this customer"}
                </p>
              </DialogHeader>

              <div className="overflow-auto max-h-[50vh] rounded-md border">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                    <tr className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/20">
                      <th className="p-3 text-center w-12">
                        <Checkbox
                          checked={
                            customerOrders.length > 0 &&
                            selectedDialogIds.length ===
                              customerOrders.filter((o) => !o.linked_order_id).length
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedDialogIds(
                                customerOrders
                                  .filter((o) => !o.linked_order_id)
                                  .map((o) => o.id),
                              );
                            } else {
                              setSelectedDialogIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="p-3 text-left">Order</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Delivery</th>
                      <th className="p-3 text-left">Phase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerOrders.map((order) => {
                      const isChild = !!order.linked_order_id;
                      const isExistingPrimary =
                        order.child_orders && order.child_orders.length > 0;
                      const isSelected = selectedDialogIds.includes(order.id);
                      const phase = order.order_phase as
                        | keyof typeof ORDER_PHASE_LABELS
                        | undefined;

                      return (
                        <tr
                          key={order.id}
                          className={cn(
                            "border-b border-border/30 last:border-b-0 cursor-pointer transition-colors",
                            isSelected ? "bg-muted/30" : "hover:bg-muted/20",
                          )}
                          onClick={() => toggleDialogSelection(order.id)}
                        >
                          <td className="p-3 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleDialogSelection(order.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <div className="text-sm font-medium">#{order.id}</div>
                            {order.invoice_number && (
                              <div className="text-xs text-muted-foreground">
                                INV {order.invoice_number}
                              </div>
                            )}
                          </td>
                          <td className="p-3 whitespace-nowrap text-sm">
                            {isChild ? (
                              <span className="text-muted-foreground">
                                Linked to #{order.linked_order_id}
                              </span>
                            ) : isExistingPrimary ? (
                              <span className="text-foreground">Primary of a group</span>
                            ) : (
                              <span className="text-muted-foreground">Independent</span>
                            )}
                          </td>
                          <td className="p-3 whitespace-nowrap text-sm">
                            {order.delivery_date ? (
                              format(parseUtcTimestamp(order.delivery_date), "d MMM yyyy")
                            ) : (
                              <span className="text-muted-foreground">Not set</span>
                            )}
                          </td>
                          <td className="p-3 whitespace-nowrap text-sm text-muted-foreground">
                            {phase ? ORDER_PHASE_LABELS[phase] : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <DialogFooter>
                <div className="flex justify-between items-center w-full">
                  <p className="text-xs text-muted-foreground">
                    {selectedDialogIds.length} selected
                  </p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleDialogConfirm}
                      disabled={selectedDialogIds.length === 0}
                    >
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Add {selectedDialogIds.length > 0 ? `(${selectedDialogIds.length})` : ""}
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

function OrderMeta({ order }: { order: SelectedOrder }) {
  return (
    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
      <span className="truncate max-w-[180px]">
        {order.customerName || "Unknown customer"}
      </span>
      {order.customerPhone && <span>{order.customerPhone}</span>}
      {order.deliveryDate && (
        <span>Due {format(parseUtcTimestamp(order.deliveryDate), "d MMM")}</span>
      )}
      {order.orderPhase && (
        <span>
          {ORDER_PHASE_LABELS[order.orderPhase as keyof typeof ORDER_PHASE_LABELS]}
        </span>
      )}
      {order.isExistingPrimary && (
        <span className="text-foreground">Re-parenting existing group</span>
      )}
      {order.isExistingChild && <span>Already linked</span>}
    </div>
  );
}

function PrimaryOrderRow({
  order,
  onRemove,
}: {
  order: SelectedOrder;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
        <Crown className="size-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-medium text-foreground">#{order.id}</span>
          {order.invoiceNumber && (
            <span className="text-sm text-muted-foreground">INV {order.invoiceNumber}</span>
          )}
          <span className="text-xs text-primary font-medium">Primary</span>
        </div>
        <OrderMeta order={order} />
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-7 w-7 shrink-0 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
        aria-label={`Remove order #${order.id}`}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function ChildOrderRow({
  order,
  hasPrimary,
  onPromote,
  onRemove,
}: {
  order: SelectedOrder;
  hasPrimary: boolean;
  onPromote: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pl-6 pr-4 py-3 hover:bg-muted/20 transition-colors">
      <CornerDownRight className="size-3.5 text-muted-foreground/50 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">#{order.id}</span>
          {order.invoiceNumber && (
            <span className="text-xs text-muted-foreground">INV {order.invoiceNumber}</span>
          )}
        </div>
        <OrderMeta order={order} />
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onPromote}
        className="h-7 px-2 text-xs text-muted-foreground hover:text-primary shrink-0"
        title={hasPrimary ? "Make this the primary instead" : "Set as primary"}
      >
        <ArrowUp className="size-3.5 mr-1" />
        {hasPrimary ? "Make primary" : "Set primary"}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-7 w-7 shrink-0 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
        aria-label={`Remove order #${order.id}`}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function MergePreviewBanner({
  selectedCount,
  primaryId,
  childCount,
}: {
  selectedCount: number;
  primaryId: number | null;
  childCount: number;
}) {
  if (selectedCount === 0) return null;

  const ready = primaryId !== null && childCount >= 1;
  const needsPrimary = selectedCount >= 2 && primaryId === null;
  const needsMore = selectedCount === 1;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-3 text-sm flex items-center gap-3",
        ready ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <LinkIcon
        className={cn(
          "size-4 shrink-0",
          ready ? "text-primary" : "text-muted-foreground/60",
        )}
      />
      {ready ? (
        <span>
          Linking <span className="font-medium text-foreground">{childCount + 1}</span>{" "}
          orders into{" "}
          <span className="font-medium text-foreground">#{primaryId}</span>
          {" "}— set a revised delivery date to continue.
        </span>
      ) : needsPrimary ? (
        <span>Promote one order to primary — children will inherit its identity.</span>
      ) : needsMore ? (
        <span>Add at least one more order to link.</span>
      ) : null}
    </div>
  );
}

function UnifiedSearch({
  onPickCustomer,
  onLookupOrder,
  isBusy,
}: {
  onPickCustomer: (c: Customer) => void;
  onLookupOrder: (idOrInvoice: number) => Promise<void>;
  isBusy: boolean;
}) {
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const trimmed = value.trim();
  const isOrderQuery = trimmed.startsWith("#");
  const orderNumber = isOrderQuery
    ? Number(trimmed.replace(/[^0-9]/g, ""))
    : null;
  const hasValidOrderNumber = orderNumber != null && orderNumber > 0;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsFocused(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const debouncedTrim = debounced.trim();
  const isCustomerQuery = !debouncedTrim.startsWith("#") && debouncedTrim.length >= 2;

  const { data: results, isFetching } = useQuery({
    queryKey: ["link-customer-search", debouncedTrim],
    queryFn: () => fuzzySearchCustomers(debouncedTrim),
    enabled: isCustomerQuery,
    staleTime: 1000 * 60,
    placeholderData: (prev) => prev,
  });

  const customers = results?.data ?? [];
  const showOrderHint = isFocused && isOrderQuery;
  const showCustomerDropdown = isFocused && isCustomerQuery;

  async function submitOrder() {
    if (!hasValidOrderNumber) return;
    await onLookupOrder(orderNumber!);
    setValue("");
    setDebounced("");
    setIsFocused(false);
  }

  function pickCustomer(c: Customer) {
    onPickCustomer(c);
    setValue("");
    setDebounced("");
    setIsFocused(false);
  }

  return (
    <div ref={ref} className="relative w-full md:w-96">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && isOrderQuery) {
            e.preventDefault();
            void submitOrder();
          }
        }}
        placeholder="Search customer, or #order / #invoice"
        className="pl-9 pr-9 h-9 text-sm"
        disabled={isBusy}
      />
      {(isFetching || isBusy) && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground pointer-events-none" />
      )}

      {showOrderHint && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-md border bg-card shadow-sm p-3 z-30">
          {hasValidOrderNumber ? (
            <>
              <p className="text-sm text-foreground">
                Look up order or invoice{" "}
                <span className="font-medium">#{orderNumber}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Press Enter to fetch</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Type an order or invoice number after <span className="font-mono">#</span>
            </p>
          )}
        </div>
      )}

      {showCustomerDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-md border bg-card shadow-sm overflow-hidden z-30 max-h-[360px] overflow-y-auto">
          {isFetching && customers.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Searching…</div>
          ) : customers.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No customers match "{debouncedTrim}"
            </div>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCustomer(c)}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/30 border-b border-border/40 last:border-b-0 transition-colors"
              >
                <div className="text-sm font-medium text-foreground">{c.name}</div>
                {c.phone && (
                  <div className="text-xs text-muted-foreground">{c.phone}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
