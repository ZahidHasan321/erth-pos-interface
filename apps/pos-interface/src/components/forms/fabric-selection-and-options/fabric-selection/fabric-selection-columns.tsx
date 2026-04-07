"use client";
import { type ColumnDef } from "@tanstack/react-table";
import { type GarmentSchema } from "./garment-form.schema";
import { Button } from "@repo/ui/button";
import * as FabricCells from "./fabric-selection-cells";
import * as React from "react";
import { useReactToPrint } from "react-to-print";
import { FabricLabel } from "./fabric-print-component";
import { useFormContext } from "react-hook-form";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";
import { MoreHorizontal, Printer, Trash2 } from "lucide-react";

export const columns: ColumnDef<GarmentSchema>[] = [
  // IDs
  {
    accessorKey: "garment_id",
    header: "ID",
    size: 40,
    cell: FabricCells.GarmentIdCell,
  },
  {
    accessorKey: "measurement_id",
    header: "Measurement",
    size: 100,
    cell: FabricCells.MeasurementIdCell,
  },
  // Fabric Selection
  {
    accessorKey: "fabric_source",
    header: "Source",
    size: 65,
    cell: FabricCells.FabricSourceCell,
  },
  {
    accessorKey: "fabric_id",
    header: "Fabric",
    size: 220,
    cell: FabricCells.IfInsideCell,
  },
  {
    accessorKey: "shop_name",
    header: "Shop Name",
    size: 130,
    cell: FabricCells.ShopNameCell,
  },
  {
    accessorKey: "color",
    header: "Color",
    size: 80,
    cell: FabricCells.ColorCell,
  },
  {
    accessorKey: "fabric_length",
    header: "Length (m)",
    size: 75,
    cell: FabricCells.FabricLengthCell,
  },
  {
    accessorKey: "fabric_amount",
    header: "Amount",
    size: 60,
    cell: FabricCells.FabricAmountCell,
  },
  // Order Details
  {
    accessorKey: "garment_type",
    header: "Brova",
    size: 55,
    cell: FabricCells.GarmentTypeCell,
  },
  {
    accessorKey: "soaking",
    header: "Soak",
    size: 50,
    cell: FabricCells.SoakingCell,
  },
  {
    accessorKey: "express",
    header: "Express",
    size: 60,
    cell: FabricCells.ExpressCell,
  },
  {
    accessorKey: "delivery_date",
    header: "Delivery",
    size: 130,
    cell: FabricCells.DeliveryDateCell,
  },
  {
    accessorKey: "notes",
    header: "Note",
    size: 140,
    cell: FabricCells.NoteCell,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    size: 40,
    cell: ActionCell,
  },
];

function ActionCell({ row, table }: { row: any; table: any }) {
  const meta = table.options.meta as {
    removeRow: (rowIndex: number) => void;
    isFormDisabled?: boolean;
    checkoutStatus?: "draft" | "confirmed" | "cancelled";
    fatoura?: number;
    orderID?: string;
    customerId?: string;
    customerName?: string;
    customerMobile?: string;
    measurementOptions?: { id: string; MeasurementID: string }[];
  };

  const isFormDisabled = meta?.isFormDisabled ?? false;

  /* ---------- PRINT HOOKS ---------- */
  const printRef = React.useRef<HTMLDivElement>(null);
  const { getValues } = useFormContext();

  const orderID = meta?.orderID || "N/A";
  const customerId = meta?.customerId || "N/A";
  const customerName = meta?.customerName || "N/A";
  const customerMobile = meta?.customerMobile || "N/A";
  const measurementOptions = meta?.measurementOptions || [];

  const getCurrentRowData = () =>
    (getValues(`garments.${row.index}`) || row.original) as GarmentSchema;

  const currentRowData = getCurrentRowData();
  if (!currentRowData) return null;

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Fabric-Order-${currentRowData.garment_id}`,
    pageStyle: `
      @page { size: 5in 4in; margin: 16px 0 0 0; }
      @media print {
        html,body{margin:0;padding:0;width:5in;height:4in;display:flex;align-items:center;justify-content:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      }`,
  });

  // Read fresh form data for print label (not stale render-time snapshot)
  const getFabricData = () => {
    const data = getCurrentRowData();
    const measurementDisplay =
      measurementOptions.find((m) => m.id === data.measurement_id)
        ?.MeasurementID || data.measurement_id;
    return {
      orderId: orderID,
      customerId,
      customerName,
      customerMobile,
      garmentId: data.garment_id || "N/A",
      fabricSource: data.fabric_source || "",
      fabricId: data.fabric_id?.toString() || "",
      fabricLength: data.fabric_length?.toString() ?? "0",
      measurementId: measurementDisplay || "N/A",
      garment_type: data.garment_type || 'final',
      express: data.express || false,
      soaking: data.soaking || false,
      deliveryDate: data.delivery_date ? new Date(data.delivery_date) : null,
      notes: data.notes || "",
    };
  };

  const fabricData = getFabricData();

  /* ---------- RENDER ---------- */
  return (
    <>
      {/* Hidden printable label */}
      <div style={{ display: "none" }}>
        <FabricLabel ref={printRef} fabricData={fabricData} />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isFormDisabled} aria-label="More options">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => handlePrint()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => meta?.removeRow(row.index)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
