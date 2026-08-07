import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { EGG_SIZES, SALE_STATUSES, sales } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isNonNegativeNumber, isPositiveInteger, isValidDateString, toDateOnly, UUID_RE } from "../lib/validation.js";

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
    const { eggSize, quantity, pricePerEgg, date, status } = req.body ?? {};

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
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }

    const [row] = await db
      .insert(sales)
      .values({
        eggSize,
        quantity,
        pricePerEgg: pricePerEgg.toFixed(2),
        saleDate: toDateOnly(date),
        ...(status !== undefined ? { status } : {}),
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

    const { status } = req.body ?? {};
    if (!SALE_STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of ${SALE_STATUSES.join(", ")}` });
      return;
    }

    const [updated] = await db.update(sales).set({ status }).where(eq(sales.id, id)).returning();
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
