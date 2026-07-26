const BASE_URL = import.meta.env.VITE_API_URL;

async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

// The API returns Drizzle's column names (saleDate, numeric fields as
// strings); the component works with `date` and plain JS numbers.
function fromSaleRow(row) {
  return { id: row.id, eggSize: row.eggSize, quantity: row.quantity, date: row.saleDate, pricePerEgg: Number(row.pricePerEgg) };
}

function fromExpenseRow(row) {
  return { id: row.id, item: row.item, quantity: row.quantity, date: row.expenseDate, price: Number(row.price) };
}

// harvested/rejected are integer columns, so unlike price/pricePerEgg they
// already come back as JS numbers — no string-to-number conversion needed.
function fromHarvestRow(row) {
  return { id: row.id, harvested: row.harvested, rejected: row.rejected, date: row.harvestDate };
}

export async function listSales() {
  const rows = await request('/api/sales');
  return rows.map(fromSaleRow);
}

export async function createSale({ eggSize, quantity, pricePerEgg, date }) {
  const row = await request('/api/sales', {
    method: 'POST',
    body: JSON.stringify({ eggSize, quantity, pricePerEgg, date }),
  });
  return fromSaleRow(row);
}

export async function deleteSale(id) {
  await request(`/api/sales/${id}`, { method: 'DELETE' });
}

export async function listExpenses() {
  const rows = await request('/api/expenses');
  return rows.map(fromExpenseRow);
}

export async function createExpense({ item, quantity, price, date }) {
  const row = await request('/api/expenses', {
    method: 'POST',
    body: JSON.stringify({ item, quantity, price, date }),
  });
  return fromExpenseRow(row);
}

export async function deleteExpense(id) {
  await request(`/api/expenses/${id}`, { method: 'DELETE' });
}

export async function listHarvests() {
  const rows = await request('/api/harvests');
  return rows.map(fromHarvestRow);
}

export async function createHarvest({ harvested, rejected, date }) {
  const row = await request('/api/harvests', {
    method: 'POST',
    body: JSON.stringify({ harvested, rejected, date }),
  });
  return fromHarvestRow(row);
}

export async function deleteHarvest(id) {
  await request(`/api/harvests/${id}`, { method: 'DELETE' });
}
