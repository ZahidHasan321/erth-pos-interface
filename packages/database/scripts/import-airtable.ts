/**
 * Bulk-import legacy Airtable CSV exports into the new Postgres schema.
 *
 * Source: AIRTABLE_MAPPING.xlsx (repo root) is the authoritative field-by-field
 * map. This script implements the "Mapped" rows; "MISSING" / "Not Migrated" /
 * "Auto-Calculated" / "Replaced" are intentionally skipped.
 *
 * CSV directory (override with AIRTABLE_DIR env var):
 *   ../../../../seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V8/
 *
 * Usage:
 *   pnpm --filter @repo/database tsx scripts/import-airtable.ts          # dry-run
 *   pnpm --filter @repo/database tsx scripts/import-airtable.ts --run    # actually insert
 *   AIRTABLE_DIR=/path/to/csvs pnpm ... --run --only=customers,fabrics
 *
 * Idempotent: re-runnable. Uses natural keys (phone, fabric name, invoice_number,
 * measurement_id text, garment_id text) with ON CONFLICT DO NOTHING.
 *
 * Dependency:
 *   pnpm --filter @repo/database add -D csv-parse
 */

import postgres from "postgres";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { parse as parseCsv } from "csv-parse/sync";

dotenv.config({ path: path.join(__dirname, "../.env") });

// -- CLI flags ----------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--run");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY: Set<string> | null = onlyArg
    ? new Set(onlyArg.replace("--only=", "").split(",").map((s) => s.trim()))
    : null;

const DEFAULT_DIR = path.resolve(
    __dirname,
    "../../../../seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V8"
);
const AIRTABLE_DIR = process.env.AIRTABLE_DIR || DEFAULT_DIR;

const sql = postgres(process.env.DATABASE_URL!, { max: 4 });

// -- Helpers ------------------------------------------------------------------

function loadCsv(name: string): Record<string, string>[] {
    const file = path.join(AIRTABLE_DIR, name);
    if (!fs.existsSync(file)) {
        console.warn(`  ⚠ missing: ${name}`);
        return [];
    }
    const raw = fs.readFileSync(file, "utf8");
    return parseCsv(raw, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
        trim: true,
    }) as Record<string, string>[];
}

const blank = (v: unknown): boolean =>
    v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const txt = (v: unknown): string | null => (blank(v) ? null : String(v).trim());

const num = (v: unknown): number | null => {
    if (blank(v)) return null;
    // Old data sometimes uses fractions like "1 1/2" — drop those, keep plain numbers
    const s = String(v).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};

const bool = (v: unknown): boolean | null => {
    if (blank(v)) return null;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "y", "checked"].includes(s)) return true;
    if (["false", "0", "no", "n", "unchecked"].includes(s)) return false;
    return null;
};

const dateOnly = (v: unknown): string | null => {
    if (blank(v)) return null;
    const s = String(v).trim();
    // ISO-ish: 2025-03-25 or 2025-03-25T07:35:20.000Z
    const m = s.match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : null;
};

const ts = (v: unknown): string | null => {
    if (blank(v)) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d.toISOString();
};

// -- Value mappings (from "Value Mappings" sheet of AIRTABLE_MAPPING.xlsx) ----

const BRAND_MAP: Record<string, "ERTH" | "SAKKBA" | "QASS"> = {
    IRTH: "ERTH",
    ERTH: "ERTH",
    SAKBA: "SAKKBA",
    SAKKBA: "SAKKBA",
    QASS: "QASS",
};
const mapBrand = (v: unknown): "ERTH" | "SAKKBA" | "QASS" => {
    const t = txt(v);
    if (!t) return "ERTH";
    return BRAND_MAP[t.toUpperCase()] || "ERTH";
};

const PAYMENT_TYPE_MAP: Record<string, string> = {
    "K NET": "knet",
    KNET: "knet",
    CASH: "cash",
    LINK: "link_payment",
    "LINK PAYMENT": "link_payment",
};
const mapPaymentType = (v: unknown): string | null => {
    const t = txt(v);
    return t ? PAYMENT_TYPE_MAP[t.toUpperCase()] || null : null;
};

