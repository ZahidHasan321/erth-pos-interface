import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Check, X, Truck, ClipboardCheck, Search, Clock, History } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";

import { parseUtcTimestamp } from "@/lib/utils";
import { PageHeader, EmptyState as PageEmptyState, LoadingSkeleton } from "@/components/shared/PageShell";
import { useTransferRequests, useApproveTransfer, useRejectTransfer, useDispatchTransfer } from "@/hooks/useTransfers";
import { TransferStatusBadge, ItemTypeBadge } from "@/components/store/transfer-status-badge";
import type { TransferRequestWithItems } from "@/api/transfers";

export const Route = createFileRoute("/(main)/store/approve-requests")({
  component: ApproveRequestsPage,
  head: () => ({ meta: [{ title: "Approve Requests" }] }),
});

function getItemName(item: TransferRequestWithItems["items"][0]) {
  if (item.fabric) return item.fabric.name;
  if (item.shelf_item) return item.shelf_item.type;
  if (item.accessory) return `${item.accessory.name} (${item.accessory.category})`;
  return "Unknown";
}

function daysSince(dateStr: Date | string | null | undefined) {
  if (!dateStr) return 0;
  const d = dateStr instanceof Date ? dateStr : parseUtcTimestamp(dateStr);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function AgeBadge({ dateStr }: { dateStr: Date | string | null | undefined }) {
  const days = daysSince(dateStr);
  if (days < 2) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${days >= 5 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
      <Clock className="h-2.5 w-2.5" />
      {days}d ago
    </span>
  );
}

function filterRequests(requests: TransferRequestWithItems[], search: string) {
  if (!search) return requests;
  const q = search.toLowerCase();
  return requests.filter((r) => {
    if (String(r.id).includes(q)) return true;
    return r.items.some((item) => getItemName(item).toLowerCase().includes(q));
  });
}

function ApproveRequestsPage() {
  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");

  // Shop requests items from workshop (direction=workshop_to_shop) — workshop approves and dispatches
  const { data: pendingRequests = [], isLoading: pendingLoading } = useTransferRequests({
    status: ["requested"],
    direction: "workshop_to_shop",
  });
  const { data: approvedRequests = [], isLoading: approvedLoading } = useTransferRequests({
    status: ["approved"],
    direction: "workshop_to_shop",
  });
  const { data: historyRequests = [], isLoading: historyLoading } = useTransferRequests({
    status: ["rejected", "dispatched", "received", "partially_received"],
    direction: "workshop_to_shop",
  });

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader icon={ClipboardCheck} title="Approve Requests" subtitle="Review requests from the shop, approve and dispatch items" />

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by item name or request ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="pending">
            Pending {pendingRequests.length > 0 && (
              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 font-bold">{pendingRequests.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Ready to Dispatch {approvedRequests.length > 0 && (
              <span className="ml-1.5 text-xs bg-emerald-100 text-emerald-700 rounded-full px-1.5 font-bold">{approvedRequests.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <PendingRequestsList requests={pendingRequests} isLoading={pendingLoading} search={search} />
        </TabsContent>
        <TabsContent value="approved">
          <ApprovedRequestsList requests={approvedRequests} isLoading={approvedLoading} search={search} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryList requests={historyRequests} isLoading={historyLoading} search={search} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PendingRequestsList({ requests, isLoading, search }: { requests: TransferRequestWithItems[]; isLoading: boolean; search: string }) {
  const approveTransfer = useApproveTransfer();
  const rejectTransfer = useRejectTransfer();
  const [selectedRequest, setSelectedRequest] = useState<TransferRequestWithItems | null>(null);
  const [action, setAction] = useState<"approve" | "reject">("approve");
  const [approvalQtys, setApprovalQtys] = useState<Map<number, number>>(new Map());
  const [rejectionReason, setRejectionReason] = useState("");

  const filtered = useMemo(() => filterRequests(requests, search), [requests, search]);

  const openApproveDialog = (request: TransferRequestWithItems) => {
    setSelectedRequest(request);
    setAction("approve");
    const initial = new Map<number, number>();
    request.items.forEach((item) => initial.set(item.id, item.requested_qty));
    setApprovalQtys(initial);
  };

  const openRejectDialog = (request: TransferRequestWithItems) => {
    setSelectedRequest(request);
    setAction("reject");
    setRejectionReason("");
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    try {
      await approveTransfer.mutateAsync({
        id: selectedRequest.id,
        items: Array.from(approvalQtys.entries()).map(([id, qty]) => ({ id, approved_qty: qty })),
      });
      toast.success("Transfer request approved");
      setSelectedRequest(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to approve");
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    try {
      await rejectTransfer.mutateAsync({ id: selectedRequest.id, reason: rejectionReason });
      toast.success("Transfer request rejected");
      setSelectedRequest(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to reject");
    }
  };

  const approvalTotal = useMemo(() => {
    return Array.from(approvalQtys.values()).reduce((s, v) => s + v, 0);
  }, [approvalQtys]);

  if (isLoading) return <LoadingSkeleton count={3} />;

  if (requests.length === 0) {
    return <PageEmptyState icon={ClipboardCheck} message="No pending requests to review" />;
  }

  if (filtered.length === 0) {
    return <PageEmptyState icon={Search} message="No requests match your search" />;
  }

  return (
    <>
      <div className="space-y-3">
        {filtered.map((request) => (
          <Card key={request.id} className="rounded-xl">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">#{request.id}</span>
                    <ItemTypeBadge itemType={request.item_type} />
                    {(request.revision_number ?? 0) > 0 && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Rev {request.revision_number}</span>
                    )}
                    <AgeBadge dateStr={request.created_at} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {request.items.length} item(s) &middot; {request.created_at ? new Date(request.created_at).toLocaleDateString() : "N/A"}
                    {request.requested_by_user && <> &middot; By {request.requested_by_user.name}</>}
                  </p>
                  {request.notes && <p className="text-xs text-muted-foreground italic">{request.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openRejectDialog(request)}>
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => openApproveDialog(request)}>
                    <Check className="h-4 w-4 mr-1" /> Approve
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table className="mt-3">
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Requested Qty</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {request.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{getItemName(item)}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.requested_qty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{action === "approve" ? "Approve" : "Reject"} Request #{selectedRequest?.id}</DialogTitle>
            <DialogDescription>
              {action === "approve" ? "Adjust quantities if needed before approving." : "Provide a reason for rejection."}
            </DialogDescription>
          </DialogHeader>
          {action === "approve" ? (
            <div className="space-y-2">
              {selectedRequest?.items.map((item) => {
                const approved = approvalQtys.get(item.id) ?? 0;
                const changed = approved !== item.requested_qty;
                return (
                  <div key={item.id} className={`flex items-center justify-between border rounded-lg p-3 ${changed ? "border-amber-300 bg-amber-50/50" : ""}`}>
                    <div className="min-w-0 mr-3">
                      <span className="text-sm font-medium block truncate">{getItemName(item)}</span>
                      <span className="text-xs text-muted-foreground">Requested: {item.requested_qty}</span>
                    </div>
                    <Input
                      type="number" min={0} step={0.5}
                      value={approvalQtys.get(item.id) ?? 0}
                      onChange={(e) => { const next = new Map(approvalQtys); next.set(item.id, Number(e.target.value)); setApprovalQtys(next); }}
                      className="w-24 h-8 text-sm shrink-0"
                    />
                  </div>
                );
              })}
              <div className="flex justify-end pt-1">
                <span className="text-sm text-muted-foreground">
                  Total: <span className="font-semibold text-foreground tabular-nums">{approvalTotal}</span>
                </span>
              </div>
            </div>
          ) : (
            <Textarea placeholder="Reason for rejection..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)}>Cancel</Button>
            {action === "approve" ? (
              <Button onClick={handleApprove} disabled={approveTransfer.isPending}>
                {approveTransfer.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Approve
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleReject} disabled={rejectTransfer.isPending}>
                {rejectTransfer.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApprovedRequestsList({ requests, isLoading, search }: { requests: TransferRequestWithItems[]; isLoading: boolean; search: string }) {
  const dispatchTransfer = useDispatchTransfer();
  const [dispatchingRequest, setDispatchingRequest] = useState<TransferRequestWithItems | null>(null);
  const [dispatchQtys, setDispatchQtys] = useState<Map<number, number>>(new Map());

  const filtered = useMemo(() => filterRequests(requests, search), [requests, search]);

  const openDispatch = (request: TransferRequestWithItems) => {
    setDispatchingRequest(request);
    const initial = new Map<number, number>();
    request.items.forEach((item) => initial.set(item.id, item.approved_qty ?? item.requested_qty));
    setDispatchQtys(initial);
  };

  const handleDispatch = async () => {
    if (!dispatchingRequest) return;
    try {
      await dispatchTransfer.mutateAsync({
        transferId: dispatchingRequest.id,
        items: Array.from(dispatchQtys.entries()).map(([id, qty]) => ({ id, dispatched_qty: qty })),
      });
      toast.success("Transfer dispatched successfully");
      setDispatchingRequest(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to dispatch");
    }
  };

  const dispatchTotal = useMemo(() => {
    return Array.from(dispatchQtys.values()).reduce((s, v) => s + v, 0);
  }, [dispatchQtys]);

  if (isLoading) return <LoadingSkeleton count={3} />;

  if (requests.length === 0) {
    return <PageEmptyState icon={Truck} message="No approved transfers ready to dispatch" />;
  }

  if (filtered.length === 0) {
    return <PageEmptyState icon={Search} message="No requests match your search" />;
  }

  return (
    <>
      <div className="space-y-3">
        {filtered.map((request) => (
          <Card key={request.id} className="rounded-xl">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">#{request.id}</span>
                    <TransferStatusBadge status={request.status} />
                    <ItemTypeBadge itemType={request.item_type} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {request.items.length} item(s) &middot; Approved {request.approved_at ? new Date(request.approved_at).toLocaleDateString() : "N/A"}
                  </p>
                </div>
                <Button size="sm" className="shrink-0 self-start sm:self-center" onClick={() => openDispatch(request)}>
                  <Truck className="h-4 w-4 mr-1.5" /> Dispatch
                </Button>
              </div>

              <div className="overflow-x-auto">
                <Table className="mt-3">
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Approved Qty</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {request.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{getItemName(item)}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.approved_qty ?? item.requested_qty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!dispatchingRequest} onOpenChange={(open) => !open && setDispatchingRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dispatch Transfer #{dispatchingRequest?.id}</DialogTitle>
            <DialogDescription>Confirm quantities to dispatch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {dispatchingRequest?.items.map((item) => {
              const workshopStock = item.fabric?.workshop_stock ?? item.shelf_item?.workshop_stock ?? item.accessory?.workshop_stock;
              const maxQty = workshopStock != null ? Number(workshopStock) : undefined;
              const dispatchVal = dispatchQtys.get(item.id) ?? 0;
              return (
                <div key={item.id} className="border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium block truncate">{getItemName(item)}</span>
                      <span className="text-xs text-muted-foreground">Approved: {item.approved_qty ?? item.requested_qty}</span>
                    </div>
                    <Input
                      type="number" min={0} max={maxQty} step={0.5}
                      value={dispatchVal}
                      onChange={(e) => {
                        let val = Number(e.target.value);
                        if (maxQty != null) val = Math.min(val, maxQty);
                        const next = new Map(dispatchQtys);
                        next.set(item.id, Math.max(0, val));
                        setDispatchQtys(next);
                      }}
                      className="w-24 h-8 text-sm shrink-0"
                    />
                  </div>
                  {maxQty != null && (
                    <p className={`text-xs ${maxQty === 0 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      Available in workshop: {maxQty}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="flex justify-end pt-1">
              <span className="text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground tabular-nums">{dispatchTotal}</span>
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchingRequest(null)}>Cancel</Button>
            <Button onClick={handleDispatch} disabled={dispatchTransfer.isPending}>
              {dispatchTransfer.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Confirm Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HistoryList({ requests, isLoading, search }: { requests: TransferRequestWithItems[]; isLoading: boolean; search: string }) {
  const filtered = useMemo(() => filterRequests(requests, search), [requests, search]);

  if (isLoading) return <LoadingSkeleton count={3} />;

  if (requests.length === 0) {
    return <PageEmptyState icon={History} message="No request history yet" />;
  }

  if (filtered.length === 0) {
    return <PageEmptyState icon={Search} message="No requests match your search" />;
  }

  return (
    <div className="space-y-3">
      {filtered.slice(0, 30).map((request) => (
        <Card key={request.id} className="rounded-xl opacity-90">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">#{request.id}</span>
                  <TransferStatusBadge status={request.status} />
                  <ItemTypeBadge itemType={request.item_type} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {request.items.length} item(s) &middot; {request.created_at ? new Date(request.created_at).toLocaleDateString() : "N/A"}
                  {request.requested_by_user && <> &middot; By {request.requested_by_user.name}</>}
                </p>
                {request.rejection_reason && (
                  <p className="text-xs text-red-600 italic">Reason: {request.rejection_reason}</p>
                )}
                {request.notes && <p className="text-xs text-muted-foreground italic">{request.notes}</p>}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Dispatched</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {request.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{getItemName(item)}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.requested_qty}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.approved_qty ?? "\u2014"}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.dispatched_qty ?? "\u2014"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
      {filtered.length > 30 && (
        <p className="text-center text-sm text-muted-foreground py-2">
          Showing 30 of {filtered.length} results
        </p>
      )}
    </div>
  );
}
