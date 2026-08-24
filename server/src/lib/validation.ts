export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Matches the `>= 0` CHECK constraint on price columns — a price of 0 is
// valid (e.g. a freebie), unlike quantity which must be strictly positive.
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// Matches the `>= 0` CHECK constraint on harvested/rejected — a count of 0
// eggs is valid (a bad day, or simply no rejects), unlike quantity.
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

// Normalizes any parseable date input down to the YYYY-MM-DD the `date`
// column expects, dropping a time-of-day component if one was sent.
export function toDateOnly(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// description is always optional, so `undefined` passes — this only rejects
// a description that was actually sent but isn't a string within the
// `char_length(...) <= 500` CHECK constraint on the sales/expenses tables.
export function isValidOptionalDescription(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= 500);
}
