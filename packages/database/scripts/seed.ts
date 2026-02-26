import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/schema";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Use Session Mode (5432) for Bulk Insert
const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

const readJson = (file: string) => {
  const p = path.join(__dirname, "../data-dump", file);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
};

const idMap = new Map<string, any>();

// Essential fabrics that should always exist
const ESSENTIAL_FABRICS = [
  { name: 'ERTH 01 10', color: 'WHITE 6', real_stock: 0.00, price_per_meter: 4.500 },
  { name: 'CHA STI C04', color: 'C04', real_stock: 0.51, price_per_meter: 3.750 },
  { name: 'SUP TER 1 PURE WHITE', color: '1 PURE WHITE', real_stock: 1.00, price_per_meter: 5.250 },
  { name: 'SUP TER 5 IVORY', color: '5 IVORY', real_stock: 16.11, price_per_meter: 5.500 },
  { name: 'CRI TER 1 PURE WHITE', color: '1 PURE WHITE', real_stock: 12.72, price_per_meter: 6.000 },
  { name: 'SUP TER 4 CREAM', color: 'CREAM', real_stock: 31.11, price_per_meter: 5.500 },
  { name: 'MOD A.F C02', color: 'C02', real_stock: 9.36, price_per_meter: 4.250 },
];

// Essential shelf products that should always exist
const ESSENTIAL_SHELF = [
  { type: 'Shumakh', brand: 'Hield', stock: 989, price: 30.00 },
  { type: 'Vest', brand: 'Cannon', stock: 953, price: 1.25 },
  { type: 'Mukassa(Pajama)', brand: 'Breezy', stock: 977, price: 2.75 },
];

// Essential prices (style options, etc.)
const ESSENTIAL_PRICES = [
  // Collar
  { key: 'COL_QALLABI', value: 5.0, description: 'Qallabi' },
  { key: 'COL_DOWN_COLLAR', value: 0.0, description: 'Down Collar' },
  { key: 'COL_JAPANESE', value: 0.0, description: 'Japanese' },
  // Collar Button
  { key: 'COL_ARAVI_ZARRAR', value: 0.0, description: 'Aravi Zarrar' },
  { key: 'COL_ZARRAR__TABBAGI', value: 0.0, description: 'Zarrar + Tabbagi' },
  { key: 'COL_TABBAGI', value: 0.0, description: 'Tabbagi' },
  { key: 'COL_SMALL_TABBAGI', value: 0.0, description: 'Small Tabbagi' },
  // Jabzour
  { key: 'JAB_SHAAB', value: 1.0, description: 'Shaab' },
  { key: 'JAB_MAGFI_MUSALLAS', value: 0.0, description: 'Magfi Musallas' },
  { key: 'JAB_BAIN_MUSALLAS', value: 0.0, description: 'Bain Musallas' },
  { key: 'JAB_MAGFI_MURABBA', value: 0.0, description: 'Magfi Murabba' },
  { key: 'JAB_BAIN_MURABBA', value: 0.0, description: 'Bain Murabba' },
  // Side Pocket
  { key: 'SID_MUSALLAS_SIDE_POCKET', value: 0.0, description: 'Musallas Side Pocket' },
  { key: 'SID_MUDAWWAR_SIDE_POCKET', value: 0.0, description: 'Mudawwar Side Pocket' },
  // Front Pocket
  { key: 'FRO_MUSALLAS_FRONT_POCKET', value: 0.0, description: 'Musallas Front Pocket' },
  { key: 'FRO_MURABBA_FRONT_POCKET', value: 0.0, description: 'Murabba Front Pocket' },
  { key: 'FRO_MUDAWWAR_FRONT_POCKET', value: 0.0, description: 'Mudawwar Front Pocket' },
  { key: 'FRO_MUDAWWAR_MAGFI_FRONT_POCKET', value: 0.0, description: 'Mudawwar Magfi Front Pocket' },
  // Cuff
  { key: 'CUF_DOUBLE_GUMSHA', value: 3.0, description: 'Double Gumsha' },
  { key: 'CUF_MURABBA_KABAK', value: 3.0, description: 'Murabba Kabak' },
  { key: 'CUF_MUSALLAS_KABBAK', value: 3.0, description: 'Musallas Kabbak' },
  { key: 'CUF_MUDAWAR_KABBAK', value: 3.0, description: 'Mudawar Kabbak' },
  // Style
  { key: 'STY_DESIGNER', value: 15.0, description: 'Designer' },
  { key: 'STY_KUWAITI', value: 0.0, description: 'Kuwaiti' },
  { key: 'STY_LINE', value: 0.0, description: 'Line' },
  { key: 'STITCHING_STANDARD', value: 9.0, description: 'Standard Stitching' },
  // Services
  { key: 'HOME_DELIVERY', value: 2.0, description: 'Home Delivery Charge' },
  { key: 'EXPRESS_SURCHARGE', value: 5.0, description: 'Express Order Surcharge' },
];

