import { useMemo, useRef, useState } from "react";
import { Search, PackageX, Loader2, Receipt, Wallet, Banknote, CreditCard, Landmark, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Badge } from "@repo/ui/badge";
import { Skeleton } from "@repo/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { useAuth } from "@/context/auth";
import { toLocalDateStr } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useStockPurchases, usePayStockPurchaseMutation } from "@/hooks/usePurchases";
import { useRegisterSession } from "@/hooks/useCashier";
import type { StockPurchaseListItem, StockPurchaseFilter } from "@/api/purchases";
import type { PurchasePaymentType } from "@repo/database";

const fmtK = (n: number): string => `${Number(Number(n).toFixed(3))} KWD`;

const ITEM_TYPE_LABEL: Record<string, string> = { fabric: "Fabric", shelf: "Shelf", accessory: "Accessory" };

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    unpaid: { label: "Unpaid", className: "bg-red-100 text-red-700 hover:bg-red-100" },
    partially_paid: { label: "Partial", className: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
    paid: { label: "Paid", className: "bg-green-100 text-green-700 hover:bg-green-100" },
};

const FILTERS: { key: StockPurchaseFilter; label: string }[] = [
    { key: "open", label: "To pay" },
    { key: "paid", label: "Settled" },
    { key: "all", label: "All" },
];

/**
 * §3 cashier Purchases queue. Lists stock-purchase payables (each a costed shop
 * fabric/shelf restock) and lets the cashier settle them. Cash settlements post
 * a drawer cash_out (open register required) and reconcile at EOD; non-cash
 * (knet/link/bank) just mark the purchase paid.
 */