const ORDER_PHASE_MAP: Record<string, string> = {
    "": "new",
    "01 REGISTERED": "new",
    "02 WAITING CUT": "in_progress",
    "03 IN PRODUCTION": "in_progress",
    "04 FN WTG": "in_progress",
    "05 READY FOR DISPATCH": "in_progress",
    "06 FINAL AT SHOP": "in_progress",
    "06 FINAL+BROVA AT SHOP": "in_progress",
    "WITH BROVA ALT": "in_progress",
    Done: "completed",
};
const mapOrderPhase = (v: unknown): string => {
    const t = txt(v) || "";
    return ORDER_PHASE_MAP[t] ?? "new";
};

const mapGarmentType = (v: unknown): "brova" | "final" => {
    const t = (txt(v) || "").toUpperCase();
    return t === "BROVA" ? "brova" : "final";
};

const mapStyle = (v: unknown): string => {
    const t = (txt(v) || "kuwaiti").toLowerCase();
    if (["kuwaiti", "saudi", "bahraini"].includes(t)) return t;
    return "kuwaiti";
};

const mapMeasurementType = (v: unknown): "Body" | "Dishdasha" | null => {
    const t = (txt(v) || "").toUpperCase();
    if (t === "BODY") return "Body";
    if (t === "DISHDASHA") return "Dishdasha";
    return null;
};

const mapJabzour1 = (v: unknown): "BUTTON" | "ZIPPER" | null => {
    const t = (txt(v) || "").toUpperCase();
    if (t.includes("ZIPPER")) return "ZIPPER";
    if (t.includes("BUTTON")) return "BUTTON";
    return null;
};

// -- Lookup maps populated as we insert ---------------------------------------

const customerByPhone = new Map<string, number>();      // phone → customers.id
const measurementByMid = new Map<string, string>();     // "IM000805" → measurements.id (uuid)
const fabricByName = new Map<string, number>();         // fabric name → fabrics.id
const orderByInvoice = new Map<string, number>();       // FATOURA → orders.id

// -- Section runners ----------------------------------------------------------

const sections = ["customers", "fabrics", "styles", "campaigns",
    "measurements", "orders", "garments", "payments", "shelf"] as const;

function shouldRun(section: typeof sections[number]) {
    return !ONLY || ONLY.has(section);
}

// 1. CUSTOMERS ---------------------------------------------------------------
async function importCustomers() {
    if (!shouldRun("customers")) return;
    const rows = loadCsv("CUSTOMER.csv");
    console.log(`\n[customers] ${rows.length} rows`);
    let inserted = 0, skipped = 0;

    for (const r of rows) {
        const phone = txt(r["PHONE"]);
        const name = txt(r["NAME"]);
        if (!phone || !name) { skipped++; continue; }

        // FAM MEMBER and Relation map to the same column — prefer Relation
        const relation = txt(r["Relation"]) ?? txt(r["FAM MEMBER"]);
        const segment = txt(r["CustomerSegment"]) ?? txt(r["TYPE CUSTOMER"]);
        const accountTypeRaw = txt(r["AccountType"]);
        const accountType = accountTypeRaw === "Primary" || accountTypeRaw === "Secondary"
            ? accountTypeRaw : null;

        const payload = {
            name,
            phone,
            nick_name: txt(r["NICK NAME"]) ?? txt(r["NickName"]),
            arabic_name: txt(r["ArabicName"]),
            arabic_nickname: txt(r["ArabicNickname"]),
            country_code: txt(r["CountryCode"]),
            alternative_country_code: txt(r["AlternateCountryCode"]),
            alternate_mobile: txt(r["ALTERNATE MOBILE NUM"]),
            whatsapp: bool(r["Whatsapp Available"]) ?? false,
            whatsapp_alt: bool(r["WhatsappAlt"]) ?? false,
            email: txt(r["Email Address"]),
            insta_id: txt(r["InstaID"]),
            city: txt(r["City"]),
            block: txt(r["Block"]),
            street: txt(r["Street"]),
            house_no: txt(r["House / Building No."]),
            area: txt(r["Area"]),
            address_note: txt(r["AddressNote"]),
            nationality: txt(r["Customer Nationality"]),
            dob: ts(r["DOB"]),
            customer_segment: segment,
            account_type: accountType,
            relation,
            notes: txt(r["Note"]),
        };

        if (DRY_RUN) {
            inserted++;
            continue;
        }

        // Natural key: phone+name (a phone can be shared across family members)
        const existing = await sql<{ id: number }[]>`
            SELECT id FROM customers WHERE phone = ${phone} AND name = ${name} LIMIT 1
        `;
        if (existing.length) {
            customerByPhone.set(phone, existing[0].id);
            skipped++;
            continue;
        }

        const [row] = await sql<{ id: number }[]>`
            INSERT INTO customers ${sql(payload)} RETURNING id
        `;
        customerByPhone.set(phone, row.id);
        inserted++;
    }
    console.log(`  inserted=${inserted} skipped=${skipped}`);
}

