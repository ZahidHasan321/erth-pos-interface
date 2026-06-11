import { pgTable, text, serial, integer, boolean, timestamp, pgEnum, uuid, uniqueIndex, index, customType, date, jsonb, primaryKey, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { relations, sql, type InferSelectModel, type InferInsertModel } from "drizzle-orm";

// --- CUSTOM TYPES ---

// Automatically maps PostgreSQL decimal (string) to JS number
const numeric = (name: string, config?: { precision?: number; scale?: number }) =>
    customType<{ data: number; driverData: string }>({
        dataType() {
            return config ? `numeric(${config.precision}, ${config.scale})` : "numeric";
        },
        fromDriver(value: string): number {
            return Number(value);
        },
        toDriver(value: number): string {
            return value.toString();
        },
    })(name);

// --- ENUMS (Normalized from JSON) ---

export const roleEnum = pgEnum("role", ["super_admin", "admin", "staff", "manager", "cashier"]);
export type Role = (typeof roleEnum.enumValues)[number];

export const departmentEnum = pgEnum("department", ["workshop", "shop"]);
export type Department = (typeof departmentEnum.enumValues)[number];

// Terminal specialisation for workshop staff. Null = office user (role+department
// drive access). Non-null = terminal-locked user who only sees their own terminal.
export const jobFunctionEnum = pgEnum("job_function", [
    "soaker",
    "cutter",
    "post_cutter",
    "sewer",
    "finisher",
    "ironer",
    "qc",
]);
export type JobFunction = (typeof jobFunctionEnum.enumValues)[number];

// Production stage — verb-noun form matching scheduler keys (soaking/cutting/…)
// distinct from job_function's person-noun form (soaker/cutter/…). Units live
// at this stage level; resources hang off units.
export const productionStageEnum = pgEnum("production_stage", [
    "soaking",
    "cutting",
    "post_cutting",
    "sewing",
    "finishing",
    "ironing",
    "quality_check",
]);
export type ProductionStage = (typeof productionStageEnum.enumValues)[number];

// "OrderStatus" from Airtable (Drafting vs Completed)
export const checkoutStatusEnum = pgEnum("checkout_status", [
    "draft",       // Was "Pending" - Customer is building order
    "confirmed",   // Was "Completed" - Customer finished ordering
    "cancelled"    // Was "Cancelled"
]);
export type CheckoutStatus = (typeof checkoutStatusEnum.enumValues)[number];

export const orderPhaseEnum = pgEnum("order_phase", [
    "new",            // Created at shop, not dispatched yet
    "in_progress",    // Any garment beyond pre-dispatch stages
    "completed",      // All garments completed
]);
export type OrderPhase = (typeof orderPhaseEnum.enumValues)[number];

export const pieceStageEnum = pgEnum("piece_stage", [
    // --- Waiting ---
    "waiting_for_acceptance",    // Finals parked, brova not tried yet

    // --- Pre-Production ---
    "waiting_cut",               // Queued at workshop
    "soaking",                   // Fabric prep

    // --- Core Production (6 workshop terminals) ---
    "cutting",
    "post_cutting",
    "sewing",
    "finishing",
    "ironing",
    "quality_check",

    // --- Post-QC ---
    "ready_for_dispatch",        // Passed QC, dispatch queue

    // --- Shop ---
    "awaiting_trial",            // Brova/Final at shop, waiting for customer trial/recheck
    "ready_for_pickup",          // Final at shop, ready for customer collection
    "brova_trialed",             // Brova after customer trial (feedback_status has outcome)

    // --- Terminal ---
    "completed",                 // Done (fulfillment_type says collected vs delivered)
    "discarded",                 // Terminal: redo outcome. Original garment dead, replaced by a new garment row (see replaced_by_garment_id).
]);
export type PieceStage = (typeof pieceStageEnum.enumValues)[number];

export const locationEnum = pgEnum("location", [
    "shop",
    "workshop",
    "transit_to_shop",
    "transit_to_workshop",
    "lost_in_transit",
]);
export type Location = (typeof locationEnum.enumValues)[number];

export const fulfillmentTypeEnum = pgEnum("fulfillment_type", [
    "collected",   // Customer picked up
    "delivered",   // Home delivery
]);
export type FulfillmentType = (typeof fulfillmentTypeEnum.enumValues)[number];

export const paymentTypeEnum = pgEnum("payment_type", ["knet", "cash", "link_payment", "installments", "others"]);
export type PaymentType = (typeof paymentTypeEnum.enumValues)[number];

export const discountTypeEnum = pgEnum("discount_type", ["flat", "referral", "loyalty", "by_value"]);
export type DiscountType = (typeof discountTypeEnum.enumValues)[number];

export const orderTypeEnum = pgEnum("order_type", ["WORK", "SALES", "ALTERATION"]);
export type OrderType = (typeof orderTypeEnum.enumValues)[number];

export const brandEnum = pgEnum("brand", ["ERTH", "SAKKBA", "QASS"]);
export type Brand = (typeof brandEnum.enumValues)[number];

export const fabricSourceEnum = pgEnum("fabric_source", ["IN", "OUT"]);
export type FabricSource = (typeof fabricSourceEnum.enumValues)[number];

export const accountTypeEnum = pgEnum("account_type", ["Primary", "Secondary"]);
export type AccountType = (typeof accountTypeEnum.enumValues)[number];

export const measurementTypeEnum = pgEnum("measurement_type", ["Body", "Dishdasha"]);
export type MeasurementType = (typeof measurementTypeEnum.enumValues)[number];

export const jabzourTypeEnum = pgEnum("jabzour_type", ["BUTTON", "ZIPPER"]);
export type JabzourType = (typeof jabzourTypeEnum.enumValues)[number];

export const collarPositionEnum = pgEnum("collar_position", ["up", "down"]);
export type CollarPosition = (typeof collarPositionEnum.enumValues)[number];

// Shoulder slope — a categorical body measurement (4 fixed shapes), entered as a
// required dropdown. Lives on `measurements` next to the numeric dimensions, but
// is modelled as an enum so it stays OUT of the numeric MEASUREMENTS_SPEC machinery
// (the Zod decimal builder, QC tolerance compare, and INPUT_MEASUREMENT_KEYS that
// feeds the alteration form all assume numbers). The 4 shape glyphs + the editable
// picker live in @repo/ui (shoulder-slope.tsx) — keep these values in sync.
export const SHOULDER_SLOPE_VALUES = ["sloped_down", "sloped_up", "straight", "peaked"] as const;
export const shoulderSlopeEnum = pgEnum("shoulder_slope", SHOULDER_SLOPE_VALUES);
export type ShoulderSlope = (typeof SHOULDER_SLOPE_VALUES)[number];
export const SHOULDER_SLOPE_LABELS: Record<ShoulderSlope, string> = {
  sloped_down: "Sloped Down",
  sloped_up: "Sloped Up",
  straight: "Straight",
  peaked: "Normal",
};

export const garmentTypeEnum = pgEnum("garment_type", ["brova", "final", "alteration"]);
export type GarmentType = (typeof garmentTypeEnum.enumValues)[number];

export const transactionTypeEnum = pgEnum("transaction_type", ["payment", "refund"]);

export const registerSessionStatusEnum = pgEnum("register_session_status", ["open", "closed"]);
export const cashMovementTypeEnum = pgEnum("cash_movement_type", ["cash_in", "cash_out"]);
// Industry-standard cash drawer movement categories. The free-text `reason`
// column is kept as an optional note alongside this enum.
export const cashMovementReasonCategoryEnum = pgEnum("cash_movement_reason_category", [
    "drop",            // cash pulled from drawer mid-shift, moved to safe
    "pickup",          // cash returned from safe back into drawer
    "petty_cash",      // out-of-drawer business expense
    "bank_deposit",    // cash taken to the bank
    "change_refill",   // small bills/coins added to drawer for change
    "tip_out",         // cash paid out as tips
    "other",
]);

export const appointmentStatusEnum = pgEnum("appointment_status", ["scheduled", "completed", "cancelled", "no_show"]);

export const fabricTypeEnum = pgEnum("fabric_type", ["summer", "winter"]);
export type AppointmentStatus = (typeof appointmentStatusEnum.enumValues)[number];
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];

// --- TRANSFER / INVENTORY ENUMS ---
// Live flow has NO approval gate (CLAUDE.md §4): requested → dispatched →
// received/partially_received. "approved"/"rejected" are retained-but-dead — no
// code path produces them — because Postgres can't drop an enum value cleanly.
export const transferStatusEnum = pgEnum("transfer_status", [
    "requested",
    "approved",            // dead — see note above
    "rejected",            // dead — see note above
    "dispatched",
    "received",
    "partially_received",
]);
export type TransferStatus = (typeof transferStatusEnum.enumValues)[number];

export const transferDirectionEnum = pgEnum("transfer_direction", [
    "shop_to_workshop",
    "workshop_to_shop",
]);
export type TransferDirection = (typeof transferDirectionEnum.enumValues)[number];

export const transferItemTypeEnum = pgEnum("transfer_item_type", [
    "fabric",
    "shelf",
    "accessory",
]);
export type TransferItemType = (typeof transferItemTypeEnum.enumValues)[number];

// --- NOTIFICATION ENUMS ---
export const notificationTypeEnum = pgEnum("notification_type", [
    "garment_dispatched_to_workshop",
    "garment_dispatched_to_shop",
    "garment_ready_for_pickup",
    "garment_awaiting_trial",
    "transfer_requested",
    "transfer_status_changed",
    "garment_redo_requested",
    "low_stock",
]);
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

export const notificationScopeEnum = pgEnum("notification_scope", [
    "department",
    "user",
]);
export type NotificationScope = (typeof notificationScopeEnum.enumValues)[number];

