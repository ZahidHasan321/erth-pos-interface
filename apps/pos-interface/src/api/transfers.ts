import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import type { TransferRequest, TransferRequestItem } from '@repo/database';

const WRITE_RETRY_ATTEMPTS = 3;
const WRITE_RETRY_BASE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type UserRef = { id: string; username: string; name: string } | null;

export type TransferRequestWithItems = TransferRequest & {
  items: (TransferRequestItem & {
    fabric?: { id: number; name: string; shop_stock: number; workshop_stock: number } | null;
    shelf_item?: { id: number; type: string; brand: string; shop_stock: number; workshop_stock: number } | null;
    accessory?: { id: number; name: string; category: string; unit_of_measure: string; shop_stock: number; workshop_stock: number } | null;
  })[];
  requested_by_user?: UserRef;
  dispatched_by_user?: UserRef;
  received_by_user?: UserRef;
};

const TRANSFER_QUERY = `
  *,
  items:transfer_request_items(
    *,
    fabric:fabrics!fabric_id(id, name, shop_stock, workshop_stock),
    shelf_item:shelf!shelf_id(id, type, brand, shop_stock, workshop_stock),
    accessory:accessories!accessory_id(id, name, category, unit_of_measure, shop_stock, workshop_stock)
  ),
  requested_by_user:users!requested_by(id, username, name),
  dispatched_by_user:users!dispatched_by(id, username, name),
  received_by_user:users!received_by(id, username, name)
`;

export interface TransferFilters {
  status?: string | string[];
  direction?: string | string[];
  item_type?: string;
  brand?: string;
  /** ISO timestamp — inclusive lower bound on created_at */
  startDate?: string;
  /** ISO timestamp — inclusive upper bound on created_at */
  endDate?: string;
}

export const getTransferRequests = async (
  filters?: TransferFilters
): Promise<TransferRequestWithItems[]> => {
  let query = db.from('transfer_requests').select(TRANSFER_QUERY).order('created_at', { ascending: false });

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }
  if (filters?.direction) {
    if (Array.isArray(filters.direction)) {
      query = query.in('direction', filters.direction);
    } else {
      query = query.eq('direction', filters.direction);
    }
  }
  if (filters?.item_type) {
    query = query.eq('item_type', filters.item_type);
  }
  if (filters?.brand) {
    query = query.eq('brand', filters.brand);
  }
  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as TransferRequestWithItems[];
};

export interface TransferBadgeCounts {
  activeRequests: number;
  receivingDeliveries: number;
  sendRequests: number;
}

/**
 * Fetch sidebar badge counts in a single lightweight query (no joins).
 * Returns counts for: active outgoing requests, dispatched incoming, and
 * incoming requests the shop still needs to send (no approval step — §4).
 */
export const getTransferBadgeCounts = async (
  brand: string,
): Promise<TransferBadgeCounts> => {
  const [active, receiving, toSend] = await Promise.all([
    db
      .from('transfer_requests')
      .select('id', { count: 'exact', head: true })
      .eq('brand', brand)
      .eq('direction', 'workshop_to_shop')
      .in('status', ['requested', 'dispatched']),
    db
      .from('transfer_requests')
      .select('id', { count: 'exact', head: true })
      .eq('brand', brand)
      .eq('direction', 'workshop_to_shop')
      .eq('status', 'dispatched'),
    db
      .from('transfer_requests')
      .select('id', { count: 'exact', head: true })
      .eq('brand', brand)
      .eq('direction', 'shop_to_workshop')
      .eq('status', 'requested'),
  ]);

  return {
    activeRequests: active.count ?? 0,
    receivingDeliveries: receiving.count ?? 0,
    sendRequests: toSend.count ?? 0,
  };
};

export const createTransferRequest = async (request: {
  direction: string;
  item_type: string;
  brand: string;
  requested_by: string;
  notes?: string;
  items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; requested_qty: number }[];
}): Promise<TransferRequest> => {
  const { items, ...requestData } = request;

  const payload: Record<string, unknown> = { ...requestData };
  const idempotencyKey: string =
    (payload.idempotency_key as string | undefined) ?? crypto.randomUUID();
  payload.idempotency_key = idempotencyKey;

  let transferData: TransferRequest | null = null;
  for (let attempt = 1; ; attempt++) {
    const res = await db
      .from('transfer_requests')
      .insert(payload)
      .select()
      .single();

    if (!res.error) {
      transferData = res.data as TransferRequest;
      break;
    }

    // 23505 = a prior attempt's response was lost but the parent (and its
    // items, inserted by that committed attempt) DID commit. Recover the
    // parent and return it WITHOUT re-inserting items.
    if (res.error.code === '23505') {
      const recovered = await db
        .from('transfer_requests')
        .select()
        .eq('idempotency_key', idempotencyKey)
        .single();
      if (!recovered.error && recovered.data) {
        return recovered.data as TransferRequest;
      }
    }

    if (isTransientNetworkError(res.error) && attempt < WRITE_RETRY_ATTEMPTS) {
      await sleep(WRITE_RETRY_BASE_MS * attempt);
      continue;
    }

    throw res.error;
  }

  const itemsToInsert = items.map(item => ({
    ...item,
    transfer_request_id: (transferData as TransferRequest).id,
  }));

  const { error: itemsError } = await db
    .from('transfer_request_items')
    .insert(itemsToInsert);

  if (itemsError) throw itemsError;

  return transferData as TransferRequest;
};

// No approve/reject in the transfer flow (CLAUDE.md §4): a requested transfer is
// sent directly via dispatchTransfer (full/partial/none), and a still-requested
// transfer is withdrawn with deleteTransferRequest (transfers:cancel).

