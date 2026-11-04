export const TRAY_SIZE = 30;

export function saleTotal(sale) {
  return sale.totalPrice ?? sale.quantity * sale.pricePerEgg;
}

// Derive from the price being entered, before rounding the displayed fields.
// In particular, 175 / 30 must not become 5.83 * 60 = 349.80 for two trays.
export function salePrices(source, quantity) {
  const empty = { perEgg: '', perTray: '', total: '' };
  if (source.amount === '') return empty;
  const amount = Number(source.amount);
  if (!Number.isFinite(amount) || amount < 0) return { ...empty, [source.basis]: source.amount };

  const hasQuantity = Number.isSafeInteger(quantity) && quantity > 0;
  const cents = Math.round(amount * 100);
  let divisor;
  if (source.basis === 'perEgg') divisor = 1;
  else if (source.basis === 'perTray') divisor = TRAY_SIZE;
  else if (source.basis === 'existing') divisor = source.quantity;
  else if (hasQuantity) divisor = quantity;
  const money = (numerator) => (Math.round(numerator / divisor) / 100).toFixed(2);

  const values = {
    perEgg: divisor === undefined ? '' : money(cents),
    perTray: divisor === undefined ? '' : money(cents * TRAY_SIZE),
    total: divisor === undefined || !hasQuantity ? '' : money(cents * quantity),
  };
  // Preserve the active field while typing, including a blank or a zero.
  if (source.basis !== 'existing') values[source.basis] = source.amount;
  return values;
}
