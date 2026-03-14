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
  isOrderDisabled: boolean;
  errors?: any[];
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
      errors?: any[];
    },
  });

  return (
    <div className="rounded-2xl border-2 border-border bg-card overflow-x-auto w-full">
      <Table>
        <colgroup>
          {table.getHeaderGroups()[0]?.headers.map((header) => (
            <col key={header.id} span={header.colSpan} />
          ))}
        </colgroup>
        <TableHeader className="bg-muted/30">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-b-2 border-border">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  colSpan={header.colSpan}
                  style={{
                    minWidth: header.column.columnDef.minSize,
                    width: header.column.columnDef.size,
                  }}
                  className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground"
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
                      minWidth: cell.column.columnDef.minSize,
                      width: cell.column.columnDef.size,
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
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <span className="text-sm font-bold uppercase tracking-widest opacity-60">No items added</span>
                  <span className="text-xs opacity-40">Click "Add Item" to get started</span>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