// accessory_category is free text (was an enum until migration 0011 — see
// /store/inventory: stakeholders type new categories inline).
export const SUGGESTED_ACCESSORY_CATEGORIES = [
    "buttons",
    "zippers",
    "thread",
    "lining",
    "elastic",
    "interlining",
    "other",
] as const;

export const unitOfMeasureEnum = pgEnum("unit_of_measure", [
    "pieces",
    "meters",
    "rolls",
    "kg",
]);
export type UnitOfMeasure = (typeof unitOfMeasureEnum.enumValues)[number];

// --- STOCK MOVEMENT ENUMS ---
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
    "restock",         // External supplier delivery (+)
    "consumption",     // Garment cut, shelf sold (-)
    "transfer_out",    // Dispatched to other location (-)
    "transfer_in",     // Received at this location (+)
    "adjustment",      // Manual recount diff (+/-)
    "waste",           // Lost in transit / damaged (-)
    "return",          // Customer return / cancellation (+)
]);
export type StockMovementType = (typeof stockMovementTypeEnum.enumValues)[number];

export const stockItemTypeEnum = pgEnum("stock_item_type", [
    "fabric",
    "shelf",
    "accessory",
]);
export type StockItemType = (typeof stockItemTypeEnum.enumValues)[number];

export const stockLocationEnum = pgEnum("stock_location", [
    "shop",
    "workshop",
]);
export type StockLocation = (typeof stockLocationEnum.enumValues)[number];

export const adjustmentReasonEnum = pgEnum("adjustment_reason", [
    "recount",
    "found",
    "lost",
    "damaged",
    "system_error",
    "other",
]);
export type AdjustmentReason = (typeof adjustmentReasonEnum.enumValues)[number];

// --- STOCKTAKE (periodic physical count, per side) ---
export const stocktakeStatusEnum = pgEnum("stocktake_status", ["open", "validated"]);
export type StocktakeStatus = (typeof stocktakeStatusEnum.enumValues)[number];

export const styleRuleTypeEnum = pgEnum("style_rule_type", [
    "flat_override",
    "additive",
]);
export type StyleRuleType = (typeof styleRuleTypeEnum.enumValues)[number];

// --- ROOT-CAUSE TAXONOMY (shared attribution vocabulary — CLAUDE.md §2.9) ---
// One canonical "who is responsible / why" enum shared by redo+scrap recording,
// redo material waste, and performance attribution (Groups A/D). The
// repeated-returns investigation workflow (Group C) was removed. The responsible party is DERIVED in
// SQL (root_cause_responsible_party in triggers.sql), never stored separately.
// Distinct from the §2.5 measurement-reason gates (the measurement-scoped view)
// and §4 WASTE_REASONS (the physical-reason axis) — see §2.9. The DB type is
// created in triggers.sql (not via db:push) so it exists ahead of any column.
export const rootCauseEnum = pgEnum("root_cause", [
    "production_error",
    "qc_escape",
    "showroom_error",
    "customer_change",
    "material_defect",
    "other",
]);
export type RootCause = (typeof rootCauseEnum.enumValues)[number];

// Group A redo lifecycle (CLAUDE.md §2.5/§6). Created in triggers.sql (not via
// db:push) so the types exist ahead of the garment columns referencing them.
export const redoPriorityEnum = pgEnum("redo_priority", [
    "immediate",
    "next_slot",
    "parked",
]);
export type RedoPriority = (typeof redoPriorityEnum.enumValues)[number];

export const redoParkedReasonEnum = pgEnum("redo_parked_reason", [
    "waiting_material",
    "customer_decision",
    "approval",
    "clarification",
]);
export type RedoParkedReason = (typeof redoParkedReasonEnum.enumValues)[number];


// --- 0. PRICES ---
export const prices = pgTable("prices", {
    key: text("key").notNull(),
    brand: brandEnum("brand").notNull().default("ERTH"),
    value: numeric("value", { precision: 10, scale: 3 }).notNull(),
    description: text("description"),
    updated_at: timestamp("updated_at").defaultNow(),
}, (t) => ({
    pk: primaryKey({ columns: [t.key, t.brand] }),
}));

// --- 1. USERS ---
export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    auth_id: uuid("auth_id").unique(), // links to supabase auth.users.id — null until auth account created
    username: text("username").unique().notNull(),
    name: text("name").notNull(),
    email: text("email").unique(),
    country_code: text("country_code").default("+965"),
    phone: text("phone"),
    role: roleEnum("role").default("staff"),
    department: departmentEnum("department"),
    job_functions: jobFunctionEnum("job_functions").array().notNull().default(sql`'{}'::job_function[]`),
    brands: text("brands").array(),
    is_active: boolean("is_active").default(true).notNull(),
    pin: text("pin"),
    failed_login_attempts: integer("failed_login_attempts").default(0).notNull(),
    locked_until: timestamp("locked_until"),
    employee_id: text("employee_id"),
    nationality: text("nationality"),
    hire_date: date("hire_date"),
    notes: text("notes"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
});

// --- 1.5 USER SESSIONS (Presence / Heartbeat) ---
export const userSessions = pgTable("user_sessions", {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id").notNull().references(() => users.id).unique(),
    last_active_at: timestamp("last_active_at").notNull().defaultNow(),
    device_info: text("device_info"),
    started_at: timestamp("started_at").notNull().defaultNow(),
});

// --- 2. CUSTOMERS ---
export const customers = pgTable("customers", {
    id: serial("id").primaryKey(),

    // Identity
    name: text("name").notNull(),
    phone: text("phone"), // Primary index candidate
    nick_name: text("nick_name"),

    // Localization
    arabic_name: text("arabic_name"),
    arabic_nickname: text("arabic_nickname"),

    // Contact
    alternative_country_code: text("alternative_country_code"),
    alternate_mobile: text("alternate_mobile"),
    whatsapp: boolean("whatsapp").default(false),
    whatsapp_alt: boolean("whatsapp_alt").default(false),
    email: text("email"),
    insta_id: text("insta_id"),

    // Address (Normalized)
    country_code: text("country_code"),
    city: text("city"),
    block: text("block"),
    street: text("street"),
    house_no: text("house_no"),
    area: text("area"),
    address_note: text("address_note"),

    // Demographics
    nationality: text("nationality"),
    dob: timestamp("dob"),
    customer_segment: text("customer_segment"),
    account_type: accountTypeEnum("account_type"),
    relation: text("relation"),

    notes: text("notes"),
    created_at: timestamp("created_at").defaultNow(),

    // Idempotent create: unique when present so a network retry / double-submit
    // returns the original row instead of duplicating. Same as orders.
    idempotency_key: uuid("idempotency_key"),
}, (t) => ({
    searchIdx: index("customers_search_idx").on(t.phone, t.name),
    idempotencyIdx: uniqueIndex("customers_idempotency_key_idx")
        .on(t.idempotency_key)
        .where(sql`${t.idempotency_key} IS NOT NULL`),
}));

// --- 3. LOOKUPS ---
export const campaigns = pgTable("campaigns", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    active: boolean("active").default(true),
});

export const styles = pgTable("styles", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type"),
    rate_per_item: numeric("rate_per_item", { precision: 10, scale: 3 }),
    image_url: text("image_url"),
    code: text("code"),        // price lookup key (was image_url repurposed — now explicit)
    component: text("component"), // groups entries: collar_type, jabzour_type, jabzour_thickness, etc.
    brand: brandEnum("brand").notNull().default("ERTH"),
}, (t) => ({
    nameTypeBrandIdx: uniqueIndex("styles_name_type_brand_idx").on(t.name, t.type, t.brand),
    codeBrandIdx: uniqueIndex("styles_code_brand_idx").on(t.code, t.brand),
}));

// Override behavior for specific style codes (e.g. "designer = 6 KD flat, ignore other options").
// Resolved at pricing time: highest priority active rule for (brand, style_code) wins.
// Default behavior when no rule exists = additive (sum of selected styles.rate_per_item).
export const stylePricingRules = pgTable("style_pricing_rules", {
    id: serial("id").primaryKey(),
    brand: brandEnum("brand").notNull(),
    style_code: text("style_code").notNull(),
    rule_type: styleRuleTypeEnum("rule_type").notNull(),
    flat_rate: numeric("flat_rate", { precision: 10, scale: 3 }),
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    description: text("description"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
}, (t) => ({
    brandStyleCodeIdx: index("style_pricing_rules_brand_code_idx").on(t.brand, t.style_code, t.active),
    brandCodePriorityIdx: uniqueIndex("style_pricing_rules_brand_code_priority_idx").on(t.brand, t.style_code, t.priority),
}));

export const fabrics = pgTable("fabrics", {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    color: text("color"),             // Shop's internal color code (e.g. "C04", "CREAM")
    color_hex: text("color_hex"),     // Hex value for UI display (e.g. "#FFFFF0")
    real_stock: numeric("real_stock", { precision: 10, scale: 2 }),  // DEPRECATED: use shop_stock + workshop_stock
    shop_stock: numeric("shop_stock", { precision: 10, scale: 2 }).default(0),
    workshop_stock: numeric("workshop_stock", { precision: 10, scale: 2 }).default(0),
    price_per_meter: numeric("price_per_meter", { precision: 10, scale: 3 }),
    supplier: text("supplier"),
    season: fabricTypeEnum("season"),
    image_url: text("image_url"),
    description: text("description"),
    sku: text("sku"),
    default_supplier_id: integer("default_supplier_id"),  // FK suppliers(id) — set in migration after suppliers table
    low_stock_threshold: numeric("low_stock_threshold", { precision: 10, scale: 2 }),
    is_archived: boolean("is_archived").default(false).notNull(),
});

export const shelf = pgTable("shelf", {
    id: serial("id").primaryKey(),
    type: text("type").unique(),
    brand: text("brand"),
    stock: integer("stock"),  // DEPRECATED: use shop_stock + workshop_stock
    shop_stock: integer("shop_stock").default(0),
    workshop_stock: integer("workshop_stock").default(0),
    price: numeric("price", { precision: 10, scale: 3 }),
    image_url: text("image_url"),
    description: text("description"),
    sku: text("sku"),
    default_supplier_id: integer("default_supplier_id"),
    low_stock_threshold: integer("low_stock_threshold"),
    is_archived: boolean("is_archived").default(false).notNull(),
});

// --- 3B. ACCESSORIES ---
export const accessories = pgTable("accessories", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit_of_measure: unitOfMeasureEnum("unit_of_measure").notNull().default("pieces"),
    price: numeric("price", { precision: 10, scale: 3 }),
    shop_stock: numeric("shop_stock", { precision: 10, scale: 2 }).default(0),
    workshop_stock: numeric("workshop_stock", { precision: 10, scale: 2 }).default(0),
    image_url: text("image_url"),
    description: text("description"),
    sku: text("sku"),
    default_supplier_id: integer("default_supplier_id"),
    low_stock_threshold: numeric("low_stock_threshold", { precision: 10, scale: 2 }),
    is_archived: boolean("is_archived").default(false).notNull(),
    created_at: timestamp("created_at").defaultNow(),
}, (t) => ({
    nameCategoryIdx: uniqueIndex("accessories_name_category_idx").on(t.name, t.category),
}));

