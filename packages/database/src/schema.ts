import { pgTable, text, serial, integer, boolean, timestamp, pgEnum, uuid, uniqueIndex, index, customType } from "drizzle-orm/pg-core";
import { relations, type InferSelectModel, type InferInsertModel } from "drizzle-orm";

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

export const roleEnum = pgEnum("role", ["admin", "staff", "manager"]);
export type Role = (typeof roleEnum.enumValues)[number];

// "OrderStatus" from Airtable (Drafting vs Completed)
export const checkoutStatusEnum = pgEnum("checkout_status", [
    "draft",       // Was "Pending" - Customer is building order
    "confirmed",   // Was "Completed" - Customer finished ordering
    "cancelled"    // Was "Cancelled"
]);
export type CheckoutStatus = (typeof checkoutStatusEnum.enumValues)[number];

// "FatouraStages" from Airtable (The actual workshop lifecycle)
export const productionStageEnum = pgEnum("production_stage", [
    "order_at_shop",
    "sent_to_workshop",
    "order_at_workshop",
    "brova_and_final_dispatched_to_shop",
    "final_dispatched_to_shop",
    "brova_at_shop",
    "brova_accepted",
    "brova_alteration",
    "brova_repair_and_production",
    "brova_alteration_and_production",
    "final_at_shop",
    "brova_and_final_at_shop",
    "order_collected",
    "order_delivered",
    "waiting_cut",
    "soaking",
    "redo"
]);
export type ProductionStage = (typeof productionStageEnum.enumValues)[number];

export const paymentTypeEnum = pgEnum("payment_type", ["knet", "cash", "link_payment", "installments", "others"]);
export type PaymentType = (typeof paymentTypeEnum.enumValues)[number];

export const discountTypeEnum = pgEnum("discount_type", ["flat", "referral", "loyalty", "by_value"]);
export type DiscountType = (typeof discountTypeEnum.enumValues)[number];

export const orderTypeEnum = pgEnum("order_type", ["WORK", "SALES"]);
export type OrderType = (typeof orderTypeEnum.enumValues)[number];

export const fabricSourceEnum = pgEnum("fabric_source", ["IN", "OUT"]);
export type FabricSource = (typeof fabricSourceEnum.enumValues)[number];

export const accountTypeEnum = pgEnum("account_type", ["Primary", "Secondary"]);
export type AccountType = (typeof accountTypeEnum.enumValues)[number];

export const measurementTypeEnum = pgEnum("measurement_type", ["Body", "Dishdasha"]);
export type MeasurementType = (typeof measurementTypeEnum.enumValues)[number];

export const jabzourTypeEnum = pgEnum("jabzour_type", ["BUTTON", "ZIPPER"]);
export type JabzourType = (typeof jabzourTypeEnum.enumValues)[number];

// --- 0. PRICES ---
export const prices = pgTable("prices", {
    key: text("key").primaryKey(),
    value: numeric("value", { precision: 10, scale: 3 }).notNull(),
    description: text("description"),
    updated_at: timestamp("updated_at").defaultNow(),
});

// --- 1. USERS ---
export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").unique(),
    role: roleEnum("role").default("staff"),
    created_at: timestamp("created_at").defaultNow(),
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
});

export const fabrics = pgTable("fabrics", {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    color: text("color"),
    real_stock: numeric("real_stock", { precision: 10, scale: 2 }),
    price_per_meter: numeric("price_per_meter", { precision: 10, scale: 3 }),
});