async function seedEssentialData() {
  console.log("--> Seeding essential fabrics...");
  for (const fabric of ESSENTIAL_FABRICS) {
    await db.insert(schema.fabrics)
      .values(fabric)
      .onConflictDoNothing();
  }
  console.log(`    Added ${ESSENTIAL_FABRICS.length} essential fabrics (if not existing)`);

  console.log("--> Seeding essential shelf products...");
  for (const item of ESSENTIAL_SHELF) {
    await db.insert(schema.shelf)
      .values(item)
      .onConflictDoNothing();
  }
  console.log(`    Added ${ESSENTIAL_SHELF.length} essential shelf products (if not existing)`);

  console.log("--> Seeding essential prices...");
  for (const price of ESSENTIAL_PRICES) {
    await db.insert(schema.prices)
      .values(price)
      .onConflictDoNothing();
  }
  console.log(`    Added ${ESSENTIAL_PRICES.length} essential prices (if not existing)`);
}

async function main() {
  console.log("🚀 Starting Clean Seed...");

  // 1. ESSENTIAL DATA (Fabrics, Shelf, Prices)
  await seedEssentialData();

  // 2. SINGLE TEST USER (Employee)
  console.log("--> Seeding test employee...");
  await db.insert(schema.users).values({
    name: "Admin User",
    email: "admin@erth.com",
    role: "admin",
  }).onConflictDoNothing();

  const employee = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, "admin@erth.com"),
  });

  // 3. SINGLE COMPREHENSIVE CUSTOMER
  console.log("--> Seeding test customer...");
  await db.insert(schema.customers).values({
    name: "John Doe",
    nick_name: "Johnny",
    phone: "96512345678",
    email: "john.doe@example.com",
    country_code: "965",
    city: "Kuwait City",
    area: "Salmiya",
    block: "4",
    street: "123 Gulf Road",
    house_no: "10",
    address_note: "Near the grand mosque",
    nationality: "Kuwaiti",
    account_type: "Primary",
  }).onConflictDoNothing();

  const customer = await db.query.customers.findFirst({
    where: (customers, { eq }) => eq(customers.email, "john.doe@example.com"),
  });

  // 4. DUMMY STYLE & ORDERS
  if (employee && customer) {
    console.log("--> Seeding dummy style...");
    const [style] = await db.insert(schema.styles).values({
      name: "Kuwaiti Standard",
      type: "Dishdasha",
      rate_per_item: "15.000",
    }).returning();

    const fabric = await db.query.fabrics.findFirst();

    console.log("--> Seeding dummy orders in various stages...");
    const stages = [
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
    ] as const;

    for (const [index, stage] of stages.entries()) {
      // Create Order
      const [order] = await db.insert(schema.orders).values({
        customer_id: customer.id,
        order_taker_id: employee.id,
        checkout_status: "confirmed",
        order_type: "WORK",
        brand: "ERTH",
        payment_type: "knet",
        paid: "15.000",
        order_total: "15.000",
        notes: `Dummy order for stage: ${stage}`,
      }).returning();

      // Create Work Order
      await db.insert(schema.workOrders).values({
        order_id: order.id,
        invoice_number: 10000 + index,
        production_stage: stage,
        num_of_fabrics: 1,
        stitching_charge: "15.000",
      }).onConflictDoNothing();

      // Create Garment
      await db.insert(schema.garments).values({
        order_id: order.id,
        quantity: 1,
        style_id: style?.id,
        fabric_id: fabric?.id,
        style: "kuwaiti",
        notes: `Garment for ${stage}`,
      });
    }
    console.log(`    Added ${stages.length} dummy orders.`);
  }

  console.log("✅ Seed Complete. Created 1 Admin, 1 Customer, essential lookups, and dummy orders.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
