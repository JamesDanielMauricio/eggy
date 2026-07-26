import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { harvests } from "../db/schema.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isNonNegativeInteger, isValidDateString, toDateOnly, UUID_RE } from "../lib/validation.js";

export const harvestsRouter = Router();

harvestsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(harvests).orderBy(desc(harvests.harvestDate));
    res.json(rows);
  })
);

harvestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { harvested, rejected, date } = req.body ?? {};

    const errors: string[] = [];
    if (!isNonNegativeInteger(harvested)) {
      errors.push("harvested must be zero or a positive whole number");
    }
    if (!isNonNegativeInteger(rejected)) {
      errors.push("rejected must be zero or a positive whole number");
    }
    if (
      isNonNegativeInteger(harvested) &&
      isNonNegativeInteger(rejected) &&
      rejected > harvested
    ) {
      errors.push("rejected cannot exceed harvested");
    }
    if (!isValidDateString(date)) {
      errors.push("date must be a valid date");
    }
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }

    const [row] = await db
      .insert(harvests)
      .values({
        harvested,
        rejected,
        harvestDate: toDateOnly(date),
      })
      .returning();

    res.status(201).json(row);
  })
);

harvestsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: "id must be a valid UUID" });
      return;
    }

    const [deleted] = await db.delete(harvests).where(eq(harvests.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "harvest not found" });
      return;
    }
    res.status(204).send();
  })
);
