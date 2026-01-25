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
  console.log("🚀 Starting Migration...");

  // 0. ESSENTIAL DATA (always seed these first)
  await seedEssentialData();

  // 1. USERS
  console.log("--> Migrating Employees...");
  const users = readJson("Employees.json"); 
  for (const u of users) {
    const [res] = await db.insert(schema.users).values({
      name: u.fields.Name,
      email: u.fields.Email,
    }).returning({ id: schema.users.id }).onConflictDoNothing();
    if(res) idMap.set(u.id, res.id);
  }

  // 2. LOOKUPS (Styles, Fabrics, Campaigns)
  console.log("--> Migrating Lookups...");
  const lookups = [
    { file: "Campaigns.json", table: schema.campaigns, name: "Name" },
    { file: "Styles.json", table: schema.styles, name: "Name" },
    { file: "Fabrics.json", table: schema.fabrics, name: "Name" },
    { file: "Shelves.json", table: schema.shelf, name: "Type" } 
  ];
  for (const l of lookups) {
    const data = readJson(l.file);
    for (const item of data) {
      const values: any = {};
      
      if (l.table === schema.shelf) {
        values.type = item.fields[l.name];
      } else {
        values.name = item.fields[l.name];
      }

      // Add random prices for fabrics if not already present
      if (l.file === "Fabrics.json") {
        values.price_per_meter = Number((Math.random() * (12 - 3) + 3).toFixed(3));
        values.color = item.fields.Color || "Standard";
      }

      // Add random prices for shelf items if not already present
      if (l.file === "Shelves.json") {
        values.price = Number((Math.random() * (50 - 1) + 1).toFixed(2));
        values.brand = item.fields.Brand || "Generic";
      }

      const [res] = await db.insert(l.table as any).values(values).returning({ id: (l.table as any).id }).onConflictDoNothing();
      if(res) idMap.set(item.id, res.id);
    }
  }

  // 3. CUSTOMERS
  console.log("--> Migrating Customers...");
  const customers = readJson("Customers.json");
  for (const c of customers) {
    const [res] = await db.insert(schema.customers).values({
      name: c.fields.Name || "Unknown",
      phone: c.fields.Phone,
      whatsapp: !!c.fields.Whatsapp,
      email: c.fields.Email,
      city: c.fields.City,
      block: c.fields.Block,
      street: c.fields.Street,
      area: c.fields.Area,
      customer_segment: c.fields.CustomerSegment,
    }).returning({ id: schema.customers.id }).onConflictDoNothing();
    if(res) idMap.set(c.id, res.id);
  }

  // 4. MEASUREMENTS
  console.log("--> Migrating Measurements...");
  const measurements = readJson("Measurements.json");
  for (const m of measurements) {
    const custId = m.fields.CustomerID ? idMap.get(m.fields.CustomerID[0]) : null;
    if(!custId) continue;
    
    const [res] = await db.insert(schema.measurements).values({
      customer_id: custId,
      // map other fields as needed
    }).returning({ id: schema.measurements.id }).onConflictDoNothing();
    if(res) idMap.set(m.id, res.id);
  }

  // 5. ORDERS
  console.log("--> Migrating Orders...");
  const orders = readJson("Orders.json");
  for (const o of orders) {
    const custId = o.fields.CustomerID ? idMap.get(o.fields.CustomerID[0]) : null;
    const takerId = o.fields.OrderTaker ? idMap.get(o.fields.OrderTaker[0]) : null;
    const linkedId = o.fields.LinkedTo ? idMap.get(o.fields.LinkedTo[0]) : null;

    let status = "draft";
    if (o.fields.OrderStatus === "Completed") status = "confirmed";
    if (o.fields.OrderStatus === "Cancelled") status = "cancelled";

    const [res] = await db.insert(schema.orders).values({
      customer_id: custId,
      order_taker_id: takerId,
      parent_order_id: linkedId,
      checkout_status: status as any,
      production_stage: (o.fields.FatouraStages || "order_at_shop").toLowerCase().replace(/ /g, "_") as any,
      invoice_number: o.fields.Fatoura,
      order_total: o.fields.OrderTotal ? String(o.fields.OrderTotal) : "0",
    }).returning({ id: schema.orders.id }).onConflictDoNothing();
    if(res) idMap.set(o.id, res.id);
  }

  // 6. GARMENTS
  console.log("--> Migrating Garments...");
  const garments = readJson("GARMENTS.json");
  for (const g of garments) {
    const orderId = g.fields.OrderId ? idMap.get(g.fields.OrderId[0]) : null;
    const fabricId = g.fields.FabricId ? idMap.get(g.fields.FabricId[0]) : null;
    const styleId = g.fields.StyleOptionId ? idMap.get(g.fields.StyleOptionId[0]) : null;
    const measureId = g.fields.MeasurementId ? idMap.get(g.fields.MeasurementId[0]) : null;

    if (!orderId) continue;

    await db.insert(schema.garments).values({
      order_id: orderId,
      fabric_id: fabricId,
      style_id: styleId,
      measurement_id: measureId,
      quantity: 1,
      notes: g.fields.Note,
    }).onConflictDoNothing();
  }

  console.log("✅ Migration Complete.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
