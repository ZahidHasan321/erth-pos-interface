import type postgres from "postgres";
import {
  ORDER_TAKER,
  CASHIER,
  MANAGER,
  BRAND,
  CUSTOMER_ID,
  FABRIC_A_ID,
  FABRIC_B_ID,
  STYLE_ID,
  SHELF_A_ID,
  SHELF_B_ID,
  CAMPAIGN_ID,
} from "./fixtures";

type Sql = ReturnType<typeof postgres>;

/**
 * Committed reference data the RPCs/driver depend on. Run ONCE in global
 * setup, outside any test transaction, so every rolled-back scenario sees it.
 *
 * Users get auth_id == id so the shim's auth.uid() (driven by `app.auth_id`)
 * resolves them. An open ERTH register session is required by
 * complete_work_order / record_payment_transaction whenever money moves.
 */
export async function seedReferenceData(sql: Sql): Promise<void> {
  // --- Users (order-taker, cashier, manager) ---
  for (const u of [
    { ...ORDER_TAKER, role: "staff", dept: "shop" },
    { ...CASHIER, role: "cashier", dept: "shop" },
    { ...MANAGER, role: "manager", dept: "shop" },
  ]) {
    await sql`
      INSERT INTO users (id, auth_id, username, name, role, department, brands, is_active)
      VALUES (${u.id}, ${u.id}, ${u.username}, ${u.name},
              ${u.role}::role, ${u.dept}::department, ${sql.array([BRAND.toLowerCase()])}, true)
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // --- Customer ---
  await sql`
    INSERT INTO customers (id, name, phone)
    VALUES (${CUSTOMER_ID}, 'Test Customer', '+96500000000')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('customers','id'),
                          (SELECT MAX(id) FROM customers))`;

  // --- Catalog: fabrics with ample stock ---
  await sql`
    INSERT INTO fabrics (id, name, color, real_stock, shop_stock, workshop_stock, price_per_meter)
    VALUES
      (${FABRIC_A_ID}, 'Fabric A', 'C01', 1000, 1000, 0, 5.000),
      (${FABRIC_B_ID}, 'Fabric B', 'C02', 1000, 1000, 0, 6.000)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('fabrics','id'),
                          (SELECT MAX(id) FROM fabrics))`;

  // --- Catalog: style ---
  await sql`
    INSERT INTO styles (id, name, type, rate_per_item, code, brand)
    VALUES (${STYLE_ID}, 'Kuwaiti Standard', 'collar', 3.000, 'STD', ${BRAND}::brand)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('styles','id'),
                          (SELECT MAX(id) FROM styles))`;

  // --- Catalog: shelf items (for sales orders / refunds) ---
  await sql`
    INSERT INTO shelf (id, type, brand, stock, shop_stock, workshop_stock, price)
    VALUES
      (${SHELF_A_ID}, 'Ready Dishdasha M', ${BRAND}, 100, 100, 0, 25.000),
      (${SHELF_B_ID}, 'Ready Dishdasha L', ${BRAND}, 100, 100, 0, 27.000)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('shelf','id'),
                          (SELECT MAX(id) FROM shelf))`;

  // --- Campaign ---
  await sql`
    INSERT INTO campaigns (id, name, active)
    VALUES (${CAMPAIGN_ID}, 'Default Campaign', true)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`SELECT setval(pg_get_serial_sequence('campaigns','id'),
                          (SELECT MAX(id) FROM campaigns))`;

  // --- Prices (toggle_home_delivery reads HOME_DELIVERY) ---
  await sql`
    INSERT INTO prices (key, brand, value)
    VALUES ('HOME_DELIVERY', ${BRAND}::brand, 2.000)
    ON CONFLICT (key, brand) DO NOTHING
  `;

  // --- Open ERTH register session for today (required for any money flow) ---
  await sql`
    INSERT INTO register_sessions (brand, date, status, opened_by, opening_float)
    VALUES (${BRAND}::brand, CURRENT_DATE, 'open', ${CASHIER.id}, 0)
    ON CONFLICT (brand, date) DO UPDATE SET status = 'open'
  `;
}
