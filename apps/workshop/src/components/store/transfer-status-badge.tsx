import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_COLORS } from "./transfer-constants";

export function TransferStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${TRANSFER_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {TRANSFER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function ItemTypeBadge({ itemType }: { itemType: string }) {
  const labels: Record<string, string> = { fabric: "Fabric", shelf: "Shelf", accessory: "Accessory" };
  const colors: Record<string, string> = {
    fabric: "bg-purple-100 text-purple-700",
    shelf: "bg-sky-100 text-sky-700",
    accessory: "bg-pink-100 text-pink-700",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${colors[itemType] ?? "bg-gray-100 text-gray-700"}`}>
      {labels[itemType] ?? itemType}
    </span>
  );
}
