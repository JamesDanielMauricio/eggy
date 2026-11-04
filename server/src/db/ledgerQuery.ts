import { getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { sales, expenses, harvests } from "./schema.js";

function recordsAsJson(table: PgTable) {
  const fields = Object.entries(getTableColumns(table)).flatMap(([name, column]) => [
    sql`${name}::text`, sql`${column}`,
  ]);
  return sql`coalesce((select json_agg(json_build_object(${sql.join(fields, sql`, `)})) from ${table}), '[]'::json)`;
}

// One database round trip and one consistent snapshot for the dashboard.
// Records are sorted by the client, so the database needn't sort them too.
export const ledgerQuery = sql`select
  ${recordsAsJson(sales)} as sales,
  ${recordsAsJson(expenses)} as expenses,
  ${recordsAsJson(harvests)} as harvests`;
