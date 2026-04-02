import { ChipToggle } from "@repo/ui/chip-toggle";
import { DatePicker } from "@repo/ui/date-picker";
import { ArrowRight } from "lucide-react";

export type DatePreset = "today" | "yesterday" | "this_week" | "this_month" | "all_time" | "custom";

interface EodDateFilterProps {
    preset: DatePreset;
    dateFrom: Date;
    dateTo: Date;
    onPresetChange: (preset: DatePreset) => void;
    onDateFromChange: (date: Date) => void;
    onDateToChange: (date: Date) => void;
}

export function EodDateFilter({
    preset,
    dateFrom,
    dateTo,
    onPresetChange,
    onDateFromChange,
    onDateToChange,
}: EodDateFilterProps) {
    const presets: { key: DatePreset; label: string }[] = [
        { key: "today", label: "Today" },
        { key: "yesterday", label: "Yesterday" },
        { key: "this_week", label: "This Week" },
        { key: "this_month", label: "This Month" },
        { key: "all_time", label: "All Time" },
    ];

    return (
        <div className="flex items-center gap-3 flex-wrap">
            {presets.map(p => (
                <ChipToggle
                    key={p.key}
                    active={preset === p.key}
                    onClick={() => onPresetChange(p.key)}
                >
                    {p.label}
                </ChipToggle>
            ))}

            <div className="h-6 w-px bg-border mx-1" />

            <div className="flex items-center gap-2">
                <DatePicker
                    value={dateFrom}
                    onChange={(d) => d && onDateFromChange(d)}
                    placeholder="From"
                    className="h-9 w-44 text-sm"
                    displayFormat="dd MMM yyyy"
                />
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <DatePicker
                    value={dateTo}
                    onChange={(d) => d && onDateToChange(d)}
                    placeholder="To"
                    className="h-9 w-44 text-sm"
                    displayFormat="dd MMM yyyy"
                />
            </div>
        </div>
    );
}
