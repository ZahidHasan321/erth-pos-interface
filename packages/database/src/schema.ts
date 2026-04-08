import { pgTable, text, serial, integer, boolean, timestamp, pgEnum, uuid, uniqueIndex, index, customType, date, jsonb, primaryKey, check } from "drizzle-orm/pg-core";
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

export const roleEnum = pgEnum("role", ["super_admin", "admin", "staff", "manager"]);
export type Role = (typeof roleEnum.enumValues)[number];

export const departmentEnum = pgEnum("department", ["workshop", "shop"]);
export type Department = (typeof departmentEnum.enumValues)[number];

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

export const orderTypeEnum = pgEnum("order_type", ["WORK", "SALES"]);
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

export const garmentTypeEnum = pgEnum("garment_type", ["brova", "final"]);
export type GarmentType = (typeof garmentTypeEnum.enumValues)[number];

export const transactionTypeEnum = pgEnum("transaction_type", ["payment", "refund"]);

export const registerSessionStatusEnum = pgEnum("register_session_status", ["open", "closed"]);
export const cashMovementTypeEnum = pgEnum("cash_movement_type", ["cash_in", "cash_out"]);

export const appointmentStatusEnum = pgEnum("appointment_status", ["scheduled", "completed", "cancelled", "no_show"]);

export const fabricTypeEnum = pgEnum("fabric_type", ["summer", "winter"]);
export type AppointmentStatus = (typeof appointmentStatusEnum.enumValues)[number];
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];

// --- TRANSFER / INVENTORY ENUMS ---
export const transferStatusEnum = pgEnum("transfer_status", [
    "requested",
    "approved",
    "rejected",
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
]);
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

export const notificationScopeEnum = pgEnum("notification_scope", [
    "department",
    "user",
]);
export type NotificationScope = (typeof notificationScopeEnum.enumValues)[number];

export const accessoryCategoryEnum = pgEnum("accessory_category", [
    "buttons",
    "zippers",
    "thread",
    "lining",
    "elastic",
    "interlining",
    "other",
]);
export type AccessoryCategory = (typeof accessoryCategoryEnum.enumValues)[number];

