import type { TransferRequestWithItems } from "@/api/transfers";
import type { AuthUser } from "@/lib/rbac";
import { getPermission } from "@/lib/rbac";

export type Side = "shop" | "workshop";

export function sourceSideOf(direction: string): Side {
  return direction === "shop_to_workshop" ? "shop" : "workshop";
}
export function destinationSideOf(direction: string): Side {
  return direction === "shop_to_workshop" ? "workshop" : "shop";
}

const SIDE_LABEL: Record<Side, string> = { shop: "shop", workshop: "workshop" };

export type TransferActionKind = "approve" | "reject" | "dispatch" | "receive" | "cancel" | null;

export function primaryActionFor(user: AuthUser | null, transfer: TransferRequestWithItems): TransferActionKind {
  if (!user) return null;
  const userSide: Side | null = user.department === "shop" ? "shop" : user.department === "workshop" ? "workshop" : null;
  const isAdmin = user.role === "super_admin" || user.role === "admin";

  switch (transfer.status) {
    case "requested": {
      if (getPermission(user, "transfers:approve") !== "full") return null;
      const approverSide = sourceSideOf(transfer.direction);
      return isAdmin || userSide === approverSide ? "approve" : null;
    }
    case "approved": {
      if (getPermission(user, "transfers:dispatch") !== "full") return null;
      const dispatcherSide = sourceSideOf(transfer.direction);
      return isAdmin || userSide === dispatcherSide ? "dispatch" : null;
    }
    case "dispatched":
    case "partially_received": {
      if (getPermission(user, "transfers:receive") !== "full") return null;
      const receiverSide = destinationSideOf(transfer.direction);
      return isAdmin || userSide === receiverSide ? "receive" : null;
    }
    default:
      return null;
  }
}

export function awaitingLabel(transfer: TransferRequestWithItems): string {
  switch (transfer.status) {
    case "requested": return `Awaiting ${sourceSideOf(transfer.direction)} approval`;
    case "approved": return `Awaiting ${sourceSideOf(transfer.direction)} dispatch`;
    case "dispatched":
    case "partially_received": return `Awaiting ${destinationSideOf(transfer.direction)} receipt`;
    default: return "";
  }
}

export function personalAwaitingLabel(user: AuthUser | null, t: TransferRequestWithItems): string {
  if (t.status === "received") return "Completed";
  if (t.status === "rejected") return "Rejected";

  const action = primaryActionFor(user, t);
  if (action) {
    if (action === "approve") return "Waiting on you to approve";
    if (action === "dispatch") return "Waiting on you to dispatch";
    if (action === "receive") return "Waiting on you to receive";
  }

  const verb = t.status === "requested" ? "approval" : t.status === "approved" ? "dispatch" : "receipt";
  const side = (t.status === "requested" || t.status === "approved")
    ? sourceSideOf(t.direction)
    : destinationSideOf(t.direction);
  return `Waiting on ${SIDE_LABEL[side]} ${verb}`;
}

export function itemTypeOf(t: TransferRequestWithItems): "fabric" | "shelf" | "accessory" {
  return (t.item_type as any) ?? "fabric";
}

export function lastEventAt(t: TransferRequestWithItems): Date | string | null {
  return (t.received_at ?? t.dispatched_at ?? t.approved_at ?? t.created_at) ?? null;
}

export function staleDays(t: TransferRequestWithItems): number {
  const at = lastEventAt(t);
  if (!at) return 0;
  return Math.floor((Date.now() - new Date(at).getTime()) / (1000 * 60 * 60 * 24));
}

export function isStale(t: TransferRequestWithItems, thresholdDays = 3): boolean {
  if (t.status === "received" || t.status === "rejected") return false;
  return staleDays(t) >= thresholdDays;
}

export function itemNamesPreview(t: TransferRequestWithItems, max = 2): string {
  const names = t.items.map((i) => i.fabric?.name ?? i.shelf_item?.type ?? i.accessory?.name ?? `#${i.id}`);
  if (names.length === 0) return "—";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

export function sourceStockOf(t: TransferRequestWithItems, it: TransferRequestWithItems["items"][number]): number | null {
  const src = sourceSideOf(t.direction);
  const key = src === "shop" ? "shop_stock" : "workshop_stock";
  if (it.fabric) return Number((it.fabric as any)[key] ?? 0);
  if (it.shelf_item) return Number((it.shelf_item as any)[key] ?? 0);
  if (it.accessory) return Number((it.accessory as any)[key] ?? 0);
  return null;
}
