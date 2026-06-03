import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightLeft, Plus, Loader2, AlertCircle, Inbox } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { SearchInput } from "@/components/shared/SearchInput";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { useAuth } from "@/context/auth";
import { useTransferRequests } from "@/hooks/useTransfers";
import { primaryActionFor, personalAwaitingLabel, itemNamesPreview, isStale, staleDays, lastEventAt, sourceSideOf, destinationSideOf } from "@/lib/transfers";
import { TransferStatusBadge, ItemTypeBadge } from "@/components/store/transfer-status-badge";
import { TransferDetailDrawer } from "@/components/transfers/TransferDetailDrawer";
import { PageHeader, StatusBanner, EmptyState as SharedEmptyState } from "@/components/shared/PageShell";
import type { TransferRequestWithItems } from "@/api/transfers";
import type { AuthUser } from "@/lib/rbac";

type TabKey = "inbox" | "open" | "done";

// URL is the source of truth for tab + filters so a view is shareable and a
// notification can target a tab. Defaults (inbox, no filters) are omitted.
type TransfersSearch = {
  tab?: TabKey;
  q?: string;
  direction?: "shop_to_workshop" | "workshop_to_shop";
  itemType?: "fabric" | "shelf" | "accessory";
};

const isTab = (v: unknown): v is TabKey => v === "inbox" || v === "open" || v === "done";

export const Route = createFileRoute("/(main)/store/transfers")({
  component: TransfersPage,
  head: () => ({ meta: [{ title: "Transfers" }] }),
  validateSearch: (raw: Record<string, unknown>): TransfersSearch => ({
    tab: isTab(raw.tab) ? raw.tab : undefined,
    q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
    direction:
      raw.direction === "shop_to_workshop" || raw.direction === "workshop_to_shop"
        ? raw.direction
        : undefined,
    itemType:
      raw.itemType === "fabric" || raw.itemType === "shelf" || raw.itemType === "accessory"
        ? raw.itemType
        : undefined,
  }),
});

function isOpen(t: TransferRequestWithItems) {
  return t.status !== "received" && t.status !== "rejected";
}

