// Helpers over lists of ledger records (sales, expenses, harvests).

// True when two record lists hold exactly the same rows in the same order.
// A background refresh that brings back what's already on screen can then
// keep the current arrays, so nothing downstream re-renders for no reason.
// Rows are flat objects of primitives (see the mappers in api.js), so a
// shallow field-by-field comparison is a complete one.
export function sameRows(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    const keys = Object.keys(row);
    return keys.length === Object.keys(other).length && keys.every((key) => Object.is(row[key], other[key]));
  });
}

// Totals per category with each one's share of the whole, for the
// breakdown bar lists. With `order`, categories follow it (egg sizes run
// small → large); anything not in it is kept at the end rather than silently
// dropped. Without `order`, the largest comes first.
export function breakdown(items, keyFn, valueFn, order) {
  const totals = new Map();
  for (const item of items) {
    const key = keyFn(item);
    totals.set(key, (totals.get(key) || 0) + valueFn(item));
  }
  let sum = 0;
  for (const value of totals.values()) sum += value;
  const names = order
    ? [...order.filter((name) => totals.has(name)), ...[...totals.keys()].filter((name) => !order.includes(name))]
    : [...totals.keys()].sort((x, y) => totals.get(y) - totals.get(x));
  return names.map((name) => ({ name, value: totals.get(name), share: sum ? totals.get(name) / sum : 0 }));
}
