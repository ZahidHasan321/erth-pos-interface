import { useState, useMemo, useEffect } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Loader2,
  Check,
  X,
  Truck,
  ClipboardCheck,
  Search,
  Clock,
  History,
  ChevronDown,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Skeleton } from "@repo/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@repo/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";

import { cn, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import { ANIMATION_CLASSES } from "@/lib/constants/animations";
import {
  useTransferRequests,
  useApproveTransfer,
  useRejectTransfer,
  useDispatchTransfer,
} from "@/hooks/useTransfers";
import { TransferStatusBadge, ItemTypeBadge } from "./transfer-status-badge";
import type { TransferRequestWithItems } from "@/api/transfers";

function getItemName(item: TransferRequestWithItems["items"][0]) {
  if (item.fabric) return item.fabric.name;
  if (item.shelf_item) return item.shelf_item.type;
  if (item.accessory)
    return `${item.accessory.name} (${item.accessory.category})`;
  return "Unknown";
}

function daysSince(dateStr: string | Date | null | undefined) {
  if (!dateStr) return 0;
  const diff = Date.now() - parseUtcTimestamp(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function AgeBadge({ dateStr }: { dateStr: string | Date | null | undefined }) {
  const days = daysSince(dateStr);
  if (days < 2) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
        days >= 5
          ? "bg-red-100 text-red-700"
          : "bg-amber-100 text-amber-700",
      )}
    >
      <Clock className="h-2.5 w-2.5" />
      {days}d ago
    </span>
  );
}