// --- 4. MEASUREMENTS ---
export const measurements = pgTable("measurements", {
    id: uuid("id").defaultRandom().primaryKey(),

    customer_id: integer("customer_id").references(() => customers.id).notNull(),
    measurer_id: uuid("measurer_id").references(() => users.id),
    measurement_date: timestamp("measurement_date"),

    measurement_id: text("measurement_id"), // e.g., 123-1
    type: measurementTypeEnum("type"),
    reference: text("reference"),
    notes: text("notes"),

    // Dimensions (Standardized Decimal Precision)
    collar_width: numeric("collar_width", { precision: 5, scale: 2 }),
    collar_height: numeric("collar_height", { precision: 5, scale: 2 }),
    shoulder: numeric("shoulder", { precision: 5, scale: 2 }),
    // Categorical body measurement (enum, not numeric) — see shoulderSlopeEnum.
    shoulder_slope: shoulderSlopeEnum("shoulder_slope"),
    chest_upper: numeric("chest_upper", { precision: 5, scale: 2 }),
    chest_full: numeric("chest_full", { precision: 5, scale: 2 }),
    sleeve_length: numeric("sleeve_length", { precision: 5, scale: 2 }),
    sleeve_width: numeric("sleeve_width", { precision: 5, scale: 2 }),
    elbow: numeric("elbow", { precision: 5, scale: 2 }),

    // Pockets
    top_pocket_length: numeric("top_pocket_length", { precision: 5, scale: 2 }),
    top_pocket_width: numeric("top_pocket_width", { precision: 5, scale: 2 }),
    top_pocket_distance: numeric("top_pocket_distance", { precision: 5, scale: 2 }),
    side_pocket_length: numeric("side_pocket_length", { precision: 5, scale: 2 }),
    side_pocket_width: numeric("side_pocket_width", { precision: 5, scale: 2 }),
    side_pocket_distance: numeric("side_pocket_distance", { precision: 5, scale: 2 }),
    side_pocket_opening: numeric("side_pocket_opening", { precision: 5, scale: 2 }),

    // Waist/Length
    waist_front: numeric("waist_front", { precision: 5, scale: 2 }),
    waist_back: numeric("waist_back", { precision: 5, scale: 2 }),
    waist_full: numeric("waist_full", { precision: 5, scale: 2 }),
    length_front: numeric("length_front", { precision: 5, scale: 2 }),
    length_back: numeric("length_back", { precision: 5, scale: 2 }),
    bottom: numeric("bottom", { precision: 5, scale: 2 }),

    // Provisions
    chest_provision: numeric("chest_provision", { precision: 5, scale: 2 }),
    waist_provision: numeric("waist_provision", { precision: 5, scale: 2 }),

    // Degree (size grade adjustment — subtracted from real measurements)
    degree: numeric("degree", { precision: 5, scale: 2 }),

    // Specifics
    jabzour_width: numeric("jabzour_width", { precision: 5, scale: 2 }),
    jabzour_length: numeric("jabzour_length", { precision: 5, scale: 2 }),
    chest_front: numeric("chest_front", { precision: 5, scale: 2 }),
    chest_back: numeric("chest_back", { precision: 5, scale: 2 }),
    armhole_front: numeric("armhole_front", { precision: 5, scale: 2 }),

    // Buttons
    second_button_distance: numeric("second_button_distance", { precision: 5, scale: 2 }),

    // Basma — optional, populated only when garment has basma trim
    basma_length: numeric("basma_length", { precision: 5, scale: 2 }),
    basma_width: numeric("basma_width", { precision: 5, scale: 2 }),

    // Hemming
    sleeve_hemming: numeric("sleeve_hemming", { precision: 5, scale: 2 }),
    bottom_hemming: numeric("bottom_hemming", { precision: 5, scale: 2 }),

    // Pen pocket
    pen_pocket_length: numeric("pen_pocket_length", { precision: 5, scale: 2 }),
    pen_pocket_width: numeric("pen_pocket_width", { precision: 5, scale: 2 }),

    // Idempotent create: unique when present so a network retry / double-submit
    // returns the original row instead of duplicating. Same as orders.
    idempotency_key: uuid("idempotency_key"),
}, (t) => ({
    customerIdx: index("measurements_customer_idx").on(t.customer_id),
    idempotencyIdx: uniqueIndex("measurements_idempotency_key_idx")
        .on(t.idempotency_key)
        .where(sql`${t.idempotency_key} IS NOT NULL`),
}));

// --- 5. ORDERS ---
export const orders = pgTable("orders", {
    id: serial("id").primaryKey(),

    customer_id: integer("customer_id").references(() => customers.id).notNull(),
    order_taker_id: uuid("order_taker_id").references(() => users.id),

    // Dates
    order_date: timestamp("order_date").defaultNow(),
    
    // State
    brand: brandEnum("brand"),
    checkout_status: checkoutStatusEnum("checkout_status").default("draft"),
    order_type: orderTypeEnum("order_type").default("WORK"),

    // Financials
    payment_type: paymentTypeEnum("payment_type"),
    payment_ref_no: text("payment_ref_no"),
    payment_note: text("payment_note"),
    discount_type: discountTypeEnum("discount_type"),
    discount_value: numeric("discount_value", { precision: 10, scale: 3 }),
    discount_percentage: numeric("discount_percentage", { precision: 5, scale: 2 }),
    discount_approved_by: uuid("discount_approved_by").references(() => users.id),
    discount_reason: text("discount_reason"),
    referral_code: text("referral_code"),
    paid: numeric("paid", { precision: 10, scale: 3 }),

    // Charges & Totals
    delivery_charge: numeric("delivery_charge", { precision: 10, scale: 3 }),
    express_charge: numeric("express_charge", { precision: 10, scale: 3 }),
    soaking_charge: numeric("soaking_charge", { precision: 10, scale: 3 }),
    shelf_charge: numeric("shelf_charge", { precision: 10, scale: 3 }),
    order_total: numeric("order_total", { precision: 10, scale: 3 }),

    // Meta
    notes: text("notes"),

    // Client-supplied UUID for idempotent order creation. Unique when present
    // so a network retry / double-submit of createOrder returns the original
    // order row instead of inserting a duplicate. Same pattern as
    // payment_transactions.idempotency_key.
    idempotency_key: uuid("idempotency_key"),
}, (t) => ({
    customerIdx: index("orders_customer_idx").on(t.customer_id),
    dateIdx: index("orders_date_idx").on(t.order_date),
    idempotencyIdx: uniqueIndex("orders_idempotency_key_idx")
        .on(t.idempotency_key)
        .where(sql`${t.idempotency_key} IS NOT NULL`),
}));

// --- 5.5 WORK ORDERS ---
export const workOrders = pgTable("work_orders", {
    order_id: integer("order_id").primaryKey().references(() => orders.id, { onDelete: 'cascade' }),
    
    // Identity
    invoice_number: integer("invoice_number"),
    invoice_revision: integer("invoice_revision").default(0).notNull(),
    campaign_id: integer("campaign_id").references(() => campaigns.id),
    linked_order_id: integer("linked_order_id").references(() => orders.id, { onDelete: 'set null' }),

    // Dates
    delivery_date: timestamp("delivery_date"),
    linked_date: timestamp("linked_date"),
    unlinked_date: timestamp("unlinked_date"),
    
    // Reminders
    r1_date: timestamp("r1_date"),
    r2_date: timestamp("r2_date"),
    r3_date: timestamp("r3_date"),
    call_reminder_date: timestamp("call_reminder_date"),
    escalation_date: timestamp("escalation_date"),

    // State
    order_phase: orderPhaseEnum("order_phase").default("new"),
    call_status: text("call_status"),

    // Financials
    stitching_price: numeric("stitching_price", { precision: 10, scale: 3 }),
    fabric_charge: numeric("fabric_charge", { precision: 10, scale: 3 }),
    stitching_charge: numeric("stitching_charge", { precision: 10, scale: 3 }),
    style_charge: numeric("style_charge", { precision: 10, scale: 3 }),
    advance: numeric("advance", { precision: 10, scale: 3 }),
    
    // Meta
    num_of_fabrics: integer("num_of_fabrics"),
    home_delivery: boolean("home_delivery").default(false),
    
    // Notes
    r1_notes: text("r1_notes"),
    r2_notes: text("r2_notes"),
    r3_notes: text("r3_notes"),
    call_notes: text("call_notes"),
    escalation_notes: text("escalation_notes"),
}, (t) => ({
    invoiceIdx: uniqueIndex("work_orders_invoice_idx").on(t.invoice_number),
}));

