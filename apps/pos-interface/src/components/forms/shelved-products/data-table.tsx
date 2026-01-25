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
} from "@/components/ui/table";
import type { Shelf } from '@repo/database'

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  serverProducts?: any[];
  selectedProducts?: string[];
  removeRow: (rowIndex: number) => void;
  updateData: (rowIndex: number, columnId: string, value: unknown) => void;
  isOrderClosed: boolean
}

export function DataTable<TData, TValue>({
  columns,
  data,
  serverProducts,
  removeRow,
  updateData,
  isOrderClosed
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      serverProducts,
      removeRow,
      updateData,
      isOrderClosed
    } as {
      serverProducts?: Shelf[];
      removeRow: (rowIndex: number) => void;
      updateData: (rowIndex: number, columnId: string, value: unknown) => void;
      isOrderClosed: boolean
    },
  });

  return (
    <div className="rounded-lg border bg-card overflow-x-auto w-full shadow">
      <Table className="">
        {/* Optional: use colgroup if needed for borders */}
        <colgroup>
          {table.getHeaderGroups()[0]?.headers.map((header) => (
            <col key={header.id} span={header.colSpan} />
          ))}
        </colgroup>
        <TableHeader className="bg-primary-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="divide-x divide-border">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  colSpan={header.colSpan}
                  className="px-4 py-2 text-center font-semibold text-foreground transition-colors hover:bg-primary/10"
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
        <TableBody className="bg-card">
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className="bg-white/50 hover:bg-muted/40 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={`px-4 py-2 text-center ${
                      cell.column.parent === undefined &&
                      cell.column.getIndex() > 0
                        ? "ml-4"
                        : ""
                    }`}
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
                className="h-24 text-center text-muted-foreground"
              >
                No products added yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}