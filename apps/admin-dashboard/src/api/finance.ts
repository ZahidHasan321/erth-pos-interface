/**
 * Admin Finance API layer.
 *
 * Thin typed wrappers over the read-only RPCs in
 * packages/database/migrations/0045_admin_finance_rpcs.sql. Every RPC is
 * SECURITY DEFINER + is_admin()-gated server-side and cross-brand
 * (p_brands NULL/[] = all brands). Money figures are computed with the same
 * reconciliation identity the cashier's close_register uses, so these numbers
 * tie out to the drawer.
 */
import { db } from "@/lib/db";

// ── 1. Finance summary (Overview) ────────────────────────────────────────────

export interface MethodTotal {
  payment_type: string;
  collected: number | string;
  refunded: number | string;
  net: number | string;
  count: number;
}
export interface CashCategory {
  type: string;
  reason_category: string;
  amount: number | string;
  count: number;
}
export interface PurchaseMethodTotal {
  payment_type: string;
  amount: number | string;
  count: number;
}

export interface FinanceSummary {
  range: { from: string; to: string };
  brands: string[] | null;
  totals: { collected: number | string; refunded: number | string; net: number | string; tx_count: number };
  by_method: MethodTotal[];
  cash_flow: { cash_in: number | string; cash_out: number | string; by_category: CashCategory[] };
  purchases: {
    payables_created_count: number;
    payables_created_amount: number | string;
    settled_amount: number | string;
    settled_by_method: PurchaseMethodTotal[];
    outstanding_now_amount: number | string;
    outstanding_now_count: number;
  };
  registers: {
    open_count: number;
    closed_count: number;
    total_variance: number | string;
    over_count: number;
    short_count: number;
  };
}

export async function getFinanceSummary(
  from: string,
  to: string,
  brands: string[] | null,
): Promise<FinanceSummary> {
  const { data, error } = await db.rpc("admin_finance_summary", {
    p_from: from,
    p_to: to,
    p_brands: brands && brands.length ? brands : null,
  });
  if (error) throw new Error(`Failed to load finance summary: ${error.message}`);
  return data as FinanceSummary;
}

// ── 2. Transactions ledger (keyset) ──────────────────────────────────────────

export interface TxnCursor { created_at: string; id: number }

export interface TransactionRow {
  id: number;
  order_id: number;
  amount: number | string;
  transaction_type: string;
  payment_type: string | null;
  refund_reason: string | null;
  payment_ref_no: string | null;
  payment_note: string | null;
  register_session_id: number | null;
  created_at: string;
  brand: string;
  invoice_number: number | null;
  customer_name: string | null;
  cashier_name: string | null;
}

export interface TxnStats {
  count: number;
  total_in: number | string;
  total_out: number | string;
  net: number | string;
}

export interface TransactionsPage {
  data: TransactionRow[];
  next_cursor: TxnCursor | null;
  stats: TxnStats | null;
}

export interface TransactionsParams {
  cursor?: TxnCursor | null;
  pageSize?: number;
  brands?: string[] | null;
  txnType?: string | null;
  paymentType?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
}

export async function getTransactionsPage(params: TransactionsParams): Promise<TransactionsPage> {
  const { data, error } = await db.rpc("admin_transactions_page", {
    p_cursor: params.cursor ?? null,
    p_page_size: params.pageSize ?? 40,
    p_brands: params.brands && params.brands.length ? params.brands : null,
    p_txn_type: params.txnType ?? null,
    p_payment_type: params.paymentType ?? null,
    p_search: params.search ?? null,
    p_from: params.from ?? null,
    p_to: params.to ?? null,
  });
  if (error) throw new Error(`Failed to load transactions: ${error.message}`);
  return data as TransactionsPage;
}

// ── 3. Registers (EOD drawers) ───────────────────────────────────────────────

export interface RegisterRow {
  id: number;
  brand: string;
  date: string;
  status: string;
  opening_float: number | string;
  closing_counted_cash: number | string | null;
  expected_cash: number | string;
  live_expected: number | string;
  variance: number | string | null;
  cash_payments: number | string;
  cash_refunds: number | string;
  cash_in: number | string;
  cash_out: number | string;
  tx_count: number;
  opened_by_name: string | null;
  opened_at: string;
  closed_by_name: string | null;
  closed_at: string | null;
  reopened_at: string | null;
}

export interface RegistersStats {
  session_count: number;
  open_count: number;
  closed_count: number;
  total_expected: number | string;
  total_counted: number | string;
  total_variance: number | string;
}

export interface RegistersPage {
  data: RegisterRow[];
  stats: RegistersStats;
}

