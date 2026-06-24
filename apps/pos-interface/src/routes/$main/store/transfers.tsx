import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightLeft, Plus, Search, Loader2, AlertCircle, Inbox } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { useAuth } from "@/context/auth";
import { useTransferRequests } from "@/hooks/useTransfers";
import { primaryActionFor, personalAwaitingLabel, itemNamesPreview, isStale, staleDays, lastEventAt, sourceSideOf, destinationSideOf } from "@/lib/transfers";
import { TransferStatusBadge, ItemTypeBadge } from "@/components/store/transfer-status-badge";
import { TransferDetailDrawer } from "@/components/transfers/TransferDetailDrawer";
import type { TransferRequestWithItems } from "@/api/transfers";
import type { AuthUser } from "@/lib/rbac";
import { parseUtcTimestamp, TIMEZONE } from "@/lib/utils";

export const Route = createFileRoute("/$main/store/transfers")({
  component: TransfersPage,
  head: () => ({ meta: [{ title: "Transfers" }] }),
});

type TabKey = "inbox" | "open" | "done";

function isOpen(t: TransferRequestWithItems) {
  return t.status !== "received" && t.status !== "rejected";
}

function TransfersPage() {
  const { user } = useAuth();
  const params = Route.useParams();
  const [tab, setTab] = useState<TabKey>("inbox");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<string>("all");
  const [drawer, setDrawer] = useState<TransferRequestWithItems | null>(null);

  const { data: transfers = [], isLoading } = useTransferRequests();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transfers.filter((t) => {
      if (tab === "inbox" && !primaryActionFor(user, t)) return false;
      if (tab === "open" && !isOpen(t)) return false;
      if (tab === "done" && isOpen(t)) return false;

      if (direction !== "all" && t.direction !== direction) return false;

      if (q) {
        const hay = [
          String(t.id),
          t.notes ?? "",
          t.requested_by_user?.name ?? "",
          ...t.items.map((i) => i.fabric?.name ?? i.shelf_item?.type ?? i.accessory?.name ?? ""),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transfers, tab, direction, search, user]);

  const counts = useMemo(() => ({
    inbox: transfers.filter((t) => primaryActionFor(user, t)).length,
    open: transfers.filter(isOpen).length,
    done: transfers.filter((t) => !isOpen(t)).length,
    stale: transfers.filter((t) => isStale(t)).length,
  }), [transfers, user]);

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" /> Transfers
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Move stock between shop and workshop.
          </p>
        </div>
        <Button asChild>
          <Link to="/$main/store/transfers/new" params={params}>
            <Plus className="h-4 w-4 mr-1" /> New transfer
          </Link>
        </Button>
      </div>

      {counts.stale > 0 && tab !== "done" && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-amber-900">{counts.stale} transfer{counts.stale !== 1 ? "s" : ""} stuck for over 3 days. See the In flight tab.</span>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="mb-4">
          <TabsTrigger value="inbox" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" />
            Needs you
            {counts.inbox > 0 && <CountBadge tone="amber" value={counts.inbox} />}
          </TabsTrigger>
          <TabsTrigger value="open" className="gap-1.5">
            In flight <CountBadge tone="muted" value={counts.open} />
          </TabsTrigger>
          <TabsTrigger value="done" className="gap-1.5">
            Done <CountBadge tone="muted" value={counts.done} />
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search ID, item, requester…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All directions</SelectItem>
              <SelectItem value="shop_to_workshop">Shop → Workshop</SelectItem>
              <SelectItem value="workshop_to_shop">Workshop → Shop</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="inbox">
          <TransfersList rows={filtered} loading={isLoading} onSelect={setDrawer} user={user} emptyKind="inbox" mainParam={params.main} />
        </TabsContent>
        <TabsContent value="open">
          <TransfersList rows={filtered} loading={isLoading} onSelect={setDrawer} user={user} emptyKind="open" mainParam={params.main} />
        </TabsContent>
        <TabsContent value="done">
          <TransfersList rows={filtered} loading={isLoading} onSelect={setDrawer} user={user} emptyKind="done" mainParam={params.main} />
        </TabsContent>
      </Tabs>

      <TransferDetailDrawer open={!!drawer} onClose={() => setDrawer(null)} transfer={drawer} />
    </div>
  );
}

function CountBadge({ value, tone }: { value: number; tone: "amber" | "muted" }) {
  if (value === 0 && tone === "amber") return null;
  const cls = tone === "amber"
    ? "bg-amber-100 text-amber-700"
    : "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold ${cls}`}>{value}</span>;
}

function TransfersList({
  rows, loading, onSelect, user, emptyKind, mainParam,
}: {
  rows: TransferRequestWithItems[];
  loading: boolean;
  onSelect: (t: TransferRequestWithItems) => void;
  user: AuthUser | null;
  emptyKind: "inbox" | "open" | "done";
  mainParam: string;
}) {
  if (loading) {
    return <Card><CardContent className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>;
  }

  if (rows.length === 0) {
    return <EmptyState kind={emptyKind} mainParam={mainParam} />;
  }

  return (
    <>
      {/* Desktop / tablet: table */}
      <Card className="hidden md:block">
        <CardContent className="py-4">
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[70px]">ID</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="w-[180px]">From → To</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead>Waiting on</TableHead>
                  <TableHead className="w-[180px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TransferRowDesktop key={t.id} t={t} user={user} onSelect={onSelect} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {rows.map((t) => (
          <TransferCardMobile key={t.id} t={t} user={user} onSelect={onSelect} />
        ))}
      </div>
    </>
  );
}