export const reviseTransferRequest = async (
  originalId: number,
  request: {
    direction: string;
    item_type: string;
    brand: string;
    requested_by: string;
    notes?: string;
    revision_number: number;
    items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; requested_qty: number }[];
  },
): Promise<TransferRequest> => {
  const { items, ...requestData } = request;

  const payload: Record<string, unknown> = { ...requestData, parent_request_id: originalId, status: 'requested' };
  const idempotencyKey: string =
    (payload.idempotency_key as string | undefined) ?? crypto.randomUUID();
  payload.idempotency_key = idempotencyKey;

  let transferData: TransferRequest | null = null;
  for (let attempt = 1; ; attempt++) {
    const res = await db
      .from('transfer_requests')
      .insert(payload)
      .select()
      .single();

    if (!res.error) {
      transferData = res.data as TransferRequest;
      break;
    }

    // 23505 = a prior attempt's response was lost but the parent (and its
    // items, inserted by that committed attempt) DID commit. Recover the
    // parent and return it WITHOUT re-inserting items.
    if (res.error.code === '23505') {
      const recovered = await db
        .from('transfer_requests')
        .select()
        .eq('idempotency_key', idempotencyKey)
        .single();
      if (!recovered.error && recovered.data) {
        return recovered.data as TransferRequest;
      }
    }

    if (isTransientNetworkError(res.error) && attempt < WRITE_RETRY_ATTEMPTS) {
      await sleep(WRITE_RETRY_BASE_MS * attempt);
      continue;
    }

    throw res.error;
  }

  const itemsToInsert = items.map(item => ({
    ...item,
    transfer_request_id: (transferData as TransferRequest).id,
  }));

  const { error: itemsError } = await db
    .from('transfer_request_items')
    .insert(itemsToInsert);

  if (itemsError) throw itemsError;

  return transferData as TransferRequest;
};

export const dispatchTransfer = async (
  transferId: number,
  dispatchedBy: string,
  items: { id: number; dispatched_qty: number }[],
): Promise<{ success: boolean; transfer_id: number }> => {
  const p_idempotency_key = crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc('dispatch_transfer', {
      p_transfer_id: transferId,
      p_dispatched_by: dispatchedBy,
      p_items: items,
      p_idempotency_key,
    }),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) throw error;
  return data as { success: boolean; transfer_id: number };
};

export const deleteTransferRequest = async (id: number): Promise<void> => {
  // Hard-delete is only allowed while the request is still in 'requested' status.
  // Guarding by status here prevents wiping an already-sent (dispatched) row if the
  // source races us. transfer_request_items has ON DELETE CASCADE so items clean up automatically.
  const { error } = await withWriteRetry(
    () => db
      .from('transfer_requests')
      .delete()
      .eq('id', id)
      .eq('status', 'requested'),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) throw error;
};

export interface TransferGroup {
  item_type: string;
  items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; requested_qty: number }[];
}

export interface SendGroup {
  item_type: string;
  items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; qty: number }[];
}

export interface BatchTransferResult {
  success: boolean;
  transfers: { transfer_id: number; item_type: string }[];
}

/**
 * Atomic fan-out for mixed-type carts. One Postgres transaction creates N
 * transfer_requests (one per item type). Either all succeed or all roll back.
 */
export const createTransferRequestsBatch = async (request: {
  direction: string;
  brand: string;
  requested_by: string;
  notes?: string;
  groups: TransferGroup[];
}): Promise<BatchTransferResult> => {
  const p_idempotency_key = crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc('create_transfer_requests_batch', {
      p_requested_by: request.requested_by,
      p_brand: request.brand,
      p_direction: request.direction,
      p_notes: request.notes ?? null,
      p_groups: request.groups,
      p_idempotency_key,
    }),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) throw error;
  return data as BatchTransferResult;
};

/**
 * Atomic fan-out for direct-send carts. Stock decrements + dispatched-state
 * transfer rows are all in one Postgres transaction.
 */
export const directSendTransfersBatch = async (request: {
  sender: string;
  brand: string;
  direction: string;
  notes?: string;
  groups: SendGroup[];
}): Promise<BatchTransferResult> => {
  const p_idempotency_key = crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc('direct_send_transfers_batch', {
      p_sender: request.sender,
      p_brand: request.brand,
      p_direction: request.direction,
      p_notes: request.notes ?? null,
      p_groups: request.groups,
      p_idempotency_key,
    }),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) throw error;
  return data as BatchTransferResult;
};

export const directSendTransfer = async (request: {
  sender: string;
  brand: string;
  direction: string;
  item_type: string;
  notes?: string;
  items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; qty: number }[];
}): Promise<{ success: boolean; transfer_id: number }> => {
  const p_idempotency_key = crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc('direct_send_transfer', {
      p_sender: request.sender,
      p_brand: request.brand,
      p_direction: request.direction,
      p_item_type: request.item_type,
      p_items: request.items,
      p_notes: request.notes ?? null,
      p_idempotency_key,
    }),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) throw error;
  return data as { success: boolean; transfer_id: number };
};

export const receiveTransfer = async (
  transferId: number,
  receivedBy: string,
  items: { id: number; received_qty: number; discrepancy_note?: string }[],
): Promise<{ success: boolean; transfer_id: number; has_discrepancy: boolean }> => {
  const p_idempotency_key = crypto.randomUUID();
  const { data, error } = await withWriteRetry(
    () => db.rpc('receive_transfer', {
      p_transfer_id: transferId,
      p_received_by: receivedBy,
      p_items: items,
      p_idempotency_key,
    }),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) throw error;
  return data as { success: boolean; transfer_id: number; has_discrepancy: boolean };
};