// 2. FABRICS -----------------------------------------------------------------
async function importFabrics() {
    if (!shouldRun("fabrics")) return;
    const rows = loadCsv("FABRIC.csv");
    console.log(`\n[fabrics] ${rows.length} rows`);
    let inserted = 0, skipped = 0;

    for (const r of rows) {
        const name = txt(r["Name"]);
        if (!name) { skipped++; continue; }

        const initialStock = num(r["INITIAL STOCK"]) ?? num(r["INITIAL STOCK "]);
        const seasonRaw = (txt(r["SEASON"]) || "").toLowerCase();
        const season = seasonRaw === "summer" || seasonRaw === "winter" ? seasonRaw : null;

        const payload = {
            name,
            color: txt(r["COL"]),
            price_per_meter: num(r["PURCHASE PRICE"]),
            supplier: txt(r["SUPP"]),
            season,
            // Initial stock is split across shop/workshop — default everything to shop.
            // Adjust per business decision before run.
            shop_stock: initialStock,
            workshop_stock: 0,
        };

        if (DRY_RUN) { inserted++; continue; }

        const [row] = await sql<{ id: number }[]>`
            INSERT INTO fabrics ${sql(payload)}
            ON CONFLICT (name) DO UPDATE SET
                color = EXCLUDED.color,
                price_per_meter = EXCLUDED.price_per_meter,
                supplier = EXCLUDED.supplier,
                season = EXCLUDED.season
            RETURNING id
        `;
        fabricByName.set(name, row.id);
        inserted++;
    }
    console.log(`  inserted=${inserted} skipped=${skipped}`);
}

// 3. STYLES (collar, buttons, jabzour, front pocket, side pocket) ------------
async function importStyles() {
    if (!shouldRun("styles")) return;

    type StyleSpec = {
        file: string;
        component: string;
        type: string;
        codeCol?: string;
    };
    const specs: StyleSpec[] = [
        { file: "COLLAR.csv", component: "collar_type", type: "collar" },
        { file: "BUTTONS.csv", component: "collar_button", type: "buttons" },
        { file: "JABZOUR.csv", component: "jabzour_type", type: "jabzour", codeCol: "JABZ CODE" },
        { file: "FRONT POCKET.csv", component: "front_pocket_type", type: "front_pocket", codeCol: "F P CODE" },
        { file: "SIDE POCKET.csv", component: "side_pocket_type", type: "side_pocket", codeCol: "S P CODE" },
    ];

    let total = 0;
    for (const spec of specs) {
        const rows = loadCsv(spec.file);
        for (const r of rows) {
            const name = txt(r["Name"]);
            if (!name) continue;

            const payload = {
                name,
                type: spec.type,
                component: spec.component,
                code: spec.codeCol ? txt(r[spec.codeCol]) : null,
                image_url: txt(r["IMAGE"]) ?? txt(r["SKETCHES B"]),
                brand: "ERTH" as const,
            };

            if (DRY_RUN) { total++; continue; }

            await sql`
                INSERT INTO styles ${sql(payload)}
                ON CONFLICT (name, type, brand) DO UPDATE SET
                    component = EXCLUDED.component,
                    code = EXCLUDED.code,
                    image_url = COALESCE(EXCLUDED.image_url, styles.image_url)
            `;
            total++;
        }
    }
    console.log(`\n[styles] total=${total}`);
}

