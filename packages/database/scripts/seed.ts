import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/schema";
import * as dotenv from "dotenv";
import { addDays, subDays } from "date-fns";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

const future = (days: number) => addDays(new Date(), days);
const past = (days: number) => subDays(new Date(), days);

async function main() {
  console.log("Seeding database...\n");

  // =============================================
  // 1. USERS (Staff / Measurers)
  // =============================================
  console.log("Users...");
  const [userAdmin] = await db.insert(schema.users).values({
    username: "zahid",
    name: "Zahid Mahmood",
    email: "zahid@erth.com",
    role: "admin",
    department: "workshop",
    country_code: "+965",
  }).returning();

  const [userAhmed] = await db.insert(schema.users).values({
    username: "ahmed",
    name: "Ahmed Al-Rashidi",
    email: "ahmed@erth.com",
    role: "staff",
    department: "shop",
    brands: ["erth"],
    country_code: "+965",
  }).returning();

  const [userKhalid] = await db.insert(schema.users).values({
    username: "khalid",
    name: "Khalid Al-Dosari",
    email: "khalid@erth.com",
    role: "staff",
    department: "shop",
    brands: ["erth", "sakkba"],
    country_code: "+965",
  }).returning();

  const [userFahad] = await db.insert(schema.users).values({
    username: "fahad",
    name: "Fahad Al-Enezi",
    email: "fahad@erth.com",
    role: "manager",
    department: "workshop",
    country_code: "+965",
  }).returning();

  // =============================================
  // 2. CUSTOMERS
  // =============================================
  console.log("Customers...");
  const [custAbdullah] = await db.insert(schema.customers).values({
    name: "Abdullah Al-Mutairi",
    arabic_name: "عبدالله المطيري",
    phone: "96599112233",
    country_code: "965",
    nationality: "Kuwaiti",
    account_type: "Primary",
    city: "Kuwait City",
    area: "Salmiya",
    block: "5",
    street: "Salem Al-Mubarak",
    whatsapp: true,
    customer_segment: "VIP",
  }).returning();

  const [custMohammad] = await db.insert(schema.customers).values({
    name: "Mohammad Al-Shammari",
    arabic_name: "محمد الشمري",
    phone: "96566778899",
    country_code: "965",
    nationality: "Kuwaiti",
    account_type: "Primary",
    city: "Kuwait City",
    area: "Hawally",
    block: "3",
    street: "Tunis St",
    whatsapp: true,
    customer_segment: "Regular",
  }).returning();

  const [custYousuf] = await db.insert(schema.customers).values({
    name: "Yousuf Al-Hajri",
    arabic_name: "يوسف الهاجري",
    phone: "96555443322",
    country_code: "965",
    nationality: "Kuwaiti",
    account_type: "Primary",
    city: "Kuwait City",
    area: "Jabriya",
    block: "8",
    street: "4th Ring Road",
    whatsapp: true,
    customer_segment: "Regular",
  }).returning();

  const [custNasser] = await db.insert(schema.customers).values({
    name: "Nasser Al-Ajmi",
    arabic_name: "ناصر العجمي",
    phone: "96597654321",
    country_code: "965",
    nationality: "Kuwaiti",
    account_type: "Primary",
    city: "Kuwait City",
    area: "Mishref",
    block: "1",
    street: "Al-Adan St",
    whatsapp: true,
    customer_segment: "VIP",
  }).returning();

  const [custSalem] = await db.insert(schema.customers).values({
    name: "Salem Al-Otaibi",
    arabic_name: "سالم العتيبي",
    phone: "96594001122",
    country_code: "965",
    nationality: "Kuwaiti",
    account_type: "Secondary",
    relation: "Son of Hamad Al-Otaibi",
    city: "Kuwait City",
    area: "Bayan",
    block: "2",
    whatsapp: false,
    customer_segment: "Regular",
  }).returning();

  // =============================================
  // 3. STYLES
  // =============================================
  console.log("Styles...");
  const stylesData = [
    // Collar
    { name: "Qallabi", type: "Collar", rate_per_item: 5.000, image_url: "COL_QALLABI" },
    { name: "Down Collar", type: "Collar", rate_per_item: 0.000, image_url: "COL_DOWN_COLLAR" },
    { name: "Japanese", type: "Collar", rate_per_item: 0.000, image_url: "COL_JAPANESE" },
    // Collar Button
    { name: "Aravi Zarrar", type: "Collar Button", rate_per_item: 0.000, image_url: "COL_ARAVI_ZARRAR" },
    { name: "Zarrar + Tabbagi", type: "Collar Button", rate_per_item: 0.000, image_url: "COL_ZARRAR__TABBAGI" },
    { name: "Tabbagi", type: "Collar Button", rate_per_item: 0.000, image_url: "COL_TABBAGI" },
    { name: "Small Tabbagi", type: "Collar Button", rate_per_item: 0.000, image_url: "COL_SMALL_TABBAGI" },
    // Jabzour
    { name: "Shaab", type: "Jabzour", rate_per_item: 1.000, image_url: "JAB_SHAAB" },
    { name: "Magfi Musallas", type: "Jabzour", rate_per_item: 0.000, image_url: "JAB_MAGFI_MUSALLAS" },
    { name: "Bain Musallas", type: "Jabzour", rate_per_item: 0.000, image_url: "JAB_BAIN_MUSALLAS" },
    { name: "Magfi Murabba", type: "Jabzour", rate_per_item: 0.000, image_url: "JAB_MAGFI_MURABBA" },
    { name: "Bain Murabba", type: "Jabzour", rate_per_item: 0.000, image_url: "JAB_BAIN_MURABBA" },
    // Side Pocket
    { name: "Musallas Side Pocket", type: "Side Pocket", rate_per_item: 0.000, image_url: "SID_MUSALLAS_SIDE_POCKET" },
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
  const styleKuwaiti = insertedStyles.find(s => s.name === "Kuwaiti")!;
  const styleDesigner = insertedStyles.find(s => s.name === "Designer")!;

  // =============================================
  // 4. FABRICS
  // =============================================
  console.log("Fabrics...");
  const fabricsData = [
    { name: "CHA STI C04", color: "C04", real_stock: 0.51, price_per_meter: 3.500 },
    { name: "CRI TER 1 PURE WHITE", color: "1 PURE WHITE", real_stock: 12.72, price_per_meter: 4.000 },
    { name: "ERTH 01 10", color: "WHITE 6", real_stock: 25.00, price_per_meter: 5.000 },
    { name: "MOD A.F C02", color: "C02", real_stock: 9.36, price_per_meter: 4.500 },
    { name: "SUP TER 1 PURE WHITE", color: "1 PURE WHITE", real_stock: 18.50, price_per_meter: 4.000 },
    { name: "SUP TER 4 CREAM", color: "CREAM", real_stock: 31.11, price_per_meter: 4.000 },
    { name: "SUP TER 5 IVORY", color: "5 IVORY", real_stock: 16.11, price_per_meter: 4.000 },
    { name: "ERTH PREMIUM 01", color: "PEARL WHITE", real_stock: 40.00, price_per_meter: 6.500 },
    { name: "ERTH PREMIUM 02", color: "IVORY CREAM", real_stock: 35.00, price_per_meter: 6.500 },
    { name: "ERTH CLASSIC 01", color: "SNOW WHITE", real_stock: 50.00, price_per_meter: 5.500 },
  ];
  const insertedFabrics = await db.insert(schema.fabrics).values(fabricsData).returning();
  const fabricWhite = insertedFabrics.find(f => f.name === "ERTH PREMIUM 01")!;
  const fabricIvory = insertedFabrics.find(f => f.name === "SUP TER 5 IVORY")!;
  const fabricCream = insertedFabrics.find(f => f.name === "SUP TER 4 CREAM")!;
  const fabricClassic = insertedFabrics.find(f => f.name === "ERTH CLASSIC 01")!;

  // =============================================
  // 5. SHELF ITEMS
  // =============================================
  console.log("Shelf items...");
  const [shelfShumakh] = await db.insert(schema.shelf).values({
    type: "Premium Shumakh",
    brand: "Hield",
    stock: 50,
    price: 25.000,
  }).returning();

  await db.insert(schema.shelf).values([
    { type: "Classic Shumakh", brand: "ERTH", stock: 80, price: 18.000 },
    { type: "Embroidered Shumakh", brand: "ERTH", stock: 30, price: 35.000 },
    { type: "Ghutra", brand: "ERTH", stock: 120, price: 12.000 },
    { type: "Agal", brand: "ERTH", stock: 100, price: 8.000 },
  ]);

  // =============================================
  // 6. CAMPAIGNS
  // =============================================
  console.log("Campaigns...");
  await db.insert(schema.campaigns).values([
    { name: "Ramadan 2026" },
    { name: "Eid Al-Fitr 2026" },
    { name: "National Day 2026" },
    { name: "Back to School 2025", active: false },
  ]);

  // =============================================
  // 7. PRICES
  // =============================================
  console.log("Prices...");
  await db.insert(schema.prices).values([
    { key: "STITCHING_ADULT", value: 9.000, description: "Adult stitching rate per garment" },
    { key: "STITCHING_KID", value: 7.000, description: "Kid stitching rate per garment" },
    { key: "STITCHING_BROVA", value: 3.000, description: "Brova (trial) stitching rate" },
    { key: "EXPRESS_SURCHARGE", value: 2.000, description: "Express order surcharge" },
  ]);

  // =============================================
  // 8. MEASUREMENTS
  // =============================================
  console.log("Measurements...");
  // Abdullah - athletic build, prefers loose fit
  const [measAbdullah] = await db.insert(schema.measurements).values({
    customer_id: custAbdullah.id,
    measurer_id: userAhmed.id,
    measurement_date: past(30),
    measurement_id: `${custAbdullah.id}-1`,
    type: "Body",
    notes: "Prefers slightly loose around chest. Athletic build.",
    collar_width: 7.00, collar_height: 2.75,
    shoulder: 19.50, armhole: 11.50,
    chest_upper: 44.00, chest_full: 47.00,
    sleeve_length: 26.00, sleeve_width: 8.00, elbow: 14.00,
    top_pocket_length: 6.00, top_pocket_width: 4.50, top_pocket_distance: 8.75,
    side_pocket_length: 7.50, side_pocket_width: 6.50, side_pocket_distance: 12.00, side_pocket_opening: 7.00,
    waist_front: 19.50, waist_back: 20.00, waist_full: 39.50,
    length_front: 44.00, length_back: 45.00, bottom: 24.00,
    chest_provision: 2.50, waist_provision: 2.50, armhole_provision: 1.25,
    jabzour_width: 3.00, jabzour_length: 8.50,
    chest_front: 22.50, chest_back: 24.50, armhole_front: 5.75, degree: 1.50,
  }).returning();

  // Mohammad - standard build
  const [measMohammad] = await db.insert(schema.measurements).values({
    customer_id: custMohammad.id,
    measurer_id: userKhalid.id,
    measurement_date: past(15),
    measurement_id: `${custMohammad.id}-1`,
    type: "Body",
    notes: "Standard fit. Regular customer since 2024.",
    collar_width: 6.50, collar_height: 2.50,
    shoulder: 18.75, armhole: 10.75,
    chest_upper: 42.00, chest_full: 44.50,
    sleeve_length: 25.00, sleeve_width: 7.50, elbow: 13.00,
    top_pocket_length: 5.50, top_pocket_width: 4.00, top_pocket_distance: 8.25,
    side_pocket_length: 7.00, side_pocket_width: 6.00, side_pocket_distance: 11.25, side_pocket_opening: 6.50,
    waist_front: 18.50, waist_back: 19.00, waist_full: 37.50,
    length_front: 43.00, length_back: 43.75, bottom: 23.00,
    chest_provision: 2.00, waist_provision: 2.00, armhole_provision: 1.00,
    jabzour_width: 2.50, jabzour_length: 8.00,
    chest_front: 21.50, chest_back: 23.00, armhole_front: 5.25, degree: 1.25,
  }).returning();

  // Yousuf - slim build
  const [measYousuf] = await db.insert(schema.measurements).values({
    customer_id: custYousuf.id,
    measurer_id: userAhmed.id,
    measurement_date: past(7),
    measurement_id: `${custYousuf.id}-1`,
    type: "Body",
    notes: "Slim fit preferred. Young customer.",
    collar_width: 6.25, collar_height: 2.25,
    shoulder: 18.00, armhole: 10.25,
    chest_upper: 40.00, chest_full: 42.00,
    sleeve_length: 24.50, sleeve_width: 7.00, elbow: 12.50,
    top_pocket_length: 5.25, top_pocket_width: 3.75, top_pocket_distance: 8.00,
    side_pocket_length: 6.75, side_pocket_width: 5.75, side_pocket_distance: 10.75, side_pocket_opening: 6.25,
    waist_front: 17.50, waist_back: 18.00, waist_full: 35.50,
    length_front: 42.00, length_back: 42.50, bottom: 22.00,
    chest_provision: 1.50, waist_provision: 1.50, armhole_provision: 0.75,
    jabzour_width: 2.25, jabzour_length: 7.50,
    chest_front: 20.50, chest_back: 21.50, armhole_front: 5.00, degree: 1.00,
  }).returning();

  // Nasser - larger build
  const [measNasser] = await db.insert(schema.measurements).values({
    customer_id: custNasser.id,
    measurer_id: userFahad.id,
    measurement_date: past(20),
    measurement_id: `${custNasser.id}-1`,
    type: "Body",
    notes: "Needs extra room in chest and waist. Long-time VIP.",
    collar_width: 7.50, collar_height: 3.00,
    shoulder: 20.50, armhole: 12.25,
    chest_upper: 48.00, chest_full: 51.00,
    sleeve_length: 27.00, sleeve_width: 8.75, elbow: 15.00,
    top_pocket_length: 6.25, top_pocket_width: 4.75, top_pocket_distance: 9.25,
    side_pocket_length: 7.75, side_pocket_width: 6.75, side_pocket_distance: 12.50, side_pocket_opening: 7.25,
    waist_front: 21.50, waist_back: 22.00, waist_full: 43.50,
    length_front: 45.50, length_back: 46.50, bottom: 25.50,
    chest_provision: 3.00, waist_provision: 3.00, armhole_provision: 1.50,
    jabzour_width: 3.25, jabzour_length: 9.00,
    chest_front: 24.50, chest_back: 26.50, armhole_front: 6.25, degree: 1.75,
  }).returning();

  // Salem - young, slim
  const [measSalem] = await db.insert(schema.measurements).values({
    customer_id: custSalem.id,
    measurer_id: userKhalid.id,
    measurement_date: past(3),
    measurement_id: `${custSalem.id}-1`,
    type: "Body",
    notes: "First-time customer. Son of Hamad. Slim build.",
    collar_width: 6.00, collar_height: 2.25,
    shoulder: 17.50, armhole: 10.00,
    chest_upper: 38.00, chest_full: 40.00,
    sleeve_length: 24.00, sleeve_width: 6.75, elbow: 12.00,
    top_pocket_length: 5.00, top_pocket_width: 3.50, top_pocket_distance: 7.75,
    side_pocket_length: 6.50, side_pocket_width: 5.50, side_pocket_distance: 10.50, side_pocket_opening: 6.00,
    waist_front: 16.75, waist_back: 17.25, waist_full: 34.00,
    length_front: 41.00, length_back: 41.50, bottom: 21.50,
    chest_provision: 1.50, waist_provision: 1.50, armhole_provision: 0.75,
    jabzour_width: 2.00, jabzour_length: 7.25,
    chest_front: 19.50, chest_back: 20.50, armhole_front: 4.75, degree: 1.00,
  }).returning();

  // Garment style presets
  const styleClassic = {
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

  const styleQallabi = {
    collar_type: "Qallabi",
    collar_button: "Aravi Zarrar",
    cuffs_type: "Murabba Kabak",
    cuffs_thickness: "Medium",
    front_pocket_type: "Murabba Front Pocket",
    front_pocket_thickness: "Thin",
    jabzour_1: "ZIPPER" as const,
    jabzour_thickness: "Thin",
    small_tabaggi: false,
  };

  // =============================================
  // 9. ORDERS + GARMENTS
  // =============================================

  // --- ORDER A: Abdullah - New order, ready to dispatch from shop ---
  // 2 finals, no brovas (finals-only order). Just created, not dispatched yet.
  console.log("Order A: Abdullah - new, ready to dispatch...");
  const dateA = future(14);
  const [orderA] = await db.insert(schema.orders).values({
    customer_id: custAbdullah.id,
    order_taker_id: userAhmed.id,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    payment_type: "knet",
    paid: 42.000,
    order_total: 42.000,
  }).returning();
  await db.insert(schema.workOrders).values({
    order_id: orderA.id, invoice_number: 5001, order_phase: "new",
    num_of_fabrics: 2, delivery_date: dateA,
  });
  await db.insert(schema.garments).values([
    { order_id: orderA.id, garment_id: `${orderA.id}-1`, garment_type: "final", piece_stage: "waiting_cut", location: "shop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricWhite.id, delivery_date: dateA, measurement_id: measAbdullah.id, ...styleClassic },
    { order_id: orderA.id, garment_id: `${orderA.id}-2`, garment_type: "final", piece_stage: "waiting_cut", location: "shop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricCream.id, delivery_date: dateA, measurement_id: measAbdullah.id, ...styleClassic },
  ]);

  // --- ORDER B: Mohammad - Brova at shop, awaiting trial ---
  // 1 brova awaiting trial at shop, 1 final parked at workshop
  console.log("Order B: Mohammad - brova awaiting trial...");
  const dateB = future(10);
  const [orderB] = await db.insert(schema.orders).values({
    customer_id: custMohammad.id,
    order_taker_id: userKhalid.id,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    payment_type: "link_payment",
    paid: 22.000,
    order_total: 21.000,
    }).returning();
  await db.insert(schema.workOrders).values({
    order_id: orderB.id, invoice_number: 5002, order_phase: "in_progress",
    num_of_fabrics: 1, delivery_date: dateB,
  });
  await db.insert(schema.garments).values([
    { order_id: orderB.id, garment_id: `${orderB.id}-1`, garment_type: "brova", piece_stage: "awaiting_trial", location: "shop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricIvory.id, delivery_date: dateB, acceptance_status: null, measurement_id: measMohammad.id, ...styleClassic },
    { order_id: orderB.id, garment_id: `${orderB.id}-2`, garment_type: "final", piece_stage: "waiting_for_acceptance", location: "workshop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricIvory.id, delivery_date: dateB, measurement_id: measMohammad.id, ...styleClassic },
  ]);

  // --- ORDER C: Nasser (VIP) - Multiple brovas, one accepted, one pending trial ---
  // 4-piece order: 2 brovas (1 accepted, 1 awaiting trial), 2 finals parked
  console.log("Order C: Nasser - multi-brova, partial acceptance...");
  const dateC = future(18);
  const [orderC] = await db.insert(schema.orders).values({
    customer_id: custNasser.id,
    order_taker_id: userFahad.id,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 85.000,
    order_total: 21.000,
    }).returning();
  await db.insert(schema.workOrders).values({
    order_id: orderC.id, invoice_number: 5003, order_phase: "in_progress",
    num_of_fabrics: 4, delivery_date: dateC,
  });
  await db.insert(schema.garments).values([
    { order_id: orderC.id, garment_id: `${orderC.id}-1`, garment_type: "brova", piece_stage: "brova_trialed", location: "shop", trip_number: 1, acceptance_status: true, feedback_status: "accepted" as const, style_id: styleDesigner.id, fabric_id: fabricWhite.id, delivery_date: dateC, measurement_id: measNasser.id, ...styleQallabi },
    { order_id: orderC.id, garment_id: `${orderC.id}-2`, garment_type: "brova", piece_stage: "awaiting_trial", location: "shop", trip_number: 1, acceptance_status: null, style_id: styleDesigner.id, fabric_id: fabricCream.id, delivery_date: dateC, measurement_id: measNasser.id, ...styleQallabi },
    { order_id: orderC.id, garment_id: `${orderC.id}-3`, garment_type: "final", piece_stage: "waiting_for_acceptance", location: "workshop", trip_number: 1, style_id: styleDesigner.id, fabric_id: fabricWhite.id, delivery_date: dateC, measurement_id: measNasser.id, ...styleQallabi },
    { order_id: orderC.id, garment_id: `${orderC.id}-4`, garment_type: "final", piece_stage: "waiting_for_acceptance", location: "workshop", trip_number: 1, style_id: styleDesigner.id, fabric_id: fabricCream.id, delivery_date: dateC, measurement_id: measNasser.id, ...styleQallabi },
  ]);

  // --- ORDER D: Abdullah (VIP) - Ready for pickup, all finals at shop ---
  // 3 finals all ready, order overdue by 2 days
  console.log("Order D: Abdullah - ready for pickup...");
  const dateD = past(2);
  const [orderD] = await db.insert(schema.orders).values({
    customer_id: custAbdullah.id,
    order_taker_id: userAhmed.id,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 55.000,
    order_total: 21.000,
    }).returning();
  await db.insert(schema.workOrders).values({
    order_id: orderD.id, invoice_number: 5004, order_phase: "in_progress",
    num_of_fabrics: 3, delivery_date: dateD,
  });
  await db.insert(schema.garments).values([
    { order_id: orderD.id, garment_id: `${orderD.id}-1`, garment_type: "final", piece_stage: "ready_for_pickup", location: "shop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricClassic.id, delivery_date: dateD, acceptance_status: true, measurement_id: measAbdullah.id, ...styleClassic },
    { order_id: orderD.id, garment_id: `${orderD.id}-2`, garment_type: "final", piece_stage: "ready_for_pickup", location: "shop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricClassic.id, delivery_date: dateD, acceptance_status: true, measurement_id: measAbdullah.id, ...styleClassic },
    { order_id: orderD.id, garment_id: `${orderD.id}-3`, garment_type: "final", piece_stage: "ready_for_pickup", location: "shop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricWhite.id, delivery_date: dateD, acceptance_status: true, measurement_id: measAbdullah.id, ...styleClassic },
  ]);

  // --- ORDER E: Yousuf - Brova alteration, back for 2nd trip ---
  // Brova was rejected, sent back, repaired, now at shop again for re-trial (trip 2)
  console.log("Order E: Yousuf - brova alteration return...");
  const dateE = future(5);
  const [orderE] = await db.insert(schema.orders).values({
    customer_id: custYousuf.id,
    order_taker_id: userAhmed.id,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 28.000,
    order_total: 21.000,
    }).returning();
  await db.insert(schema.workOrders).values({
    order_id: orderE.id, invoice_number: 5005, order_phase: "in_progress",
    num_of_fabrics: 2, delivery_date: dateE,
  });
  await db.insert(schema.garments).values([
    { order_id: orderE.id, garment_id: `${orderE.id}-1`, garment_type: "brova", piece_stage: "awaiting_trial", location: "shop", trip_number: 2, acceptance_status: false, style_id: styleKuwaiti.id, fabric_id: fabricIvory.id, delivery_date: dateE, measurement_id: measYousuf.id, ...styleClassic },
    { order_id: orderE.id, garment_id: `${orderE.id}-2`, garment_type: "final", piece_stage: "waiting_for_acceptance", location: "workshop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricIvory.id, delivery_date: dateE, measurement_id: measYousuf.id, ...styleClassic },
  ]);

  // --- ORDER F: Mohammad - Finals in transit to shop ---
  // Finals done at workshop, dispatched, in transit
  console.log("Order F: Mohammad - finals in transit...");
  const dateF = future(3);
  const [orderF] = await db.insert(schema.orders).values({
    customer_id: custMohammad.id,
    order_taker_id: userKhalid.id,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 18.000,
    order_total: 21.000,
    }).returning();
  await db.insert(schema.workOrders).values({
    order_id: orderF.id, invoice_number: 5006, order_phase: "in_progress",
    num_of_fabrics: 1, delivery_date: dateF,
  });
  await db.insert(schema.garments).values([
    { order_id: orderF.id, garment_id: `${orderF.id}-1`, garment_type: "final", piece_stage: "ready_for_dispatch", location: "transit_to_shop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricCream.id, delivery_date: dateF, measurement_id: measMohammad.id, ...styleClassic },
  ]);

  // --- ORDER G: Nasser (VIP) - Needs action, rejected brova to send back ---
  // Brova trialed but rejected (needs_repair), needs to be sent back to workshop
  console.log("Order G: Nasser - needs action (rejected brova)...");
  const dateG = future(8);
  const [orderG] = await db.insert(schema.orders).values({
    customer_id: custNasser.id,
    order_taker_id: userFahad.id,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 35.000,
    order_total: 21.000,
    }).returning();
  await db.insert(schema.workOrders).values({
    order_id: orderG.id, invoice_number: 5007, order_phase: "in_progress",
    num_of_fabrics: 2, delivery_date: dateG,
  });
  await db.insert(schema.garments).values([
    { order_id: orderG.id, garment_id: `${orderG.id}-1`, garment_type: "brova", piece_stage: "brova_trialed", location: "shop", trip_number: 1, acceptance_status: false, feedback_status: "needs_repair" as const, style_id: styleDesigner.id, fabric_id: fabricWhite.id, delivery_date: dateG, measurement_id: measNasser.id, ...styleQallabi },
    { order_id: orderG.id, garment_id: `${orderG.id}-2`, garment_type: "final", piece_stage: "waiting_for_acceptance", location: "workshop", trip_number: 1, style_id: styleDesigner.id, fabric_id: fabricWhite.id, delivery_date: dateG, measurement_id: measNasser.id, ...styleQallabi },
  ]);

  // --- ORDER H: Salem - Sales order (shelf items) ---
  console.log("Order H: Salem - sales order...");
  const [orderH] = await db.insert(schema.orders).values({
    customer_id: custSalem.id,
    order_taker_id: userKhalid.id,
    checkout_status: "confirmed",
    order_type: "SALES",
    brand: "ERTH",
    paid: 43.000,
    order_total: 43.000,
    order_date: new Date(),
  }).returning();
  await db.insert(schema.orderShelfItems).values([
    { order_id: orderH.id, shelf_id: shelfShumakh.id, quantity: 1, unit_price: 25.000 },
  ]);

  // --- ORDER I: Yousuf - Partial ready (1 final at shop, 1 still at workshop) ---
  console.log("Order I: Yousuf - partial ready...");
  const dateI = future(6);
  const [orderI] = await db.insert(schema.orders).values({
    customer_id: custYousuf.id,
    order_taker_id: userAhmed.id,
    checkout_status: "confirmed",
    order_type: "WORK",
    brand: "ERTH",
    paid: 38.000,
    order_total: 21.000,
    }).returning();
  await db.insert(schema.workOrders).values({
    order_id: orderI.id, invoice_number: 5008, order_phase: "in_progress",
    num_of_fabrics: 2, delivery_date: dateI,
  });
  await db.insert(schema.garments).values([
    { order_id: orderI.id, garment_id: `${orderI.id}-1`, garment_type: "final", piece_stage: "ready_for_pickup", location: "shop", trip_number: 1, acceptance_status: true, style_id: styleKuwaiti.id, fabric_id: fabricClassic.id, delivery_date: dateI, measurement_id: measYousuf.id, ...styleClassic },
    { order_id: orderI.id, garment_id: `${orderI.id}-2`, garment_type: "final", piece_stage: "sewing", location: "workshop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricClassic.id, delivery_date: dateI, measurement_id: measYousuf.id, ...styleClassic },
  ]);

  // --- ORDER J: Salem - Draft order (not yet confirmed) ---
  console.log("Order J: Salem - draft order...");
  const dateJ = future(21);
  const [orderJ] = await db.insert(schema.orders).values({
    customer_id: custSalem.id,
    order_taker_id: userFahad.id,
    checkout_status: "draft",
    order_type: "WORK",
    brand: "ERTH",
    paid: 0,
    order_total: 21.000,
    }).returning();
  await db.insert(schema.workOrders).values({
    order_id: orderJ.id, invoice_number: 5009, order_phase: "new",
    num_of_fabrics: 2, delivery_date: dateJ,
  });
  await db.insert(schema.garments).values([
    { order_id: orderJ.id, garment_id: `${orderJ.id}-1`, garment_type: "brova", piece_stage: "waiting_cut", location: "shop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricIvory.id, delivery_date: dateJ, measurement_id: measSalem.id, ...styleClassic },
    { order_id: orderJ.id, garment_id: `${orderJ.id}-2`, garment_type: "final", piece_stage: "waiting_cut", location: "shop", trip_number: 1, style_id: styleKuwaiti.id, fabric_id: fabricIvory.id, delivery_date: dateJ, measurement_id: measSalem.id, ...styleClassic },
  ]);

  // =============================================
  // 10. WORKSHOP RESOURCES
  // =============================================
  console.log("Workshop resources...");
  await db.insert(schema.resources).values([
    // Soaking
    { resource_name: "Ahmad",   responsibility: "soaking",       unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Rashid",  responsibility: "soaking",       unit: "Unit 1", resource_type: "Junior" },
    // Cutting
    { resource_name: "Bilal",   responsibility: "cutting",       unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Tariq",   responsibility: "cutting",       unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Waleed",  responsibility: "cutting",       unit: "Unit 1", resource_type: "Junior" },
    // Post-Cutting
    { resource_name: "Hassan",  responsibility: "post_cutting",  unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Majed",   responsibility: "post_cutting",  unit: "Unit 1", resource_type: "Junior" },
    // Sewing
    { resource_name: "Omar",    responsibility: "sewing",        unit: "Unit 1", resource_type: "Senior", daily_target: 12 },
    { resource_name: "Yusuf",   responsibility: "sewing",        unit: "Unit 1", resource_type: "Senior", daily_target: 10 },
    { resource_name: "Khalid",  responsibility: "sewing",        unit: "Unit 1", resource_type: "Junior", daily_target: 8 },
    { resource_name: "Ibrahim", responsibility: "sewing",        unit: "Unit 2", resource_type: "Senior", daily_target: 11 },
    { resource_name: "Ali",     responsibility: "sewing",        unit: "Unit 2", resource_type: "Senior", daily_target: 10 },
    { resource_name: "Hamza",   responsibility: "sewing",        unit: "Unit 2", resource_type: "Junior", daily_target: 7 },
    // Finishing
    { resource_name: "Saeed",   responsibility: "finishing",      unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Hamad",   responsibility: "finishing",      unit: "Unit 1", resource_type: "Junior" },
    // Ironing
    { resource_name: "Faisal",  responsibility: "ironing",        unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Salman",  responsibility: "ironing",        unit: "Unit 1", resource_type: "Junior" },
    // QC
    { resource_name: "Nasser",  responsibility: "quality_check",  unit: "Unit 1", resource_type: "Senior" },
    { resource_name: "Fahad",   responsibility: "quality_check",  unit: "Unit 1", resource_type: "Junior" },
  ]);

  console.log("\nDone! Seeded:");
  console.log("  4 users, 5 customers, 5 measurements");
  console.log("  25 styles, 10 fabrics, 5 shelf items, 4 campaigns");
  console.log("  10 orders (8 work + 1 sales + 1 draft)");
  console.log("  19 workshop resources");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
