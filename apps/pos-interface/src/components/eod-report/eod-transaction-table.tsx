import { useState, useRef, useMemo, useEffect } from "react";
import { useReactToPrint } from "react-to-print";
import {
  Search,
  Printer,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Link, useParams } from "@tanstack/react-router";
import { Card } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { ChipToggle } from "@repo/ui/chip-toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { parseUtcTimestamp } from "@/lib/utils";
import { useEodTransactionsPaginated } from "@/hooks/useCashier";
import type { EodTransaction, EodTransactionFilters } from "@/api/cashier";
import {
  PaymentReceipt,
  type PaymentReceiptData,
} from "@/components/cashier/payment-receipt";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
});

interface EodTransactionTableProps {
  dateFrom: string;
  dateTo: string;
  showDate?: boolean;
}

const PAGE_SIZES = [10, 25, 50, 100] as const;

export function EodTransactionTable({
  dateFrom,
  dateTo,
  showDate,
}: EodTransactionTableProps) {
  const { main } = useParams({ strict: false }) as { main: string };

  // Filter state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paymentType, setPaymentType] = useState<string>("");
  const [transactionType, setTransactionType] = useState<string>("");
  const [orderType, setOrderType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
      setPage(1);
    }, 400);
  };

  const filters: EodTransactionFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      paymentType: paymentType || undefined,
      transactionType: transactionType || undefined,
      orderType: orderType || undefined,
      page,
      pageSize,
    }),
    [debouncedSearch, paymentType, transactionType, orderType, page, pageSize],
  );

  const {
    data: result,
    isLoading,
    isFetching,
  } = useEodTransactionsPaginated(dateFrom, dateTo, filters);
  const txPage = result?.data;
  const transactions = txPage?.transactions || [];
  const totalCount = txPage?.total_count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Reset page when filters change
  const resetPage = () => setPage(1);
  const handlePaymentTypeChange = (v: string) => {
    setPaymentType(v === paymentType ? "" : v);
    resetPage();
  };
  const handleTransactionTypeChange = (v: string) => {
    setTransactionType(v === transactionType ? "" : v);
    resetPage();
  };
  const handleOrderTypeChange = (v: string) => {
    setOrderType(v === orderType ? "" : v);
    resetPage();
  };

  const hasFilters =
    !!debouncedSearch || !!paymentType || !!transactionType || !!orderType;

  // ── Receipt Print ─────────────────────────────────────────────────────────
  const receiptRef = useRef<HTMLDivElement>(null);
  const [receiptData, setReceiptData] = useState<PaymentReceiptData | null>(
    null,
  );

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    onAfterPrint: () => setReceiptData(null),
  });

  useEffect(() => {
    if (!receiptData) return;
    const timer = window.setTimeout(() => {
      void handlePrint();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [receiptData, handlePrint]);

  const printTransaction = (tx: EodTransaction) => {
    const invoiceDisplay = tx.invoice_number
      ? `${tx.invoice_number}`
      : undefined;
    const totalPaid = Number(tx.order_paid) || 0;
    const orderTotal = Number(tx.order_total) || 0;
    setReceiptData({
      orderId: tx.order_id,
      invoiceDisplay,
      customerName: tx.customer_name || undefined,
      customerPhone: tx.customer_phone || undefined,
      transactionAmount: tx.amount,
      transactionType: tx.transaction_type,
      paymentType: tx.payment_type,
      paymentRefNo: tx.payment_ref_no || undefined,
      orderTotal,
      totalPaid,
      remainingBalance: orderTotal - totalPaid,
      cashierName: tx.cashier_name || undefined,
      timestamp: tx.created_at,
    });
  };

  return (
    <Card
      className="overflow-hidden"
      style={{
        animation:
          "cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) 400ms both",
      }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Transactions</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalCount} record{totalCount !== 1 ? "s" : ""}
              {hasFilters && " (filtered)"}
              {isFetching && !isLoading && " · updating…"}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-border space-y-2.5 bg-muted/20">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search order ID, invoice, customer, phone, ref…"
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Transaction type */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mr-1">
              Type
            </span>
            <ChipToggle
              active={transactionType === "payment"}
              onClick={() => handleTransactionTypeChange("payment")}
              className="text-[11px] py-0.5 px-2"
            >
              Payment
            </ChipToggle>
            <ChipToggle
              active={transactionType === "refund"}
              onClick={() => handleTransactionTypeChange("refund")}
              className="text-[11px] py-0.5 px-2"
            >
              Refund
            </ChipToggle>
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Payment method */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mr-1">
              Method
            </span>
            {Object.entries(PAYMENT_TYPE_LABELS).map(([key, label]) => (
              <ChipToggle
                key={key}
                active={paymentType === key}
                onClick={() => handlePaymentTypeChange(key)}
                className="text-[11px] py-0.5 px-2"
              >
                {label}
              </ChipToggle>
            ))}
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Order type */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mr-1">
              Order
            </span>
            <ChipToggle
              active={orderType === "WORK"}
              onClick={() => handleOrderTypeChange("WORK")}
              className="text-[11px] py-0.5 px-2"
            >
              Work
            </ChipToggle>
            <ChipToggle
              active={orderType === "SALES"}
              onClick={() => handleOrderTypeChange("SALES")}
              className="text-[11px] py-0.5 px-2"
            >
              Sales
            </ChipToggle>
          </div>

          {hasFilters && (
            <>
              <div className="w-px h-4 bg-border" />
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                  setPaymentType("");
                  setTransactionType("");
                  setOrderType("");
                  resetPage();
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Loading transactions…
        </div>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          {hasFilters
            ? "No transactions match the current filters"
            : "No transactions in this period"}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Time</TableHead>
                {showDate && <TableHead className="w-16">Date</TableHead>}
                <TableHead className="w-28">Order</TableHead>
                <TableHead className="w-36">Customer</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead className="w-20">Method</TableHead>
                <TableHead className="text-right w-28">Amount</TableHead>
                <TableHead className="w-24">Reference</TableHead>
                <TableHead className="w-20">Cashier</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => {
                const isRefund = tx.transaction_type === "refund";
                const methodLabel =
                  PAYMENT_TYPE_LABELS[
                    tx.payment_type as keyof typeof PAYMENT_TYPE_LABELS
                  ] || tx.payment_type;
                const time = timeFmt.format(parseUtcTimestamp(tx.created_at));
                const date = dateFmt.format(parseUtcTimestamp(tx.created_at));
                const orderLabel = tx.invoice_number
                  ? `#${tx.order_id} · INV ${tx.invoice_number}`
                  : `#${tx.order_id}`;
                return (
                  <TableRow key={tx.id}>
                    <TableCell className="tabular-nums text-xs">
                      {time}
                    </TableCell>
                    {showDate && (
                      <TableCell className="tabular-nums text-xs">
                        {date}
                      </TableCell>
                    )}
                    <TableCell>
                      <Link
                        to="/$main/cashier"
                        params={{ main }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        {orderLabel}
                        <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                      </Link>
                      {tx.order_type && (
                        <span
                          className={`ml-1.5 text-[10px] font-medium ${tx.order_type === "WORK" ? "text-blue-600" : "text-amber-600"}`}
                        >
                          {tx.order_type === "WORK" ? "W" : "S"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[140px]">
                      {tx.customer_name || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={isRefund ? "destructive" : "default"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {isRefund ? "Refund" : "Payment"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{methodLabel}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-semibold text-sm ${isRefund ? "text-red-600" : "text-emerald-600"}`}
                    >
                      {isRefund ? "-" : ""}
                      {fmt(Math.abs(tx.amount))} KWD
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[100px]">
                      {tx.payment_ref_no || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {tx.cashier_name || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => printTransaction(tx)}
                        aria-label="Print receipt"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, totalCount)} of {totalCount}
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                resetPage();
              }}
            >
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs tabular-nums px-2 text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Hidden receipt for printing */}
      <div className="hidden">
        <div ref={receiptRef}>
          {receiptData && <PaymentReceipt data={receiptData} />}
        </div>
      </div>
    </Card>
  );
}
