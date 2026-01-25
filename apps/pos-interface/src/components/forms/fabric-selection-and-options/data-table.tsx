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

declare module "@tanstack/react-table" {
    interface ColumnMeta<TData extends RowData, TValue> {
        className?: string;
    }
}

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    measurementOptions?: { id: string; MeasurementID: string }[];
    removeRow: (rowIndex: number) => void;
    updateData: (rowIndex: number, columnId: string, value: unknown) => void;
    isFormDisabled?: boolean;
    styles?: any[];
    checkoutStatus?: "draft" | "confirmed" | "cancelled";
    fatoura?: number;
    orderDate?: Date | string | null;
    orderID?: number;
    customerId?: number;
    customerName?: string;
    customerMobile?: string;
    tempStockUsage?: Map<string, number>;
    stitchingPrice?: number;
}

export function DataTable<TData, TValue>({
    columns,
    data,
    measurementOptions,
    removeRow,
    updateData,
    isFormDisabled,
    styles,
    checkoutStatus,
    fatoura,
    orderDate,
    orderID,
    customerId,
    customerName,
    customerMobile,
    tempStockUsage,
    stitchingPrice,
}: DataTableProps<TData, TValue>) {
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        meta: {
            measurementOptions,
            removeRow,
            updateData,
            isFormDisabled,
            styles,
            checkoutStatus,
            fatoura,
            orderDate,
            orderID,
            customerId,
            customerName,
            customerMobile,
            tempStockUsage,
            stitchingPrice,
        } as {
            measurementOptions?: { id: string; MeasurementID: string }[];
            removeRow: (rowIndex: number) => void;
            updateData: (rowIndex: number, columnId: string, value: unknown) => void;
            isFormDisabled?: boolean;
            styles?: any[];
            checkoutStatus?: "draft" | "confirmed" | "cancelled";
            fatoura?: number;
            orderDate?: Date | string | null;
            orderID?: string;
            customerId?: string;
            customerName?: string;
            customerMobile?: string;
            tempStockUsage?: Map<string, number>;
            stitchingPrice?: number;
        },
    });

    return (
        <div className="rounded-lg border bg-card overflow-x-auto w-full shadow">
            <Table className="">
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
                                            header.getContext(),
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
                                        className={`px-4 py-2 text-center ${cell.column.parent === undefined &&
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
                                colSpan={columns.length + 12}
                                className="h-24 text-center text-muted-foreground"
                            >
                                No results.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
