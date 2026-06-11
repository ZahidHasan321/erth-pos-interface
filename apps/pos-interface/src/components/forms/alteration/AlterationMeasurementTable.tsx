import { Input } from "@repo/ui/input";
import { cn } from "@/lib/utils";
import type { AlterationMeasurementField } from "./alteration-form.schema";

export interface AlterationMeasurementColumn {
    name: AlterationMeasurementField;
    label: string;
}

interface Props {
    title: string;
    columns: AlterationMeasurementColumn[];
    values: Partial<Record<AlterationMeasurementField, number>>;
    onChange: (field: AlterationMeasurementField, raw: string) => void;
}

export function AlterationMeasurementTable({
    title,
    columns,
    values,
    onChange,
}: Props) {
    return (
        <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border p-3">
            {title && (
                <h4 className="text-sm font-semibold pb-2 text-foreground">{title}</h4>
            )}
            <table className="w-full border-collapse">
                <thead>
                    <tr className="border-t border-border">
                        {columns.map((col) => (
                            <th
                                key={col.name}
                                className="border border-border px-2 py-2 text-xs text-muted-foreground font-medium text-center leading-tight bg-muted/40"
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {/* Input row: shows only the new value staff type for changed fields */}
                    <tr>
                        {columns.map((col) => {
                            const current = values[col.name];
                            const changed = current != null;
                            return (
                                <td
                                    key={col.name}
                                    className={cn(
                                        "border border-border px-1.5 py-1.5",
                                        changed && "bg-amber-50",
                                    )}
                                >
                                    <Input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.125"
                                        value={current ?? ""}
                                        onChange={(e) => onChange(col.name, e.target.value)}
                                        placeholder="-"
                                        className={cn(
                                            "h-9 w-full text-center tabular-nums bg-transparent border-0 shadow-none px-1",
                                            "focus:ring-1 focus:ring-primary focus-visible:ring-1 focus-visible:ring-primary",
                                            changed && "font-semibold text-amber-900",
                                        )}
                                    />
                                </td>
                            );
                        })}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
