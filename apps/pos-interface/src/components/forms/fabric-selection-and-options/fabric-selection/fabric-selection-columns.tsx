"use client";
import { type ColumnDef } from "@tanstack/react-table";
import { type GarmentSchema } from "./garment-form.schema";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Printer, Trash2 } from "lucide-react";

export const columns: ColumnDef<GarmentSchema>[] = [
  // IDs
  {
    accessorKey: "garment_id",
    header: "Garment ID",
    size: 120,
    cell: FabricCells.GarmentIdCell,
  },
  {
    accessorKey: "measurement_id",
    header: "Measurement ID",
    size: 180,
    cell: FabricCells.MeasurementIdCell,
  },
  // Fabric Selection
  {
    accessorKey: "fabric_source",
    header: "Source",
    size: 200,
    cell: FabricCells.FabricSourceCell,
  },
  {
    accessorKey: "fabric_id",
    header: "Fabric",
    size: 250,
    cell: FabricCells.IfInsideCell,
  },
  {
    accessorKey: "shop_name",
    header: "Shop Name",
    size: 200,
    cell: FabricCells.ShopNameCell,
  },
  {
    accessorKey: "color",
    header: "Color / اللون",
    size: 150,
    cell: FabricCells.ColorCell,
  },
  {
    accessorKey: "fabric_length",
    header: "Length (m)",
    size: 140,
    cell: FabricCells.FabricLengthCell,
  },
  {
    accessorKey: "fabric_amount",
    header: "Amount / سعر القماش",
    size: 180,
    cell: FabricCells.FabricAmountCell,
  },
  // Order Details
  {
    accessorKey: "brova",
    header: "Brova",
    size: 100,
    cell: FabricCells.BrovaCell,
  },
  {
    accessorKey: "express",
    header: "Express / مستعجل",
    size: 180,
    cell: FabricCells.ExpressCell,
  },
  {
    accessorKey: "delivery_date",
    header: "Delivery Date / موعد التسليم",
    size: 220,
    cell: FabricCells.DeliveryDateCell,
  },
  {
    accessorKey: "home_delivery",
    header: "Home Delivery",
    size: 180,
    cell: FabricCells.HomeDeliveryCell,
  },
  {
    accessorKey: "notes",
    header: "Note",
    size: 250,
    cell: FabricCells.NoteCell,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    size: 80,
    cell: ({ row, table }) => {
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

      const currentRowData = (getValues(
        `garments.${row.index}`,
      ) || row.original) as GarmentSchema;

      if (!currentRowData) return null;

      const measurementDisplay =
        measurementOptions.find((m) => m.id === currentRowData.measurement_id)
          ?.MeasurementID || currentRowData.measurement_id;

      const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Fabric-Order-${currentRowData.garment_id}`,
        pageStyle: `
          @page { size: 5in 4in; margin: 0; }
          @media print {
            html,body{margin:0;padding:0;width:5in;height:4in;display:flex;align-items:center;justify-content:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
          }`,
      });

      const fabricData = {
        orderId: orderID,
        customerId,
        customerName,
        customerMobile,
        garmentId: currentRowData.garment_id || "",
        fabricSource: currentRowData.fabric_source || "",
        fabricId: currentRowData.fabric_id?.toString() || "",
        fabricLength: currentRowData.fabric_length?.toString() ?? "0",
        measurementId: measurementDisplay || "",
        brova: currentRowData.brova || false,
        express: currentRowData.express || false,
        deliveryDate: currentRowData.delivery_date ? new Date(currentRowData.delivery_date) : null,
      };

      /* ---------- RENDER ---------- */
      return (
        <>
          {/* Hidden printable label */}
          <div style={{ display: "none" }}>
            <FabricLabel ref={printRef} fabricData={fabricData} />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isFormDisabled}>
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
    },
  },
];
