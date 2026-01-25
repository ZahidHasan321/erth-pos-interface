DO $$ BEGIN
 CREATE TYPE "account_type" AS ENUM('Primary', 'Secondary');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "checkout_status" AS ENUM('draft', 'confirmed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "discount_type" AS ENUM('flat', 'referral', 'loyalty', 'by_value');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "fabric_source" AS ENUM('IN', 'OUT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "jabzour_type" AS ENUM('BUTTON', 'ZIPPER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "measurement_type" AS ENUM('Body', 'Dishdasha');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "order_type" AS ENUM('WORK', 'SALES');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "payment_type" AS ENUM('knet', 'cash', 'link_payment', 'installments', 'others');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "production_stage" AS ENUM('order_at_shop', 'sent_to_workshop', 'order_at_workshop', 'brova_and_final_dispatched_to_shop', 'final_dispatched_to_shop', 'brova_at_shop', 'brova_accepted', 'brova_alteration', 'brova_repair_and_production', 'brova_alteration_and_production', 'final_at_shop', 'brova_and_final_at_shop', 'order_collected', 'order_delivered', 'waiting_cut', 'soaking', 'redo');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "role" AS ENUM('admin', 'staff', 'manager');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"nick_name" text,
	"arabic_name" text,
	"arabic_nickname" text,
	"alternate_mobile" text,
	"whatsapp" boolean DEFAULT false,
	"whatsapp_alt" boolean DEFAULT false,
	"email" text,
	"insta_id" text,
	"country_code" text,
	"city" text,
	"block" text,
	"street" text,
	"house_no" text,
	"area" text,
	"address_note" text,
	"nationality" text,
	"dob" timestamp,
	"customer_segment" text,
	"account_type" "account_type",
	"relation" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fabrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"code" text,
	"real_stock" numeric(10, 2),
	"price_per_meter" numeric(10, 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "garments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"garment_id" text,
	"order_id" integer NOT NULL,
	"fabric_id" integer,
	"style_id" integer,
	"measurement_id" uuid,
	"fabric_source" "fabric_source",
	"quantity" integer DEFAULT 1,
	"fabric_length" numeric(5, 2),
	"fabric_price_snapshot" numeric(10, 3),
	"stitching_price_snapshot" numeric(10, 3),
	"style_price_snapshot" numeric(10, 3),
	"collar_type" text,
	"collar_button" text,
	"cuffs_type" text,
	"cuffs_thickness" text,
	"front_pocket_type" text,
	"front_pocket_thickness" text,
	"wallet_pocket" boolean DEFAULT false,
	"pen_holder" boolean DEFAULT false,
	"small_tabaggi" boolean DEFAULT false,
	"jabzour_1" "jabzour_type",
	"jabzour_2" text,
	"jabzour_thickness" text,
	"lines" integer DEFAULT 1,
	"notes" text,
	"express" boolean DEFAULT false,
	"brova" boolean DEFAULT false,
	"delivery_date" timestamp,
	"piece_stage" "production_stage"
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" integer NOT NULL,
	"measurer_id" uuid,
	"measurement_date" timestamp,
	"measurement_id" text,
	"type" "measurement_type",
	"reference" text,
	"notes" text,
	"collar_width" numeric(5, 2),
	"collar_height" numeric(5, 2),
	"shoulder" numeric(5, 2),
	"armhole" numeric(5, 2),
	"chest_upper" numeric(5, 2),
	"chest_full" numeric(5, 2),
	"sleeve_length" numeric(5, 2),
	"sleeve_width" numeric(5, 2),
	"elbow" numeric(5, 2),
	"top_pocket_length" numeric(5, 2),
	"top_pocket_width" numeric(5, 2),
	"top_pocket_distance" numeric(5, 2),
	"side_pocket_length" numeric(5, 2),
	"side_pocket_width" numeric(5, 2),
	"side_pocket_distance" numeric(5, 2),
	"side_pocket_opening" numeric(5, 2),
	"waist_front" numeric(5, 2),
	"waist_back" numeric(5, 2),
	"waist_full" numeric(5, 2),
	"length_front" numeric(5, 2),
	"length_back" numeric(5, 2),
	"bottom" numeric(5, 2),
	"chest_provision" numeric(5, 2),
	"waist_provision" numeric(5, 2),
	"armhole_provision" numeric(5, 2),
	"jabzour_width" numeric(5, 2),
	"jabzour_length" numeric(5, 2),
	"chest_front" numeric(5, 2),
	"chest_back" numeric(5, 2),
	"armhole_front" numeric(5, 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_shelf_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"shelf_id" integer NOT NULL,
	"quantity" integer DEFAULT 1,
	"unit_price" numeric(10, 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" integer,
	"customer_id" integer NOT NULL,
	"campaign_id" integer,
	"order_taker_id" uuid,
	"parent_order_id" integer,
	"order_date" timestamp DEFAULT now(),
	"delivery_date" timestamp,
	"call_reminder_date" timestamp,
	"escalation_date" timestamp,
	"checkout_status" "checkout_status" DEFAULT 'draft',
	"production_stage" "production_stage" DEFAULT 'order_at_shop',
	"order_type" "order_type" DEFAULT 'WORK',
	"payment_type" "payment_type",
	"payment_ref_no" text,
	"discount_type" "discount_type",
	"discount_value" numeric(10, 3),
	"referral_code" text,
	"paid" numeric(10, 3) DEFAULT 0,
	"stitching_price" numeric(10, 3),
	"fabric_charge" numeric(10, 3),
	"stitching_charge" numeric(10, 3),
	"style_charge" numeric(10, 3),
	"delivery_charge" numeric(10, 3),
	"shelf_charge" numeric(10, 3),
	"advance" numeric(10, 3),
	"order_total" numeric(10, 3),
	"num_of_fabrics" integer,
	"notes" text,
	"call_notes" text,
	"escalation_notes" text,
	"home_delivery" boolean DEFAULT false,
	"call_status" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prices" (
	"key" text PRIMARY KEY NOT NULL,
	"value" numeric(10, 3) NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shelf" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text,
	"brand" text,
	"stock" integer,
	"price" numeric(10, 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "styles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"rate_per_item" numeric(10, 3),
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" "role" DEFAULT 'staff',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_search_idx" ON "customers" ("phone","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "garments_order_idx" ON "garments" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "measurements_customer_idx" ON "measurements" ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_invoice_idx" ON "orders" ("invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_customer_idx" ON "orders" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_date_idx" ON "orders" ("order_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_parent_idx" ON "orders" ("parent_order_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "garments" ADD CONSTRAINT "garments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "garments" ADD CONSTRAINT "garments_fabric_id_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "fabrics"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "garments" ADD CONSTRAINT "garments_style_id_styles_id_fk" FOREIGN KEY ("style_id") REFERENCES "styles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "garments" ADD CONSTRAINT "garments_measurement_id_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "measurements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "measurements" ADD CONSTRAINT "measurements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "measurements" ADD CONSTRAINT "measurements_measurer_id_users_id_fk" FOREIGN KEY ("measurer_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_shelf_items" ADD CONSTRAINT "order_shelf_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_shelf_items" ADD CONSTRAINT "order_shelf_items_shelf_id_shelf_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "shelf"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_order_taker_id_users_id_fk" FOREIGN KEY ("order_taker_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