export default function ApproveRequestsPage({
  initialTab,
}: {
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState(initialTab ?? "pending");
  const { main } = useParams({ strict: false }) as { main?: string };

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const [search, setSearch] = useState("");

  const { data: pendingRequests = [], isLoading: pendingLoading, isError: pendingError, refetch: pendingRefetch } =
    useTransferRequests({
      status: ["requested"],
      direction: "shop_to_workshop",
    });
  const { data: approvedRequests = [], isLoading: approvedLoading, isError: approvedError, refetch: approvedRefetch } =
    useTransferRequests({
      status: ["approved"],
      direction: "shop_to_workshop",
    });
  const historySince = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);
  const { data: historyRequests = [], isLoading: historyLoading, isError: historyError, refetch: historyRefetch } =
    useTransferRequests({
      status: ["rejected", "dispatched", "received", "partially_received"],
      direction: "shop_to_workshop",
      startDate: historySince,
    });

  return (
    <div
      className={cn(
        "p-4 md:p-5 max-w-[1600px] mx-auto space-y-5",
        ANIMATION_CLASSES.fadeInUp,
      )}
    >
      <div>
        <h1 className="text-xl font-bold tracking-tight">Approve Requests</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review fabric requests from the workshop, approve and dispatch
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by item name or request ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit [&>[data-slot=tabs-trigger]]:shrink-0">
          <TabsTrigger value="pending">
            Pending
            {pendingRequests.length > 0 && (
              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 font-bold">
                {pendingRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Ready to Dispatch
            {approvedRequests.length > 0 && (
              <span className="ml-1.5 text-xs bg-emerald-100 text-emerald-700 rounded-full px-1.5 font-bold">
                {approvedRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <PendingRequestsList
            requests={pendingRequests}
            isLoading={pendingLoading}
            isError={pendingError}
            refetch={pendingRefetch}
            search={search}
          />
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          <ApprovedRequestsList
            requests={approvedRequests}
            isLoading={approvedLoading}
            isError={approvedError}
            refetch={approvedRefetch}
            search={search}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <p className="text-xs text-muted-foreground mb-3">
            Showing last 30 days. For older records see{" "}
            <Link
              to="/$main/store/transfer-history"
              params={{ main: main ?? "showroom" }}
              className="underline font-medium"
            >
              Transfer History
            </Link>
            .
          </p>
          <HistoryList
            requests={historyRequests}
            isLoading={historyLoading}
            isError={historyError}
            refetch={historyRefetch}
            search={search}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Shared helpers ──────────────────────────────────────────────────── */

function filterRequests(requests: TransferRequestWithItems[], search: string) {
  if (!search) return requests;
  const q = search.toLowerCase();
  return requests.filter((r) => {
    if (String(r.id).includes(q)) return true;
    return r.items.some((item) => getItemName(item).toLowerCase().includes(q));
  });
}

function TableSkeleton() {
  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-8" />
            <TableHead>Request</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Requested By</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell className="w-8 px-2"><Skeleton className="h-4 w-4" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function QueryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="shadow-none rounded-xl border border-destructive/20">
      <CardContent className="py-10 text-center">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
        <p className="font-medium text-sm">Failed to load data</p>
        <p className="text-xs text-muted-foreground mt-1">
          Something went wrong. Please try again.
        </p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Expandable Row (read-only — used by approved & history tabs) ───── */

function ReadOnlyRow({
  request,
  isExpanded,
  onToggle,
  dateField,
  itemsSlot,
  actionSlot,
}: {
  request: TransferRequestWithItems;
  isExpanded: boolean;
  onToggle: () => void;
  dateField: string | Date | null | undefined;
  itemsSlot?: React.ReactNode;
  actionSlot: React.ReactNode;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="w-8 px-2 py-3.5">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground/40 transition-transform duration-300",
              isExpanded && "rotate-180 text-primary",
            )}
          />
        </TableCell>
        <TableCell className="py-3.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold">#{request.id}</span>
            {(request.revision_number ?? 0) > 0 && (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                Rev {request.revision_number}
              </span>
            )}
            <AgeBadge dateStr={request.created_at} />
          </div>
        </TableCell>
        <TableCell className="py-3.5">
          <ItemTypeBadge itemType={request.item_type} />
        </TableCell>
        <TableCell className="py-3.5">
          {itemsSlot ?? (
            <>
              <span className="tabular-nums font-medium">{request.items.length}</span>
              <span className="text-muted-foreground ml-1 text-xs">item(s)</span>
            </>
          )}
        </TableCell>
        <TableCell className="py-3.5">
          <span className="text-sm">
            {dateField
              ? parseUtcTimestamp(dateField).toLocaleDateString(undefined, { timeZone: TIMEZONE, day: "numeric", month: "short" })
              : "N/A"}
          </span>
        </TableCell>
        <TableCell className="py-3.5">
          <span className="text-sm">{request.requested_by_user?.name ?? "—"}</span>
        </TableCell>
        <TableCell className="py-3.5 text-right">{actionSlot}</TableCell>
      </TableRow>

      <TableRow className="border-0 hover:bg-transparent">
        <TableCell
          colSpan={7}
          className={cn(
            "p-0 transition-colors",
            isExpanded ? "bg-muted/30 border-b border-border/40" : "border-0",
          )}
        >
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="px-6 py-3">
                {request.notes && (
                  <p className="text-xs text-muted-foreground italic mb-3">
                    Note: &ldquo;{request.notes}&rdquo;
                  </p>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="text-left pb-2 font-semibold">Item</th>
                      <th className="text-right pb-2 font-semibold pr-2">Requested</th>
                      {request.status !== "requested" && (
                        <th className="text-right pb-2 font-semibold pr-2">Approved</th>
                      )}
                      {request.dispatched_at && (
                        <th className="text-right pb-2 font-semibold pr-2">Dispatched</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {request.items.map((item) => (
                      <tr key={item.id} className="border-t border-border/50">
                        <td className="py-2 font-medium">{getItemName(item)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground pr-2">
                          {item.requested_qty}
                        </td>
                        {request.status !== "requested" && (
                          <td className="py-2 text-right tabular-nums pr-2">
                            {item.approved_qty != null ? (
                              <span className="font-medium text-emerald-600">{item.approved_qty}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        )}
                        {request.dispatched_at && (
                          <td className="py-2 text-right tabular-nums pr-2">
                            {item.dispatched_qty != null ? (
                              <span className="font-medium">{item.dispatched_qty}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}

/* ── Pending Row (per-item approve/reject in expanded, per-request on row) */

function PendingRow({
  request,
  isExpanded,
  onToggle,
  onReject,
}: {
  request: TransferRequestWithItems;
  isExpanded: boolean;
  onToggle: () => void;
  onReject: () => void;
}) {
  const approveTransfer = useApproveTransfer();
  const [qtys, setQtys] = useState<Map<number, number | "">>(() => {
    const m = new Map<number, number | "">();
    request.items.forEach((item) => m.set(item.id, item.requested_qty));
    return m;
  });

  useEffect(() => {
    const m = new Map<number, number | "">();
    request.items.forEach((item) => m.set(item.id, Number(item.requested_qty)));
    setQtys(m);
  }, [request]);

  const total = useMemo(
    () => Array.from(qtys.values()).reduce((s: number, v) => s + (v === "" ? 0 : Number(v)), 0),
    [qtys],
  );

  const handleApprove = async () => {
    if (total <= 0) {
      toast.error("Approve at least one item with quantity greater than 0");
      return;
    }
    try {
      await approveTransfer.mutateAsync({
        id: request.id,
        items: Array.from(qtys.entries()).map(([id, qty]) => ({ id, approved_qty: qty === "" ? 0 : qty })),
      });
    } catch (e: any) {
      toast.error(`Could not approve request: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="w-8 px-2 py-3.5">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground/40 transition-transform duration-300",
              isExpanded && "rotate-180 text-primary",
            )}
          />
        </TableCell>
        <TableCell className="py-3.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold">#{request.id}</span>
            {(request.revision_number ?? 0) > 0 && (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                Rev {request.revision_number}
              </span>
            )}
            <AgeBadge dateStr={request.created_at} />
          </div>
        </TableCell>
        <TableCell className="py-3.5">
          <ItemTypeBadge itemType={request.item_type} />
        </TableCell>
        <TableCell className="py-3.5">
          <span className="tabular-nums font-medium">{request.items.length}</span>
          <span className="text-muted-foreground ml-1 text-xs">item(s)</span>
        </TableCell>
        <TableCell className="py-3.5">
          <span className="text-sm">
            {request.created_at
              ? parseUtcTimestamp(request.created_at).toLocaleDateString(undefined, { timeZone: TIMEZONE, day: "numeric", month: "short" })
              : "N/A"}
          </span>
        </TableCell>
        <TableCell className="py-3.5">
          <span className="text-sm">{request.requested_by_user?.name ?? "—"}</span>
        </TableCell>
        <TableCell className="py-3.5 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleApprove();
              }}
              disabled={approveTransfer.isPending}
            >
              {approveTransfer.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              )}
              Approve
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <TableRow className="border-0 hover:bg-transparent">
        <TableCell
          colSpan={7}
          className={cn(
            "p-0 transition-colors",
            isExpanded ? "bg-muted/30 border-b border-border/40" : "border-0",
          )}
        >
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="px-6 py-3">
                {request.notes && (
                  <p className="text-xs text-muted-foreground italic mb-3">
                    Note: &ldquo;{request.notes}&rdquo;
                  </p>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="text-left pb-2 font-semibold">Item</th>
                      <th className="text-right pb-2 font-semibold pr-2">Requested</th>
                      <th className="text-right pb-2 font-semibold pr-2 w-28">Approve Qty</th>
                      <th className="text-right pb-2 font-semibold w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {request.items.map((item) => {
                      const qty = qtys.get(item.id) ?? 0;
                      const isRejected = qty === 0;
                      const isApproved = qty === item.requested_qty;
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            "border-t border-border/50",
                            isRejected && "bg-red-50/40 opacity-60",
                            !isRejected && !isApproved && "bg-amber-50/50",
                          )}
                        >
                          <td className="py-2 font-medium">{getItemName(item)}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground pr-2">
                            {item.requested_qty}
                          </td>
                          <td className="py-2 text-right pr-2">
                            <Input
                              type="number"
                              min={0}
                              step={request.item_type === "fabric" ? 0.5 : 1}
                              value={qty}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const next = new Map(qtys);
                                const raw = e.target.value;
                                if (raw === "") {
                                  next.set(item.id, "");
                                } else {
                                  let val = Math.max(0, Number(raw));
                                  if (request.item_type !== "fabric") val = Math.round(val);
                                  next.set(item.id, val);
                                }
                                setQtys(next);
                              }}
                              className="w-24 h-7 text-sm ml-auto tabular-nums"
                            />
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className={cn(
                                  "h-6 w-6 rounded flex items-center justify-center transition-colors",
                                  isApproved
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "hover:bg-emerald-50 text-muted-foreground/50 hover:text-emerald-600",
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = new Map(qtys);
                                  next.set(item.id, item.requested_qty);
                                  setQtys(next);
                                }}
                                title="Approve full qty"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "h-6 w-6 rounded flex items-center justify-center transition-colors",
                                  isRejected
                                    ? "bg-red-100 text-red-700"
                                    : "hover:bg-red-50 text-muted-foreground/50 hover:text-red-600",
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = new Map(qtys);
                                  next.set(item.id, 0);
                                  setQtys(next);
                                }}
                                title="Reject item (set to 0)"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    Total: <span className="font-semibold text-foreground tabular-nums">{total}</span>
                  </span>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApprove();
                    }}
                    disabled={approveTransfer.isPending || total <= 0}
                  >
                    {approveTransfer.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Approve with quantities
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}

/* ── Pending Requests ─────────────────────────────────────────────────── */

function PendingRequestsList({
  requests,
  isLoading,
  isError,
  refetch,
  search,
}: {
  requests: TransferRequestWithItems[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  search: string;
}) {
  const approveTransfer = useApproveTransfer();
  const rejectTransfer = useRejectTransfer();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rejectingRequest, setRejectingRequest] =
    useState<TransferRequestWithItems | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const filtered = useMemo(
    () => filterRequests(requests, search),
    [requests, search],
  );

  const handleReject = async () => {
    if (!rejectingRequest || !rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    try {
      await rejectTransfer.mutateAsync({
        id: rejectingRequest.id,
        reason: rejectionReason,
      });
      setRejectingRequest(null);
    } catch (e: any) {
      toast.error(`Could not reject request: ${e?.message ?? String(e)}`);
    }
  };

  if (isLoading) return <TableSkeleton />;
  if (isError) return <QueryErrorState onRetry={refetch} />;

  if (requests.length === 0) {
    return (
      <Card className="shadow-none rounded-xl border">
        <CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pending requests to review</p>
          <p className="text-xs mt-1 opacity-70">
            Workshop requests will appear here for approval
          </p>
        </CardContent>
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card className="shadow-none rounded-xl border">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No requests match your search</p>
        </CardContent>
      </Card>
    );
  }

  const handleApproveAll = async () => {
    for (const request of filtered) {
      const items = request.items.map((item) => ({
        id: item.id,
        approved_qty: item.requested_qty,
      }));
      try {
        await approveTransfer.mutateAsync({ id: request.id, items });
      } catch (e: any) {
        toast.error(`Failed to approve #${request.id}: ${e.message ?? "Unknown error"}`);
        return;
      }
    }
  };

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <Button
          size="sm"
          onClick={handleApproveAll}
          disabled={approveTransfer.isPending || filtered.length === 0}
        >
          {approveTransfer.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <Check className="h-3.5 w-3.5 mr-1.5" />
          )}
          Approve All ({filtered.length})
        </Button>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8" />
              <TableHead>Request</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((request) => (
              <PendingRow
                key={request.id}
                request={request}
                isExpanded={expandedId === request.id}
                onToggle={() => setExpandedId(expandedId === request.id ? null : request.id)}
                onReject={() => {
                  setRejectingRequest(request);
                  setRejectionReason("");
                }}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Reject Dialog */}
      <Dialog
        open={!!rejectingRequest}
        onOpenChange={(open) => !open && setRejectingRequest(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Request #{rejectingRequest?.id}</DialogTitle>
            <DialogDescription>
              Provide a reason so the workshop knows why.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Explain why this request is being rejected..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
            className="resize-none"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingRequest(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectTransfer.isPending || !rejectionReason.trim()}
            >
              {rejectTransfer.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              )}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Approved / Ready to Dispatch ─────────────────────────────────────── */

function ApprovedRequestsList({
  requests,
  isLoading,
  isError,
  refetch,
  search,
}: {
  requests: TransferRequestWithItems[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  search: string;
}) {
  const dispatchTransfer = useDispatchTransfer();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dispatchingRequest, setDispatchingRequest] =
    useState<TransferRequestWithItems | null>(null);
  const [dispatchQtys, setDispatchQtys] = useState<Map<number, number | "">>(new Map());

  const filtered = useMemo(
    () => filterRequests(requests, search),
    [requests, search],
  );

  const openDispatch = (request: TransferRequestWithItems) => {
    setDispatchingRequest(request);
    const initial = new Map<number, number | "">();
    request.items.forEach((item) =>
      initial.set(item.id, Number(item.approved_qty ?? item.requested_qty)),
    );
    setDispatchQtys(initial);
  };

  const dispatchTotal = useMemo(
    () => Array.from(dispatchQtys.values()).reduce((s: number, v) => s + (v === "" ? 0 : Number(v)), 0),
    [dispatchQtys],
  );

  const handleDispatch = async () => {
    if (!dispatchingRequest) return;
    if (dispatchTotal <= 0) {
      toast.error("Dispatch at least one item with quantity greater than 0");
      return;
    }
    const items = Array.from(dispatchQtys.entries()).map(([id, qty]) => ({
      id,
      dispatched_qty: qty === "" ? 0 : qty,
    }));
    try {
      await dispatchTransfer.mutateAsync({
        transferId: dispatchingRequest.id,
        items,
      });
      setDispatchingRequest(null);
    } catch (e: any) {
      toast.error(`Could not dispatch request: ${e?.message ?? String(e)}`);
    }
  };

  if (isLoading) return <TableSkeleton />;
  if (isError) return <QueryErrorState onRetry={refetch} />;

  if (requests.length === 0) {
    return (
      <Card className="shadow-none rounded-xl border">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No approved transfers ready to dispatch</p>
          <p className="text-xs mt-1 opacity-70">
            Approved requests will queue here until dispatched
          </p>
        </CardContent>
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card className="shadow-none rounded-xl border">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No requests match your search</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8" />
              <TableHead>Request</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((request) => (
              <ReadOnlyRow
                key={request.id}
                request={request}
                isExpanded={expandedId === request.id}
                onToggle={() => setExpandedId(expandedId === request.id ? null : request.id)}
                dateField={request.approved_at}
                actionSlot={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDispatch(request);
                    }}
                  >
                    <Truck className="h-3.5 w-3.5 mr-1.5" />
                    Dispatch
                  </Button>
                }
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dispatch Dialog */}
      <Dialog
        open={!!dispatchingRequest}
        onOpenChange={(open) => !open && setDispatchingRequest(null)}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Dispatch Request #{dispatchingRequest?.id}</DialogTitle>
            <DialogDescription>
              Confirm quantities. Dispatched amounts are capped by available stock.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {dispatchingRequest?.items.map((item) => {
              const availableStock =
                item.fabric?.shop_stock ??
                item.shelf_item?.shop_stock ??
                item.accessory?.shop_stock;
              const approvedMax = Number(item.approved_qty ?? item.requested_qty);
              const stockMax = availableStock != null ? Number(availableStock) : undefined;
              const maxQty = stockMax != null ? Math.min(approvedMax, stockMax) : approvedMax;
              const dispatchVal = Number(dispatchQtys.get(item.id) ?? 0);
              const overStock = dispatchVal > maxQty;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "border rounded-lg p-3 space-y-1.5",
                    overStock ? "border-red-300 bg-red-50/50" : "",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium block truncate">
                        {getItemName(item)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Approved: {item.approved_qty ?? item.requested_qty}
                      </span>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={maxQty}
                      step={dispatchingRequest?.item_type === "fabric" ? 0.5 : 1}
                      value={dispatchVal}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const next = new Map(dispatchQtys);
                        if (raw === "") {
                          next.set(item.id, "");
                        } else {
                          let val = Number(raw);
                          val = Math.min(Math.max(0, val), maxQty);
                          if (dispatchingRequest?.item_type !== "fabric") val = Math.round(val);
                          next.set(item.id, val);
                        }
                        setDispatchQtys(next);
                      }}
                      className="w-24 h-8 text-sm shrink-0"
                    />
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>Approved: {approvedMax}</span>
                    {stockMax != null && (
                      <span className={stockMax === 0 ? "text-red-600 font-medium" : ""}>
                        In shop: {stockMax}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end text-sm text-muted-foreground">
            Total:{" "}
            <span className="font-semibold text-foreground tabular-nums ml-1">
              {dispatchTotal}
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchingRequest(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDispatch}
              disabled={dispatchTransfer.isPending}
            >
              {dispatchTransfer.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              )}
              <Truck className="h-4 w-4 mr-1.5" />
              Confirm Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── History ──────────────────────────────────────────────────────────── */

function HistoryList({
  requests,
  isLoading,
  isError,
  refetch,
  search,
}: {
  requests: TransferRequestWithItems[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  search: string;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = useMemo(
    () => filterRequests(requests, search),
    [requests, search],
  );

  if (isLoading) return <TableSkeleton />;
  if (isError) return <QueryErrorState onRetry={refetch} />;

  if (requests.length === 0) {
    return (
      <Card className="shadow-none rounded-xl border">
        <CardContent className="py-12 text-center text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No request history yet</p>
        </CardContent>
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card className="shadow-none rounded-xl border">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No requests match your search</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8" />
              <TableHead>Request</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead className="text-right">Items</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 30).map((request) => (
              <ReadOnlyRow
                key={request.id}
                request={request}
                isExpanded={expandedId === request.id}
                onToggle={() => setExpandedId(expandedId === request.id ? null : request.id)}
                dateField={request.created_at}
                actionSlot={
                  <span className="tabular-nums text-sm">
                    {request.items.length} item(s)
                  </span>
                }
                itemsSlot={<TransferStatusBadge status={request.status} />}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {filtered.length > 30 && (
        <p className="text-center text-xs text-muted-foreground mt-2">
          Showing 30 of {filtered.length} results
        </p>
      )}

    </>
  );
}
