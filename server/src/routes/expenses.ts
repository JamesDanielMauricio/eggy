import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { EXPENSE_ITEMS, expenses } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isNonNegativeNumber, isPositiveInteger, isValidDateString, toDateOnly, UUID_RE } from "../lib/validation.js";

export const expensesRouter = Router();

expensesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(expenses).orderBy(desc(expenses.expenseDate));
    res.json(rows);
  })
);

expensesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { item, quantity, price, date } = req.body ?? {};

    const errors: string[] = [];
    if (!EXPENSE_ITEMS.includes(item)) {
      errors.push(`item must be one of ${EXPENSE_ITEMS.join(", ")}`);
    }
    if (!isPositiveInteger(quantity)) {
      errors.push("quantity must be a positive whole number");
    }
    if (!isNonNegativeNumber(price)) {
      errors.push("price must be zero or a positive number");
    }
    if (!isValidDateString(date)) {
      errors.push("date must be a valid date");
    }
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }

    const [row] = await db
      .insert(expenses)
      .values({
        item,
        quantity,
        price: price.toFixed(2),
        expenseDate: toDateOnly(date),
      })
      .returning();

    res.status(201).json(row);
  })
);

expensesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: "id must be a valid UUID" });
      return;
    }

    const [deleted] = await db.delete(expenses).where(eq(expenses.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "expense not found" });
      return;
    }
    res.status(204).send();
  })
);
