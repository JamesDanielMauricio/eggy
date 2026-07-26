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

## Scripts

| Command             | Purpose                                      |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Run the API with hot reload (`tsx watch`)     |
| `npm run build`      | Compile TypeScript to `dist/`                 |
| `npm start`          | Run the compiled build                        |
| `npm run db:generate`| Generate a migration from the current schema  |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL`    |
| `npm run db:studio`  | Open Drizzle Studio to browse data            |
| `npm run db:seed`    | Insert a few weeks of sample sales/expenses   |
