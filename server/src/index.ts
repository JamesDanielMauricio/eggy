import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { salesRouter } from "./routes/sales.js";
import { expensesRouter } from "./routes/expenses.js";
import { harvestsRouter } from "./routes/harvests.js";

const app = express();

// Browsers block cross-origin fetches by default (the Vite dev server runs
// on a different port, so it counts as a different origin). This allows
// only that specific origin to call the API, rather than opening it to any
// website a user's browser happens to have open — a wildcard origin here
// would let any page on the internet read/write your sales and expense data.
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));

app.use(express.json());

// Confirms the API process is up and can reach the local Postgres instance.
app.get("/health", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "unreachable" });
  }
});

app.use("/api/sales", salesRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/harvests", harvestsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

// Catches malformed JSON bodies (from express.json()) and anything an
// async route handler passed to next() — keeps every error response in
// the same { error: "message" } shape instead of Express's default HTML page.
// body-parser sets err.status = 400 for a JSON syntax error; anything else
// (e.g. an unexpected DB failure) falls through as a 500.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = (err as { status?: number }).status === 400 ? 400 : 500;
  res.status(status).json({ error: status === 400 ? "invalid JSON body" : "internal server error" });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