// 4. CAMPAIGNS ---------------------------------------------------------------
async function importCampaigns() {
    if (!shouldRun("campaigns")) return;
    const rows = loadCsv("COMPAIGN.csv");
    let inserted = 0;
    for (const r of rows) {
        const name = txt(r["Name"]);
        if (!name) continue;
        if (DRY_RUN) { inserted++; continue; }
        await sql`
            INSERT INTO campaigns (name, active)
            VALUES (${name}, ${bool(r["Active"]) ?? true})
            ON CONFLICT DO NOTHING
        `;
        inserted++;
    }
    console.log(`\n[campaigns] inserted=${inserted}`);
}

// 5. MEASUREMENTS ------------------------------------------------------------
async function importMeasurements() {
    if (!shouldRun("measurements")) return;
    const rows = loadCsv("MEASURE.csv");
    console.log(`\n[measurements] ${rows.length} rows`);
    let inserted = 0, skipped = 0;

    // Build phone↔customer_id map if not populated (e.g. running --only=measurements)
    if (!DRY_RUN && customerByPhone.size === 0) {
        const all = await sql<{ id: number; phone: string }[]>`
            SELECT id, phone FROM customers WHERE phone IS NOT NULL
        `;
        for (const c of all) customerByPhone.set(c.phone, c.id);
    }

    for (const r of rows) {
        const measurementId = txt(r["MEASURE ID"]);
        if (!measurementId) { skipped++; continue; }

        // CUSTOMER 2 column holds the customer's PHONE; CustomerID column holds
        // the numeric ID (varies by export). Try phone first.
        const phone = txt(r["TEL 📞"]) ?? txt(r["CUSTOMER 2"]);
        const customerId = phone ? customerByPhone.get(phone) : undefined;
        if (!customerId) { skipped++; continue; }

        const payload = {
            measurement_id: measurementId,
            customer_id: customerId,
            type: mapMeasurementType(r["MEASURE TYPE"]),
            reference: txt(r["Libellé"]),
            notes: txt(r["Notes"]),
            collar_width: num(r["COLLAR L"]),
            collar_height: num(r["COLLAR HE"]),
            shoulder: num(r["SHOULDER"]),
            armhole: num(r["ARMHOLE"]),
            chest_upper: num(r["UP CHEST"]),
            chest_full: num(r["CHEST"]),
            chest_front: num(r["HALF CHEST"]),
            chest_back: num(r["BACK CHEST"]),
            armhole_front: num(r["ArmholeFront"]),
            sleeve_length: num(r["SLEEVES LENGTH"]),
            sleeve_width: num(r["SLEEVES WIDTH"]),
            elbow: num(r["ELBOW"]),
            top_pocket_length: num(r["F POCK H"]),
            top_pocket_width: num(r["F POCK W"]),
            top_pocket_distance: num(r["DIST TO F POCK"]),
            side_pocket_length: num(r["S POCK L"]),
            side_pocket_width: num(r["S POCK W"]),
            side_pocket_distance: num(r["DIST TO S POCK"]),
            side_pocket_opening: num(r["OPENING S POCK L"]),
            waist_front: num(r["FRONT WAIST"]),
            waist_back: num(r["BACK WAIST"]),
            waist_full: num(r["WaistFull"]),
            length_front: num(r["FRONT LENGTH"]),
            length_back: num(r["BACK LENGTH"]),
            bottom: num(r["BOTTOM"]),
            jabzour_width: num(r["JABZOUR W"]),
            jabzour_length: num(r["JABZOUR L"]) ?? num(r["JABZ L inv"]),
            armhole_provision: num(r["ArmholeProvision"]),
            chest_provision: num(r["ChestProvision"]),
            waist_provision: num(r["Waist Provision"]),
        };

        if (DRY_RUN) { inserted++; continue; }

        const existing = await sql<{ id: string }[]>`
            SELECT id FROM measurements WHERE measurement_id = ${measurementId} LIMIT 1
        `;
        if (existing.length) {
            measurementByMid.set(measurementId, existing[0].id);
            skipped++;
            continue;
        }

        const [row] = await sql<{ id: string }[]>`
            INSERT INTO measurements ${sql(payload)} RETURNING id
        `;
        measurementByMid.set(measurementId, row.id);
        inserted++;
    }
    console.log(`  inserted=${inserted} skipped=${skipped}`);
}

