"use client";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type RowData,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import type { Shelf } from '@repo/database'

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  serverProducts?: Shelf[];
  selectedProducts?: string[];
  removeRow: (rowIndex: number) => void;
  updateData: (rowIndex: number, columnId: string, value: unknown) => void;
  isOrderDisabled: boolean;
  errors?: { quantity?: { message?: string } }[];
}

export function DataTable<TData, TValue>({
  columns,
  data,
  serverProducts,
  removeRow,
  updateData,
  isOrderDisabled,
  errors
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      serverProducts,
      removeRow,
      updateData,
      isOrderDisabled,
      errors
    } as {
      serverProducts?: Shelf[];
      removeRow: (rowIndex: number) => void;
      updateData: (rowIndex: number, columnId: string, value: unknown) => void;
      isOrderDisabled: boolean;
      errors?: { quantity?: { message?: string } }[];
    },
  });

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden w-full">
      <Table className="w-full table-fixed">
        <colgroup>
          {table.getHeaderGroups()[0]?.headers.map((header) => (
            <col key={header.id} span={header.colSpan} />
          ))}
        </colgroup>
        <TableHeader className="bg-muted/30">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-b border-border">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  colSpan={header.colSpan}
                  style={{
                    width: `${header.column.columnDef.size}%`,
                  }}
                  className="px-4 py-3 text-center text-sm font-medium text-muted-foreground"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className="hover:bg-muted/20 transition-colors border-b border-border/50"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    style={{
                      width: `${cell.column.columnDef.size}%`,
                    }}
                    className="px-4 py-3 text-center"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center"
              >
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  <span className="text-sm font-medium">No items added yet</span>
                  <span className="text-sm opacity-60">Pick a product from the grid above</span>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