export const unitOfMeasureEnum = pgEnum("unit_of_measure", [
    "pieces",
    "meters",
    "rolls",
    "kg",
]);
export type UnitOfMeasure = (typeof unitOfMeasureEnum.enumValues)[number];


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
}, (t) => ({
    searchIdx: index("customers_search_idx").on(t.phone, t.name),
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

export const fabrics = pgTable("fabrics", {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    color: text("color"),             // Shop's internal color code (e.g. "C04", "CREAM")
    color_hex: text("color_hex"),     // Hex value for UI display (e.g. "#FFFFF0")
    real_stock: numeric("real_stock", { precision: 10, scale: 2 }),  // DEPRECATED: use shop_stock + workshop_stock
    shop_stock: numeric("shop_stock", { precision: 10, scale: 2 }).default(0),
    workshop_stock: numeric("workshop_stock", { precision: 10, scale: 2 }).default(0),
    price_per_meter: numeric("price_per_meter", { precision: 10, scale: 3 }),
});

export const shelf = pgTable("shelf", {
    id: serial("id").primaryKey(),
    type: text("type").unique(),
    brand: text("brand"),
    stock: integer("stock"),  // DEPRECATED: use shop_stock + workshop_stock
    shop_stock: integer("shop_stock").default(0),
    workshop_stock: integer("workshop_stock").default(0),
    price: numeric("price", { precision: 10, scale: 3 }),
});

// --- 3B. ACCESSORIES ---
export const accessories = pgTable("accessories", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    category: accessoryCategoryEnum("category").notNull(),
    unit_of_measure: unitOfMeasureEnum("unit_of_measure").notNull().default("pieces"),
    price: numeric("price", { precision: 10, scale: 3 }),
    shop_stock: numeric("shop_stock", { precision: 10, scale: 2 }).default(0),
    workshop_stock: numeric("workshop_stock", { precision: 10, scale: 2 }).default(0),
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
    armhole: numeric("armhole", { precision: 5, scale: 2 }),
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
    armhole_provision: numeric("armhole_provision", { precision: 5, scale: 2 }),

    // Degree (size grade adjustment — subtracted from real measurements)
    degree: numeric("degree", { precision: 5, scale: 2 }),

    // Specifics
    jabzour_width: numeric("jabzour_width", { precision: 5, scale: 2 }),
    jabzour_length: numeric("jabzour_length", { precision: 5, scale: 2 }),
    chest_front: numeric("chest_front", { precision: 5, scale: 2 }),
    chest_back: numeric("chest_back", { precision: 5, scale: 2 }),
    armhole_front: numeric("armhole_front", { precision: 5, scale: 2 }),
}, (t) => ({
    customerIdx: index("measurements_customer_idx").on(t.customer_id),
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
}, (t) => ({
    customerIdx: index("orders_customer_idx").on(t.customer_id),
    dateIdx: index("orders_date_idx").on(t.order_date),
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

// --- Trip History (stored as JSONB array on garments) ---
export interface QcAttempt {
    inspector: string;
    ratings: Record<string, number> | null;
    result: "pass" | "fail";
    fail_reason: string | null;
    return_stage: string | null;
    date: string;
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

// --- 6. GARMENTS (Line Items) ---
export const garments = pgTable("garments", {
    id: uuid("id").defaultRandom().primaryKey(),
    garment_id: text("garment_id"), // e.g. 12-1, 12-2

    order_id: integer("order_id").references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    fabric_id: integer("fabric_id").references(() => fabrics.id),
    style_id: integer("style_id").references(() => styles.id),
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
    trip_history: jsonb("trip_history").$type<TripHistoryEntry[]>(),

    // Refund tracking (which price components have been refunded)
    refunded_fabric: boolean("refunded_fabric").default(false),
    refunded_stitching: boolean("refunded_stitching").default(false),
    refunded_style: boolean("refunded_style").default(false),
    refunded_express: boolean("refunded_express").default(false),
    refunded_soaking: boolean("refunded_soaking").default(false),
}, (t) => ({
    orderIdx: index("garments_order_idx").on(t.order_id),
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

    // --- Timestamps ---
    created_at: timestamp("created_at").defaultNow(),
}, (t) => ({
    garmentIdx: index("feedback_garment_idx").on(t.garment_id),
    orderIdx: index("feedback_order_idx").on(t.order_id),
    typeIdx: index("feedback_type_idx").on(t.feedback_type),
}));

// --- 6.6 RESOURCES (Workshop Workers & Units) ---
export const resources = pgTable("resources", {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id").references(() => users.id),
    brand: brandEnum("brand"),
    responsibility: text("responsibility"),
    resource_name: text("resource_name").notNull(),
    unit: text("unit"),
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
    created_at: timestamp("created_at").defaultNow(),
}, (t) => ({
    orderIdx: index("payment_transactions_order_idx").on(t.order_id),
    createdAtIdx: index("payment_transactions_created_at_idx").on(t.created_at),
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
}, (t) => ({
    dateIdx: index("appointments_date_idx").on(t.appointment_date),
    assignedIdx: index("appointments_assigned_idx").on(t.assigned_to),
    customerIdx: index("appointments_customer_idx").on(t.customer_id),
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
}, (t) => ({
    brandDateIdx: uniqueIndex("register_sessions_brand_date_idx").on(t.brand, t.date),
}));

// --- 11. REGISTER CASH MOVEMENTS ---
export const registerCashMovements = pgTable("register_cash_movements", {
    id: serial("id").primaryKey(),
    register_session_id: integer("register_session_id").references(() => registerSessions.id).notNull(),
    type: cashMovementTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 10, scale: 3 }).notNull(),
    reason: text("reason").notNull(),
    performed_by: uuid("performed_by").references(() => users.id).notNull(),
    created_at: timestamp("created_at").defaultNow(),
}, (t) => ({
    sessionIdx: index("cash_movements_session_idx").on(t.register_session_id),
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
}, (t) => ({
    statusIdx: index("transfer_requests_status_idx").on(t.status),
    createdAtIdx: index("transfer_requests_created_at_idx").on(t.created_at),
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
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    metadata: jsonb("metadata"),
    scope: notificationScopeEnum("scope").default("department").notNull(),
    recipient_user_id: uuid("recipient_user_id").references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp("created_at").defaultNow().notNull(),
    expires_at: timestamp("expires_at").default(sql`now() + interval '7 days'`).notNull(),
}, (t) => ({
    deptCreatedIdx: index("notifications_dept_created_idx").on(t.department, t.created_at),
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

// --- RELATIONS ---
export const customersRelations = relations(customers, ({ many }) => ({
    orders: many(orders),
    measurements: many(measurements),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
    customer: one(customers, { fields: [orders.customer_id], references: [customers.id] }),
    workOrder: one(workOrders, { fields: [orders.id], references: [workOrders.order_id] }),
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

export const garmentsRelations = relations(garments, ({ one, many }) => ({
    order: one(orders, { fields: [garments.order_id], references: [orders.id] }),
    fabric: one(fabrics, { fields: [garments.fabric_id], references: [fabrics.id] }),
    style: one(styles, { fields: [garments.style_id], references: [styles.id] }),
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
}));

export const registerCashMovementsRelations = relations(registerCashMovements, ({ one }) => ({
    session: one(registerSessions, { fields: [registerCashMovements.register_session_id], references: [registerSessions.id] }),
    performedBy: one(users, { fields: [registerCashMovements.performed_by], references: [users.id] }),
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

// --- TYPE EXPORTS ---

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Customer = InferSelectModel<typeof customers>;
export type NewCustomer = InferInsertModel<typeof customers>;

export type BaseOrder = InferSelectModel<typeof orders>;
export type WorkOrder = InferSelectModel<typeof workOrders>;

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
};

export type NewOrder = InferInsertModel<typeof orders>;
export type NewWorkOrder = InferInsertModel<typeof workOrders>;

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

export type Appointment = InferSelectModel<typeof appointments>;
export type NewAppointment = InferInsertModel<typeof appointments>;

export type UserSession = InferSelectModel<typeof userSessions>;
export type NewUserSession = InferInsertModel<typeof userSessions>;

export type RegisterSession = InferSelectModel<typeof registerSessions>;
export type NewRegisterSession = InferInsertModel<typeof registerSessions>;
export type RegisterCashMovement = InferSelectModel<typeof registerCashMovements>;
export type NewRegisterCashMovement = InferInsertModel<typeof registerCashMovements>;

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
