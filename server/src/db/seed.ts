import "dotenv/config";
import { db, client } from "./index.js";
import { sales, expenses, EGG_SIZES, EXPENSE_ITEMS } from "./schema.js";

// Adds sample rows on top of whatever's already there — running this twice
// gives you duplicate sample data, not an error. Fine for local dev; just
// clear the tables first (or don't re-run it) if that's not what you want.

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const EGG_BASE_PRICE: Record<(typeof EGG_SIZES)[number], number> = {
  "Extra Small": 5.5,
  "Small": 6.5,
  "Medium": 7.5,
  "Large": 8.75,
  "Extra Large": 10,
  "Jumbo": 12,
  "Reject": 2,
};

const EXPENSE_BASE_PRICE: Record<(typeof EXPENSE_ITEMS)[number], number> = {
  "Feeds": 420,
  "Fly Trap": 180,
  "Medicines/Vitamins": 150,
  "Others": 200,
};

// One sale a day for the last three weeks, rotating through egg sizes.
const sampleSales = Array.from({ length: 21 }, (_, i) => {
  const eggSize = EGG_SIZES[i % EGG_SIZES.length];
  const quantity = 20 + ((i * 7) % 25);
  const pricePerEgg = (EGG_BASE_PRICE[eggSize] + (i % 3) * 0.25).toFixed(2);
  return { eggSize, quantity, pricePerEgg, saleDate: daysAgo(i) };
});

// A handful of expenses spread across the same window, rotating through categories.
const sampleExpenses = Array.from({ length: 8 }, (_, i) => {
  const item = EXPENSE_ITEMS[i % EXPENSE_ITEMS.length];
  const quantity = 1 + (i % 3);
  const price = (EXPENSE_BASE_PRICE[item] + (i % 2) * 20).toFixed(2);
  return { item, quantity, price, expenseDate: daysAgo(i * 2 + 1) };
});

async function main() {
  const insertedSales = await db.insert(sales).values(sampleSales).returning({ id: sales.id });
  const insertedExpenses = await db.insert(expenses).values(sampleExpenses).returning({ id: expenses.id });
  console.log(`Seeded ${insertedSales.length} sales and ${insertedExpenses.length} expenses.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
