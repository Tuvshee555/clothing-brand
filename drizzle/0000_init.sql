CREATE SCHEMA "store";
--> statement-breakpoint
CREATE TYPE "store"."audience" AS ENUM('women', 'men', 'unisex');--> statement-breakpoint
CREATE TYPE "store"."inventory_reason" AS ENUM('initial', 'order_reserved', 'order_cancelled', 'restock', 'adjustment', 'damaged', 'return');--> statement-breakpoint
CREATE TYPE "store"."order_status" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "store"."payment_method" AS ENUM('qpay', 'cash_on_delivery');--> statement-breakpoint
CREATE TYPE "store"."payment_status" AS ENUM('unpaid', 'simulated', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "store"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "store"."user_role" AS ENUM('owner', 'manager', 'staff', 'demo');--> statement-breakpoint
CREATE SEQUENCE "store"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10001 CACHE 1;--> statement-breakpoint
CREATE TABLE "store"."ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"visitor_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_quantity_range" CHECK ("store"."cart_items"."quantity" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "store"."cart_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"visitor_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "store"."carts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "store"."categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"eyebrow" text,
	"description" text,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "store"."collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"visitor_id" text,
	"is_demo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"reason" "store"."inventory_reason" NOT NULL,
	"note" text,
	"order_id" uuid,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_tx_delta_non_zero" CHECK ("store"."inventory_transactions"."delta" <> 0),
	CONSTRAINT "inventory_tx_stock_after_non_negative" CHECK ("store"."inventory_transactions"."stock_after" >= 0)
);
--> statement-breakpoint
ALTER TABLE "store"."inventory_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'footer' NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "store"."newsletter_subscribers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "store"."order_status",
	"to_status" "store"."order_status" NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."order_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"product_name" text NOT NULL,
	"product_slug" text NOT NULL,
	"color_name" text NOT NULL,
	"size" text NOT NULL,
	"sku" text NOT NULL,
	"image_url" text,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" integer NOT NULL,
	CONSTRAINT "order_items_unit_price_positive" CHECK ("store"."order_items"."unit_price" > 0),
	CONSTRAINT "order_items_quantity_range" CHECK ("store"."order_items"."quantity" between 1 and 20),
	CONSTRAINT "order_items_line_total" CHECK ("store"."order_items"."line_total" = "store"."order_items"."unit_price" * "store"."order_items"."quantity")
);
--> statement-breakpoint
ALTER TABLE "store"."order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"visitor_id" text,
	"customer_id" uuid NOT NULL,
	"status" "store"."order_status" DEFAULT 'pending' NOT NULL,
	"payment_status" "store"."payment_status" DEFAULT 'unpaid' NOT NULL,
	"payment_method" "store"."payment_method" NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"shipping_method_code" text NOT NULL,
	"shipping_method_name" text NOT NULL,
	"shipping_fee" integer NOT NULL,
	"district" text NOT NULL,
	"address" text NOT NULL,
	"delivery_note" text,
	"subtotal" integer NOT NULL,
	"total" integer NOT NULL,
	"item_count" integer NOT NULL,
	"source" text DEFAULT 'storefront' NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"access_token_hash" text NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_amounts_non_negative" CHECK ("store"."orders"."subtotal" >= 0 and "store"."orders"."shipping_fee" >= 0),
	CONSTRAINT "orders_total_matches" CHECK ("store"."orders"."total" = "store"."orders"."subtotal" + "store"."orders"."shipping_fee"),
	CONSTRAINT "orders_item_count_positive" CHECK ("store"."orders"."item_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "store"."orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount" integer NOT NULL,
	"provider_invoice_id" text,
	"qr_text" text,
	"is_simulated" boolean NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("store"."payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "store"."payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."product_collections" (
	"product_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_collections_product_id_collection_id_pk" PRIMARY KEY("product_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "store"."product_collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."product_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"hex" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."product_colors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"color_id" uuid,
	"url" text NOT NULL,
	"alt" text NOT NULL,
	"width" integer DEFAULT 1440 NOT NULL,
	"height" integer DEFAULT 1800 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"credit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."product_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"color_id" uuid NOT NULL,
	"size" text NOT NULL,
	"sku" text NOT NULL,
	"price_override" integer,
	"stock" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "product_variants_stock_non_negative" CHECK ("store"."product_variants"."stock" >= 0),
	CONSTRAINT "product_variants_price_positive" CHECK ("store"."product_variants"."price_override" is null or "store"."product_variants"."price_override" > 0),
	CONSTRAINT "product_variants_threshold_non_negative" CHECK ("store"."product_variants"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
ALTER TABLE "store"."product_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"audience" "store"."audience" DEFAULT 'unisex' NOT NULL,
	"short_description" text NOT NULL,
	"description" text NOT NULL,
	"material" text NOT NULL,
	"care" text NOT NULL,
	"fit" text,
	"base_price" integer NOT NULL,
	"status" "store"."product_status" DEFAULT 'draft' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_new_arrival" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"is_demo" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_base_price_positive" CHECK ("store"."products"."base_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "store"."products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"visitor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "store"."settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."shipping_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"region" text NOT NULL,
	"fee" integer NOT NULL,
	"free_threshold" integer,
	"eta" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_methods_code_unique" UNIQUE("code"),
	CONSTRAINT "shipping_methods_fee_non_negative" CHECK ("store"."shipping_methods"."fee" >= 0),
	CONSTRAINT "shipping_methods_region" CHECK ("store"."shipping_methods"."region" in ('ub', 'countryside'))
);
--> statement-breakpoint
ALTER TABLE "store"."shipping_methods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" "store"."user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "store"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "store"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "store"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "store"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "store"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "store"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "store"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "store"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."order_events" ADD CONSTRAINT "order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "store"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "store"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "store"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "store"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "store"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "store"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."product_collections" ADD CONSTRAINT "product_collections_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "store"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."product_collections" ADD CONSTRAINT "product_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "store"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."product_colors" ADD CONSTRAINT "product_colors_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "store"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "store"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."product_images" ADD CONSTRAINT "product_images_color_id_product_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "store"."product_colors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "store"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."product_variants" ADD CONSTRAINT "product_variants_color_id_product_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "store"."product_colors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "store"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "store"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "store"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "store"."ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "store"."audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_variant_uq" ON "store"."cart_items" USING btree ("cart_id","variant_id");--> statement-breakpoint
CREATE INDEX "carts_expires_idx" ON "store"."carts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_visitor_uq" ON "store"."customers" USING btree ("phone",coalesce("visitor_id", ''));--> statement-breakpoint
CREATE INDEX "customers_visitor_idx" ON "store"."customers" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "inventory_tx_variant_idx" ON "store"."inventory_transactions" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_tx_created_idx" ON "store"."inventory_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "store"."order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "store"."order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_idx" ON "store"."order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "orders_status_placed_idx" ON "store"."orders" USING btree ("status","placed_at");--> statement-breakpoint
CREATE INDEX "orders_placed_idx" ON "store"."orders" USING btree ("placed_at");--> statement-breakpoint
CREATE INDEX "orders_visitor_idx" ON "store"."orders" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "store"."orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "store"."payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "product_collections_collection_idx" ON "store"."product_collections" USING btree ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_colors_product_code_uq" ON "store"."product_colors" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "store"."product_images" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_combo_uq" ON "store"."product_variants" USING btree ("product_id","color_id","size");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "store"."product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_status_category_idx" ON "store"."products" USING btree ("status","category_id");--> statement-breakpoint
CREATE INDEX "products_featured_idx" ON "store"."products" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "store"."sessions" USING btree ("user_id");