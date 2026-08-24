import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { EGG_SIZES, SALE_STATUSES, sales } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  isNonNegativeNumber,
  isPositiveInteger,
  isValidDateString,
  isValidOptionalDescription,
  toDateOnly,
  UUID_RE,
} from "../lib/validation.js";

export const salesRouter = Router();

salesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(sales).orderBy(desc(sales.saleDate));
    res.json(rows);
  })
);

salesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { eggSize, quantity, pricePerEgg, date, status, description } = req.body ?? {};

    const errors: string[] = [];
    if (!EGG_SIZES.includes(eggSize)) {
      errors.push(`eggSize must be one of ${EGG_SIZES.join(", ")}`);
    }
    if (!isPositiveInteger(quantity)) {
      errors.push("quantity must be a positive whole number");
    }
    if (!isNonNegativeNumber(pricePerEgg)) {
      errors.push("pricePerEgg must be zero or a positive number");
    }
    if (!isValidDateString(date)) {
      errors.push("date must be a valid date");
    }
    // Omitted entirely = a regular, already-settled sale; the column
    // default ('paid') covers that. Only reject it if it was sent but
    // isn't one of the two statuses we recognize.
    if (status !== undefined && !SALE_STATUSES.includes(status)) {
      errors.push(`status must be one of ${SALE_STATUSES.join(", ")}`);
    }
    if (!isValidOptionalDescription(description)) {
      errors.push("description must be text no longer than 500 characters");
    }
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }

    // A blank/whitespace-only description is the same as "no description" —
    // store null rather than an empty string so the list view's `s.description
    // && ...` check treats it consistently.
    const trimmedDescription = description === undefined ? undefined : description.trim() || null;

    const [row] = await db
      .insert(sales)
      .values({
        eggSize,
        quantity,
        pricePerEgg: pricePerEgg.toFixed(2),
        saleDate: toDateOnly(date),
        ...(status !== undefined ? { status } : {}),
        ...(trimmedDescription !== undefined ? { description: trimmedDescription } : {}),
      })
      .returning();

    res.status(201).json(row);
  })
);

salesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: "id must be a valid UUID" });
      return;
    }

    // Partial update — every field is optional so callers like the status
    // toggle (which only ever sends `{ status }`) keep working unchanged
    // alongside the full record-edit form (which sends everything it owns).
    const { eggSize, quantity, pricePerEgg, date, status, description } = req.body ?? {};

    const errors: string[] = [];
    const updates: Record<string, unknown> = {};

    if (eggSize !== undefined) {
      if (!EGG_SIZES.includes(eggSize)) errors.push(`eggSize must be one of ${EGG_SIZES.join(", ")}`);
      else updates.eggSize = eggSize;
    }
    if (quantity !== undefined) {
      if (!isPositiveInteger(quantity)) errors.push("quantity must be a positive whole number");
      else updates.quantity = quantity;
    }
    if (pricePerEgg !== undefined) {
      if (!isNonNegativeNumber(pricePerEgg)) errors.push("pricePerEgg must be zero or a positive number");
      else updates.pricePerEgg = pricePerEgg.toFixed(2);
    }
    if (date !== undefined) {
      if (!isValidDateString(date)) errors.push("date must be a valid date");
      else updates.saleDate = toDateOnly(date);
    }
    if (status !== undefined) {
      if (!SALE_STATUSES.includes(status)) errors.push(`status must be one of ${SALE_STATUSES.join(", ")}`);
      else updates.status = status;
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

    const [updated] = await db.update(sales).set(updates).where(eq(sales.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "sale not found" });
      return;
    }
    res.json(updated);
  })
);

salesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: "id must be a valid UUID" });
      return;
    }

    const [deleted] = await db.delete(sales).where(eq(sales.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "sale not found" });
      return;
    }
    res.status(204).send();
  })
);
