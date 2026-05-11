import { db } from "@/lib/db";
import type { TransferRequest, TransferRequestItem } from '@repo/database';

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

export async function getTransferRequests(filters?: TransferFilters): Promise<TransferRequestWithItems[]> {
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
}

export async function createTransferRequest(request: {
  direction: string;
  item_type: string;
  brand: string;
  requested_by: string;
  notes?: string;
  items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; requested_qty: number }[];
}): Promise<TransferRequest> {
  const { items, ...requestData } = request;

  const { data: transferData, error: transferError } = await db
    .from('transfer_requests')
    .insert(requestData)
    .select()
    .single();

  if (transferError) throw transferError;

  const itemsToInsert = items.map(item => ({
    ...item,
    transfer_request_id: transferData.id,
  }));

  const { error: itemsError } = await db
    .from('transfer_request_items')
    .insert(itemsToInsert);

  if (itemsError) throw itemsError;
  return transferData as TransferRequest;
}

export async function approveTransferRequest(
  id: number,
  items: { id: number; approved_qty: number }[],
): Promise<TransferRequest> {
  for (const item of items) {
    const { error } = await db
      .from('transfer_request_items')
      .update({ approved_qty: item.approved_qty })
      .eq('id', item.id);
    if (error) throw error;
  }

  const { data, error } = await db
    .from('transfer_requests')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as TransferRequest;
}

export async function rejectTransferRequest(
  id: number,
  rejection_reason: string,
): Promise<TransferRequest> {
  const { data, error } = await db
    .from('transfer_requests')
    .update({ status: 'rejected', rejection_reason })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as TransferRequest;
}

export async function reviseTransferRequest(
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
): Promise<TransferRequest> {
  const { items, ...requestData } = request;

  const { data: transferData, error: transferError } = await db
    .from('transfer_requests')
    .insert({ ...requestData, parent_request_id: originalId, status: 'requested' })
    .select()
    .single();

  if (transferError) throw transferError;

  const itemsToInsert = items.map(item => ({
    ...item,
    transfer_request_id: transferData.id,
  }));

  const { error: itemsError } = await db
    .from('transfer_request_items')
    .insert(itemsToInsert);

  if (itemsError) throw itemsError;
  return transferData as TransferRequest;
}

export async function dispatchTransfer(
  transferId: number,
  dispatchedBy: string,
  items: { id: number; dispatched_qty: number }[],
): Promise<{ success: boolean; transfer_id: number }> {
  const { data, error } = await db.rpc('dispatch_transfer', {
    p_transfer_id: transferId,
    p_dispatched_by: dispatchedBy,
    p_items: items,
  });

  if (error) throw error;
  return data as { success: boolean; transfer_id: number };
}

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
export async function createTransferRequestsBatch(request: {
  direction: string;
  brand: string;
  requested_by: string;
  notes?: string;
  groups: TransferGroup[];
}): Promise<BatchTransferResult> {
  const { data, error } = await db.rpc('create_transfer_requests_batch', {
    p_requested_by: request.requested_by,
    p_brand: request.brand,
    p_direction: request.direction,
    p_notes: request.notes ?? null,
    p_groups: request.groups,
  });

  if (error) throw error;
  return data as BatchTransferResult;
}

/**
 * Atomic fan-out for direct-send carts. Stock decrements + dispatched-state
 * transfer rows are all in one Postgres transaction.
 */
export async function directSendTransfersBatch(request: {
  sender: string;
  brand: string;
  direction: string;
  notes?: string;
  groups: SendGroup[];
}): Promise<BatchTransferResult> {
  const { data, error } = await db.rpc('direct_send_transfers_batch', {
    p_sender: request.sender,
    p_brand: request.brand,
    p_direction: request.direction,
    p_notes: request.notes ?? null,
    p_groups: request.groups,
  });

  if (error) throw error;
  return data as BatchTransferResult;
}

export async function directSendTransfer(request: {
  sender: string;
  brand: string;
  direction: string;
  item_type: string;
  notes?: string;
  items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; qty: number }[];
}): Promise<{ success: boolean; transfer_id: number }> {
  const { data, error } = await db.rpc('direct_send_transfer', {
    p_sender: request.sender,
    p_brand: request.brand,
    p_direction: request.direction,
    p_item_type: request.item_type,
    p_items: request.items,
    p_notes: request.notes ?? null,
  });

  if (error) throw error;
  return data as { success: boolean; transfer_id: number };
}

export async function deleteTransferRequest(id: number): Promise<void> {
  // Hard-delete is only allowed while the request is still in 'requested' status.
  // Guarding by status here prevents wiping an already-approved row if an approver
  // races us. transfer_request_items has ON DELETE CASCADE so items clean up automatically.
  const { error } = await db
    .from('transfer_requests')
    .delete()
    .eq('id', id)
    .eq('status', 'requested');

  if (error) throw error;
}

export async function receiveTransfer(
  transferId: number,
  receivedBy: string,
  items: { id: number; received_qty: number; discrepancy_note?: string }[],
): Promise<{ success: boolean; transfer_id: number; has_discrepancy: boolean }> {
  const { data, error } = await db.rpc('receive_transfer', {
    p_transfer_id: transferId,
    p_received_by: receivedBy,
    p_items: items,
  });

  if (error) throw error;
  return data as { success: boolean; transfer_id: number; has_discrepancy: boolean };
}