export function StockPurchasesBody() {
    const [filter, setFilter] = useState<StockPurchaseFilter>("open");
    const [search, setSearch] = useState("");
    const [payTarget, setPayTarget] = useState<StockPurchaseListItem | null>(null);

    const { data: result, isLoading } = useStockPurchases(filter);
    const purchases = useMemo(() => result?.data ?? [], [result]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return purchases;
        return purchases.filter((p) =>
            (p.item_name ?? "").toLowerCase().includes(q) ||
            (p.supplier_name ?? "").toLowerCase().includes(q) ||
            String(p.id).includes(q),
        );
    }, [purchases, search]);

    const outstanding = useMemo(
        () => purchases.reduce((sum, p) => sum + (p.status === "paid" ? 0 : p.remaining), 0),
        [purchases],
    );

    return (
        <div className="relative h-full flex flex-col">
            <div className="px-4 py-3 border-b bg-card shrink-0">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-base font-bold">Stock Purchases</h1>
                        <p className="text-xs text-muted-foreground">
                            Fabric and shelf restocks awaiting payment
                        </p>
                    </div>
                    {filter === "open" && outstanding > 0 && (
                        <Badge variant="secondary" className="text-sm tabular-nums">
                            {fmtK(outstanding)} outstanding
                        </Badge>
                    )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by item, supplier, or purchase number"
                            className="pl-8 h-9 text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border p-0.5">
                        {FILTERS.map((f) => (
                            <button
                                key={f.key}
                                onClick={() => setFilter(f.key)}
                                className={cn(
                                    "px-3 h-8 rounded-md text-xs font-semibold transition-colors",
                                    filter === f.key
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4">
                {isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-16">
                        <PackageX className="h-10 w-10 mb-3 opacity-40" />
                        <p className="text-sm font-medium">
                            {purchases.length === 0
                                ? filter === "open" ? "No purchases to pay" : "No purchases"
                                : "No purchases match your search"}
                        </p>
                        <p className="text-xs mt-1">
                            Restocking fabric or shelf items adds a payable here.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map((p) => (
                            <PurchaseRow key={p.id} purchase={p} onPay={() => setPayTarget(p)} />
                        ))}
                    </div>
                )}
            </div>

            <PayPurchaseDialog purchase={payTarget} onClose={() => setPayTarget(null)} />
        </div>
    );
}

function PurchaseRow({ purchase, onPay }: { purchase: StockPurchaseListItem; onPay: () => void }) {
    const badge = STATUS_BADGE[purchase.status] ?? STATUS_BADGE.unpaid!;
    const date = toLocalDateStr(purchase.created_at);
    const isOpen = purchase.status !== "paid";
    return (
        <div className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{purchase.item_name ?? "Unknown item"}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {ITEM_TYPE_LABEL[purchase.item_type] ?? purchase.item_type}
                    </Badge>
                    <Badge className={cn("text-[10px] px-1.5 py-0", badge.className)}>{badge.label}</Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                    {purchase.qty} &times; {fmtK(purchase.unit_cost)}
                    {purchase.supplier_name && <> &middot; {purchase.supplier_name}</>}
                    {date && <> &middot; {date}</>}
                    {purchase.amount_paid > 0 && purchase.status !== "paid" && (
                        <> &middot; paid {fmtK(purchase.amount_paid)}</>
                    )}
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{fmtK(purchase.total_cost)}</div>
                {isOpen && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                        {fmtK(purchase.remaining)} left
                    </div>
                )}
            </div>
            {isOpen && (
                <Button size="sm" onClick={onPay}>
                    <Wallet className="h-4 w-4 mr-1.5" />
                    Pay
                </Button>
            )}
        </div>
    );
}

const PAYMENT_METHODS: { key: PurchasePaymentType; label: string; icon: LucideIcon; cash: boolean }[] = [
    { key: "cash", label: "Cash", icon: Banknote, cash: true },
    { key: "knet", label: "KNET", icon: CreditCard, cash: false },
    { key: "link_payment", label: "Link", icon: CreditCard, cash: false },
    { key: "bank_transfer", label: "Bank", icon: Landmark, cash: false },
    { key: "others", label: "Other", icon: MoreHorizontal, cash: false },
];

function PayPurchaseDialog({ purchase, onClose }: { purchase: StockPurchaseListItem | null; onClose: () => void }) {
    const { user } = useAuth();
    const { data: sessionResult } = useRegisterSession();
    const payMut = usePayStockPurchaseMutation();

    const [method, setMethod] = useState<PurchasePaymentType>("cash");
    const [amount, setAmount] = useState("");
    const [refNo, setRefNo] = useState("");
    const [note, setNote] = useState("");
    // Stable idempotency key per dialog opening — reused across retries so a
    // lost-response tail can't double-settle (or double the drawer cash_out).
    const idemKeyRef = useRef<string>(crypto.randomUUID());

    const open = purchase != null;
    const remaining = purchase?.remaining ?? 0;
    const session = sessionResult?.data ?? null;
    const registerOpen = session?.status === "open";
    const isCash = PAYMENT_METHODS.find((m) => m.key === method)?.cash ?? false;

    // Reset form state whenever a new purchase is opened.
    const lastIdRef = useRef<number | null>(null);
    if (open && purchase!.id !== lastIdRef.current) {
        lastIdRef.current = purchase!.id;
        idemKeyRef.current = crypto.randomUUID();
        setMethod("cash");
        setAmount(String(Number(remaining.toFixed(3))));
        setRefNo("");
        setNote("");
    }

    const parsedAmount = Number(amount || 0);
    const amountValid = parsedAmount > 0 && parsedAmount <= remaining + 1e-9;
    const cashBlocked = isCash && !registerOpen;
    const canSubmit = open && amountValid && !cashBlocked && !payMut.isPending && !!user?.id;

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!purchase || !user?.id) return;
        if (!amountValid) return;
        payMut.mutate(
            {
                purchaseId: purchase.id,
                amount: parsedAmount,
                paymentType: method,
                registerSessionId: isCash ? session?.id ?? null : null,
                paymentRefNo: refNo.trim() || null,
                note: note.trim() || null,
                userId: user.id,
                idempotencyKey: idemKeyRef.current,
            },
            {
                onSuccess: (res) => {
                    if (res.status === "success") onClose();
                },
            },
        );
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 pt-5 pb-4 border-b">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Receipt className="h-4 w-4 text-primary" />
                        Pay purchase
                    </DialogTitle>
                </DialogHeader>

                {purchase && (
                    <form onSubmit={handleSubmit}>
                        <div className="px-6 py-5 space-y-5">
                            <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold truncate">{purchase.item_name ?? "Unknown item"}</span>
                                    <span className="tabular-nums text-muted-foreground">{purchase.qty} &times; {fmtK(purchase.unit_cost)}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                                    <span>Total {fmtK(purchase.total_cost)}</span>
                                    <span className="font-medium text-foreground">{fmtK(remaining)} remaining</span>
                                </div>
                            </div>

                            {/* Payment method */}
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Method</Label>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {PAYMENT_METHODS.map((m) => {
                                        const Icon = m.icon;
                                        const active = method === m.key;
                                        return (
                                            <button
                                                key={m.key}
                                                type="button"
                                                onClick={() => setMethod(m.key)}
                                                className={cn(
                                                    "flex flex-col items-center gap-1 px-1 py-2 rounded-lg border text-[11px] font-medium transition-colors",
                                                    active
                                                        ? "border-primary bg-primary/5 text-primary"
                                                        : "border-input bg-card hover:bg-muted text-muted-foreground",
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                                {m.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {isCash && (
                                    <p className={cn("text-xs", cashBlocked ? "text-red-600" : "text-muted-foreground")}>
                                        {cashBlocked
                                            ? "Open the register (End of Day) to pay in cash, or use a non-cash method."
                                            : "Cash is paid out of the drawer and reconciles at end of day."}
                                    </p>
                                )}
                            </div>

                            {/* Amount */}
                            <div className="space-y-2">
                                <div className="flex items-baseline justify-between">
                                    <Label htmlFor="pay-amount" className="text-sm font-semibold">Amount</Label>
                                    <button
                                        type="button"
                                        className="text-xs text-primary hover:underline"
                                        onClick={() => setAmount(String(Number(remaining.toFixed(3))))}
                                    >
                                        Pay full ({fmtK(remaining)})
                                    </button>
                                </div>
                                <div className="relative">
                                    <Input
                                        id="pay-amount"
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        max={remaining}
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="pr-12 tabular-nums"
                                        autoFocus
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                        KWD
                                    </span>
                                </div>
                                {parsedAmount > remaining + 1e-9 && (
                                    <p className="text-xs text-red-600">Amount exceeds the remaining balance.</p>
                                )}
                            </div>

                            {/* Reference + note */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="pay-ref" className="text-xs text-muted-foreground">Reference</Label>
                                    <Input
                                        id="pay-ref"
                                        value={refNo}
                                        onChange={(e) => setRefNo(e.target.value)}
                                        placeholder="Txn / invoice #"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="pay-note" className="text-xs text-muted-foreground">Note</Label>
                                    <Input
                                        id="pay-note"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="Optional"
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
                            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={!canSubmit}>
                                {payMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                                Pay {amountValid && fmtK(parsedAmount)}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