// --- 5.6 ALTERATION ORDERS (customer-brought garments from outside) ---
// Parent order has order_type='ALTERATION'. Garments live in the regular
// `garments` table but use the alteration-specific fields (alteration_measurements,
// alteration_issues, custom_price) and skip fabric/style pricing.
export const alterationOrders = pgTable("alteration_orders", {
    order_id: integer("order_id").primaryKey().references(() => orders.id, { onDelete: 'cascade' }),

    // Identity (separate sequence from work_orders — alteration_invoice_seq)
    invoice_number: integer("invoice_number"),

    // Dates — per-garment requested delivery dates live on garments.delivery_date
    received_date: timestamp("received_date"),

    // State
    order_phase: orderPhaseEnum("order_phase").default("new"),

    // Financials (sum of per-garment custom_price * quantity)
    alteration_total: numeric("alteration_total", { precision: 10, scale: 3 }),

    // Meta
    comments: text("comments"),

    // Idempotent create: unique when present so a network retry / double-submit
    // returns the original row instead of duplicating. Same as orders.
    idempotency_key: uuid("idempotency_key"),
}, (t) => ({
    invoiceIdx: uniqueIndex("alteration_orders_invoice_idx").on(t.invoice_number),
    idempotencyIdx: uniqueIndex("alteration_orders_idempotency_key_idx")
        .on(t.idempotency_key)
        .where(sql`${t.idempotency_key} IS NOT NULL`),
}));

// --- Trip History (stored as JSONB array on garments) ---

/**
 * Workshop-attributed measurement correction recorded by QC inspector.
 * Used when QC catches that a garment was produced to a value that doesn't
 * match the spec — i.e. a workshop mistake. `field` is the column name on
 * the `measurements` table; `corrected` is the actual (wrong) value the
 * garment was produced to.
 *
 * Deprecated for new writes — see `QCFlag`. Kept for reading historical records.
 */
export interface MeasurementIssue {
    field: string;
    original: number | null;
    corrected: number;
    note?: string;
}

/**
 * Lightweight flag attached to a QC fail. Tells the rework worker which
 * measurement field or style component is wrong. No numeric correction —
 * the worker uses the existing measurement spec / style image as-is.
 */
export interface QCFlag {
    /** field key — measurement column name OR style key (e.g. "collar_type") */
    field: string;
    kind: "measurement" | "style";
    note?: string;
}

export interface QcAttempt {
    inspector: string;
    date: string;
    result: "pass" | "fail";
    /** Trip number this attempt belongs to. Optional for legacy records. */
    trip?: number;
    /** Sequential number within the trip (1, 2, ...). Optional for legacy records. */
    attempt_number?: number;
    /** Operator-recorded measurements keyed by `measurements` column name. */
    measurements?: Record<string, number> | null;
    /** Operator-recorded options keyed by `garments` column name. */
    options?: Record<string, string | boolean | number | null> | null;
    /** Operator-recorded 1-5 ratings keyed by quality aspect. */
    quality_ratings?: Record<string, number> | null;
    /** Keys (measurement column names) that exceeded tolerance this attempt. */
    failed_measurements?: string[] | null;
    /** Keys (garment option columns) that did not match expected value. */
    failed_options?: string[] | null;
    /** Keys (quality aspect names) scored below threshold. */
    failed_quality?: string[] | null;
    /** Stages garment must re-run on fail; null on pass. */
    return_stages?: string[] | null;

    // ── Legacy fields (deprecated, read-only fallback for historical records) ──
    /** @deprecated use quality_ratings */
    ratings?: Record<string, number> | null;
    /** @deprecated unused — system computes verdict, no free-text reason */
    fail_reason?: string | null;
    /** @deprecated single-stage form */
    return_stage?: string | null;
    /** @deprecated old flag editor */
    flags?: QCFlag[] | null;
    /** @deprecated old pass-mode correction records */
    measurement_issues?: MeasurementIssue[] | null;
}

/**
 * Read helper: returns the QC attempt's return stages, falling back to the
 * deprecated single-stage `return_stage` field when present on old records.
 */
export function getQcReturnStages(att: QcAttempt | null | undefined): string[] {
    if (!att) return [];
    if (att.return_stages && att.return_stages.length > 0) return att.return_stages;
    if (att.return_stage) return [att.return_stage];
    return [];
}

export interface TripHistoryEntry {
    trip: number;
    reentry_stage: string | null;
    production_plan: Record<string, string> | null;
    worker_history: Record<string, string> | null;
    assigned_date: string | null;
    completed_date: string | null;
    qc_attempts: QcAttempt[];
}

/**
 * Per-stage timing session. A garment can visit the same stage multiple times
 * (e.g. QC fail → sewing → QC → sewing), so stage_timings stores an ARRAY per
 * stage. The last entry with completed_at === null is the active session.
 */
export interface StageTimingEntry {
    worker: string | null;
    started_at: string;          // ISO timestamp
    completed_at: string | null; // ISO timestamp; null = still in progress
}

export type StageTimings = Partial<Record<string, StageTimingEntry[]>>;

// --- 6. GARMENTS (Line Items) ---
export const garments = pgTable("garments", {
    id: uuid("id").defaultRandom().primaryKey(),
    garment_id: text("garment_id"), // e.g. 12-1, 12-2

    order_id: integer("order_id").references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    fabric_id: integer("fabric_id").references(() => fabrics.id),
    // Per-order style group counter (1, 2, 3...). Garments sharing identical
    // style selections within the same order get the same value. NOT a FK.
    // Computed by computeStyleGroups() in utils.ts on save.
    style_id: integer("style_id"),
    style: text("style").default("kuwaiti"),
    measurement_id: uuid("measurement_id").references(() => measurements.id),

    // Line Item Details
    fabric_source: fabricSourceEnum("fabric_source"),
    color: text("color"),
    shop_name: text("shop_name"),
    home_delivery: boolean("home_delivery").default(false),
    quantity: integer("quantity").default(1),
    fabric_length: numeric("fabric_length", { precision: 5, scale: 2 }),

    // Price Snapshots
    fabric_price_snapshot: numeric("fabric_price_snapshot", { precision: 10, scale: 3 }),
    stitching_price_snapshot: numeric("stitching_price_snapshot", { precision: 10, scale: 3 }),
    style_price_snapshot: numeric("style_price_snapshot", { precision: 10, scale: 3 }),

    // Style Specifics
    collar_type: text("collar_type"),
    collar_button: text("collar_button"),
    collar_position: collarPositionEnum("collar_position"),
    collar_thickness: text("collar_thickness"),
    cuffs_type: text("cuffs_type"),
    cuffs_thickness: text("cuffs_thickness"),
    front_pocket_type: text("front_pocket_type"),
    front_pocket_thickness: text("front_pocket_thickness"),
    wallet_pocket: boolean("wallet_pocket").default(false),
    pen_holder: boolean("pen_holder").default(false),
    mobile_pocket: boolean("mobile_pocket").default(false),
    small_tabaggi: boolean("small_tabaggi").default(false),
    jabzour_1: jabzourTypeEnum("jabzour_1"),
    jabzour_2: text("jabzour_2"),
    jabzour_thickness: text("jabzour_thickness"),

    lines: integer("lines").default(1),

    notes: text("notes"),
    soaking: boolean("soaking").default(false),
    // Soaking duration in hours. NULL when soaking=false. Currently 8 or 24.
    soaking_hours: integer("soaking_hours"),
    // When the soak bath was started. NULL while waiting in the soak queue
    // or for non-soak garments. Set when staff hits "Start Soak" in the
    // soak terminal (typically as a batch — multiple garments share a start).
    soaking_started_at: timestamp("soaking_started_at", { withTimezone: true }),
    // When soaking finished. NULL while pending or for non-soak garments.
    // Soaking runs as a parallel track — see soak terminal queue + cutting gate.
    soaking_completed_at: timestamp("soaking_completed_at", { withTimezone: true }),
    express: boolean("express").default(false),
    garment_type: garmentTypeEnum("garment_type").default("final"),
    delivery_date: timestamp("delivery_date"),
    piece_stage: pieceStageEnum("piece_stage"),
    location: locationEnum("location").default("shop"),
    acceptance_status: boolean("acceptance_status"),
    feedback_status: text("feedback_status"), // "accepted" | "needs_repair" | "needs_redo" | null
    fulfillment_type: fulfillmentTypeEnum("fulfillment_type"),
    // 0 = created, never dispatched from shop. Bumped to 1 on first dispatchOrder
    // (shop → workshop). Subsequent returns/alterations increment from there, so
    // workshop logic (alteration thresholds, receiving tabs) still sees trip ≥ 1.
    trip_number: integer("trip_number").default(0),

    // --- Workshop Production Fields ---
    in_production: boolean("in_production").default(false).notNull(),
    production_plan: jsonb("production_plan"),
    worker_history: jsonb("worker_history"),
    assigned_date: date("assigned_date"),
    assigned_unit: text("assigned_unit"),
    assigned_person: text("assigned_person"),
    start_time: timestamp("start_time", { withTimezone: true }),
    completion_time: timestamp("completion_time", { withTimezone: true }),
    quality_check_ratings: jsonb("quality_check_ratings"),
    /** When QC fails: stages the garment must re-run before next QC. Cleared on QC pass / new schedule. */
    qc_rework_stages: text("qc_rework_stages").array(),
    trip_history: jsonb("trip_history").$type<TripHistoryEntry[]>(),
    // Per-stage timing log. Each stage key maps to an array of sessions so we
    // can track repeat visits (QC-fail → same stage re-entered). Mirrors
    // start_time/completion_time/worker_history but adds durations + history.
    stage_timings: jsonb("stage_timings").$type<StageTimings>(),

    // Refund tracking (which price components have been refunded)
    refunded_fabric: boolean("refunded_fabric").default(false),
    refunded_stitching: boolean("refunded_stitching").default(false),
    refunded_style: boolean("refunded_style").default(false),
    refunded_express: boolean("refunded_express").default(false),
    refunded_soaking: boolean("refunded_soaking").default(false),

    // --- Alteration-only fields (populated when parent order.order_type = 'ALTERATION') ---
    // Sparse measurement overrides for changes_only mode. JSON object keyed by
    // measurements-table column name → absolute target value. Only changed
    // fields filled, rest absent. Null when full_measurement_set_id is set.
    alteration_measurements: jsonb("alteration_measurements"),
    // Sparse style overrides. JSON object keyed by garments-table style column
    // (collar_type, cuffs_type, …) → desired value. Only changed fields filled.
    alteration_styles: jsonb("alteration_styles"),
    // DEPRECATED: legacy SVG-overlay UX checkbox matrix. Retained for back-compat
    // with rows created before the multi-step alteration flow. Not written by
    // the new flow.
    alteration_issues: jsonb("alteration_issues"),
    // FK to a measurements row when the cashier picks an existing full set for
    // this garment (full_set mode). Null ⇒ changes_only mode (sparse fields above).
    full_measurement_set_id: uuid("full_measurement_set_id").references(() => measurements.id),
    // Optional FK back to the original garment being altered (when the cashier
    // links a prior order's garment). Used to seed measurements/style on form
    // load; not load-bearing afterward.
    original_garment_id: uuid("original_garment_id").references((): AnyPgColumn => garments.id, { onDelete: 'set null' }),
    // Custom per-garment price for alteration work (not driven by fabric/style catalogs)
    custom_price: numeric("custom_price", { precision: 10, scale: 3 }),
    // BU/F/EXT code on the physical garment (written by customer)
    bufi_ext: text("bufi_ext"),

    // Set on a discarded garment (piece_stage='discarded') to point at its replacement row.
    // Unique: one discarded original can be replaced at most once. Null for all other garments.
    replaced_by_garment_id: uuid("replaced_by_garment_id").references((): AnyPgColumn => garments.id, { onDelete: 'set null' }),

    // --- Group A redo lifecycle (CLAUDE.md §2.5/§6) ---
    // root_cause is set on the DISCARDED ORIGINAL (the attributed scrap); the
    // responsible party is derived in SQL (§2.9), never stored separately.
    root_cause: rootCauseEnum("root_cause"),
    // These live on the REPLACEMENT row. redo_priority is VESTIGIAL — redo is now
    // shop-initiated (§2.5) and the workshop redo-priority queue was dropped (§6),
    // so it is no longer written/read (kept to avoid a destructive column drop).
    // redo_parked_reason now marks a replacement WAITING IN SHOP DISPATCH (on the
    // customer's cloth — customer_decision — or a restock — waiting_material), not
    // a workshop scheduler park; redo_customer_must_provide_fabric flags OUT cloth.
    redo_priority: redoPriorityEnum("redo_priority"),
    redo_parked_reason: redoParkedReasonEnum("redo_parked_reason"),
    redo_customer_must_provide_fabric: boolean("redo_customer_must_provide_fabric").default(false).notNull(),
    // Set when a final is promoted to a brova by an outcome-3 redo (§2.5): the
    // chosen final becomes the new trial brova when no replacement is made. Audit
    // marker — this brova row was originally a final.
    promoted_to_brova_at: timestamp("promoted_to_brova_at", { withTimezone: true }),

    // --- Group C repeated-returns investigation: REMOVED, vestigial (CLAUDE.md §2.10) ---
    // The auto-hold was removed: nothing sets this true and there is no writer. Kept
    // vestigial (no destructive drop, matching redo_priority). Investigation/root-cause
    // handling is being redesigned elsewhere.
    needs_investigation: boolean("needs_investigation").default(false).notNull(),
}, (t) => ({
    orderIdx: index("garments_order_idx").on(t.order_id),
    orderGarmentIdUnique: uniqueIndex("garments_order_garment_id_unique").on(t.order_id, t.garment_id),
    replacedByUnique: uniqueIndex("garments_replaced_by_unique").on(t.replaced_by_garment_id),
}));

