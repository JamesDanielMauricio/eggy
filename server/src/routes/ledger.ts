import { Router } from "express";
import { db } from "../db/index.js";
import { ledgerQuery } from "../db/ledgerQuery.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const ledgerRouter = Router();
ledgerRouter.get("/", asyncHandler(async (_req, res) => {
  const [ledger] = await db.execute(ledgerQuery);
  res.set("Cache-Control", "private, no-store").json(ledger);
}));
