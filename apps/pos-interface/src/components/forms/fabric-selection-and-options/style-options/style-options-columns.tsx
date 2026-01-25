"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { type GarmentSchema } from "../fabric-selection/garment-form.schema";
import * as StyleCells from "./style-options-cells";

export const columns: ColumnDef<GarmentSchema>[] = [
  {
    accessorKey: "garment_id",
    header: "Garment ID",
    size: 150,
    cell: StyleCells.GarmentIdCell,
  },
  {
    accessorKey: "style",
    header: "Style",
    size: 150,
    cell: StyleCells.StyleCell,
  },
  {
    accessorKey: "lines",
    header: "Lines",
    size: 180,
    cell: StyleCells.LinesCell,
  },
  {
    accessorKey: "collar_type",
    header: "Collar",
    size: 350,
    cell: StyleCells.CollarCell,
  },
  {
    accessorKey: "jabzour_1",
    header: "Jabzour",
    size: 420,
    cell: StyleCells.JabzourCell,
  },
  {
    accessorKey: "front_pocket_type",
    header: "Front Pocket",
    size: 300,
    cell: StyleCells.FrontPocketCell,
  },
  {
    accessorKey: "cuffs_type",
    header: "Cuffs",
    size: 300,
    cell: StyleCells.CuffsCell,
  },
  {
    accessorKey: "wallet_pocket",
    header: "Accessories",
    size: 280,
    cell: StyleCells.AccessoriesCell,
  },
  {
    header: "Amount",
    id: "amount",
    size: 100,
    cell: StyleCells.AmountCell,
  },
];