// --- 6.3 GARMENT INVESTIGATIONS: vestigial (CLAUDE.md §2.10 repeated-returns) ---
// Vestigial — the auto-hold was removed and its record_investigation writer dropped.
// The table is retained (no destructive drop) but has no writer. Kept so the schema
// still types the (unused) table; safe to drop if the redesign supersedes it.
export const garmentInvestigations = pgTable("garment_investigations", {
    id: uuid("id").defaultRandom().primaryKey(),
    garment_id: uuid("garment_id").notNull().references((): AnyPgColumn => garments.id),
    order_id: integer("order_id"),
    root_cause: rootCauseEnum("root_cause"),
    decision: text("decision").notNull(), // continue | redo | refund
    history_note: text("history_note"),
    corrective_short: text("corrective_short"),
    corrective_long: text("corrective_long"),
    quality_returns: integer("quality_returns"),
    alteration_returns: integer("alteration_returns"),
    resolved_by: uuid("resolved_by"),
    resolved_at: timestamp("resolved_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
    garmentIdx: index("garment_investigations_garment_idx").on(t.garment_id),
}));

// --- 6.25 DISPATCH LOG (append-only audit of shop↔workshop dispatches) ---
// Lightweight log so we can show a "Dispatch History" view (e.g. this month) and
// print the list. Rows can be purged periodically — nothing else depends on them.
export const dispatchLog = pgTable("dispatch_log", {
    id: serial("id").primaryKey(),
    garment_id: uuid("garment_id").references(() => garments.id, { onDelete: 'cascade' }).notNull(),
    order_id: integer("order_id").references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    direction: text("direction").notNull(), // 'to_workshop' | 'to_shop'
    trip_number: integer("trip_number"),    // snapshot at dispatch time
    dispatched_at: timestamp("dispatched_at").defaultNow().notNull(),
}, (t) => ({
    dispatchedAtIdx: index("dispatch_log_dispatched_at_idx").on(t.dispatched_at),
    orderIdx: index("dispatch_log_order_idx").on(t.order_id),
}));

// --- 6.5 GARMENT FEEDBACK ---
export const garmentFeedback = pgTable("garment_feedback", {
    id: uuid("id").defaultRandom().primaryKey(),

    // --- Links ---
    garment_id: uuid("garment_id").references(() => garments.id, { onDelete: 'cascade' }).notNull(),
    order_id: integer("order_id").references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    staff_id: uuid("staff_id").references(() => users.id),

    // --- Context ---
    feedback_type: text("feedback_type").notNull(),
        // "brova_trial" | "final_collection" | "post_collection" | "post_delivery"
    trip_number: integer("trip_number").default(1),
        // 1st time = 1, after repair comes back = 2, etc.

    // --- Feedback Action ---
    action: text("action").notNull(),
        // "accepted" | "needs_repair_accepted" | "needs_repair_rejected" | "needs_redo" | "collected" | "delivered"
    previous_stage: text("previous_stage"),
        // What piece_stage was BEFORE this feedback (for audit trail)

    // --- Distribution Request ---
    distribution: text("distribution"),
        // "pickup" | "workshop" | "shop"
        // Requested next location — dispatch page reads this to know what to move

    // --- Satisfaction ---
    satisfaction_level: integer("satisfaction_level"),
        // 1-5 scale (1=angry, 5=very happy) — emoji-based in UI

    // --- Measurement Comparison ---
    measurement_diffs: text("measurement_diffs"),
        // JSON: array of { field, original_value, actual_value, difference, reason }
        // reason: "customer_request" | "workshop_error" | "shop_error"
    previous_measurement_id: uuid("previous_measurement_id").references(() => measurements.id),
        // Audit: measurement_id the garment had BEFORE this feedback created a new one.
        // Only set when Customer Request reasons triggered a new measurements row.

    // --- Options Verification ---
    options_checklist: text("options_checklist"),
        // JSON: array of { option_name, expected_value, actual_correct: boolean, notes }
        // e.g., { option_name: "collar_type", expected_value: "kuwaiti", actual_correct: true }

    // --- Evidence ---
    customer_signature: text("customer_signature"),
        // Base64 or blob URL of digital signature
    photo_urls: text("photo_urls"),
        // JSON array of photo/video URLs (uploaded to storage)
    voice_note_urls: text("voice_note_urls"),
        // JSON array of voice note URLs

    // --- Notes ---
    notes: text("notes"),
    difference_reasons: text("difference_reasons"),
        // JSON: summary of why measurements differ

    // --- Price audit (brova-trial per-final style reprice, §2.5) ---
    // Set on the brova's feedback row when a style change moved the order total.
    // Audit-only: records who/why + the old→new delta. Never gates anything.
    price_adjustment: jsonb("price_adjustment").$type<{
        order_id: number;
        old_order_total: number;
        new_order_total: number;
        delta: number;
        old_style_charge: number;
        new_style_charge: number;
        per_garment: { garment_id: string; old_snapshot: number; new_snapshot: number }[];
        actor: string | null;
        reason: string | null;
        applied_at: string;
    }>(),

    // --- Timestamps ---
    created_at: timestamp("created_at").defaultNow(),

    // Idempotent create: unique when present so a network retry / double-submit
    // returns the original row instead of duplicating. Same as orders.
    idempotency_key: uuid("idempotency_key"),
}, (t) => ({
    garmentIdx: index("feedback_garment_idx").on(t.garment_id),
    orderIdx: index("feedback_order_idx").on(t.order_id),
    typeIdx: index("feedback_type_idx").on(t.feedback_type),
    idempotencyIdx: uniqueIndex("garment_feedback_idempotency_key_idx")
        .on(t.idempotency_key)
        .where(sql`${t.idempotency_key} IS NOT NULL`),
}));

