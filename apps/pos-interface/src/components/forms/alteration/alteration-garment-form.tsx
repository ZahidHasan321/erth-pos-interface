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
    ALTERATION_STYLE_FIELDS,
    type AlterationGarmentSchema,
    type AlterationMeasurementField,
    type AlterationStyleField,
} from "./alteration-form.schema";
import { AlterationMeasurementTable } from "./AlterationMeasurementTable";
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
import { getMeasurementsByCustomerId } from "@/api/measurements";
import { getCustomerGarmentsForLink, type PriorGarmentForLink } from "@/api/alteration-orders";
import type { Measurement } from "@repo/database";

const BUFI_OPTIONS = ["Brova", "Final", "External"] as const;

interface AlterationGarmentFormProps {
    customerId: number | null;
    value: AlterationGarmentSchema;
    onChange: (next: AlterationGarmentSchema) => void;
    masterMeasurement: Measurement | null;
}

type StyleVal = string | boolean | number;

export function AlterationGarmentForm({
    customerId,
    value,
    onChange,
    masterMeasurement,
}: AlterationGarmentFormProps) {
    const { data: customerMeasurementsRes } = useQuery({
        queryKey: ["measurements", customerId],
        queryFn: () => (customerId ? getMeasurementsByCustomerId(customerId) : Promise.resolve(null)),
        enabled: !!customerId,
        staleTime: Infinity,
    });
    const measurements = customerMeasurementsRes?.data ?? [];

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

    const linkPriorGarment = (priorGarmentId: string) => {
        const prior = priorGarments.find((g) => g.id === priorGarmentId);
        if (!prior) return;

        const newStyles: Record<string, StyleVal> = {};
        for (const f of ALTERATION_STYLE_FIELDS) {
            const v = (prior as Record<string, unknown>)[f];
            if (v != null && v !== "") newStyles[f] = v as StyleVal;
        }

        update({
            original_garment_id: priorGarmentId,
            alteration_styles: newStyles,
        });
    };

    const masterValueFor = (field: AlterationMeasurementField): number | null => {
        if (!masterMeasurement) return null;
        const v = (masterMeasurement as Record<string, unknown>)[field];
        return typeof v === "number" ? v : null;
    };

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
            <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                    <Label>Type</Label>
                    <div className="flex h-9 overflow-hidden rounded-md border border-slate-300">
                        {BUFI_OPTIONS.map((opt) => {
                            const selected = value.bufi_ext === opt;
                            return (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => update({ bufi_ext: selected ? null : opt })}
                                    className={
                                        "flex-1 text-xs font-semibold transition border-r border-slate-300 last:border-r-0 " +
                                        (selected
                                            ? "bg-slate-900 text-white"
                                            : "bg-white text-slate-700 hover:bg-slate-50")
                                    }
                                >
                                    {opt}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label>Link prior garment</Label>
                    <Select
                        value={value.original_garment_id ?? "__none"}
                        onValueChange={(v) => {
                            if (v === "__none") {
                                update({ original_garment_id: null });
                            } else {
                                linkPriorGarment(v);
                            }
                        }}
                        disabled={!customerId || priorGarments.length === 0}
                    >
                        <SelectTrigger className="bg-background">
                            <SelectValue placeholder={customerId ? (priorGarments.length === 0 ? "No prior garments" : "Optional") : "Select customer first"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none">— None —</SelectItem>
                            {priorGarments.map((g: PriorGarmentForLink) => (
                                <SelectItem key={g.id} value={g.id}>
                                    #{g.order_id} · {g.garment_id ?? g.id.slice(0, 8)} · {g.garment_type ?? "—"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-sm font-medium text-slate-700">Measurements</span>
                <div className="flex h-8 overflow-hidden rounded-md border border-slate-300">
                    {(["changes_only", "full_set"] as const).map((m) => {
                        const selected = value.mode === m;
                        return (
                            <button
                                key={m}
                                type="button"
                                onClick={() => update({ mode: m, full_measurement_set_id: m === "full_set" ? value.full_measurement_set_id : null })}
                                className={
                                    "px-3 text-xs font-semibold transition border-r border-slate-300 last:border-r-0 " +
                                    (selected ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100")
                                }
                            >
                                {m === "changes_only" ? "Changes only" : "Full set"}
                            </button>
                        );
                    })}
                </div>
                {value.mode === "full_set" && (
                    <Select
                        value={value.full_measurement_set_id ?? ""}
                        onValueChange={(v) => update({ full_measurement_set_id: v || null })}
                    >
                        <SelectTrigger className="ml-auto w-72 bg-background">
                            <SelectValue placeholder={measurements.length === 0 ? "No saved measurements" : "Pick measurement record"} />
                        </SelectTrigger>
                        <SelectContent>
                            {measurements.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                    {m.measurement_id ?? m.id.slice(0, 8)} · {m.type ?? "—"} · {m.reference ?? "—"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {/* Sparse measurement fields (changes_only) — table layout matching measurement form */}
            {value.mode === "changes_only" && (
                <div className="space-y-3">
                    <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Measurement Changes
                        </h4>
                        <p className="text-xs text-slate-500">
                            Fill only the cells that are changing. The row below each input shows the existing master value for reference.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <AlterationMeasurementTable
                            title="Chest & Shoulder"
                            values={value.alteration_measurements}
                            masterValueFor={masterValueFor}
                            onChange={setMeasurementField}
                            columns={[
                                { name: "chest_full", label: "1. Full Chest" },
                                { name: "shoulder", label: "2. Shoulder" },
                                { name: "sleeve_length", label: "3. Sleeve Len" },
                                { name: "sleeve_width", label: "4. Sleeve W" },
                                { name: "elbow", label: "5. Elbow" },
                                { name: "armhole_front", label: "6. Armhole F" },
                                { name: "chest_upper", label: "7. Upper Chest" },
                                { name: "chest_front", label: "8. Front Chest" },
                                { name: "waist_front", label: "9. Front Waist" },
                            ]}
                        />
                        <AlterationMeasurementTable
                            title="Waist, Collar & Back"
                            values={value.alteration_measurements}
                            masterValueFor={masterValueFor}
                            onChange={setMeasurementField}
                            columns={[
                                { name: "top_pocket_distance", label: "10. Pocket Dist" },
                                { name: "jabzour_length", label: "11. Jabzour Len" },
                                { name: "length_front", label: "12. Front Len" },
                                { name: "bottom", label: "13. Bottom" },
                                { name: "chest_back", label: "14. Back Chest" },
                                { name: "waist_back", label: "15. Back Waist" },
                                { name: "length_back", label: "16. Back Len" },
                                { name: "collar_width", label: "17. Collar Len" },
                                { name: "collar_height", label: "18. Collar H" },
                            ]}
                        />
                        <AlterationMeasurementTable
                            title="Armhole, Pockets & Jabzour"
                            values={value.alteration_measurements}
                            masterValueFor={masterValueFor}
                            onChange={setMeasurementField}
                            columns={[
                                { name: "armhole", label: "Armhole Full" },
                                { name: "waist_full", label: "Waist Full" },
                                { name: "jabzour_width", label: "Jabzour W" },
                                { name: "top_pocket_length", label: "Top Pkt Len" },
                                { name: "top_pocket_width", label: "Top Pkt W" },
                                { name: "side_pocket_length", label: "Side Pkt Len" },
                                { name: "side_pocket_width", label: "Side Pkt W" },
                                { name: "side_pocket_distance", label: "Side Pkt Dist" },
                                { name: "side_pocket_opening", label: "Side Pkt Open" },
                            ]}
                        />
                        <AlterationMeasurementTable
                            title="Gallabiya, Basma, Hemming & Pen Pocket"
                            values={value.alteration_measurements}
                            masterValueFor={masterValueFor}
                            onChange={setMeasurementField}
                            columns={[
                                { name: "collar_length", label: "Gallabiya Len" },
                                { name: "second_button_distance", label: "2nd Button Dist" },
                                { name: "basma_length", label: "Basma Len" },
                                { name: "basma_width", label: "Basma W" },
                                { name: "basma_sleeve_length", label: "Basma Sleeve L" },
                                { name: "sleeve_hemming", label: "Sleeve Hem" },
                                { name: "bottom_hemming", label: "Bottom Hem" },
                                { name: "pen_pocket_length", label: "Pen Pkt Len" },
                                { name: "pen_pocket_width", label: "Pen Pkt W" },
                            ]}
                        />
                    </div>
                </div>
            )}

            {/* Style overrides — image-driven */}
            <div className="space-y-3">
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Style Changes
                    </h4>
                    <p className="text-xs text-slate-500">
                        Pick only what should change from the original.
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
                                    className="text-xs text-slate-500 hover:text-slate-800 underline"
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
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
            <Label className="text-xs text-slate-600">{label}</Label>
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
                    <SelectItem value="__clear">— None —</SelectItem>
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
            <Label className="text-xs text-slate-600">{label}</Label>
            <Select
                value={value || ""}
                onValueChange={(v) => onChange(v === "__clear" ? null : v)}
                disabled={disabled}
            >
                <SelectTrigger className="bg-background min-w-[6rem]">
                    <SelectValue placeholder="Thickness" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__clear">— None —</SelectItem>
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
                "relative flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 bg-white px-2 py-1.5 text-[10px] text-slate-700 transition " +
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
                <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-slate-900 text-[9px] font-bold text-white">
                    ✓
                </span>
            )}
            <img src={image} alt={label} className="h-9 w-9 object-contain" />
            <span className="font-medium">{label}</span>
        </label>
    );
}
