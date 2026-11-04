ALTER TABLE "sales" ADD COLUMN "total_price" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_price_check" CHECK ("sales"."total_price" >= 0);