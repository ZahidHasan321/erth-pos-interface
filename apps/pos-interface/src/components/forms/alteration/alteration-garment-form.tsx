import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@repo/ui/select";
import { SHOULDER_SLOPE_UI } from "@repo/ui/shoulder-slope";
import { COLLAR_POSITION_UI } from "@repo/ui/collar-position";
import { cn } from "@/lib/utils";

import {
    type AlterationGarmentSchema,
    type AlterationGarmentSource,
    type AlterationMeasurementField,
    type AlterationStyleField,
} from "./alteration-form.schema";
import { AlterationMeasurementTable } from "./AlterationMeasurementTable";
import { AlterationChangeSummary } from "./AlterationChangeSummary";
import { OriginalSpecPanel } from "./OriginalSpecPanel";
import { AlterationCheckboxMatrix } from "@/components/alteration/alteration-checkbox-matrix";
import { getNumberedLabel, getLabel } from "@repo/database";

// Same field grouping as the customer-measurements form — kept here so the
// alteration form mirrors the entry experience.
const AUTO_TAPE_GROUP_1 = [
    "chest_full", "shoulder", "sleeve_length", "sleeve_width",
    "elbow", "armhole_front", "chest_upper", "chest_front", "waist_front",
];
const AUTO_TAPE_GROUP_2 = [
    "top_pocket_distance", "jabzour_length", "length_front", "bottom",
    "chest_back", "waist_back", "length_back", "collar_width", "collar_height",
];
const MANUAL_GROUP_1 = [
    "waist_full", "jabzour_width",
    "top_pocket_length", "top_pocket_width",
    "side_pocket_length", "side_pocket_width",
    "side_pocket_distance", "side_pocket_opening",
];
const MANUAL_GROUP_2 = [
    "second_button_distance",
    "basma_length", "basma_width",
    "sleeve_hemming", "bottom_hemming",
    "pen_pocket_length", "pen_pocket_width",
];

function alterationColumns(
    keys: readonly string[],
    numbered = false,
): { name: string; label: string }[] {
    return keys.map((name) => ({
        name,
        label: numbered ? getNumberedLabel(name) : getLabel(name),
    }));
}
import {
    collarButtons,
    collarTypes,
    cuffTypes,
    jabzourTypes,
    penIcon,
    phoneIcon,
    smallTabaggiImage,
    thicknessOptions,
    topPocketTypes,
    walletIcon,
    type BaseOption,
} from "@/components/forms/fabric-selection-and-options/constants";
import { getCustomerGarmentsForLink, type PriorGarmentForLink } from "@/api/alteration-orders";

interface AlterationGarmentFormProps {
    customerId: number | null;
    value: AlterationGarmentSchema;
    onChange: (next: AlterationGarmentSchema) => void;
}

type StyleVal = string | boolean | number;