function ActionLabel({ action }: { action: ReturnType<typeof primaryActionFor> }) {
  switch (action) {
    case "dispatch": return <>Send</>;
    case "receive": return <>Receive</>;
    default: return null;
  }
}

function FromTo({ t }: { t: TransferRequestWithItems }) {
  const src = sourceSideOf(t.direction);
  const dst = destinationSideOf(t.direction);
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="capitalize">{src}</span>
      <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
      <span className="capitalize">{dst}</span>
    </div>
  );
}

function StaleDot({ t }: { t: TransferRequestWithItems }) {
  if (!isStale(t)) return null;
  return (
    <span title={`Stuck ${staleDays(t)} days`} className="inline-block h-2 w-2 rounded-full bg-amber-500" />
  );
}

function TransferRowDesktop({
  t, user, onSelect,
}: {
  t: TransferRequestWithItems;
  user: AuthUser | null;
  onSelect: (t: TransferRequestWithItems) => void;
}) {
  const action = primaryActionFor(user, t);
  const at = lastEventAt(t);
  return (
    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => onSelect(t)}>
      <TableCell className="font-medium tabular-nums">
        <div className="flex items-center gap-1.5">
          <StaleDot t={t} /> <span>#{t.id}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <ItemTypeBadge itemType={t.item_type} />
          <span className="text-sm truncate max-w-[280px]" title={itemNamesPreview(t, 99)}>
            {itemNamesPreview(t)}
          </span>
        </div>
      </TableCell>
      <TableCell><FromTo t={t} /></TableCell>
      <TableCell><TransferStatusBadge status={t.status} /></TableCell>
      <TableCell className="text-xs">
        <span className={action ? "text-amber-700 font-medium" : "text-muted-foreground"}>{personalAwaitingLabel(user, t)}</span>
        {at && <span className="block text-[10px] text-muted-foreground mt-0.5">{parseUtcTimestamp(at).toLocaleDateString("en-GB", { timeZone: TIMEZONE })}</span>}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        {action ? (
          <Button size="sm" variant={action === "dispatch" ? "default" : "outline"} onClick={() => onSelect(t)}>
            <ActionLabel action={action} />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onSelect(t)}>View</Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function TransferCardMobile({
  t, user, onSelect,
}: {
  t: TransferRequestWithItems;
  user: AuthUser | null;
  onSelect: (t: TransferRequestWithItems) => void;
}) {
  const action = primaryActionFor(user, t);
  return (
    <Card className="cursor-pointer" onClick={() => onSelect(t)}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StaleDot t={t} />
            <span className="font-medium text-sm tabular-nums">#{t.id}</span>
            <TransferStatusBadge status={t.status} size="xs" />
          </div>
          <FromTo t={t} />
        </div>
        <div className="flex items-center gap-2">
          <ItemTypeBadge itemType={t.item_type} />
          <span className="text-sm truncate">{itemNamesPreview(t)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs ${action ? "text-amber-700 font-medium" : "text-muted-foreground"}`}>{personalAwaitingLabel(user, t)}</p>
          {action ? (
            <Button size="sm" variant={action === "dispatch" ? "default" : "outline"} onClick={(e) => { e.stopPropagation(); onSelect(t); }}>
              <ActionLabel action={action} />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ kind, mainParam }: { kind: "inbox" | "open" | "done"; mainParam: string }) {
  const messages = {
    inbox: { title: "You're all caught up", body: "Anything that needs you to send or receive will land here." },
    open: { title: "Nothing in motion", body: "Active transfers, waiting on someone, will show up here." },
    done: { title: "No history yet", body: "Completed transfers will be archived here." },
  };
  const m = messages[kind];
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <ArrowRightLeft className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">{m.title}</p>
          <p className="text-sm text-muted-foreground mt-1">{m.body}</p>
        </div>
        {kind !== "done" && (
          <Button size="sm" asChild>
            <Link to="/$main/store/transfers/new" params={{ main: mainParam }}>
              <Plus className="h-4 w-4 mr-1" /> New transfer
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
