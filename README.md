# Eggfarm

Sales/expense tracker for an egg farm — Express + Drizzle ORM + Postgres backend
(`server/`), React + Vite frontend (`client/`).

## Prerequisites

- Node.js
- A local Postgres server (this project assumes you manage it directly —
  `createdb`/`psql` or pgAdmin — not Docker)

## Setup

1. Install dependencies for the root, `server/`, and `client/` in one go:

   ```sh
   npm install
   ```

2. Create your env files from the templates:

   ```sh
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```

   Edit `server/.env` and set `DATABASE_URL` to your local Postgres credentials.
   `client/.env` already points at `http://localhost:3000`, which matches the
   server's default port — no edits needed there for local dev.

3. Create the `eggfarm` database, if you haven't already:

   ```sh
   createdb eggfarm
   ```

   or in pgAdmin: right-click **Databases** → **Create** → **Database...**, name it `eggfarm`.

4. Apply the migration:

   ```sh
   npm run db:migrate --prefix server
   ```

5. (Optional) Seed a few weeks of sample sales and expenses, so the dashboard
   charts have something to show:

   ```sh
   npm run db:seed --prefix server
   ```

6. Start both the API and the frontend:

   ```sh
   npm run dev
   ```

   Server runs at `http://localhost:3000`, frontend at `http://localhost:5173`.
   Open the frontend URL in your browser.

## Project layout

- `server/` — Express API + Drizzle schema/migrations. See
  [server/README.md](server/README.md) for schema-change workflow and the
  full script reference (`db:generate`, `db:migrate`, `db:studio`, etc).
- `client/` — React dashboard. Reads the API base URL from `VITE_API_URL`.