// 6. ORDERS + WORK_ORDERS ----------------------------------------------------
async function importOrders() {
    if (!shouldRun("orders")) return;
    const rows = loadCsv("FATOURA.csv");
    console.log(`\n[orders] ${rows.length} rows`);
    let inserted = 0, skipped = 0;

    if (!DRY_RUN && customerByPhone.size === 0) {
        const all = await sql<{ id: number; phone: string }[]>`
            SELECT id, phone FROM customers WHERE phone IS NOT NULL
        `;
        for (const c of all) customerByPhone.set(c.phone, c.id);
    }

    for (const r of rows) {
        const fatoura = txt(r["FATOURA"]);
        if (!fatoura) { skipped++; continue; }
        const phone = txt(r["PHONE CUSTOMER 📞"]) ?? txt(r["PHONE CUSTOMER"]);
        const customerId = phone ? customerByPhone.get(phone) : undefined;
        if (!customerId) { skipped++; continue; }

        const cancelled = (txt(r["cancellation"]) || "").toLowerCase() === "true"
            || (txt(r["cancellation"]) || "").toLowerCase() === "cancelled";

        const orderPayload = {
            customer_id: customerId,
            order_date: ts(r["INVOICE DATE"]),
            brand: mapBrand(r["BRAND"]),
            checkout_status: cancelled ? "cancelled" : "confirmed",
            order_type: "WORK" as const,
            payment_type: mapPaymentType(r["PAYMENT TYPE"]),
            payment_note: txt(r["PAYMENT REMARKS"]),
            order_total: num(r["TOT DUE"]),
            discount_type: txt(r["DiscountType"]),
            discount_value: num(r["DiscountValue"]),
            referral_code: txt(r["ReferralCode"]),
            delivery_charge: num(r["DeliveryCharge"]),
            notes: txt(r["SPECIAL REQUESTS (à partir de PCE REF)"]) ?? txt(r["SPECIAL REQUESTS"]),
        };

        const invoiceNumber = parseInt(fatoura.replace(/^0+/, ""), 10);
        const workOrderPayload = {
            invoice_number: Number.isFinite(invoiceNumber) ? invoiceNumber : null,
            delivery_date: ts(r["FNL DELIVERY DATE REQUESTED"]) ?? ts(r["BRV DELIVERY DATE REQUESTED"]),
            order_phase: mapOrderPhase(r["PRODUCTION PHASE"]),
            home_delivery: bool(r["HomeDelivery"]) ?? false,
        };

        if (DRY_RUN) { inserted++; continue; }

        // Skip if already imported (by invoice_number)
        if (workOrderPayload.invoice_number != null) {
            const existing = await sql<{ order_id: number }[]>`
                SELECT order_id FROM work_orders WHERE invoice_number = ${workOrderPayload.invoice_number} LIMIT 1
            `;
            if (existing.length) {
                orderByInvoice.set(fatoura, existing[0].order_id);
                skipped++;
                continue;
            }
        }

        const [order] = await sql<{ id: number }[]>`
            INSERT INTO orders ${sql(orderPayload)} RETURNING id
        `;
        await sql`
            INSERT INTO work_orders ${sql({ order_id: order.id, ...workOrderPayload })}
        `;
        orderByInvoice.set(fatoura, order.id);
        inserted++;
    }
    console.log(`  inserted=${inserted} skipped=${skipped}`);
}