export const shelf = pgTable("shelf", {
    id: serial("id").primaryKey(),
    type: text("type").unique(),
    brand: text("brand"),
    stock: integer("stock"),
    price: numeric("price", { precision: 10, scale: 3 }),
});

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

    // The incremental Invoice Number (Fatoura)
    invoice_number: integer("invoice_number"),

    customer_id: integer("customer_id").references(() => customers.id).notNull(),
    campaign_id: integer("campaign_id").references(() => campaigns.id),
    order_taker_id: uuid("order_taker_id").references(() => users.id),

    linked_order_id: integer("linked_order_id").references((): any => orders.id),

    // Dates
    order_date: timestamp("order_date").defaultNow(),
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
    checkout_status: checkoutStatusEnum("checkout_status").default("draft"),
    production_stage: productionStageEnum("production_stage"),
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
    stitching_price: numeric("stitching_price", { precision: 10, scale: 3 }),

    // Charges & Totals
    fabric_charge: numeric("fabric_charge", { precision: 10, scale: 3 }),
    stitching_charge: numeric("stitching_charge", { precision: 10, scale: 3 }),
    style_charge: numeric("style_charge", { precision: 10, scale: 3 }),
    delivery_charge: numeric("delivery_charge", { precision: 10, scale: 3 }),
    shelf_charge: numeric("shelf_charge", { precision: 10, scale: 3 }),
    advance: numeric("advance", { precision: 10, scale: 3 }),
    order_total: numeric("order_total", { precision: 10, scale: 3 }),

    // Meta
    num_of_fabrics: integer("num_of_fabrics"),
    notes: text("notes"),
    
    r1_notes: text("r1_notes"),
    r2_notes: text("r2_notes"),
    r3_notes: text("r3_notes"),
    call_notes: text("call_notes"),
    escalation_notes: text("escalation_notes"),
    
    home_delivery: boolean("home_delivery").default(false),

    // Workshop interaction
    call_status: text("call_status"),
}, (t) => ({
    invoiceIdx: uniqueIndex("orders_invoice_idx").on(t.invoice_number),
    customerIdx: index("orders_customer_idx").on(t.customer_id),
    dateIdx: index("orders_date_idx").on(t.order_date),
    linkedOrderIdx: index("orders_linked_idx").on(t.linked_order_id),
}));

// --- 6. GARMENTS (Line Items) ---
export const garments = pgTable("garments", {
    id: uuid("id").defaultRandom().primaryKey(),
    garment_id: text("garment_id"), // e.g. 12-1, 12-2

    order_id: integer("order_id").references(() => orders.id).notNull(),
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
    small_tabaggi: boolean("small_tabaggi").default(false),
    jabzour_1: jabzourTypeEnum("jabzour_1"),
    jabzour_2: text("jabzour_2"),
    jabzour_thickness: text("jabzour_thickness"),

    lines: integer("lines").default(1),

    notes: text("notes"),
    express: boolean("express").default(false),
    brova: boolean("brova").default(false),
    delivery_date: timestamp("delivery_date"),
    piece_stage: productionStageEnum("piece_stage"),
}, (t) => ({
    orderIdx: index("garments_order_idx").on(t.order_id),
}));

// --- 7. ORDER SHELF ITEMS (Work & Sales Orders) ---
export const orderShelfItems = pgTable("order_shelf_items", {
    id: serial("id").primaryKey(),
    order_id: integer("order_id").references(() => orders.id).notNull(),
    shelf_id: integer("shelf_id").references(() => shelf.id).notNull(),
    quantity: integer("quantity").default(1),
    unit_price: numeric("unit_price", { precision: 10, scale: 3 }),
});

// --- RELATIONS ---
export const customersRelations = relations(customers, ({ many }) => ({
    orders: many(orders),
    measurements: many(measurements),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
    customer: one(customers, { fields: [orders.customer_id], references: [customers.id] }),
    garments: many(garments),
    shelfItems: many(orderShelfItems),
    taker: one(users, { fields: [orders.order_taker_id], references: [users.id] }),
    campaign: one(campaigns, { fields: [orders.campaign_id], references: [campaigns.id] }),
    linkedOrder: one(orders, { fields: [orders.linked_order_id], references: [orders.id], relationName: "linked_orders" }),
    childOrders: many(orders, { relationName: "linked_orders" })
}));

export const garmentsRelations = relations(garments, ({ one }) => ({
    order: one(orders, { fields: [garments.order_id], references: [orders.id] }),
    fabric: one(fabrics, { fields: [garments.fabric_id], references: [fabrics.id] }),
    style: one(styles, { fields: [garments.style_id], references: [styles.id] }),
    measurement: one(measurements, { fields: [garments.measurement_id], references: [measurements.id] }),
}));

export const orderShelfItemsRelations = relations(orderShelfItems, ({ one }) => ({
    order: one(orders, { fields: [orderShelfItems.order_id], references: [orders.id] }),
    shelf: one(shelf, { fields: [orderShelfItems.shelf_id], references: [shelf.id] }),
}));

// --- TYPE EXPORTS ---

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Customer = InferSelectModel<typeof customers>;
export type NewCustomer = InferInsertModel<typeof customers>;

export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;

export type Garment = InferSelectModel<typeof garments>;
export type NewGarment = InferInsertModel<typeof garments>;

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
