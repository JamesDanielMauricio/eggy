// Empty string = relative paths, i.e. same-origin requests through the
// Vercel rewrite in vercel.json (see request() below for why that matters).
// Local dev still sets VITE_API_URL to hit the local server directly.
const BASE_URL = import.meta.env.VITE_API_URL || '';

async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    // The API and client live on different domains in production, so the
    // login cookie only gets sent/accepted cross-origin if every request
    // opts in with credentials: 'include' — without it every call looks
    // logged-out even right after a successful login.
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

export async function login(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout() {
  await request('/api/auth/logout', { method: 'POST' });
}

export async function getCurrentUser() {
  return request('/api/auth/me');
}

// The API returns Drizzle's column names (saleDate, numeric fields as
// strings); the component works with `date` and plain JS numbers.
function fromSaleRow(row) {
  return { id: row.id, eggSize: row.eggSize, quantity: row.quantity, date: row.saleDate, pricePerEgg: Number(row.pricePerEgg), status: row.status, createdAt: row.createdAt };
}

function fromExpenseRow(row) {
  return { id: row.id, item: row.item, quantity: row.quantity, date: row.expenseDate, price: Number(row.price), createdAt: row.createdAt };
}

// harvested/rejected are integer columns, so unlike price/pricePerEgg they
// already come back as JS numbers — no string-to-number conversion needed.
function fromHarvestRow(row) {
  return { id: row.id, harvested: row.harvested, rejected: row.rejected, date: row.harvestDate, createdAt: row.createdAt };
}

export async function listSales() {
  const rows = await request('/api/sales');
  return rows.map(fromSaleRow);
}

export async function createSale({ eggSize, quantity, pricePerEgg, date, status }) {
  const row = await request('/api/sales', {
    method: 'POST',
    body: JSON.stringify({ eggSize, quantity, pricePerEgg, date, status }),
  });
  return fromSaleRow(row);
}

export async function updateSaleStatus(id, status) {
  const row = await request(`/api/sales/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
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