// --- 6.6 UNITS (Workshop Groupings under each Stage) ---
// A unit is a physical grouping (e.g. "Sewing 1", "Cutting A") within a stage.
// Resources (workers) belong to a unit. Name is unique per stage.
export const units = pgTable("units", {
    id: uuid("id").defaultRandom().primaryKey(),
    stage: productionStageEnum("stage").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    daily_target: integer("daily_target"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// --- 6.7 RESOURCES (Workshop Workers) ---
// `unit_id` is the source of truth; `unit` text is auto-mirrored via trigger
// so legacy readers (scheduler / PlanDialog / performance) keep working.
export const resources = pgTable("resources", {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id").references(() => users.id),
    brand: brandEnum("brand"),
    responsibility: text("responsibility"),
    resource_name: text("resource_name").notNull(),
    unit: text("unit"),
    unit_id: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    resource_type: text("resource_type"),
    rating: integer("rating"),
    daily_target: integer("daily_target"),
    overtime_target: integer("overtime_target"),
    target_from: date("target_from"),
    target_to: date("target_to"),
    created_at: timestamp("created_at").defaultNow(),
});

// --- 7. ORDER SHELF ITEMS (Work & Sales Orders) ---
export const orderShelfItems = pgTable("order_shelf_items", {
    id: serial("id").primaryKey(),
    order_id: integer("order_id").references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    shelf_id: integer("shelf_id").references(() => shelf.id).notNull(),
    quantity: integer("quantity").default(1),
    unit_price: numeric("unit_price", { precision: 10, scale: 3 }),
    refunded_qty: integer("refunded_qty").default(0),
});

// --- 8. PAYMENT TRANSACTIONS ---
export const paymentTransactions = pgTable("payment_transactions", {
    id: serial("id").primaryKey(),
    order_id: integer("order_id").references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    amount: numeric("amount", { precision: 10, scale: 3 }).notNull(),
    payment_type: paymentTypeEnum("payment_type"),
    payment_ref_no: text("payment_ref_no"),
    payment_note: text("payment_note"),
    cashier_id: uuid("cashier_id").references(() => users.id),
    transaction_type: transactionTypeEnum("transaction_type").notNull(),
    refund_reason: text("refund_reason"),
    refund_items: jsonb("refund_items"),  // [{garment_id, fabric, stitching, style, amount}, {shelf_item_id, quantity, amount}]
    // Links the transaction to the register session it was recorded against.
    // Populated by record_payment_transaction and the checkout RPCs; allows
    // close_register to reconcile cash by exact session attribution rather than
    // by time window (which broke across midnight).
    register_session_id: integer("register_session_id").references(() => registerSessions.id),
    // Client-supplied UUID for idempotent retries. Unique when present so a
    // duplicate submit (network retry, double-click) returns the original row
    // instead of inserting a new one.
    idempotency_key: uuid("idempotency_key"),
    created_at: timestamp("created_at").defaultNow(),
}, (t) => ({
    orderIdx: index("payment_transactions_order_idx").on(t.order_id),
    createdAtIdx: index("payment_transactions_created_at_idx").on(t.created_at),
    sessionIdx: index("payment_transactions_session_idx").on(t.register_session_id),
    idempotencyIdx: uniqueIndex("payment_transactions_idempotency_key_idx")
        .on(t.idempotency_key)
        .where(sql`${t.idempotency_key} IS NOT NULL`),
}));

// --- 8.5 RPC IDEMPOTENCY LEDGER ---
// Server-enforced dedupe for mutating RPCs whose replay would corrupt data
// (stock = stock ± qty, duplicate inserts, counter bumps). A client-supplied
// key is claimed in the SAME transaction as the RPC's side effects via
// idem_claim() (see triggers.sql): first call inserts the key and proceeds;
// a replay finds the key and short-circuits. Rollback releases the claim, so
// a genuinely-failed call can still be retried.
export const rpcIdempotency = pgTable("rpc_idempotency", {
    idempotency_key: uuid("idempotency_key").primaryKey(),
    rpc_name: text("rpc_name").notNull(),
    result: jsonb("result"),
    created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
    createdAtIdx: index("rpc_idempotency_created_at_idx").on(t.created_at),
}));

// --- 9. APPOINTMENTS (Home Visit Bookings — SAKKBA) ---
export const appointments = pgTable("appointments", {
    id: uuid("id").defaultRandom().primaryKey(),

    // Customer
    customer_id: integer("customer_id").references(() => customers.id),
    customer_name: text("customer_name").notNull(),
    customer_phone: text("customer_phone").notNull(),

    // Staff
    assigned_to: uuid("assigned_to").references(() => users.id).notNull(),
    booked_by: uuid("booked_by").references(() => users.id).notNull(),

    // Schedule
    appointment_date: date("appointment_date").notNull(),
    start_time: text("start_time").notNull(), // "09:00" (24h)
    end_time: text("end_time").notNull(),     // "10:30" (24h)

    // Status
    status: appointmentStatusEnum("status").default("scheduled").notNull(),

    // Address
    city: text("city"),
    block: text("block"),
    street: text("street"),
    house_no: text("house_no"),
    area: text("area"),
    address_note: text("address_note"),

    // Estimate
    people_count: integer("people_count"),
    estimated_pieces: integer("estimated_pieces"),
    fabric_type: fabricTypeEnum("fabric_type"),

    // Meta
    notes: text("notes"),
    order_id: integer("order_id").references(() => orders.id),
    brand: brandEnum("brand").notNull(),

    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),

    // Idempotent create: unique when present so a network retry / double-submit
    // returns the original row instead of duplicating. Same as orders.
    idempotency_key: uuid("idempotency_key"),
}, (t) => ({
    dateIdx: index("appointments_date_idx").on(t.appointment_date),
    assignedIdx: index("appointments_assigned_idx").on(t.assigned_to),
    customerIdx: index("appointments_customer_idx").on(t.customer_id),
    idempotencyIdx: uniqueIndex("appointments_idempotency_key_idx")
        .on(t.idempotency_key)
        .where(sql`${t.idempotency_key} IS NOT NULL`),
}));

// --- 10. REGISTER SESSIONS ---
export const registerSessions = pgTable("register_sessions", {
    id: serial("id").primaryKey(),
    brand: brandEnum("brand").notNull(),
    date: date("date").notNull(),
    status: registerSessionStatusEnum("status").notNull().default("open"),
    opened_by: uuid("opened_by").references(() => users.id).notNull(),
    opened_at: timestamp("opened_at").notNull().defaultNow(),
    opening_float: numeric("opening_float", { precision: 10, scale: 3 }).notNull(),
    closed_by: uuid("closed_by").references(() => users.id),
    closed_at: timestamp("closed_at"),
    closing_counted_cash: numeric("closing_counted_cash", { precision: 10, scale: 3 }),
    expected_cash: numeric("expected_cash", { precision: 10, scale: 3 }),
    variance: numeric("variance", { precision: 10, scale: 3 }),
    closing_notes: text("closing_notes"),
    // Audit trail when a closed session is reopened. The original close fields
    // (closed_by/closed_at/etc.) are preserved; the next close overwrites them
    // with the new close values, and these reopened_* fields stand as evidence.
    reopened_by: uuid("reopened_by").references(() => users.id),
    reopened_at: timestamp("reopened_at"),
}, (t) => ({
    brandDateIdx: uniqueIndex("register_sessions_brand_date_idx").on(t.brand, t.date),
    openingFloatNonNeg: check("register_sessions_opening_float_nonneg", sql`${t.opening_float} >= 0`),
    countedCashNonNeg: check("register_sessions_counted_cash_nonneg",
        sql`${t.closing_counted_cash} IS NULL OR ${t.closing_counted_cash} >= 0`),
}));

// --- 11. REGISTER CASH MOVEMENTS ---
export const registerCashMovements = pgTable("register_cash_movements", {
    id: serial("id").primaryKey(),
    register_session_id: integer("register_session_id").references(() => registerSessions.id).notNull(),
    type: cashMovementTypeEnum("type").notNull(),
    // Categorized reason for reporting (drop/pickup/petty_cash/bank_deposit/etc).
    // Defaults to 'other' so existing rows are valid after the column is added.
    reason_category: cashMovementReasonCategoryEnum("reason_category").notNull().default("other"),
    amount: numeric("amount", { precision: 10, scale: 3 }).notNull(),
    reason: text("reason").notNull(),  // free-text note (optional in UI, but historically required)
    performed_by: uuid("performed_by").references(() => users.id).notNull(),
    created_at: timestamp("created_at").defaultNow(),
}, (t) => ({
    sessionIdx: index("cash_movements_session_idx").on(t.register_session_id),
    amountPositive: check("register_cash_movements_amount_positive", sql`${t.amount} > 0`),
}));

// --- 11b. REGISTER CLOSE EVENTS ---
// Append-only audit log of every register close. When a session is reopened
// and reclosed, register_sessions only keeps the LATEST close fields — this
// table preserves all prior closes (counted_cash, variance, notes, who closed).
export const registerCloseEvents = pgTable("register_close_events", {
    id: serial("id").primaryKey(),
    register_session_id: integer("register_session_id").references(() => registerSessions.id).notNull(),
    closed_by: uuid("closed_by").references(() => users.id).notNull(),
    closed_at: timestamp("closed_at").notNull().defaultNow(),
    opening_float: numeric("opening_float", { precision: 10, scale: 3 }).notNull(),
    counted_cash: numeric("counted_cash", { precision: 10, scale: 3 }).notNull(),
    expected_cash: numeric("expected_cash", { precision: 10, scale: 3 }).notNull(),
    variance: numeric("variance", { precision: 10, scale: 3 }).notNull(),
    notes: text("notes"),
}, (t) => ({
    sessionIdx: index("register_close_events_session_idx").on(t.register_session_id),
}));

// --- 12. TRANSFER REQUESTS ---
export const transferRequests = pgTable("transfer_requests", {
    id: serial("id").primaryKey(),
    brand: brandEnum("brand").notNull().default("ERTH"),
    direction: transferDirectionEnum("direction").notNull(),
    item_type: transferItemTypeEnum("item_type").notNull(),
    status: transferStatusEnum("status").notNull().default("requested"),
    requested_by: uuid("requested_by").references(() => users.id).notNull(),
    dispatched_by: uuid("dispatched_by").references(() => users.id),
    received_by: uuid("received_by").references(() => users.id),
    notes: text("notes"),
    rejection_reason: text("rejection_reason"),
    parent_request_id: integer("parent_request_id"),
    revision_number: integer("revision_number").default(0),
    created_at: timestamp("created_at").defaultNow(),
    approved_at: timestamp("approved_at"),
    dispatched_at: timestamp("dispatched_at"),
    received_at: timestamp("received_at"),

    // Idempotent create: unique when present so a network retry / double-submit
    // returns the original row instead of duplicating. Same as orders.
    idempotency_key: uuid("idempotency_key"),
}, (t) => ({
    statusIdx: index("transfer_requests_status_idx").on(t.status),
    createdAtIdx: index("transfer_requests_created_at_idx").on(t.created_at),
    idempotencyIdx: uniqueIndex("transfer_requests_idempotency_key_idx")
        .on(t.idempotency_key)
        .where(sql`${t.idempotency_key} IS NOT NULL`),
}));

// --- 13. TRANSFER REQUEST ITEMS ---
export const transferRequestItems = pgTable("transfer_request_items", {
    id: serial("id").primaryKey(),
    transfer_request_id: integer("transfer_request_id").references(() => transferRequests.id, { onDelete: 'cascade' }).notNull(),
    fabric_id: integer("fabric_id").references(() => fabrics.id),
    shelf_id: integer("shelf_id").references(() => shelf.id),
    accessory_id: integer("accessory_id").references(() => accessories.id),
    requested_qty: numeric("requested_qty", { precision: 10, scale: 2 }).notNull(),
    approved_qty: numeric("approved_qty", { precision: 10, scale: 2 }),
    dispatched_qty: numeric("dispatched_qty", { precision: 10, scale: 2 }),
    received_qty: numeric("received_qty", { precision: 10, scale: 2 }),
    // Quantity that was dispatched but never arrived at the destination.
    // Computed at receive time as max(dispatched - received, 0). These units
    // are treated as lost in transit — they are NOT returned to source stock.
    missing_qty: numeric("missing_qty", { precision: 10, scale: 2 }).default(0),
    discrepancy_note: text("discrepancy_note"),
}, (t) => ({
    transferRequestIdx: index("transfer_items_request_idx").on(t.transfer_request_id),
}));

// --- 14. NOTIFICATIONS ---
// Notifications can be scoped to a whole department (default: broadcast to all users
// in shop/workshop) or to a single user (scope='user' + recipient_user_id). Department
// is required in both cases for app/context filtering.
export const notifications = pgTable("notifications", {
    id: serial("id").primaryKey(),
    department: departmentEnum("department").notNull(),
    brand: brandEnum("brand").notNull().default("ERTH"),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    metadata: jsonb("metadata"),
    scope: notificationScopeEnum("scope").default("department").notNull(),
    recipient_user_id: uuid("recipient_user_id").references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp("created_at").defaultNow().notNull(),
    expires_at: timestamp("expires_at").default(sql`now() + interval '7 days'`).notNull(),
}, (t) => ({
    deptBrandCreatedIdx: index("notifications_dept_brand_created_idx").on(t.department, t.brand, t.created_at),
    recipientCreatedIdx: index("notifications_recipient_created_idx").on(t.recipient_user_id, t.created_at),
    scopeRecipientCheck: check(
        "notifications_scope_recipient_check",
        sql`(scope = 'department' AND recipient_user_id IS NULL) OR (scope = 'user' AND recipient_user_id IS NOT NULL)`
    ),
}));

// --- 15. NOTIFICATION READS (per-user read tracking) ---
export const notificationReads = pgTable("notification_reads", {
    notification_id: integer("notification_id").references(() => notifications.id, { onDelete: 'cascade' }).notNull(),
    user_id: uuid("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    read_at: timestamp("read_at").defaultNow().notNull(),
}, (t) => ({
    pk: primaryKey({ columns: [t.notification_id, t.user_id] }),
}));

// --- 16. SUPPLIERS (Shared across fabric / shelf / accessory restocks) ---
export const suppliers = pgTable("suppliers", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    is_archived: boolean("is_archived").default(false).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
    nameIdx: uniqueIndex("suppliers_name_idx").on(t.name),
}));

