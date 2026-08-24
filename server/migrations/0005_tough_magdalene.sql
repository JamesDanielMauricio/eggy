ALTER TABLE "expenses" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_description_check" CHECK (char_length("expenses"."description") <= 500);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_description_check" CHECK (char_length("sales"."description") <= 500);