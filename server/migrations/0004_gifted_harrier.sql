ALTER TABLE "sales" ADD COLUMN "status" text DEFAULT 'paid' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_status_check" CHECK ("sales"."status" in ('paid','pending'));