// --- 17. STOCK MOVEMENTS (Append-only audit ledger for every stock change) ---
//
// Every change to fabrics/shelf/accessories.{shop,workshop}_stock writes a row here.
// Triggers in triggers.sql auto-log on UPDATE; callers stamp context via session vars
// (app.movement_type, app.movement_ref_type, app.movement_ref_id, app.movement_user_id,
//  app.movement_supplier_id, app.movement_unit_cost, app.movement_reason, app.movement_notes).
// Missing context defaults to movement_type='adjustment', reason='unattributed'.
export const stockMovements = pgTable("stock_movements", {
    id: serial("id").primaryKey(),
    item_type: stockItemTypeEnum("item_type").notNull(),
    item_id: integer("item_id").notNull(),  // soft-ref to fabrics/shelf/accessories
    location: stockLocationEnum("location").notNull(),
    movement_type: stockMovementTypeEnum("movement_type").notNull(),
    qty_delta: numeric("qty_delta", { precision: 10, scale: 2 }).notNull(),  // signed
    qty_before: numeric("qty_before", { precision: 10, scale: 2 }),
    qty_after: numeric("qty_after", { precision: 10, scale: 2 }),
    // traceability
    ref_type: text("ref_type"),    // 'transfer' | 'order' | 'garment' | 'restock' | 'adjustment' | 'consumption'
    ref_id: integer("ref_id"),
    // restock-specific
    supplier_id: integer("supplier_id").references(() => suppliers.id),
    unit_cost: numeric("unit_cost", { precision: 10, scale: 3 }),
    // human context
    reason: text("reason"),
    notes: text("notes"),
    image_url: text("image_url"),  // optional photo (e.g. damage/waste evidence)
    // Group A net-zero waste annotation (CLAUDE.md §4 redo material waste): a
    // `waste` row with qty_delta=0 carries the scrapped length here so reports
    // surface it (SUM(ABS(qty_delta)+COALESCE(annotated_qty,0))) without
    // double-counting real wastes (whose annotated_qty is NULL). root_cause
    // attributes the loss (§2.9); responsible party is derived in SQL.
    annotated_qty: numeric("annotated_qty", { precision: 10, scale: 2 }),
    root_cause: rootCauseEnum("root_cause"),
    // who/when
    user_id: uuid("user_id").references(() => users.id),
    created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
    itemIdx: index("stock_movements_item_idx").on(t.item_type, t.item_id),
    itemLocIdx: index("stock_movements_item_loc_idx").on(t.item_type, t.item_id, t.location),
    createdAtIdx: index("stock_movements_created_at_idx").on(t.created_at),
    refIdx: index("stock_movements_ref_idx").on(t.ref_type, t.ref_id),
    typeCreatedIdx: index("stock_movements_type_created_idx").on(t.movement_type, t.created_at),
}));

// --- 18. STOCKTAKE (periodic physical count, per side) ---
// A controlled monthly recount run per side (shop counts its own holdings,
// workshop its own). Counts are entered against the side's full item set; a
// manager validates to commit each non-zero variance as an 'adjustment'
// movement (reason='stocktake'), which freezes the session and resets the
// side's cadence clock. Validated sessions are retained for history.
export const stocktakeSessions = pgTable("stocktake_sessions", {
    id: serial("id").primaryKey(),
    side: stockLocationEnum("side").notNull(),  // 'shop' | 'workshop' — which side's stock is counted
    brand: brandEnum("brand").notNull().default("ERTH"),
    status: stocktakeStatusEnum("status").notNull().default("open"),
    started_by: uuid("started_by").references(() => users.id),
    started_at: timestamp("started_at").defaultNow().notNull(),
    validated_by: uuid("validated_by").references(() => users.id),
    validated_at: timestamp("validated_at"),
    notes: text("notes"),
}, (t) => ({
    sideStatusIdx: index("stocktake_sessions_side_status_idx").on(t.side, t.status),
    sideValidatedIdx: index("stocktake_sessions_side_validated_idx").on(t.side, t.validated_at),
}));

export const stocktakeCounts = pgTable("stocktake_counts", {
    id: serial("id").primaryKey(),
    session_id: integer("session_id").references(() => stocktakeSessions.id, { onDelete: 'cascade' }).notNull(),
    item_type: stockItemTypeEnum("item_type").notNull(),
    item_id: integer("item_id").notNull(),  // soft-ref to fabrics/shelf/accessories
    system_qty: numeric("system_qty", { precision: 10, scale: 2 }),    // snapshot taken at validate time
    counted_qty: numeric("counted_qty", { precision: 10, scale: 2 }),  // physical count entered; null = not yet counted
    variance: numeric("variance", { precision: 10, scale: 2 }),        // counted − system (set at validate)
    reason: text("reason"),                                            // required when variance != 0
}, (t) => ({
    sessionItemIdx: uniqueIndex("stocktake_counts_session_item_idx").on(t.session_id, t.item_type, t.item_id),
}));