// 7. GARMENTS (legacy ORDERS.csv = pieces) ----------------------------------
async function importGarments() {
    if (!shouldRun("garments")) return;
    const rows = loadCsv("ORDERS.csv");
    console.log(`\n[garments] ${rows.length} rows`);
    let inserted = 0, skipped = 0;

    if (!DRY_RUN && fabricByName.size === 0) {
        const all = await sql<{ id: number; name: string }[]>`SELECT id, name FROM fabrics`;
        for (const f of all) fabricByName.set(f.name, f.id);
    }
    if (!DRY_RUN && measurementByMid.size === 0) {
        const all = await sql<{ id: string; measurement_id: string | null }[]>`
            SELECT id, measurement_id FROM measurements WHERE measurement_id IS NOT NULL
        `;
        for (const m of all) if (m.measurement_id) measurementByMid.set(m.measurement_id, m.id);
    }
    if (!DRY_RUN && orderByInvoice.size === 0) {
        const all = await sql<{ order_id: number; invoice_number: number | null }[]>`
            SELECT order_id, invoice_number FROM work_orders WHERE invoice_number IS NOT NULL
        `;
        for (const o of all) {
            if (o.invoice_number != null) {
                orderByInvoice.set(String(o.invoice_number), o.order_id);
                orderByInvoice.set(String(o.invoice_number).padStart(4, "0"), o.order_id);
            }
        }
    }

    for (const r of rows) {
        const pceRef = txt(r["PCE REF"]);
        if (!pceRef) { skipped++; continue; }

        const invRef = txt(r["INV REF O"]);
        const orderId = invRef ? orderByInvoice.get(invRef) : undefined;
        if (!orderId) { skipped++; continue; }

        // Old "PRODUCT" or "Libellé" sometimes carries fabric name; FABRIC link
        // is exported as fabric NAME in some columns. Use FABRIC SUPPLIER as
        // best-effort lookup if a dedicated column isn't present in this export.
        const fabricName = txt(r["PRODUCT"]) ?? txt(r["Libellé"]);
        const fabricId = fabricName ? fabricByName.get(fabricName) : undefined;

        // Measurement linkage: legacy MEASURE.csv has a GARMENT column linking
        // back to PCE REF; we follow that direction below if needed. The ORDERS
        // CSV itself does not have a direct measurement-id column.
        const payload = {
            order_id: orderId,
            garment_id: pceRef,
            fabric_id: fabricId ?? null,
            measurement_id: null, // populated by linkGarmentMeasurements() below
            style: mapStyle(r["PRODUCT TYPE REQUESTED"]),
            quantity: num(r["QTY"]) ?? 1,
            fabric_length: num(r["consump"]),
            soaking: bool(r["WATER"]) ?? false,
            collar_type: txt(r["COLLAR IMAGE REQUESTED"]),
            cuffs_thickness: txt(r["COLLAR THICKNESS"]),
            collar_button: txt(r["TYPE BUTTONS"]),
            jabzour_1: mapJabzour1(r["JABZOUR 1 REQUESTED"]),
            jabzour_2: txt(r["JABZOUR 2 IMAGE"]),
            jabzour_thickness: txt(r["HASHWA JABZOUR REQUESTED"]),
            front_pocket_type: txt(r["F PCK"]),
            front_pocket_thickness: txt(r["HASHWA F PCK REQUESTED"]),
            pen_holder: bool(r["P PCK REQUESTED"]) ?? false,
            wallet_pocket: bool(r["W PCK REQUESTED"]) ?? false,
            mobile_pocket: bool(r["M PCK REQUESTED"]) ?? false,
            small_tabaggi: bool(r["SMALL TABAGGI REQUESTED"]) ?? false,
            cuffs_type: txt(r["SLEEVES TYPE"]),
            lines: num(r["LINES REQUESTED"]) ?? 1,
            delivery_date: ts(r["FINAL DEL DATE REQUESTED"]),
            notes: txt(r["SPECIAL REQUESTS"]),
            garment_type: mapGarmentType(r["B/F"]),
            acceptance_status: bool(r["APPROVED"]),
            // Imported garments are historical — assume completed at shop unless
            // production phase suggests otherwise. Adjust before run if needed.
            piece_stage: "completed" as const,
            location: "shop" as const,
        };

        if (DRY_RUN) { inserted++; continue; }

        await sql`
            INSERT INTO garments ${sql(payload)}
            ON CONFLICT (order_id, garment_id) DO NOTHING
        `;
        inserted++;
    }
    console.log(`  inserted=${inserted} skipped=${skipped}`);
}

