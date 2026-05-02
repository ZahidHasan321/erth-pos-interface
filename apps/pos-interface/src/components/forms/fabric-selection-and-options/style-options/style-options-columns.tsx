"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { type GarmentSchema } from "../fabric-selection/garment-form.schema";
import * as StyleCells from "./style-options-cells";

export const columns: ColumnDef<GarmentSchema>[] = [
  {
    accessorKey: "garment_id",
    header: "ID",
    size: 40,
    cell: StyleCells.GarmentIdCell,
  },
  {
    accessorKey: "style",
    header: "Style",
    size: 75,
    cell: StyleCells.StyleCell,
  },
  {
    accessorKey: "lines",
    header: "Lines",
    size: 80,
    cell: StyleCells.LinesCell,
  },
  {
    accessorKey: "collar_type",
    header: "Collar",
    size: 180,
    cell: StyleCells.CollarCell,
  },
  {
    accessorKey: "jabzour_1",
    header: "Jabzour",
    size: 200,
    cell: StyleCells.JabzourCell,
  },
  {
    accessorKey: "front_pocket_type",
    header: "Front Pocket",
    size: 140,
    cell: StyleCells.FrontPocketCell,
  },
  {
    accessorKey: "cuffs_type",
    header: "Cuffs",
    size: 140,
    cell: StyleCells.CuffsCell,
  },
  {
    accessorKey: "wallet_pocket",
    header: "Accessories",
    size: 155,
    cell: StyleCells.AccessoriesCell,
  },
  {
    header: "Amount",
    id: "amount",
    size: 60,
    cell: StyleCells.AmountCell,
  },
];