export async function getRegistersPage(
  from: string,
  to: string,
  brands: string[] | null,
  status: string | null,
): Promise<RegistersPage> {
  const { data, error } = await db.rpc("admin_registers_page", {
    p_from: from,
    p_to: to,
    p_brands: brands && brands.length ? brands : null,
    p_status: status ?? null,
  });
  if (error) throw new Error(`Failed to load registers: ${error.message}`);
  return data as RegistersPage;
}

// ── 4. Register detail ───────────────────────────────────────────────────────

export interface Reconciliation {
  opening_float: number | string;
  cash_payments: number | string;
  cash_refunds: number | string;
  cash_in: number | string;
  cash_out: number | string;
  expected: number | string;
  counted: number | string | null;
  variance: number | string | null;
}
export interface CashMovementRow {
  id: number;
  type: string;
  reason_category: string;
  amount: number | string;
  reason: string;
  performed_by_name: string | null;
  created_at: string;
}
export interface CloseEventRow {
  id: number;
  closed_by_name: string | null;
  closed_at: string;
  opening_float: number | string;
  counted_cash: number | string;
  expected_cash: number | string;
  variance: number | string;
  notes: string | null;
}
export interface SessionTxnRow {
  id: number;
  order_id: number;
  invoice_number: number | null;
  amount: number | string;
  transaction_type: string;
  payment_type: string | null;
  refund_reason: string | null;
  payment_ref_no: string | null;
  cashier_name: string | null;
  created_at: string;
}
export interface RegisterDetail {
  session: {
    id: number;
    brand: string;
    date: string;
    status: string;
    opening_float: number | string;
    closing_counted_cash: number | string | null;
    expected_cash: number | string | null;
    variance: number | string | null;
    closing_notes: string | null;
    opened_by_name: string | null;
    opened_at: string;
    closed_by_name: string | null;
    closed_at: string | null;
    reopened_by_name: string | null;
    reopened_at: string | null;
  };
  reconciliation: Reconciliation;
  by_method: MethodTotal[];
  cash_movements: CashMovementRow[];
  close_events: CloseEventRow[];
  transactions: SessionTxnRow[];
}

export async function getRegisterDetail(sessionId: number): Promise<RegisterDetail | null> {
  const { data, error } = await db.rpc("admin_register_detail", { p_session_id: sessionId });
  if (error) throw new Error(`Failed to load register ${sessionId}: ${error.message}`);
  return (data as RegisterDetail | null) ?? null;
}

// ── 5. Purchases ledger (money out) ──────────────────────────────────────────

export interface PurchaseCursor { created_at: string; id: number }

export interface PurchaseRow {
  id: number;
  created_at: string;
  brand: string;
  item_type: string;
  item_id: number;
  item_name: string | null;
  qty: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  amount_paid: number | string;
  outstanding: number | string;
  status: string;
  supplier_id: number | null;
  supplier_name: string | null;
  invoice_image_url: string | null;
  created_by_name: string | null;
}

export interface PurchasesStats {
  count: number;
  total_payable: number | string;
  total_paid: number | string;
  total_outstanding: number | string;
}

export interface PurchasesPage {
  data: PurchaseRow[];
  next_cursor: PurchaseCursor | null;
  stats: PurchasesStats | null;
}

export interface PurchasesParams {
  cursor?: PurchaseCursor | null;
  pageSize?: number;
  brands?: string[] | null;
  status?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
}

export async function getPurchasesPage(params: PurchasesParams): Promise<PurchasesPage> {
  const { data, error } = await db.rpc("admin_purchases_page", {
    p_cursor: params.cursor ?? null,
    p_page_size: params.pageSize ?? 30,
    p_brands: params.brands && params.brands.length ? params.brands : null,
    p_status: params.status ?? null,
    p_search: params.search ?? null,
    p_from: params.from ?? null,
    p_to: params.to ?? null,
  });
  if (error) throw new Error(`Failed to load purchases: ${error.message}`);
  return data as PurchasesPage;
}

// ── 6. Purchase detail ───────────────────────────────────────────────────────

export interface PurchasePaymentRow {
  id: number;
  amount: number | string;
  payment_type: string;
  register_session_id: number | null;
  register_cash_movement_id: number | null;
  payment_ref_no: string | null;
  note: string | null;
  paid_by_name: string | null;
  paid_at: string;
}

export interface PurchaseDetail {
  purchase: PurchaseRow & { notes: string | null };
  payments: PurchasePaymentRow[];
}

export async function getPurchaseDetail(purchaseId: number): Promise<PurchaseDetail | null> {
  const { data, error } = await db.rpc("admin_purchase_detail", { p_purchase_id: purchaseId });
  if (error) throw new Error(`Failed to load purchase ${purchaseId}: ${error.message}`);
  return (data as PurchaseDetail | null) ?? null;
}
