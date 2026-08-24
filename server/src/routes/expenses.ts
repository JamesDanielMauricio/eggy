import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { EXPENSE_ITEMS, expenses } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  isNonNegativeNumber,
  isPositiveInteger,
  isValidDateString,
  isValidOptionalDescription,
  toDateOnly,
  UUID_RE,
} from "../lib/validation.js";

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
    const { item, quantity, price, date, description } = req.body ?? {};

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
    if (!isValidOptionalDescription(description)) {
      errors.push("description must be text no longer than 500 characters");
    }
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }

    // A blank/whitespace-only description is the same as "no description" —
    // store null rather than an empty string so the list view's `e.description
    // && ...` check treats it consistently.
    const trimmedDescription = description === undefined ? undefined : description.trim() || null;

    const [row] = await db
      .insert(expenses)
      .values({
        item,
        quantity,
        price: price.toFixed(2),
        expenseDate: toDateOnly(date),
        ...(trimmedDescription !== undefined ? { description: trimmedDescription } : {}),
      })
      .returning();

    res.status(201).json(row);
  })
);

expensesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: "id must be a valid UUID" });
      return;
    }

    // Partial update — only the fields present in the body are validated
    // and changed, so the edit form can send the whole record at once.
    const { item, quantity, price, date, description } = req.body ?? {};

    const errors: string[] = [];
    const updates: Record<string, unknown> = {};

    if (item !== undefined) {
      if (!EXPENSE_ITEMS.includes(item)) errors.push(`item must be one of ${EXPENSE_ITEMS.join(", ")}`);
      else updates.item = item;
    }
    if (quantity !== undefined) {
      if (!isPositiveInteger(quantity)) errors.push("quantity must be a positive whole number");
      else updates.quantity = quantity;
    }
    if (price !== undefined) {
      if (!isNonNegativeNumber(price)) errors.push("price must be zero or a positive number");
      else updates.price = price.toFixed(2);
    }
    if (date !== undefined) {
      if (!isValidDateString(date)) errors.push("date must be a valid date");
      else updates.expenseDate = toDateOnly(date);
    }
    if (description !== undefined) {
      if (!isValidOptionalDescription(description)) errors.push("description must be text no longer than 500 characters");
      // Blank/whitespace-only means "clear it", same as on create. (The `??
      // ""` is just to satisfy the type checker — the outer `!== undefined`
      // already guarantees this is a string here.)
      else updates.description = (description ?? "").trim() || null;
    }
    if (Object.keys(updates).length === 0 && errors.length === 0) {
      errors.push("at least one field must be provided");
    }
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }

    const [updated] = await db.update(expenses).set(updates).where(eq(expenses.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "expense not found" });
      return;
    }
    res.json(updated);
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
