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
import { Checkbox } from "@repo/ui/checkbox";
import { Plus } from "lucide-react";

import {
    type AlterationGarmentSchema,
    type AlterationGarmentSource,
    type AlterationMeasurementField,
    type AlterationStyleField,
} from "./alteration-form.schema";
import { AlterationMeasurementTable } from "./AlterationMeasurementTable";
import { AlterationChangeSummary } from "./AlterationChangeSummary";
import { OriginalSpecPanel } from "./OriginalSpecPanel";
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
    const styleBool = (field: AlterationStyleField): boolean => styles[field] === true;
    const styleNum = (field: AlterationStyleField): number | null => {
        const v = styles[field];
        return typeof v === "number" ? v : null;
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

                <div className="grid gap-3 lg:grid-cols-2">
                    {/* Collar group */}
                    <StyleGroup title="Collar">
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
                        <CheckboxImage
                            label="Small Tabbagi"
                            checked={styleBool("small_tabaggi")}
                            onChange={(v) => setStyle("small_tabaggi", v)}
                            image={smallTabaggiImage}
                        />
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-slate-700">Position</span>
                            <div className="flex gap-3">
                                <label className="flex items-center gap-1.5 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={styleStr("collar_position") === "up"}
                                        onChange={(e) =>
                                            setStyle("collar_position", e.target.checked ? "up" : "")
                                        }
                                    />
                                    UP
                                </label>
                                <label className="flex items-center gap-1.5 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={styleStr("collar_position") === "down"}
                                        onChange={(e) =>
                                            setStyle("collar_position", e.target.checked ? "down" : "")
                                        }
                                    />
                                    DOWN
                                </label>
                            </div>
                        </div>
                        <ThicknessField
                            label="Thickness"
                            value={styleStr("collar_thickness")}
                            onChange={(v) => setStyle("collar_thickness", v)}
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

                    {/* Jabzour */}
                    <StyleGroup title="Jabzour">
                        <ImagePickerField
                            label="Type"
                            value={styleStr("jabzour_1")}
                            options={jabzourTypes}
                            onChange={(v) => setStyle("jabzour_1", v)}
                            placeholder="Jabzour type"
                        />
                        {isShaab && (
                            <div className="flex items-end gap-1.5">
                                <Plus className="mb-2 size-3 text-muted-foreground/60 shrink-0" />
                                <div className="flex-1">
                                    <ImagePickerField
                                        label="2nd"
                                        value={styleStr("jabzour_2")}
                                        options={jabzourTypes.filter((j) => j.value !== "JAB_SHAAB")}
                                        onChange={(v) => setStyle("jabzour_2", v)}
                                        placeholder="2nd type"
                                    />
                                </div>
                            </div>
                        )}
                        <ThicknessField
                            label="Thickness"
                            value={styleStr("jabzour_thickness")}
                            onChange={(v) => setStyle("jabzour_thickness", v)}
                            disabled={isShaab}
                        />
                    </StyleGroup>

                    {/* Accessories */}
                    <StyleGroup title="Accessories">
                        <CheckboxImage
                            label="Wallet"
                            checked={styleBool("wallet_pocket")}
                            onChange={(v) => setStyle("wallet_pocket", v)}
                            image={walletIcon}
                        />
                        <CheckboxImage
                            label="Pen"
                            checked={styleBool("pen_holder")}
                            onChange={(v) => setStyle("pen_holder", v)}
                            image={penIcon}
                        />
                        <CheckboxImage
                            label="Mobile"
                            checked={styleBool("mobile_pocket")}
                            onChange={(v) => setStyle("mobile_pocket", v)}
                            image={phoneIcon}
                        />
                    </StyleGroup>

                    {/* Lines */}
                    <StyleGroup title="Lines">
                        <div className="flex items-center gap-4 px-1">
                            {[1, 2].map((n) => (
                                <label key={n} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={linesVal === n}
                                        onCheckedChange={(c) => setStyle("lines", c ? n : null)}
                                    />
                                    <span>{n} line{n > 1 ? "s" : ""}</span>
                                </label>
                            ))}
                            {linesVal != null && (
                                <button
                                    type="button"
                                    onClick={() => setStyle("lines", null)}
                                    className="text-sm text-slate-500 hover:text-slate-800 underline"
                                >
                                    clear
                                </button>
                            )}
                        </div>
                    </StyleGroup>
                </div>
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

function StyleGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {title}
            </div>
            <div className="flex flex-wrap items-end gap-3">{children}</div>
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
        <div className="min-w-[8rem] flex-1 space-y-1">
            <Label className="text-sm text-slate-600">{label}</Label>
            <Select
                value={value || ""}
                onValueChange={(v) => onChange(v === "__clear" ? null : v)}
            >
                <SelectTrigger className="bg-background">
                    {selected ? (
                        selected.image ? (
                            <img
                                src={selected.image}
                                alt={selected.alt}
                                className="min-w-10 h-10 object-contain"
                            />
                        ) : (
                            <span>{selected.displayText}</span>
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
        </div>
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
        <div className="min-w-[7rem] space-y-1">
            <Label className="text-sm text-slate-600">{label}</Label>
            <Select
                value={value || ""}
                onValueChange={(v) => onChange(v === "__clear" ? null : v)}
                disabled={disabled}
            >
                <SelectTrigger className="bg-background min-w-[6rem]">
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
        </div>
    );
}

function CheckboxImage({
    label,
    checked,
    onChange,
    image,
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    image: string;
}) {
    return (
        <label
            className={
                "relative flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 bg-white px-2 py-1.5 text-xs text-slate-700 transition " +
                (checked
                    ? "border-slate-900 ring-2 ring-slate-900/20"
                    : "border-slate-200 hover:bg-slate-50")
            }
        >
            <Checkbox
                checked={checked}
                onCheckedChange={(v) => onChange(!!v)}
                className="sr-only"
            />
            {checked && (
                <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    ✓
                </span>
            )}
            <img src={image} alt={label} className="h-9 w-9 object-contain" />
            <span className="font-medium">{label}</span>
        </label>
    );
}