export function AlterationGarmentForm({
    customerId,
    value,
    onChange,
}: AlterationGarmentFormProps) {
    const { data: priorGarmentsRes } = useQuery({
        queryKey: ["customer-garments-for-link", customerId],
        queryFn: () => (customerId ? getCustomerGarmentsForLink(customerId) : Promise.resolve({ status: "success" as const, data: [] })),
        enabled: !!customerId,
        staleTime: 60_000,
    });
    const priorGarments = priorGarmentsRes?.status === "success" ? priorGarmentsRes.data : [];

    const update = (patch: Partial<AlterationGarmentSchema>) => onChange({ ...value, ...patch });

    const styles = value.alteration_styles;

    const setStyle = (field: AlterationStyleField, raw: StyleVal | null) => {
        const next = { ...styles };
        if (raw === null || raw === "" || raw === undefined) {
            delete next[field];
        } else {
            next[field] = raw;
        }
        update({ alteration_styles: next });
    };

    const styleStr = (field: AlterationStyleField): string => {
        const v = styles[field];
        return typeof v === "string" ? v : "";
    };
    // Tri-state: true = add, false = remove, null = not changing this accessory.
    const styleTriBool = (field: AlterationStyleField): boolean | null => {
        const v = styles[field];
        return v === true ? true : v === false ? false : null;
    };
    const styleNum = (field: AlterationStyleField): number | null => {
        const v = styles[field];
        return typeof v === "number" ? v : null;
    };

    const issues = value.alteration_issues ?? {};
    const setIssue = (rowId: string, columnId: string, checked: boolean) => {
        const next = { ...issues };
        const row = { ...(next[rowId] ?? {}) };
        if (checked) {
            row[columnId] = true;
        } else {
            delete row[columnId];
        }
        if (Object.keys(row).length > 0) {
            next[rowId] = row;
        } else {
            delete next[rowId];
        }
        update({ alteration_issues: next });
    };

    const setMeasurementField = (field: AlterationMeasurementField, raw: string) => {
        const next = { ...value.alteration_measurements };
        if (raw === "") {
            delete next[field];
        } else {
            const n = Number(raw);
            if (Number.isFinite(n)) next[field] = n;
        }
        update({ alteration_measurements: next });
    };

    // Linking sets the FK reference ONLY. It never prefills the change maps:
    // an alteration records only what the staff explicitly chooses to change.
    const setSource = (source: AlterationGarmentSource) => {
        if (source === "external") {
            update({ source, original_garment_id: null });
        } else {
            update({ source });
        }
    };

    const pickedPrior: PriorGarmentForLink | null = value.original_garment_id
        ? priorGarments.find((g) => g.id === value.original_garment_id) ?? null
        : null;

    const isShaab = styleStr("jabzour_1") === "JAB_SHAAB";
    React.useEffect(() => {
        if (isShaab && styleStr("jabzour_thickness") !== "DOUBLE") {
            setStyle("jabzour_thickness", "DOUBLE");
        }
        if (!isShaab && styles.jabzour_2 != null) {
            setStyle("jabzour_2", null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isShaab]);

    const linesVal = styleNum("lines");

    return (
        <div className="space-y-5">
            {/* Internal vs external: the primary per-garment choice */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div>
                        <span className="text-sm font-semibold text-slate-800">
                            Garment source <span className="text-red-500">*</span>
                        </span>
                        <p className="text-[11px] text-slate-500">
                            Did we make this garment, or another shop?
                        </p>
                    </div>
                    <div className="ml-auto flex h-9 overflow-hidden rounded-md border border-slate-300">
                        {(["internal", "external"] as const).map((opt) => {
                            const selected = value.source === opt;
                            return (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setSource(opt)}
                                    className={
                                        "w-32 text-sm font-semibold transition border-r border-slate-300 last:border-r-0 " +
                                        (selected
                                            ? "bg-slate-900 text-white"
                                            : "bg-white text-slate-700 hover:bg-slate-50")
                                    }
                                >
                                    {opt === "internal" ? "We made it" : "Another shop"}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Internal: required source-garment picker + read-only reference */}
                {value.source === "internal" && (
                    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                        <div className="space-y-1.5">
                            <Label>
                                Original garment <span className="text-red-500">*</span>
                            </Label>
                            <Select
                                value={value.original_garment_id ?? ""}
                                onValueChange={(v) => update({ original_garment_id: v || null })}
                                disabled={!customerId || priorGarments.length === 0}
                            >
                                <SelectTrigger className="bg-background">
                                    <SelectValue placeholder={
                                        !customerId
                                            ? "Select customer first"
                                            : priorGarments.length === 0
                                                ? "No prior garments on file for this customer"
                                                : "Pick the garment being altered"
                                    } />
                                </SelectTrigger>
                                <SelectContent>
                                    {priorGarments.map((g: PriorGarmentForLink) => (
                                        <SelectItem key={g.id} value={g.id}>
                                            #{g.order_id} · {g.garment_id ?? g.id.slice(0, 8)} · {g.garment_type ?? "-"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {pickedPrior && (
                            <>
                                <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                    <span className="font-semibold text-slate-900">
                                        Order #{pickedPrior.order_id}
                                    </span>
                                    <span className="text-slate-400">·</span>
                                    <span>{pickedPrior.garment_type ?? "Garment"}</span>
                                    <span className="text-slate-400">·</span>
                                    <span className="font-mono text-xs text-slate-500">
                                        {pickedPrior.garment_id ?? pickedPrior.id.slice(0, 8)}
                                    </span>
                                </div>
                                <OriginalSpecPanel prior={pickedPrior} />
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Live recap of what is being changed (only the new values) */}
            <AlterationChangeSummary
                measurements={value.alteration_measurements}
                styles={value.alteration_styles}
                onClearMeasurement={(f) => setMeasurementField(f, "")}
                onClearStyle={(f) => setStyle(f as AlterationStyleField, null)}
            />

            {/* Measurement changes: per-field, new value only */}
            <div className="space-y-3">
                <div>
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                        Measurement Changes
                    </h4>
                    <p className="text-sm text-slate-500">
                        Fill only the fields that are changing. Enter the new value.
                    </p>
                </div>

                <div className="space-y-3">
                    <AlterationMeasurementTable
                        title="Chest & Shoulder"
                        values={value.alteration_measurements}
                        onChange={setMeasurementField}
                        columns={alterationColumns(AUTO_TAPE_GROUP_1, true)}
                    />
                    <AlterationMeasurementTable
                        title="Waist, Back & Collar"
                        values={value.alteration_measurements}
                        onChange={setMeasurementField}
                        columns={alterationColumns(AUTO_TAPE_GROUP_2, true)}
                    />
                    <AlterationMeasurementTable
                        title="Pockets & Jabzour"
                        values={value.alteration_measurements}
                        onChange={setMeasurementField}
                        columns={alterationColumns(MANUAL_GROUP_1)}
                    />
                    <AlterationMeasurementTable
                        title="Basma, Hemming & Pen Pocket"
                        values={value.alteration_measurements}
                        onChange={setMeasurementField}
                        columns={alterationColumns(MANUAL_GROUP_2)}
                    />

                    {/* Categorical body measurements (§2.12) — shoulder slope and
                        collar position live on the measurement, not the options.
                        Leave blank to keep the garment's current value. */}
                    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                        <div className="flex flex-wrap items-start gap-4">
                            <SlopeSelect
                                label="Shoulder Slope"
                                value={styleStr("shoulder_slope")}
                                onChange={(v) => setStyle("shoulder_slope", v)}
                            />
                            <SegField
                                label="Collar Position"
                                value={styleStr("collar_position")}
                                options={COLLAR_POSITION_UI}
                                onChange={(v) => setStyle("collar_position", v || null)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Style overrides — image-driven */}
            <div className="space-y-3">
                <div>
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                        Style Changes
                    </h4>
                    <p className="text-sm text-slate-500">
                        Pick only the styles that should change.
                    </p>
                </div>

                <div className="grid items-start gap-3 lg:grid-cols-2">
                    {/* Collar group — densest, so it spans the full width */}
                    <StyleGroup title="Collar" className="lg:col-span-2">
                        <ImagePickerField
                            label="Type"
                            value={styleStr("collar_type")}
                            options={collarTypes}
                            onChange={(v) => setStyle("collar_type", v)}
                            placeholder="Collar type"
                        />
                        <ImagePickerField
                            label="Button"
                            value={styleStr("collar_button")}
                            options={collarButtons}
                            onChange={(v) => setStyle("collar_button", v)}
                            placeholder="Button"
                        />
                        <ThicknessField
                            label="Thickness"
                            value={styleStr("collar_thickness")}
                            onChange={(v) => setStyle("collar_thickness", v)}
                        />
                        <BoolField
                            label="Small Tabbagi"
                            value={styleTriBool("small_tabaggi")}
                            onChange={(v) => setStyle("small_tabaggi", v)}
                            image={smallTabaggiImage}
                        />
                    </StyleGroup>

                    {/* Cuffs */}
                    <StyleGroup title="Cuffs">
                        <ImagePickerField
                            label="Type"
                            value={styleStr("cuffs_type")}
                            options={cuffTypes}
                            onChange={(v) => setStyle("cuffs_type", v)}
                            placeholder="Cuff type"
                        />
                        <ThicknessField
                            label="Thickness"
                            value={styleStr("cuffs_thickness")}
                            onChange={(v) => setStyle("cuffs_thickness", v)}
                            disabled={styleStr("cuffs_type") === "CUF_NO_CUFF"}
                        />
                    </StyleGroup>

                    {/* Front pocket */}
                    <StyleGroup title="Front Pocket">
                        <ImagePickerField
                            label="Type"
                            value={styleStr("front_pocket_type")}
                            options={topPocketTypes}
                            onChange={(v) => setStyle("front_pocket_type", v)}
                            placeholder="Pocket type"
                        />
                        <ThicknessField
                            label="Thickness"
                            value={styleStr("front_pocket_thickness")}
                            onChange={(v) => setStyle("front_pocket_thickness", v)}
                            disabled={!styleStr("front_pocket_type")}
                        />
                    </StyleGroup>

                    {/* Jabzour — the 2nd type wraps within the group so the second
                        field appearing never reflows the surrounding grid. */}
                    <StyleGroup title="Jabzour">
                        <ImagePickerField
                            label="Type"
                            value={styleStr("jabzour_1")}
                            options={jabzourTypes}
                            onChange={(v) => setStyle("jabzour_1", v)}
                            placeholder="Jabzour type"
                        />
                        {isShaab && (
                            <ImagePickerField
                                label="2nd type"
                                value={styleStr("jabzour_2")}
                                options={jabzourTypes.filter((j) => j.value !== "JAB_SHAAB")}
                                onChange={(v) => setStyle("jabzour_2", v)}
                                placeholder="2nd type"
                            />
                        )}
                        <ThicknessField
                            label="Thickness"
                            value={styleStr("jabzour_thickness")}
                            onChange={(v) => setStyle("jabzour_thickness", v)}
                            disabled={isShaab}
                        />
                    </StyleGroup>

                    {/* Accessories — Yes adds, No removes; leave unset for no change */}
                    <StyleGroup title="Accessories">
                        <BoolField
                            label="Wallet"
                            value={styleTriBool("wallet_pocket")}
                            onChange={(v) => setStyle("wallet_pocket", v)}
                            image={walletIcon}
                        />
                        <BoolField
                            label="Pen"
                            value={styleTriBool("pen_holder")}
                            onChange={(v) => setStyle("pen_holder", v)}
                            image={penIcon}
                        />
                        <BoolField
                            label="Mobile"
                            value={styleTriBool("mobile_pocket")}
                            onChange={(v) => setStyle("mobile_pocket", v)}
                            image={phoneIcon}
                        />
                    </StyleGroup>

                    {/* Lines */}
                    <StyleGroup title="Lines">
                        <SegField
                            label="Count"
                            value={linesVal != null ? String(linesVal) : ""}
                            options={[
                                { value: "1", label: "1 line" },
                                { value: "2", label: "2 lines" },
                            ]}
                            onChange={(v) => setStyle("lines", v ? Number(v) : null)}
                        />
                    </StyleGroup>
                </div>
            </div>

            {/* Reason matrix — printed on the alteration form for the workshop */}
            <div className="space-y-3">
                <div>
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                        Alteration Reasons
                    </h4>
                    <p className="text-sm text-slate-500">
                        Mark why each part is being altered. Prints on the alteration form.
                    </p>
                </div>
                <AlterationCheckboxMatrix
                    values={issues}
                    onValueChange={setIssue}
                    className="max-w-md"
                />
            </div>

            <div className="space-y-1">
                <Label>Garment notes</Label>
                <Input
                    value={value.notes ?? ""}
                    onChange={(e) => update({ notes: e.target.value || null })}
                    placeholder="Per-garment comments"
                />
            </div>
        </div>
    );
}

// Shared trigger height so image-bearing and text-only selects line up. The
// `data-[size=default]` variant is needed to override the primitive's own h-9.
const TRIGGER_H = "h-10 data-[size=default]:h-10";

function StyleGroup({
    title,
    className,
    children,
}: {
    title: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn("rounded-lg border border-slate-200 bg-white p-3", className)}>
            <div className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {title}
            </div>
            <div className="flex flex-wrap items-start gap-3">{children}</div>
        </div>
    );
}

// Label-on-top wrapper so every control in a group shares one baseline grid.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-slate-500">{label}</Label>
            {children}
        </div>
    );
}

function ImagePickerField({
    label,
    value,
    options,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    options: BaseOption[];
    onChange: (v: string | null) => void;
    placeholder: string;
}) {
    const selected = options.find((o) => o.value === value);
    return (
        <Field label={label}>
            <Select
                value={value || ""}
                onValueChange={(v) => onChange(v === "__clear" ? null : v)}
            >
                <SelectTrigger className={cn("w-36 bg-background", TRIGGER_H)}>
                    {selected ? (
                        selected.image ? (
                            <img
                                src={selected.image}
                                alt={selected.alt}
                                className="h-7 w-auto object-contain"
                            />
                        ) : (
                            <span className="truncate">{selected.displayText}</span>
                        )
                    ) : (
                        <SelectValue placeholder={placeholder} />
                    )}
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__clear">(None)</SelectItem>
                    {options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center space-x-2">
                                {opt.image && (
                                    <img
                                        src={opt.image}
                                        alt={opt.alt}
                                        className="min-w-12 h-12 object-contain"
                                    />
                                )}
                                <span>{opt.displayText}</span>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Field>
    );
}

function ThicknessField({
    label,
    value,
    onChange,
    disabled,
}: {
    label: string;
    value: string;
    onChange: (v: string | null) => void;
    disabled?: boolean;
}) {
    return (
        <Field label={label}>
            <Select
                value={value || ""}
                onValueChange={(v) => onChange(v === "__clear" ? null : v)}
                disabled={disabled}
            >
                <SelectTrigger className={cn("w-32 bg-background", TRIGGER_H)}>
                    <SelectValue placeholder="Thickness" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__clear">(None)</SelectItem>
                    {thicknessOptions.map((opt) => (
                        <SelectItem
                            key={opt.value}
                            value={opt.value}
                            className={opt.className}
                        >
                            {opt.label} · {opt.value}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Field>
    );
}

// Single-select segmented toggle. Clicking the active segment clears it, so it
// behaves like the sparse change map (no selection = no change recorded).
function SegField({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
}) {
    return (
        <Field label={label}>
            <div className="flex h-10 overflow-hidden rounded-md border border-slate-300">
                {options.map((opt) => {
                    const active = value === opt.value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange(active ? "" : opt.value)}
                            className={cn(
                                "border-r border-slate-300 px-3 text-sm font-medium transition last:border-r-0",
                                active
                                    ? "bg-slate-900 text-white"
                                    : "bg-white text-slate-700 hover:bg-slate-50",
                            )}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </Field>
    );
}

// Explicit Yes/No accessory toggle. On an alteration a boolean accessory means
// "add it" (Yes) or "remove it" (No); leaving both unset records no change.
// Clicking the active choice clears it back to "no change".
function BoolField({
    label,
    value,
    onChange,
    image,
}: {
    label: string;
    value: boolean | null;
    onChange: (v: boolean | null) => void;
    image: string;
}) {
    return (
        <Field label={label}>
            <div className="flex items-center gap-2">
                <img src={image} alt={label} className="h-6 w-6 shrink-0 object-contain" />
                <div className="flex h-10 overflow-hidden rounded-md border border-slate-300">
                    {[
                        { v: true, label: "Yes" },
                        { v: false, label: "No" },
                    ].map((opt) => {
                        const active = value === opt.v;
                        return (
                            <button
                                key={opt.label}
                                type="button"
                                onClick={() => onChange(active ? null : opt.v)}
                                className={cn(
                                    "border-r border-slate-300 px-3 text-sm font-medium transition last:border-r-0",
                                    active
                                        ? opt.v
                                            ? "bg-slate-900 text-white"
                                            : "bg-red-600 text-white"
                                        : "bg-white text-slate-700 hover:bg-slate-50",
                                )}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </Field>
    );
}

// Shoulder slope — categorical body measurement (§2.12). A plain dropdown of the
// ten fixed values plus a clear option; empty means "not changing the slope".
function SlopeSelect({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string | null) => void;
}) {
    return (
        <Field label={label}>
            <Select
                value={value || ""}
                onValueChange={(v) => onChange(v === "__clear" ? null : v)}
            >
                <SelectTrigger className={cn("w-64 bg-background", TRIGGER_H)}>
                    <SelectValue placeholder="No change" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__clear">(No change)</SelectItem>
                    {SHOULDER_SLOPE_UI.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Field>
    );
}