function TransfersPage() {
  const { user } = useAuth();

  // URL is the source of truth for tab + filters; defaults applied on read.
  const sp = Route.useSearch();
  const tab = sp.tab ?? "inbox";
  const search = sp.q ?? "";
  const direction = sp.direction ?? "all";
  const itemType = sp.itemType ?? "all";
  const navigate = Route.useNavigate();
  const setTab = (v: TabKey) =>
    navigate({ search: (prev) => ({ ...prev, tab: v === "inbox" ? undefined : v }), replace: true });
  const setSearch = (v: string) =>
    navigate({ search: (prev) => ({ ...prev, q: v || undefined }), replace: true });
  const setDirection = (v: string) =>
    navigate({ search: (prev) => ({ ...prev, direction: v === "all" ? undefined : (v as TransfersSearch["direction"]) }), replace: true });
  const setItemType = (v: string) =>
    navigate({ search: (prev) => ({ ...prev, itemType: v === "all" ? undefined : (v as TransfersSearch["itemType"]) }), replace: true });
  const [drawer, setDrawer] = useState<TransferRequestWithItems | null>(null);

  const { data: transfers = [], isLoading } = useTransferRequests();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transfers.filter((t) => {
      if (tab === "inbox" && !primaryActionFor(user, t)) return false;
      if (tab === "open" && !isOpen(t)) return false;
      if (tab === "done" && isOpen(t)) return false;

      if (direction !== "all" && t.direction !== direction) return false;
      if (itemType !== "all" && t.item_type !== itemType) return false;

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
  }, [transfers, tab, direction, itemType, search, user]);

  const counts = useMemo(() => ({
    inbox: transfers.filter((t) => primaryActionFor(user, t)).length,
    open: transfers.filter(isOpen).length,
    done: transfers.filter((t) => !isOpen(t)).length,
    stale: transfers.filter((t) => isStale(t)).length,
  }), [transfers, user]);

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-10">
      <PageHeader icon={ArrowRightLeft} title="Transfers">
        <Button asChild>
          <Link to="/store/transfers/new">
            <Plus className="h-4 w-4 mr-1" /> New transfer
          </Link>
        </Button>
      </PageHeader>

      {counts.stale > 0 && tab !== "done" && (
        <div className="mb-3">
          <StatusBanner tone="warn" icon={AlertCircle}>
            {counts.stale} transfer{counts.stale !== 1 ? "s" : ""} stuck for over 3 days — see the In flight tab.
          </StatusBanner>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="mb-4">
          <TabsTrigger value="inbox" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" />
            Needs you
            {counts.inbox > 0 && <CountBadge tone="warn" value={counts.inbox} />}
          </TabsTrigger>
          <TabsTrigger value="open" className="gap-1.5">
            In flight <CountBadge tone="muted" value={counts.open} />
          </TabsTrigger>
          <TabsTrigger value="done" className="gap-1.5">
            Done <CountBadge tone="muted" value={counts.done} />
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search ID, item, requester…"
            className="flex-1 min-w-[240px] max-w-md"
          />
          <SlidingPillSwitcher
            value={direction}
            onChange={setDirection}
            size="sm"
            options={[
              { value: "all", label: "All directions" },
              { value: "shop_to_workshop", label: "Shop → Workshop" },
              { value: "workshop_to_shop", label: "Workshop → Shop" },
            ]}
          />
          <SlidingPillSwitcher
            value={itemType}
            onChange={setItemType}
            size="sm"
            options={[
              { value: "all", label: "All types" },
              { value: "fabric", label: "Fabric" },
              { value: "shelf", label: "Shelf" },
              { value: "accessory", label: "Accessory" },
            ]}
          />
        </div>

        <TabsContent value="inbox">
          <TransfersList rows={filtered} loading={isLoading} onSelect={setDrawer} user={user} emptyKind="inbox" />
        </TabsContent>
        <TabsContent value="open">
          <TransfersList rows={filtered} loading={isLoading} onSelect={setDrawer} user={user} emptyKind="open" />
        </TabsContent>
        <TabsContent value="done">
          <TransfersList rows={filtered} loading={isLoading} onSelect={setDrawer} user={user} emptyKind="done" />
        </TabsContent>
      </Tabs>

      <TransferDetailDrawer open={!!drawer} onClose={() => setDrawer(null)} transfer={drawer} />
    </div>
  );
}

function CountBadge({ value, tone }: { value: number; tone: "warn" | "muted" }) {
  if (value === 0 && tone === "warn") return null;
  const cls = tone === "warn"
    ? "bg-[var(--status-warn-bg)] text-[var(--status-warn)]"
    : "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-[11px] font-medium ${cls}`}>{value}</span>;
}

function TransfersList({
  rows, loading, onSelect, user, emptyKind,
}: {
  rows: TransferRequestWithItems[];
  loading: boolean;
  onSelect: (t: TransferRequestWithItems) => void;
  user: AuthUser | null;
  emptyKind: "inbox" | "open" | "done";
}) {
  if (loading) {
    return <Card><CardContent className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>;
  }

  if (rows.length === 0) {
    return <EmptyTransferState kind={emptyKind} />;
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
    <span title={`Stuck ${staleDays(t)} days`} className="inline-block h-2 w-2 rounded-full bg-[var(--status-warn)]" />
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
        <span className={action ? "text-[var(--status-warn)] font-medium" : "text-muted-foreground"}>{personalAwaitingLabel(user, t)}</span>
        {at && <span className="block text-[11px] text-muted-foreground/70 mt-0.5">{new Date(at).toLocaleDateString()}</span>}
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
          <p className={`text-xs ${action ? "text-[var(--status-warn)] font-medium" : "text-muted-foreground"}`}>{personalAwaitingLabel(user, t)}</p>
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

function EmptyTransferState({ kind }: { kind: "inbox" | "open" | "done" }) {
  const messages = {
    inbox: { title: "You're all caught up", body: "Anything that needs you to send or receive will land here." },
    open: { title: "Nothing in motion", body: "Active transfers — waiting on someone — will show up here." },
    done: { title: "No history yet", body: "Completed transfers will be archived here." },
  };
  const m = messages[kind];
  return (
    <div className="space-y-3">
      <SharedEmptyState icon={ArrowRightLeft} message={`${m.title} — ${m.body}`} />
      {kind !== "done" && (
        <div className="flex justify-center">
          <Button size="sm" asChild>
            <Link to="/store/transfers/new">
              <Plus className="h-4 w-4 mr-1" /> New transfer
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
