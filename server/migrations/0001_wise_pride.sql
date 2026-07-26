CREATE TABLE IF NOT EXISTS "harvests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"harvested" integer NOT NULL,
	"rejected" integer NOT NULL,
	"harvest_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "harvests_harvested_check" CHECK ("harvests"."harvested" >= 0),
	CONSTRAINT "harvests_rejected_check" CHECK ("harvests"."rejected" >= 0),
	CONSTRAINT "harvests_rejected_le_harvested_check" CHECK ("harvests"."rejected" <= "harvests"."harvested")
);
