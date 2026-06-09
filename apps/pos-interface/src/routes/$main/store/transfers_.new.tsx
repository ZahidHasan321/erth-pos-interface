import { useState, useMemo, useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Minus, ArrowRight, AlertCircle, MessageSquarePlus, Send, ShoppingCart, Trash2, ChevronLeft, ArrowRightLeft, Search, Check } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Textarea } from "@repo/ui/textarea";
import { Separator } from "@repo/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/tooltip";
import { useAuth } from "@/context/auth";
import { useCreateTransfersBatch, useDirectSendTransfersBatch } from "@/hooks/useTransfers";
import { getAccessories } from "@/api/accessories";
import { ITEM_TYPE_LABELS, UNIT_OF_MEASURE_LABELS } from "@/components/store/transfer-constants";

type Unit = "pieces" | "meters" | "rolls" | "kg";

const UNIT_STEP: Record<Unit, number> = {
  pieces: 1,
  rolls: 1,
  meters: 0.5,
  kg: 0.1,
};

function unitLabel(u: Unit): string {
  return UNIT_OF_MEASURE_LABELS[u] ?? u;
}

export const Route = createFileRoute("/$main/store/transfers_/new")({
  component: NewTransferPage,
  head: () => ({ meta: [{ title: "New transfer" }] }),
});

// Only accessories ever transfer — fabric/shelf live solely on the shop side and
// never cross to the workshop (§4), so there is no item-type choice to make.
type ItemType = "accessory";
type Direction = "shop_to_workshop" | "workshop_to_shop";
type Mode = "request" | "send";
type CartLine = { itemId: number; itemType: ItemType; qty: number; name: string; sourceStock: number; unit: Unit; step: number };

// Cart auto-saves to localStorage so a refresh, accidental nav-away, or
// closed tab doesn't lose what the user typed in. The "Clear" button is the
// explicit escape hatch. Drafts older than 7 days are dropped on load.
const DRAFT_KEY = "transfer-new-draft-v1";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface TransferDraft {
  cart: CartLine[];
  notes: string;
  mode: Mode;
  adminDirection: Direction;
  savedAt: number;
}

function loadDraft(): TransferDraft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TransferDraft;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

function clearDraft() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(DRAFT_KEY);
}

function NewTransferPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = Route.useParams();

  const userSide: "shop" | "workshop" | null =
    user?.department === "shop" ? "shop" :
    user?.department === "workshop" ? "workshop" :
    null;

  // Hydrate from localStorage on first mount. useState lazy initializer runs
  // exactly once, so refreshes/back-nav restore the cart without a flicker.
  const draft = useRef<TransferDraft | null>(loadDraft()).current;

  const [mode, setMode] = useState<Mode>(draft?.mode ?? "request");
  // Staff with a side: directions are derived from mode + userSide.
  //   Request = "other side sends to me" → source = other side.
  //   Send now = "I push to other side"  → source = my side.
  // Admin (no side) keeps a manual direction picker for both modes.
  const requestDirection: Direction = userSide === "workshop" ? "shop_to_workshop" : "workshop_to_shop";
  const sendDirection: Direction = userSide === "shop" ? "shop_to_workshop" : "workshop_to_shop";

  const [adminDirection, setAdminDirection] = useState<Direction>(draft?.adminDirection ?? requestDirection);
  const itemType: ItemType = "accessory";
  const [cart, setCart] = useState<CartLine[]>(draft?.cart ?? []);
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState(draft?.notes ?? "");

  const createMut = useCreateTransfersBatch();
  const sendMut = useDirectSendTransfersBatch();
  const submitting = createMut.isPending || sendMut.isPending;

  // Persist on every meaningful change. Don't persist on the very first render
  // when nothing changed yet — useEffect runs after mount, so the first save
  // mirrors whatever the draft (or defaults) gave us, which is fine.
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    // Empty cart + empty notes = nothing worth saving. Clear instead so an
    // empty form doesn't keep an empty draft alive forever.
    if (cart.length === 0 && notes.trim() === "") {
      clearDraft();
      return;
    }
    const payload: TransferDraft = {
      cart, notes, mode, adminDirection, savedAt: Date.now(),
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {
      // Quota exceeded or storage disabled — silent. Cart still works in-memory.
    }
  }, [cart, notes, mode, adminDirection]);

  const { data: accessories = [], isLoading: optionsLoading } = useQuery({ queryKey: ["accessories"], queryFn: () => getAccessories(), staleTime: 60_000 });

  const effectiveDirection: Direction = userSide
    ? (mode === "send" ? sendDirection : requestDirection)
    : adminDirection;
  const sourceLabel = effectiveDirection === "shop_to_workshop" ? "Shop" : "Workshop";
  const destLabel = effectiveDirection === "shop_to_workshop" ? "Workshop" : "Shop";

  const options = useMemo(() => {
    return accessories.map((a) => {
      const unit = (a.unit_of_measure ?? "pieces") as Unit;
      return {
        id: a.id,
        label: a.name,
        sourceStock: effectiveDirection === "shop_to_workshop" ? Number(a.shop_stock ?? 0) : Number(a.workshop_stock ?? 0),
        unit,
        step: UNIT_STEP[unit] ?? 1,
      };
    });
  }, [accessories, effectiveDirection]);

  const cartWithCurrentStock = useMemo(() => cart.map((line) => {
    const opt = options.find((o) => o.id === line.itemId);
    return opt ? { ...line, sourceStock: opt.sourceStock } : line;
  }), [cart, options]);

  const cartKeys = useMemo(() => new Set(cart.map((l) => `${l.itemType}:${l.itemId}`)), [cart]);
  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const hasInsufficientInCart = cartWithCurrentStock.some((l) => l.qty > l.sourceStock);
  const blockingInsufficient = mode === "send" && hasInsufficientInCart;
  const hasZeroQtyInCart = cart.some((l) => l.qty <= 0);
  const totalQty = cartWithCurrentStock.reduce((s, l) => s + l.qty, 0);

  function addToCart(opt: (typeof options)[number]) {
    const key = `${itemType}:${opt.id}`;
    if (cartKeys.has(key)) return;
    setCart((prev) => [...prev, {
      itemId: opt.id,
      itemType,
      qty: opt.step,
      name: opt.label,
      sourceStock: opt.sourceStock,
      unit: opt.unit,
      step: opt.step,
    }]);
  }

  function removeFromCart(type: ItemType, itemId: number) {
    setCart((prev) => prev.filter((l) => !(l.itemType === type && l.itemId === itemId)));
  }

  function updateCartQty(type: ItemType, itemId: number, qty: number) {
    const safe = Math.max(0, Number(qty.toFixed(2)));
    setCart((prev) => prev.map((l) => l.itemType === type && l.itemId === itemId ? { ...l, qty: safe } : l));
  }

  function bumpCartQty(type: ItemType, itemId: number, delta: number) {
    setCart((prev) => prev.map((l) => l.itemType === type && l.itemId === itemId ? { ...l, qty: Math.max(0, Number((l.qty + delta).toFixed(2))) } : l));
  }

  function backToList() {
    navigate({ to: "/$main/store/transfers", params });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      toast.error("Add at least one item to the cart");
      return;
    }
    // The batch RPCs reject non-positive quantities and roll back the whole
    // atomic batch — catch it here with an actionable message instead.
    const zeroLines = cart.filter((l) => l.qty <= 0);
    if (zeroLines.length > 0) {
      toast.error(
        zeroLines.length === cart.length
          ? "Set a quantity for every item before submitting"
          : `${zeroLines.length} item(s) have no quantity, set or remove them`,
      );
      return;
    }

    // Every line is an accessory, so the whole cart is one transfer request
    // (the DB stores one item_type per request). The batch RPC commits it in a
    // single Postgres transaction — all or nothing, no partial success.
    const trimmedNotes = notes.trim() || undefined;
    const itemWord = cart.length !== 1 ? "items" : "item";

    try {
      if (mode === "send") {
        const groups = [{
          item_type: "accessory" as ItemType,
          items: cart.map((l) => ({ qty: l.qty, accessory_id: l.itemId })),
        }];
        await sendMut.mutateAsync({ direction: sendDirection, notes: trimmedNotes, groups });
        clearDraft();
        toast.success(`Sent ${cart.length} ${itemWord} to ${destLabel}`);
        backToList();
      } else {
        const groups = [{
          item_type: "accessory" as ItemType,
          items: cart.map((l) => ({ requested_qty: l.qty, accessory_id: l.itemId })),
        }];
        await createMut.mutateAsync({ direction: effectiveDirection, notes: trimmedNotes, groups });
        clearDraft();
        toast.success(`Requested ${cart.length} ${itemWord} from ${sourceLabel}`);
        backToList();
      }
    } catch (err: unknown) {
      // Batch is atomic — failure means nothing was written. Cart stays
      // populated and the localStorage draft is preserved so the user can
      // retry without re-typing.
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(mode === "send" ? `Could not send: ${msg}` : `Could not create transfer: ${msg}`);
    }
  }

  const sendDisabled = !userSide;

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto pb-20">
      {/* Header */}
      <div className="mb-5">
        <Link
          to="/$main/store/transfers"
          params={params}
          
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to transfers
        </Link>
        <h1 className="text-xl font-bold tracking-tight mt-2 flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5" /> New transfer
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {mode === "request"
            ? `Pick the accessories you need from ${sourceLabel}.`
            : `Pick the accessories to send to ${destLabel}. Stock leaves ${sourceLabel} as soon as you submit.`}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: setup + picker */}
          <div className="lg:col-span-2 space-y-5">
            {/* Direction — admins (no side affiliation) choose it explicitly;
                staff direction is derived from mode. There is no item-type
                choice: every transfer is accessories (§4). */}
            {!userSide && (
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <Label>Direction</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <DirectionTile
                        active={adminDirection === "workshop_to_shop"}
                        from="Workshop"
                        to="Shop"
                        onClick={() => setAdminDirection("workshop_to_shop")}
                      />
                      <DirectionTile
                        active={adminDirection === "shop_to_workshop"}
                        from="Shop"
                        to="Workshop"
                        onClick={() => setAdminDirection("shop_to_workshop")}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Picker — searchable list of source-side accessories */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <Label className="text-base">Add items</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tap an item from <span className="font-medium">{sourceLabel}</span> to add it. Adjust quantities in the cart.
                  </p>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${sourceLabel.toLowerCase()} ${ITEM_TYPE_LABELS[itemType].toLowerCase()}…`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="rounded-lg border divide-y max-h-[360px] overflow-y-auto">
                  {optionsLoading ? (
                    <div className="py-10 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : filteredOptions.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      {search ? `No items match "${search}"` : "No items available"}
                    </div>
                  ) : (
                    filteredOptions.map((o) => {
                      const inCart = cartKeys.has(`${itemType}:${o.id}`);
                      const outOfStock = o.sourceStock <= 0;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => addToCart(o)}
                          disabled={inCart}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition-colors ${
                            inCart
                              ? "bg-primary/5 cursor-default"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{o.label}</p>
                            {/* Source stock is hidden in request mode — the requester
                                can't see the other side's count (CLAUDE.md §4). */}
                            {mode === "send" && (
                              <p className={`text-[11px] mt-0.5 ${outOfStock ? "text-red-600" : "text-muted-foreground"}`}>
                                {sourceLabel} stock: <span className="tabular-nums font-medium">{o.sourceStock}</span> {unitLabel(o.unit)}
                              </p>
                            )}
                          </div>
                          {inCart ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary shrink-0">
                              <Check className="h-3.5 w-3.5" /> In cart
                            </span>
                          ) : (
                            <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Right: cart (sticky) */}
          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-4">
              <CardContent className="p-4">
                {/* Mode tiles — anchored to the cart panel so the user sees
                    "what does Submit do" right next to the Submit button.
                    Stacked (not side-by-side) because the cart column is narrow. */}
                <div className="space-y-2 mb-3">
                  <ModeTile
                    active={mode === "request"}
                    icon={<MessageSquarePlus className="h-4 w-4" />}
                    title="Request"
                    body="Ask the other side for items. They send what they have."
                    onClick={() => setMode("request")}
                  />
                  <ModeTile
                    active={mode === "send"}
                    icon={<Send className="h-4 w-4" />}
                    title="Send now"
                    body={sendDisabled
                      ? "Pick a side first (admins can't send)."
                      : "Ship items right away. Stock leaves now."}
                    onClick={() => !sendDisabled && setMode("send")}
                    disabled={sendDisabled}
                  />
                </div>

                <div className="flex items-center justify-between mb-3">
                  <Label className="flex items-center gap-1.5 text-base">
                    <ShoppingCart className="h-4 w-4" />
                    Cart <span className="text-muted-foreground font-normal">({cart.length})</span>
                  </Label>
                  {cart.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => { setCart([]); setNotes(""); clearDraft(); }}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-8 text-center">
                    <ShoppingCart className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground mt-2">No items yet</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Items you add appear here.</p>
                  </div>
                ) : (
                  <div className="rounded-lg border divide-y max-h-[480px] overflow-y-auto">
                    {cartWithCurrentStock.map((line) => {
                      const overStock = line.qty > line.sourceStock;
                      return (
                        <div key={`${line.itemType}:${line.itemId}`} className="px-3 py-2.5 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium truncate">{line.name}</p>
                                {/* Over-stock warning is send-mode only — in request mode
                                    the requester can't see the source's stock (§4). */}
                                {overStock && mode === "send" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label="Stock warning"
                                        className="shrink-0 rounded-full text-red-600 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      >
                                        <AlertCircle className="h-3.5 w-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[240px] text-sm leading-snug px-3 py-2 font-medium">
                                      Only {line.sourceStock} {unitLabel(line.unit)} available right now
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              {mode === "send" && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {sourceLabel} stock: <span className="tabular-nums">{line.sourceStock}</span> {unitLabel(line.unit)}
                                </p>
                              )}
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600" onClick={() => removeFromCart(line.itemType, line.itemId)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => bumpCartQty(line.itemType, line.itemId, -line.step)}
                              disabled={line.qty <= 0}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Input
                              type="number"
                              min={0}
                              step={line.step}
                              value={String(line.qty)}
                              onChange={(e) => updateCartQty(line.itemType, line.itemId, Number(e.target.value) || 0)}
                              onFocus={(e) => e.currentTarget.select()}
                              className={`w-[64px] h-7 text-center px-1 ${overStock && mode === "send" ? "border-red-300 focus-visible:ring-red-200" : ""}`}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => bumpCartQty(line.itemType, line.itemId, line.step)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-left">{unitLabel(line.unit)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Review summary */}
                {cart.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-1.5 text-sm">
                      <p className="font-medium">
                        {mode === "send" ? `Sending to ${destLabel}` : `Requesting from ${sourceLabel}`}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Items</span>
                        <span className="font-medium tabular-nums">{cart.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Total qty</span>
                        <span className="font-medium tabular-nums">{totalQty}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Notes — last thing before submitting, kept inside the cart
                    panel since it's part of the "review and send" step. */}
                {cart.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <Label htmlFor="nt-notes" className="text-xs text-muted-foreground">Notes (optional)</Label>
                    <Textarea
                      id="nt-notes"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anything the other side should know…"
                      className="text-sm resize-none"
                    />
                  </div>
                )}

                {/* Action buttons */}
                <div className="mt-4 space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting || cart.length === 0 || blockingInsufficient || hasZeroQtyInCart}
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                    {mode === "send" ? (
                      <><Send className="h-4 w-4 mr-1.5" />Send to {destLabel}{cart.length > 0 ? ` (${cart.length})` : ""}</>
                    ) : (
                      <>Request from {sourceLabel}{cart.length > 0 ? ` (${cart.length})` : ""}</>
                    )}
                  </Button>
                  <Button type="button" variant="outline" className="w-full" onClick={backToList}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}


function ModeTile({ active, icon, title, body, onClick, disabled }: { active: boolean; icon: React.ReactNode; title: string; body: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : active
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "hover:border-foreground/30 hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span>{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">{body}</p>
    </button>
  );
}

function DirectionTile({ active, from, to, onClick }: { active: boolean; from: string; to: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition-all ${active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-foreground/30 hover:bg-muted/40"}`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>{from}</span>
        <ArrowRight className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
        <span>{to}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">
        {from} sends, {to} receives
      </p>
    </button>
  );
}
