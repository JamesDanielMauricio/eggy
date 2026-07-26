import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Kept in sync with the CHECK constraints below by hand — the constraint
// enforces this list at the database level, this array lets the API
// validate the same list before an insert is even attempted.
export const EGG_SIZES = ["Extra Small", "Small", "Medium", "Large", "Extra Large"] as const;
export const EXPENSE_ITEMS = ["Feeds", "Fly Trap", "Medicines/Vitamins", "Others"] as const;

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    eggSize: text("egg_size").notNull(),
    quantity: integer("quantity").notNull(),
    pricePerEgg: numeric("price_per_egg", { precision: 10, scale: 2 }).notNull(),
    saleDate: date("sale_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    check(
      "sales_egg_size_check",
      sql`${table.eggSize} in ('Extra Small','Small','Medium','Large','Extra Large')`
    ),
    check("sales_quantity_check", sql`${table.quantity} > 0`),
    check("sales_price_per_egg_check", sql`${table.pricePerEgg} >= 0`),
  ]
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    item: text("item").notNull(),
    quantity: integer("quantity").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    expenseDate: date("expense_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    check(
      "expenses_item_check",
      sql`${table.item} in ('Feeds','Fly Trap','Medicines/Vitamins','Others')`
    ),
    check("expenses_quantity_check", sql`${table.quantity} > 0`),
    check("expenses_price_check", sql`${table.price} >= 0`),
  ]
);

export const harvests = pgTable(
  "harvests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    harvested: integer("harvested").notNull(),
    rejected: integer("rejected").notNull(),
    harvestDate: date("harvest_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    check("harvests_harvested_check", sql`${table.harvested} >= 0`),
    check("harvests_rejected_check", sql`${table.rejected} >= 0`),
    // Can't reject more eggs than were actually harvested that day.
    check("harvests_rejected_le_harvested_check", sql`${table.rejected} <= ${table.harvested}`),
  ]
);
