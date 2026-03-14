import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/schema";
import * as dotenv from "dotenv";
import { addDays } from "date-fns";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

// Helper to add days
const future = (days: number) => addDays(new Date(), days);

async function main() {
  console.log("🚀 Starting Shop-Focused Realistic Seed...");

  // 1. Core Data
  const [admin] = await db.insert(schema.users).values({
    name: "System Admin",
    email: "admin@erth.com",
    role: "admin",
  }).onConflictDoNothing().returning();

  const [customer] = await db.insert(schema.customers).values({
    name: "John Doe",
    phone: "96590001111",
    email: "john@example.com",
    country_code: "965",
    nationality: "Kuwaiti",
    account_type: "Primary",
  }).onConflictDoNothing().returning();

  // --- Styles ---
  console.log("Seeding styles...");
  const stylesData = [
    // Collar types
    { name: "Qallabi", type: "Collar", rate_per_item: 5.000, image_url: "COL_QALLABI" },
    { name: "Down Collar", type: "Collar", rate_per_item: 0.000, image_url: "COL_DOWN_COLLAR" },
    { name: "Japanese", type: "Collar", rate_per_item: 0.000, image_url: "COL_JAPANESE" },
    // Collar buttons
    { name: "Aravi Zarrar", type: "Collar Button", rate_per_item: 0.000, image_url: "COL_ARAVI_ZARRAR" },
    { name: "Zarrar + Tabbagi", type: "Collar Button", rate_per_item: 0.000, image_url: "COL_ZARRAR__TABBAGI" },
    { name: "Tabbagi", type: "Collar Button", rate_per_item: 0.000, image_url: "COL_TABBAGI" },
    { name: "Small Tabbagi", type: "Collar Button", rate_per_item: 0.000, image_url: "COL_SMALL_TABBAGI" },
    // Jabzour
    { name: "Shaab", type: "Jabzour", rate_per_item: 1.000, image_url: "JAB_SHAAB" },
    { name: "Magfi  Musallas", type: "Jabzour", rate_per_item: 0.000, image_url: "JAB_MAGFI_MUSALLAS" },
    { name: "Bain Musallas", type: "Jabzour", rate_per_item: 0.000, image_url: "JAB_BAIN_MUSALLAS" },
    { name: "Magfi Murabba", type: "Jabzour", rate_per_item: 0.000, image_url: "JAB_MAGFI_MURABBA" },
    { name: "Bain Murabba", type: "Jabzour", rate_per_item: 0.000, image_url: "JAB_BAIN_MURABBA" },
    // Side Pocket
    { name: "Musallas Side pocket", type: "Side Pocket", rate_per_item: 0.000, image_url: "SID_MUSALLAS_SIDE_POCKET" },
    { name: "Mudawwar Side Pocket", type: "Side Pocket", rate_per_item: 0.000, image_url: "SID_MUDAWWAR_SIDE_POCKET" },
    // Front Pocket
    { name: "Musallas Front Pocket", type: "Front Pocket", rate_per_item: 0.000, image_url: "FRO_MUSALLAS_FRONT_POCKET" },
    { name: "Murabba Front Pocket", type: "Front Pocket", rate_per_item: 0.000, image_url: "FRO_MURABBA_FRONT_POCKET" },
    { name: "Mudawwar Front Pocket", type: "Front Pocket", rate_per_item: 0.000, image_url: "FRO_MUDAWWAR_FRONT_POCKET" },
    { name: "Mudawwar Magfi Front Pocket", type: "Front Pocket", rate_per_item: 0.000, image_url: "FRO_MUDAWWAR_MAGFI_FRONT_POCKET" },
    // Cuff
    { name: "Double Gumsha", type: "Cuff", rate_per_item: 3.000, image_url: "CUF_DOUBLE_GUMSHA" },
    { name: "Murabba Kabak", type: "Cuff", rate_per_item: 3.000, image_url: "CUF_MURABBA_KABAK" },
    { name: "Musallas Kabbak", type: "Cuff", rate_per_item: 3.000, image_url: "CUF_MUSALLAS_KABBAK" },
    { name: "Mudawar Kabbak", type: "Cuff", rate_per_item: 3.000, image_url: "CUF_MUDAWAR_KABBAK" },
    // Style
    { name: "Designer", type: "Style", rate_per_item: 6.000, image_url: "STY_DESIGNER" },
    { name: "Kuwaiti", type: "Style", rate_per_item: 0.000, image_url: "STY_KUWAITI" },
    { name: "Line", type: "Style", rate_per_item: 0.000, image_url: "STY_LINE" },
  ];
  const insertedStyles = await db.insert(schema.styles).values(stylesData).returning();
  // Use the first "Style" type entry as default for garment references
  const defaultStyle = insertedStyles.find(s => s.type === "Style");

  // --- Fabrics ---
  console.log("Seeding fabrics...");
  const fabricsData = [
    { name: "CHA STI C04", color: "C04", real_stock: 0.51, price_per_meter: 3.500 },
    { name: "CRI TER 1 PURE WHITE", color: "1 PURE WHITE", real_stock: 12.72, price_per_meter: 4.000 },
    { name: "ERTH 01 10", color: "WHITE 6", real_stock: 0.00, price_per_meter: 5.000 },
    { name: "MOD A.F C02", color: "C02", real_stock: 9.36, price_per_meter: 4.500 },
    { name: "SUP TER 1 PURE WHITE", color: "1 PURE WHITE", real_stock: 1.00, price_per_meter: 4.000 },
    { name: "SUP TER 4 CREAM", color: "CREAM", real_stock: 31.11, price_per_meter: 4.000 },
    { name: "SUP TER 5 IVORY", color: "5 IVORY", real_stock: 16.11, price_per_meter: 4.000 },
  ];
  const insertedFabrics = await db.insert(schema.fabrics).values(fabricsData).onConflictDoNothing().returning();

  const [shelf] = await db.insert(schema.shelf).values({
    type: "Premium Shumakh",
    brand: "Hield",
    stock: 100,
    price: 25.000,
  }).onConflictDoNothing().returning();

  const employeeId = admin?.id;
  const customerId = customer?.id;
  const styleId = defaultStyle?.id;
  const fabricId = insertedFabrics[0]?.id;

  if (!employeeId || !customerId) {
    console.error("Failed to setup core entities");
    return;
  }

  // --- Measurements ---
  console.log("Seeding measurements...");
  const [measurement1] = await db.insert(schema.measurements).values({
    customer_id: customerId,
    measurer_id: employeeId,
    measurement_date: new Date(),
    measurement_id: `${customerId}-1`,
    type: "Body",
    notes: "Standard measurements",
    collar_width: 6.75,
    collar_height: 2.50,
    shoulder: 19.25,
    armhole: 11.00,
    chest_upper: 43.50,
    chest_full: 46.00,
    sleeve_length: 25.75,
    sleeve_width: 7.75,
    elbow: 13.50,
    top_pocket_length: 5.75,
    top_pocket_width: 4.25,
    top_pocket_distance: 8.50,
    side_pocket_length: 7.25,
    side_pocket_width: 6.25,
    side_pocket_distance: 11.50,
    side_pocket_opening: 6.75,
    waist_front: 19.25,
    waist_back: 19.75,
    waist_full: 39.00,
    length_front: 43.50,
    length_back: 44.25,
    bottom: 23.50,
    chest_provision: 2.00,
    waist_provision: 2.00,
    armhole_provision: 1.00,
    jabzour_width: 2.75,
    jabzour_length: 8.25,
    chest_front: 22.25,
    chest_back: 23.75,
    armhole_front: 5.50,
    degree: 1.25,
  }).returning();

  const measurementId = measurement1?.id;

  // Shared garment style options for realistic feedback testing
  const garmentStyleOptions = {
    collar_type: "Down Collar",
    collar_button: "Tabbagi",
    cuffs_type: "Double Gumsha",
    cuffs_thickness: "Thick",
    front_pocket_type: "Musallas Front Pocket",
    front_pocket_thickness: "Thin",
    jabzour_1: "BUTTON" as const,
    jabzour_thickness: "Medium",
    small_tabaggi: false,
  };

  // --- SCENARIO A: New Order (Ready to Dispatch) ---
  console.log("Scenario A: New Order (Ready to Dispatch)...");
  const dateA = future(10);
  const [orderA] = await db.insert(schema.orders).values({
    customer_id: customerId,
    order_taker_id: employeeId,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    payment_type: "knet",
    paid: 30.000,
    order_total: 30.000,
    delivery_date: dateA,
  }).returning();

  await db.insert(schema.workOrders).values({
    order_id: orderA.id,
    invoice_number: 5001,
    order_phase: "new",
    num_of_fabrics: 2,
    delivery_date: dateA,
  });

  await db.insert(schema.garments).values([
    { order_id: orderA.id, garment_id: `${orderA.id}-1`, garment_type: "final", piece_stage: "waiting_cut", location: "shop", trip_number: 1, style_id: styleId, fabric_id: fabricId, delivery_date: dateA, measurement_id: measurementId, ...garmentStyleOptions },
    { order_id: orderA.id, garment_id: `${orderA.id}-2`, garment_type: "final", piece_stage: "waiting_cut", location: "shop", trip_number: 1, style_id: styleId, fabric_id: fabricId, delivery_date: dateA, measurement_id: measurementId, ...garmentStyleOptions },
  ]);

  // --- SCENARIO B: Brova Trial Needed (At Shop) ---
  console.log("Scenario B: Brova Trial Needed...");
  const dateB = future(5);
  const [orderB] = await db.insert(schema.orders).values({
    customer_id: customerId,
    order_taker_id: employeeId,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    payment_type: "link_payment",
    paid: 15.000,
    order_total: 15.000,
    delivery_date: dateB,
  }).returning();

  await db.insert(schema.workOrders).values({
    order_id: orderB.id,
    invoice_number: 5002,
    order_phase: "in_progress",
    num_of_fabrics: 1,
    delivery_date: dateB,
  });

  await db.insert(schema.garments).values([
    { order_id: orderB.id, garment_id: `${orderB.id}-1`, garment_type: "brova", piece_stage: "awaiting_trial", location: "shop", style_id: styleId, fabric_id: fabricId, delivery_date: dateB, acceptance_status: null, measurement_id: measurementId, ...garmentStyleOptions },
    { order_id: orderB.id, garment_id: `${orderB.id}-2`, garment_type: "final", piece_stage: "waiting_for_acceptance", location: "workshop", style_id: styleId, fabric_id: fabricId, delivery_date: dateB, measurement_id: measurementId, ...garmentStyleOptions },
  ]);

  // --- SCENARIO C: Multiple Brovas (One Trialed, One Pending) ---
  console.log("Scenario C: Multiple Brovas...");
  const dateC = future(12);
  const [orderC] = await db.insert(schema.orders).values({
    customer_id: customerId,
    order_taker_id: employeeId,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 60.000,
    order_total: 60.000,
    delivery_date: dateC,
  }).returning();

  await db.insert(schema.workOrders).values({
    order_id: orderC.id,
    invoice_number: 5003,
    order_phase: "in_progress",
    num_of_fabrics: 4,
    delivery_date: dateC,
  });

  await db.insert(schema.garments).values([
    { order_id: orderC.id, garment_id: `${orderC.id}-1`, garment_type: "brova", piece_stage: "accepted", location: "shop", acceptance_status: true, style_id: styleId, fabric_id: fabricId, delivery_date: dateC, measurement_id: measurementId, ...garmentStyleOptions },
    { order_id: orderC.id, garment_id: `${orderC.id}-2`, garment_type: "brova", piece_stage: "awaiting_trial", location: "shop", style_id: styleId, fabric_id: fabricId, delivery_date: dateC, acceptance_status: null, measurement_id: measurementId, ...garmentStyleOptions },
    { order_id: orderC.id, garment_id: `${orderC.id}-3`, garment_type: "final", piece_stage: "waiting_for_acceptance", location: "workshop", style_id: styleId, fabric_id: fabricId, delivery_date: dateC, measurement_id: measurementId, ...garmentStyleOptions },
    { order_id: orderC.id, garment_id: `${orderC.id}-4`, garment_type: "final", piece_stage: "waiting_for_acceptance", location: "workshop", style_id: styleId, fabric_id: fabricId, delivery_date: dateC, measurement_id: measurementId, ...garmentStyleOptions },
  ]);

  // --- SCENARIO D: Ready for Pickup (All Items Accepted at Shop) ---
  console.log("Scenario D: Ready for Pickup...");
  const dateD = future(-2);
  const [orderD] = await db.insert(schema.orders).values({
    customer_id: customerId,
    order_taker_id: employeeId,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 45.000,
    order_total: 45.000,
    delivery_date: dateD, 
  }).returning();

  await db.insert(schema.workOrders).values({
    order_id: orderD.id,
    invoice_number: 5004,
    order_phase: "in_progress",
    num_of_fabrics: 3,
    delivery_date: dateD,
  });

  await db.insert(schema.garments).values([
    { order_id: orderD.id, garment_id: `${orderD.id}-1`, garment_type: "final", piece_stage: "ready_for_pickup", location: "shop", style_id: styleId, fabric_id: fabricId, delivery_date: dateD, acceptance_status: true, measurement_id: measurementId, ...garmentStyleOptions },
    { order_id: orderD.id, garment_id: `${orderD.id}-2`, garment_type: "final", piece_stage: "ready_for_pickup", location: "shop", style_id: styleId, fabric_id: fabricId, delivery_date: dateD, acceptance_status: true, measurement_id: measurementId, ...garmentStyleOptions },
    { order_id: orderD.id, garment_id: `${orderD.id}-3`, garment_type: "final", piece_stage: "accepted", location: "shop", acceptance_status: true, style_id: styleId, fabric_id: fabricId, delivery_date: dateD, measurement_id: measurementId, ...garmentStyleOptions },
  ]);

  // --- SCENARIO E: Alteration (In) - Brova back for 2nd repair (trip 3 = 1st alteration) ---
  console.log("Scenario E: Alteration (In)...");
  const dateE = future(2);
  const [orderE] = await db.insert(schema.orders).values({
    customer_id: customerId,
    order_taker_id: employeeId,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 30.000,
    order_total: 30.000,
    delivery_date: dateE,
  }).returning();

  await db.insert(schema.workOrders).values({
    order_id: orderE.id,
    invoice_number: 5005,
    order_phase: "in_progress",
    num_of_fabrics: 2,
    delivery_date: dateE,
  });

  await db.insert(schema.garments).values([
    { order_id: orderE.id, garment_id: `${orderE.id}-1`, garment_type: "brova", piece_stage: "awaiting_trial", location: "shop", trip_number: 3, acceptance_status: false, style_id: styleId, fabric_id: fabricId, delivery_date: dateE, measurement_id: measurementId, ...garmentStyleOptions },
    { order_id: orderE.id, garment_id: `${orderE.id}-2`, garment_type: "final", piece_stage: "waiting_for_acceptance", location: "workshop", trip_number: 1, style_id: styleId, fabric_id: fabricId, delivery_date: dateE, measurement_id: measurementId, ...garmentStyleOptions },
  ]);

  // --- SCENARIO F: In Transit to Shop (Ready to be Received) ---
  console.log("Scenario F: In Transit to Shop...");
  const dateF = future(3);
  const [orderF] = await db.insert(schema.orders).values({
    customer_id: customerId,
    order_taker_id: employeeId,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 15.000,
    order_total: 15.000,
    delivery_date: dateF,
  }).returning();

  await db.insert(schema.workOrders).values({
    order_id: orderF.id,
    invoice_number: 5006,
    order_phase: "in_progress",
    num_of_fabrics: 1,
    delivery_date: dateF,
  });

  await db.insert(schema.garments).values([
    {
      order_id: orderF.id,
      garment_id: `${orderF.id}-1`,
      garment_type: "final",
      piece_stage: "ready_for_dispatch",
      location: "transit_to_shop",
      trip_number: 1,
      style_id: styleId,
      fabric_id: fabricId,
      delivery_date: dateF,
      measurement_id: measurementId,
      ...garmentStyleOptions,
    },
  ]);

  // --- SCENARIO G: Simple Sales Order ---
  console.log("Scenario G: Simple Sales Order...");
  const [orderG] = await db.insert(schema.orders).values({
    customer_id: customerId,
    order_taker_id: employeeId,
    checkout_status: "confirmed",
    order_type: "SALES",
    brand: "ERTH",
    paid: 25.000,
    order_total: 25.000,
    order_date: new Date(),
  }).returning();

  await db.insert(schema.orderShelfItems).values({
    order_id: orderG.id,
    shelf_id: shelf?.id,
    quantity: 1,
    unit_price: 25.000,
  });

  // --- Prices (system-level only, style pricing lives in styles table) ---
  console.log("Seeding prices...");
  await db.insert(schema.prices).values([
    { key: "STITCHING_ADULT", value: 9.000, description: "Adult stitching rate per garment" },
    { key: "STITCHING_CHILD", value: 7.000, description: "Child stitching rate per garment" },
    { key: "HOME_DELIVERY", value: 5.000, description: "Home delivery charge" },
    { key: "EXPRESS_SURCHARGE", value: 2.000, description: "Express order surcharge" },
  ]).onConflictDoNothing();

  // --- Workshop Resources (Workers & Units) ---
  console.log("Seeding workshop resources...");
  await db.insert(schema.resources).values([
    // Soaking - Unit 1
    { resource_name: "Ahmad",   responsibility: "soaking",       unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Rashid",  responsibility: "soaking",       unit: "Unit 1", resource_type: "Junior" },
    // Cutting - Unit 1
    { resource_name: "Bilal",   responsibility: "cutting",       unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Tariq",   responsibility: "cutting",       unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Waleed",  responsibility: "cutting",       unit: "Unit 1", resource_type: "Junior" },
    // Post-Cutting - Unit 1
    { resource_name: "Hassan",  responsibility: "post_cutting",  unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Majed",   responsibility: "post_cutting",  unit: "Unit 1", resource_type: "Junior" },
    // Sewing - Unit 1 + Unit 2
    { resource_name: "Omar",    responsibility: "sewing",        unit: "Unit 1", resource_type: "Senior", daily_target: 12 },
    { resource_name: "Yusuf",   responsibility: "sewing",        unit: "Unit 1", resource_type: "Senior", daily_target: 10 },
    { resource_name: "Khalid",  responsibility: "sewing",        unit: "Unit 1", resource_type: "Junior", daily_target: 8 },
    { resource_name: "Ibrahim", responsibility: "sewing",        unit: "Unit 2", resource_type: "Senior", daily_target: 11 },
    { resource_name: "Ali",     responsibility: "sewing",        unit: "Unit 2", resource_type: "Senior", daily_target: 10 },
    { resource_name: "Hamza",   responsibility: "sewing",        unit: "Unit 2", resource_type: "Junior", daily_target: 7 },
    // Finishing - Unit 1
    { resource_name: "Saeed",   responsibility: "finishing",      unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Hamad",   responsibility: "finishing",      unit: "Unit 1", resource_type: "Junior" },
    // Ironing - Unit 1
    { resource_name: "Faisal",  responsibility: "ironing",        unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Salman",  responsibility: "ironing",        unit: "Unit 1", resource_type: "Junior" },
    // QC - Unit 1
    { resource_name: "Nasser",  responsibility: "quality_check",  unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Fahad",   responsibility: "quality_check",  unit: "Unit 1", resource_type: "Junior" },
  ]).onConflictDoNothing();

  console.log("✅ Shop-Focused Seed Complete!");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
