# Eggfarm Server

Node.js + Express backend for the egg farm sales/expense tracker, using Drizzle ORM against Postgres.

## Getting started

For the full setup flow (installing both `server/` and `client/`, env files,
database creation, migrations, seeding), see the [root README](../README.md).
This folder can also be run standalone — `cp .env.example .env`, fill in
`DATABASE_URL`, `npm install`, `npm run db:migrate`, `npm run dev`.

`GET http://localhost:3000/health` confirms the process is up and can reach Postgres.

## Schema changes

After editing `src/db/schema.ts`, generate a new migration (never hand-edit one that's
already been applied):

```sh
npm run db:generate
npm run db:migrate
```

## Dashboard reads

Sales can include an exact `totalPrice` alongside the rounded per-egg
price. Apply migration `0006_sale_total_price` before deploying this version.
Tray prices use 30 eggs; record amounts, revenue, and charts use the saved
total when present. Older records continue to use quantity times per-egg
price. Status and description edits preserve the saved total.

The dashboard uses authenticated `GET /api/ledger` to read sales, expenses,
and harvests in one PostgreSQL statement and one HTTP request. The response
keeps the same record fields as the individual collection endpoints, which
remain available. It returns complete collections so all-time totals stay
accurate; sorting for the Records screen happens in the client.

The client reuses an in-flight read and avoids repeating a successful read
within 30 seconds when returning to the app. Failed reads have a Retry
action. Refresh responses cannot overwrite collections changed by a save
or deletion while that read was in flight.

## Scripts

Run `npm test` for the API regression checks. They build the server and use
Node's experimental module mocks (tested on Node 24), without connecting to
the configured farm database. Coverage includes nullable descriptions,
paid/pending edits, validation failures, and the authenticated ledger read.

| Command             | Purpose                                      |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Run the API with hot reload (`tsx watch`)     |
| `npm run build`      | Compile TypeScript to `dist/`                 |
| `npm start`          | Run the compiled build                        |
| `npm run db:generate`| Generate a migration from the current schema  |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL`    |
| `npm run db:studio`  | Open Drizzle Studio to browse data            |
| `npm run db:seed`    | Insert a few weeks of sample sales/expenses   |
