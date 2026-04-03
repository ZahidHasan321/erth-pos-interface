import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Check, X, Truck, ClipboardCheck } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";

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

function ApproveRequestsPage() {
  const [activeTab, setActiveTab] = useState("pending");

  // Workshop approves requests where shop asks workshop to send items (direction=workshop_to_shop)
  const { data: pendingRequests = [], isLoading: pendingLoading } = useTransferRequests({
    status: ["requested"],
    direction: "workshop_to_shop",
  });
  const { data: approvedRequests = [], isLoading: approvedLoading } = useTransferRequests({
    status: ["approved"],
    direction: "workshop_to_shop",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approve Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">Review transfer requests from the shop and dispatch approved items</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending Approval {pendingRequests.length > 0 && (
              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 font-bold">{pendingRequests.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Ready to Dispatch {approvedRequests.length > 0 && (
              <span className="ml-1.5 text-xs bg-emerald-100 text-emerald-700 rounded-full px-1.5 font-bold">{approvedRequests.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <PendingRequestsList requests={pendingRequests} isLoading={pendingLoading} />
        </TabsContent>
        <TabsContent value="approved">
          <ApprovedRequestsList requests={approvedRequests} isLoading={approvedLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PendingRequestsList({ requests, isLoading }: { requests: TransferRequestWithItems[]; isLoading: boolean }) {
  const approveTransfer = useApproveTransfer();
  const rejectTransfer = useRejectTransfer();
  const [selectedRequest, setSelectedRequest] = useState<TransferRequestWithItems | null>(null);
  const [action, setAction] = useState<"approve" | "reject">("approve");
  const [approvalQtys, setApprovalQtys] = useState<Map<number, number>>(new Map());
  const [rejectionReason, setRejectionReason] = useState("");

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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No pending requests to review</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Request #{request.id}</span>
                    <ItemTypeBadge itemType={request.item_type} />
                    {request.revision_number! > 0 && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Rev {request.revision_number}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {request.items.length} item(s) &middot; {new Date(request.created_at!).toLocaleDateString()}
                    {request.requested_by_user && <> &middot; By {request.requested_by_user.name}</>}
                  </p>
                  {request.notes && <p className="text-xs text-muted-foreground italic">{request.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openRejectDialog(request)}>
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => openApproveDialog(request)}>
                    <Check className="h-4 w-4 mr-1" /> Approve
                  </Button>
                </div>
              </div>
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
              {selectedRequest?.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between border rounded-lg p-2">
                  <span className="text-sm font-medium">{getItemName(item)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Req: {item.requested_qty}</span>
                    <Input
                      type="number" min={0} step={0.5}
                      value={approvalQtys.get(item.id) ?? 0}
                      onChange={(e) => { const next = new Map(approvalQtys); next.set(item.id, Number(e.target.value)); setApprovalQtys(next); }}
                      className="w-20 h-8 text-sm"
                    />
                  </div>
                </div>
              ))}
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

function ApprovedRequestsList({ requests, isLoading }: { requests: TransferRequestWithItems[]; isLoading: boolean }) {
  const dispatchTransfer = useDispatchTransfer();
  const [dispatchingRequest, setDispatchingRequest] = useState<TransferRequestWithItems | null>(null);
  const [dispatchQtys, setDispatchQtys] = useState<Map<number, number>>(new Map());

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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No approved transfers ready to dispatch</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Transfer #{request.id}</span>
                    <TransferStatusBadge status={request.status} />
                    <ItemTypeBadge itemType={request.item_type} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {request.items.length} item(s) &middot; Approved {request.approved_at ? new Date(request.approved_at).toLocaleDateString() : "N/A"}
                  </p>
                </div>
                <Button size="sm" onClick={() => openDispatch(request)}>
                  <Truck className="h-4 w-4 mr-1.5" /> Dispatch
                </Button>
              </div>
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
            {dispatchingRequest?.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between border rounded-lg p-2">
                <span className="text-sm font-medium">{getItemName(item)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Approved: {item.approved_qty ?? item.requested_qty}</span>
                  <Input
                    type="number" min={0} step={0.5}
                    value={dispatchQtys.get(item.id) ?? 0}
                    onChange={(e) => { const next = new Map(dispatchQtys); next.set(item.id, Number(e.target.value)); setDispatchQtys(next); }}
                    className="w-20 h-8 text-sm"
                  />
                </div>
              </div>
            ))}
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
