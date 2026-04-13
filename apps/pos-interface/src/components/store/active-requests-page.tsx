import { useState, useMemo } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Loader2,
  PackageSearch,
  X,
  ChevronDown,
  Search,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Clock,
} from "lucide-react";

import { Button, buttonVariants } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
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

import { cn, parseUtcTimestamp } from "@/lib/utils";
import { ANIMATION_CLASSES } from "@/lib/constants/animations";
import { useTransferRequests, useCancelTransfer } from "@/hooks/useTransfers";
import { TransferStatusBadge, ItemTypeBadge } from "./transfer-status-badge";
import type { TransferRequestWithItems } from "@/api/transfers";

function getItemDisplayName(item: TransferRequestWithItems["items"][0]): string {
  if (item.fabric) return item.fabric.name ?? "Fabric";
  if (item.shelf_item)
    return `${item.shelf_item.type}${item.shelf_item.brand ? ` (${item.shelf_item.brand})` : ""}`;
  if (item.accessory)
    return `${item.accessory.name} (${item.accessory.category})`;
  return "Unknown";
}

function daysSince(dateStr: string | Date | null | undefined) {
  if (!dateStr) return 0;
  const diff = Date.now() - parseUtcTimestamp(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getApprovalSummary(items: TransferRequestWithItems["items"]) {
  const hasApproval = items.some((i) => i.approved_qty != null);
  if (!hasApproval) return null;
  const totalRequested = items.reduce((s, i) => s + Number(i.requested_qty ?? 0), 0);
  const totalApproved = items.reduce((s, i) => s + Number(i.approved_qty ?? 0), 0);
  const isPartial = totalApproved < totalRequested;
  return { totalRequested, totalApproved, isPartial };
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

function ActiveRequestRow({
  request,
  isExpanded,
  onToggle,
  onCancel,
}: {
  request: TransferRequestWithItems;
  isExpanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
}) {
  const canCancel = request.status === "requested";

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
            <AgeBadge dateStr={request.created_at} />
          </div>
        </TableCell>
        <TableCell className="py-3.5">
          <TransferStatusBadge status={request.status} />
        </TableCell>
        <TableCell className="py-3.5">
          <ItemTypeBadge itemType={request.item_type} />
        </TableCell>
        <TableCell className="py-3.5">
          <div>
            <span className="tabular-nums font-medium">{request.items.length}</span>
            <span className="text-muted-foreground ml-1 text-xs">item(s)</span>
          </div>
          {(() => {
            const summary = getApprovalSummary(request.items);
            if (!summary) return null;
            return (
              <span className={cn(
                "text-[10px] tabular-nums font-medium",
                summary.isPartial ? "text-amber-600" : "text-emerald-600",
              )}>
                {summary.totalApproved}/{summary.totalRequested} approved
              </span>
            );
          })()}
        </TableCell>
        <TableCell className="py-3.5">
          <span className="text-sm">
            {request.created_at
              ? parseUtcTimestamp(request.created_at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })
              : "N/A"}
          </span>
        </TableCell>
        <TableCell className="py-3.5">
          <span className="text-sm">{request.requested_by_user?.name ?? "—"}</span>
        </TableCell>
        <TableCell className="py-3.5 text-right">
          <Button
            size="sm"
            variant="outline"
            disabled={!canCancel}
            className="text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Cancel
          </Button>
        </TableCell>
      </TableRow>

      <TableRow className="border-0 hover:bg-transparent">
        <TableCell
          colSpan={8}
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
                      <th className="text-right pb-2 font-semibold pr-2">Approved</th>
                      <th className="text-right pb-2 font-semibold pr-2">Dispatched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.items.map((item) => (
                      <tr key={item.id} className="border-t border-border/50">
                        <td className="py-2 font-medium">{getItemDisplayName(item)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground pr-2">
                          {item.requested_qty}
                        </td>
                        <td className="py-2 text-right tabular-nums pr-2">
                          {item.approved_qty != null ? (
                            <span className="font-medium text-emerald-600">{item.approved_qty}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums pr-2">
                          {item.dispatched_qty != null ? (
                            <span className="font-medium">{item.dispatched_qty}</span>
                          ) : (
                            "—"
                          )}
                        </td>
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

export default function ActiveRequestsPage() {
  const { main } = useParams({ strict: false }) as { main?: string };
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<TransferRequestWithItems | null>(null);
  const cancelTransfer = useCancelTransfer();

  const { data: requests = [], isLoading, isError, refetch } = useTransferRequests({
    status: ["requested", "approved", "dispatched"],
    direction: "workshop_to_shop",
  });

  const filtered = useMemo(() => {
    if (!search) return requests;
    const q = search.toLowerCase();
    return requests.filter(
      (r) =>
        String(r.id).includes(q) ||
        r.items.some((i) => getItemDisplayName(i).toLowerCase().includes(q)),
    );
  }, [requests, search]);

  const handleCancel = async () => {
    if (!confirmCancel) return;
    try {
      await cancelTransfer.mutateAsync(confirmCancel.id);
      setConfirmCancel(null);
      if (expandedId === confirmCancel.id) setExpandedId(null);
    } catch (e: any) {
      toast.error(`Could not cancel request: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <div className={cn("p-4 md:p-5 max-w-[1600px] mx-auto space-y-5", ANIMATION_CLASSES.fadeInUp)}>
      <div className="flex items-start gap-3">
        <Link
          to="/$main/store/request-delivery"
          params={{ main: main ?? "showroom" }}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Active Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {requests.length > 0
              ? `${requests.length} request${requests.length === 1 ? "" : "s"} in flight`
              : "Requests pending approval or dispatch from the workshop"}
          </p>
        </div>
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

      {isLoading && requests.length === 0 ? (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8" />
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
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
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : isError ? (
        <Card className="shadow-none rounded-xl border border-destructive/20">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
            <p className="font-medium text-sm">Failed to load requests</p>
            <p className="text-xs text-muted-foreground mt-1">
              Something went wrong. Please try again.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : requests.length === 0 ? (
        <Card className="shadow-none rounded-xl border">
          <CardContent className="py-14 text-center text-muted-foreground">
            <PackageSearch className="h-10 w-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">No active requests</p>
            <p className="text-xs mt-1 opacity-70">
              Requests you submit will appear here until received
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="shadow-none rounded-xl border">
          <CardContent className="py-14 text-center text-muted-foreground">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-25" />
            <p>No requests match your search</p>
          </CardContent>
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8" />
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((req) => (
                <ActiveRequestRow
                  key={req.id}
                  request={req}
                  isExpanded={expandedId === req.id}
                  onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
                  onCancel={() => setConfirmCancel(req)}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={!!confirmCancel}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel request #{confirmCancel?.id}?</DialogTitle>
            <DialogDescription>
              This removes the request permanently. The workshop will not see
              it. You can create a new request afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmCancel(null)}
              disabled={cancelTransfer.isPending}
            >
              Keep request
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelTransfer.isPending}
            >
              {cancelTransfer.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              )}
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