// 7b. Link garments → measurements via MEASURE.csv GARMENT column ------------
async function linkGarmentMeasurements() {
    if (!shouldRun("garments")) return;
    const rows = loadCsv("MEASURE.csv");
    let linked = 0;
    for (const r of rows) {
        const measurementId = txt(r["MEASURE ID"]);
        const garmentRef = txt(r["GARMENT"]); // PCE REF of linked garment
        if (!measurementId || !garmentRef) continue;
        if (DRY_RUN) { linked++; continue; }
        const measUuid = measurementByMid.get(measurementId);
        if (!measUuid) continue;
        await sql`
            UPDATE garments SET measurement_id = ${measUuid}
            WHERE garment_id = ${garmentRef} AND measurement_id IS NULL
        `;
        linked++;
    }
    console.log(`  garment↔measurement links: ${linked}`);
}

// 8. PAYMENT TRANSACTIONS (split from FATOURA payment columns) ---------------
async function importPayments() {
    if (!shouldRun("payments")) return;
    const rows = loadCsv("FATOURA.csv");
    console.log(`\n[payments] from ${rows.length} fatoura rows`);
    let inserted = 0;

    if (!DRY_RUN && orderByInvoice.size === 0) {
        const all = await sql<{ order_id: number; invoice_number: number | null }[]>`
            SELECT order_id, invoice_number FROM work_orders WHERE invoice_number IS NOT NULL
        `;
        for (const o of all) {
            if (o.invoice_number != null) {
                orderByInvoice.set(String(o.invoice_number), o.order_id);
                orderByInvoice.set(String(o.invoice_number).padStart(4, "0"), o.order_id);
            }
        }
    }

    for (const r of rows) {
        const fatoura = txt(r["FATOURA"]);
        if (!fatoura) continue;
        const orderId = orderByInvoice.get(fatoura);
        if (!orderId) continue;

        const paymentType = mapPaymentType(r["PAYMENT TYPE"]);
        const splits: Array<[string, number | null]> = [
            ["1ST", num(r["1 ST PAIMENT"])],
            ["2ND", num(r["2ND PAIMENT"])],
            ["LAST", num(r["LAST PAIMENT"])],
        ];

        for (const [label, amount] of splits) {
            if (amount == null || amount <= 0) continue;
            if (DRY_RUN) { inserted++; continue; }
            await sql`
                INSERT INTO payment_transactions
                    (order_id, amount, payment_type, payment_note, transaction_type)
                VALUES
                    (${orderId}, ${amount}, ${paymentType}, ${`legacy ${label}`}, 'payment')
            `;
            inserted++;
        }
    }
    console.log(`  inserted=${inserted}`);
}

// 9. SHELF -------------------------------------------------------------------
async function importShelf() {
    if (!shouldRun("shelf")) return;
    const rows = loadCsv("Shelves.csv");
    let inserted = 0;
    for (const r of rows) {
        const type = txt(r["Type"]);
        if (!type) continue;
        const payload = {
            type,
            brand: txt(r["Brand"]),
            shop_stock: num(r["Stock"]),
            workshop_stock: 0,
            price: num(r["UnitPrice"]),
        };
        if (DRY_RUN) { inserted++; continue; }
        await sql`
            INSERT INTO shelf ${sql(payload)}
            ON CONFLICT (type) DO UPDATE SET
                brand = EXCLUDED.brand,
                price = EXCLUDED.price
        `;
        inserted++;
    }
    console.log(`\n[shelf] inserted=${inserted}`);
}

// -- Main --------------------------------------------------------------------

async function main() {
    console.log(`Airtable import — ${DRY_RUN ? "DRY-RUN" : "LIVE"}`);
    console.log(`Source: ${AIRTABLE_DIR}`);
    if (ONLY) console.log(`Only: ${[...ONLY].join(",")}`);

    try {
        await importCustomers();
        await importFabrics();
        await importStyles();
        await importCampaigns();
        await importMeasurements();
        await importOrders();
        await importGarments();
        await linkGarmentMeasurements();
        await importPayments();
        await importShelf();
        console.log("\n✓ done");
    } catch (e) {
        console.error("\n✗ failed:", e);
        process.exitCode = 1;
    } finally {
        await sql.end();
    }
}

main();
