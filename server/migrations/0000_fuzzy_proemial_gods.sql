CREATE TABLE IF NOT EXISTS "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"expense_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_item_check" CHECK ("expenses"."item" in ('Feeds','Fly Trap','Medicines/Vitamins','Others')),
	CONSTRAINT "expenses_quantity_check" CHECK ("expenses"."quantity" > 0),
	CONSTRAINT "expenses_price_check" CHECK ("expenses"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"egg_size" text NOT NULL,
	"quantity" integer NOT NULL,
	"price_per_egg" numeric(10, 2) NOT NULL,
	"sale_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_egg_size_check" CHECK ("sales"."egg_size" in ('Extra Small','Small','Medium','Large','Extra Large')),
	CONSTRAINT "sales_quantity_check" CHECK ("sales"."quantity" > 0),
	CONSTRAINT "sales_price_per_egg_check" CHECK ("sales"."price_per_egg" >= 0)
);