// --- RELATIONS ---
export const customersRelations = relations(customers, ({ many }) => ({
    orders: many(orders),
    measurements: many(measurements),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
    customer: one(customers, { fields: [orders.customer_id], references: [customers.id] }),
    workOrder: one(workOrders, { fields: [orders.id], references: [workOrders.order_id] }),
    alterationOrder: one(alterationOrders, { fields: [orders.id], references: [alterationOrders.order_id] }),
    garments: many(garments),
    shelfItems: many(orderShelfItems),
    paymentTransactions: many(paymentTransactions),
    taker: one(users, { fields: [orders.order_taker_id], references: [users.id] }),
}));

export const workOrdersRelations = relations(workOrders, ({ one }) => ({
    order: one(orders, { fields: [workOrders.order_id], references: [orders.id] }),
    campaign: one(campaigns, { fields: [workOrders.campaign_id], references: [campaigns.id] }),
    linkedOrder: one(orders, { fields: [workOrders.linked_order_id], references: [orders.id], relationName: "linked_orders" }),
}));

export const alterationOrdersRelations = relations(alterationOrders, ({ one }) => ({
    order: one(orders, { fields: [alterationOrders.order_id], references: [orders.id] }),
}));

export const garmentsRelations = relations(garments, ({ one, many }) => ({
    order: one(orders, { fields: [garments.order_id], references: [orders.id] }),
    fabric: one(fabrics, { fields: [garments.fabric_id], references: [fabrics.id] }),
    measurement: one(measurements, { fields: [garments.measurement_id], references: [measurements.id] }),
    feedback: many(garmentFeedback),
}));

export const garmentFeedbackRelations = relations(garmentFeedback, ({ one }) => ({
    garment: one(garments, { fields: [garmentFeedback.garment_id], references: [garments.id] }),
    order: one(orders, { fields: [garmentFeedback.order_id], references: [orders.id] }),
    staff: one(users, { fields: [garmentFeedback.staff_id], references: [users.id] }),
}));

export const orderShelfItemsRelations = relations(orderShelfItems, ({ one }) => ({
    order: one(orders, { fields: [orderShelfItems.order_id], references: [orders.id] }),
    shelf: one(shelf, { fields: [orderShelfItems.shelf_id], references: [shelf.id] }),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
    order: one(orders, { fields: [paymentTransactions.order_id], references: [orders.id] }),
    cashier: one(users, { fields: [paymentTransactions.cashier_id], references: [users.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
    customer: one(customers, { fields: [appointments.customer_id], references: [customers.id] }),
    assignee: one(users, { fields: [appointments.assigned_to], references: [users.id], relationName: "appointment_assignee" }),
    booker: one(users, { fields: [appointments.booked_by], references: [users.id], relationName: "appointment_booker" }),
    order: one(orders, { fields: [appointments.order_id], references: [orders.id] }),
}));

export const registerSessionsRelations = relations(registerSessions, ({ one, many }) => ({
    openedBy: one(users, { fields: [registerSessions.opened_by], references: [users.id], relationName: "register_opener" }),
    closedBy: one(users, { fields: [registerSessions.closed_by], references: [users.id], relationName: "register_closer" }),
    cashMovements: many(registerCashMovements),
    closeEvents: many(registerCloseEvents),
}));

export const registerCashMovementsRelations = relations(registerCashMovements, ({ one }) => ({
    session: one(registerSessions, { fields: [registerCashMovements.register_session_id], references: [registerSessions.id] }),
    performedBy: one(users, { fields: [registerCashMovements.performed_by], references: [users.id] }),
}));

export const registerCloseEventsRelations = relations(registerCloseEvents, ({ one }) => ({
    session: one(registerSessions, { fields: [registerCloseEvents.register_session_id], references: [registerSessions.id] }),
    closedBy: one(users, { fields: [registerCloseEvents.closed_by], references: [users.id] }),
}));

export const transferRequestsRelations = relations(transferRequests, ({ one, many }) => ({
    requestedBy: one(users, { fields: [transferRequests.requested_by], references: [users.id] }),
    parentRequest: one(transferRequests, { fields: [transferRequests.parent_request_id], references: [transferRequests.id], relationName: "transfer_revisions" }),
    items: many(transferRequestItems),
}));

export const transferRequestItemsRelations = relations(transferRequestItems, ({ one }) => ({
    transferRequest: one(transferRequests, { fields: [transferRequestItems.transfer_request_id], references: [transferRequests.id] }),
    fabric: one(fabrics, { fields: [transferRequestItems.fabric_id], references: [fabrics.id] }),
    shelfItem: one(shelf, { fields: [transferRequestItems.shelf_id], references: [shelf.id] }),
    accessory: one(accessories, { fields: [transferRequestItems.accessory_id], references: [accessories.id] }),
}));

export const notificationsRelations = relations(notifications, ({ many }) => ({
    reads: many(notificationReads),
}));

export const notificationReadsRelations = relations(notificationReads, ({ one }) => ({
    notification: one(notifications, { fields: [notificationReads.notification_id], references: [notifications.id] }),
    user: one(users, { fields: [notificationReads.user_id], references: [users.id] }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
    movements: many(stockMovements),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
    supplier: one(suppliers, { fields: [stockMovements.supplier_id], references: [suppliers.id] }),
    user: one(users, { fields: [stockMovements.user_id], references: [users.id] }),
}));

// --- TYPE EXPORTS ---

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Customer = InferSelectModel<typeof customers>;
export type NewCustomer = InferInsertModel<typeof customers>;

export type BaseOrder = InferSelectModel<typeof orders>;
export type WorkOrder = InferSelectModel<typeof workOrders>;
export type AlterationOrder = InferSelectModel<typeof alterationOrders>;

/**
 * Unified Order type combining core transaction data and work order tailoring extension.
 * Also includes optional relations for customer and items.
 * This is the primary type used by the POS frontend.
 */
export type Order = BaseOrder & Partial<WorkOrder> & {
    customer?: Customer;
    garments?: Garment[];
    shelf_items?: OrderShelfItem[];
    child_orders?: BaseOrder[];
    payment_transactions?: PaymentTransaction[];
    alteration_order?: AlterationOrder;
};

export type NewOrder = InferInsertModel<typeof orders>;
export type NewWorkOrder = InferInsertModel<typeof workOrders>;
export type NewAlterationOrder = InferInsertModel<typeof alterationOrders>;

export type Garment = InferSelectModel<typeof garments>;
export type NewGarment = InferInsertModel<typeof garments>;

export type GarmentFeedback = InferSelectModel<typeof garmentFeedback>;
export type NewGarmentFeedback = InferInsertModel<typeof garmentFeedback>;

export type OrderShelfItem = InferSelectModel<typeof orderShelfItems>;
export type NewOrderShelfItem = InferInsertModel<typeof orderShelfItems>;

export type Measurement = InferSelectModel<typeof measurements>;
export type NewMeasurement = InferInsertModel<typeof measurements>;

export type Fabric = InferSelectModel<typeof fabrics>;
export type NewFabric = InferInsertModel<typeof fabrics>;

export type Style = InferSelectModel<typeof styles>;
export type NewStyle = InferInsertModel<typeof styles>;

export type StylePricingRule = InferSelectModel<typeof stylePricingRules>;
export type NewStylePricingRule = InferInsertModel<typeof stylePricingRules>;

export type Campaign = InferSelectModel<typeof campaigns>;
export type NewCampaign = InferInsertModel<typeof campaigns>;

export type Employee = User;
export type NewEmployee = NewUser;

export type Shelf = InferSelectModel<typeof shelf>;
export type NewShelf = InferInsertModel<typeof shelf>;

export type Price = InferSelectModel<typeof prices>;
export type NewPrice = InferInsertModel<typeof prices>;

export type PaymentTransaction = InferSelectModel<typeof paymentTransactions>;
export type NewPaymentTransaction = InferInsertModel<typeof paymentTransactions>;

export type Resource = InferSelectModel<typeof resources>;
export type NewResource = InferInsertModel<typeof resources>;

export type Unit = InferSelectModel<typeof units>;
export type NewUnit = InferInsertModel<typeof units>;

export type Appointment = InferSelectModel<typeof appointments>;
export type NewAppointment = InferInsertModel<typeof appointments>;

export type UserSession = InferSelectModel<typeof userSessions>;
export type NewUserSession = InferInsertModel<typeof userSessions>;

export type RegisterSession = InferSelectModel<typeof registerSessions>;
export type NewRegisterSession = InferInsertModel<typeof registerSessions>;
export type RegisterCashMovement = InferSelectModel<typeof registerCashMovements>;
export type NewRegisterCashMovement = InferInsertModel<typeof registerCashMovements>;
export type RegisterCloseEvent = InferSelectModel<typeof registerCloseEvents>;
export type NewRegisterCloseEvent = InferInsertModel<typeof registerCloseEvents>;

export type Accessory = InferSelectModel<typeof accessories>;
export type NewAccessory = InferInsertModel<typeof accessories>;

export type TransferRequest = InferSelectModel<typeof transferRequests>;
export type NewTransferRequest = InferInsertModel<typeof transferRequests>;

export type TransferRequestItem = InferSelectModel<typeof transferRequestItems>;
export type NewTransferRequestItem = InferInsertModel<typeof transferRequestItems>;

export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = InferInsertModel<typeof notifications>;
export type NotificationRead = InferSelectModel<typeof notificationReads>;
export type NewNotificationRead = InferInsertModel<typeof notificationReads>;

export type Supplier = InferSelectModel<typeof suppliers>;
export type NewSupplier = InferInsertModel<typeof suppliers>;

export type StockMovement = InferSelectModel<typeof stockMovements>;
export type NewStockMovement = InferInsertModel<typeof stockMovements>;
