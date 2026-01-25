"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { type GarmentSchema } from "../fabric-selection/garment-form.schema";
import * as StyleCells from "./style-options-cells";

export const columns: ColumnDef<GarmentSchema>[] = [
  {
    accessorKey: "garment_id",
    header: "Garment ID",
    minSize: 150,
    cell: StyleCells.GarmentIdCell,
  },
  {
    accessorKey: "style",
    header: "Style",
    minSize: 150,
    cell: StyleCells.StyleCell,
  },
  {
    accessorKey: "lines",
    header: "Lines",
    minSize: 180,
    cell: StyleCells.LinesCell,
  },
  {
    accessorKey: "collar_type",
    header: "Collar",
    minSize: 350,
    cell: StyleCells.CollarCell,
  },
  {
    accessorKey: "jabzour_1",
    header: "Jabzour",
    minSize: 420,
    cell: StyleCells.JabzourCell,
  },
  {
    accessorKey: "front_pocket_type",
    header: "Front Pocket",
    minSize: 300,
    cell: StyleCells.FrontPocketCell,
  },
  {
    accessorKey: "cuffs_type",
    header: "Cuffs",
    minSize: 300,
    cell: StyleCells.CuffsCell,
  },
  {
    accessorKey: "wallet_pocket",
    header: "Accessories",
    minSize: 280,
    cell: StyleCells.AccessoriesCell,
  },
  {
    header: "Amount",
    id: "amount",
    minSize: 100,
    cell: StyleCells.AmountCell,
  },
];
