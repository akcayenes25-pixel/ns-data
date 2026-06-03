/* NSDATA - db.js */
/* All Supabase read/write operations */

var SUPABASE_URL = 'https://eiltpqvtdojsmjfukkah.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbHRwcXZ0ZG9qc21qZnVra2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTExMjksImV4cCI6MjA5NjAyNzEyOX0.wHzHUvmGck6bB8PkueCTKd22dB6xb4KdWRO-PDwYS_Y';

var _client = null;

function dbInit() {
  try {
    _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    dbInitRealtime();
  } catch (err) {
    console.error('Supabase init failed:', err);
  }
}

function dbInitRealtime() {
  if (!_client) return;
  _client.channel('nsdata-realtime')
    .on('postgres_changes', { event: '*', schema: 'public' }, function(payload) {
      emitDataChange(payload.table, payload);
    })
    .subscribe();
}

/* PRODUCTS */
async function dbGetProducts() {
  try {
    var res = await _client.from('products').select('*').order('name');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetProducts:', err); return []; }
}

async function dbUpsertProduct(product) {
  try {
    var res = await _client.from('products').upsert(product, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpsertProduct:', err); return false; }
}

async function dbUpdateProductPrice(productId, newPrice) {
  if (!productId || newPrice === null) return false;
  try {
    var res = await _client.from('products').update({ avg_price_eur: Math.max(0.01, parseFloat(newPrice)) }).eq('id', productId);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpdateProductPrice:', err); return false; }
}

/* CUSTOMERS */
async function dbGetCustomers() {
  try {
    var res = await _client.from('customers').select('*').order('name');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetCustomers:', err); return []; }
}

async function dbUpsertCustomer(customer) {
  try {
    var res = await _client.from('customers').upsert(customer, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpsertCustomer:', err); return false; }
}

async function dbSetCustomerActive(customerId, active) {
  try {
    var res = await _client.from('customers').update({ active: active }).eq('id', customerId);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbSetCustomerActive:', err); return false; }
}

/* TARGETS */
async function dbGetTargets() {
  try {
    var res = await _client.from('targets').select('*');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetTargets:', err); return []; }
}

async function dbUpsertTarget(target) {
  try {
    var res = await _client.from('targets').upsert(target, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpsertTarget:', err); return false; }
}

async function dbUpsertTargetByKey(target) {
  // Upsert by scope+customer_id+product_id+month+year or scope+country+product_id+month+year
  try {
    // Find existing
    var q = _client.from('targets').select('id').eq('scope', target.scope).eq('month', target.month).eq('year', target.year);
    if (target.scope === 'customer') {
      q = q.eq('customer_id', target.customer_id).eq('product_id', target.product_id);
    } else {
      q = q.eq('country', target.country).eq('product_id', target.product_id);
    }
    var existing = await q.maybeSingle();
    if (existing.error) throw existing.error;

    var payload = Object.assign({}, target);
    if (existing.data) payload.id = existing.data.id;

    var res = await _client.from('targets').upsert(payload, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpsertTargetByKey:', err); return false; }
}

/* ORDERS */
async function dbGetOrders() {
  try {
    var res = await _client.from('orders').select('*');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetOrders:', err); return []; }
}

async function dbUpsertOrder(order) {
  if (!order.customer_id || !order.product_id) return false;
  order.updated_at = new Date().toISOString();
  try {
    var res = await _client.from('orders').upsert(order, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpsertOrder:', err); return false; }
}

async function dbImportOrder(customerId, productId, shippedQty) {
  if (!customerId || !productId) return false;
  try {
    var existing = await _client.from('orders').select('id, planned_qty, note').eq('customer_id', customerId).eq('product_id', productId).maybeSingle();
    if (existing.error) throw existing.error;
    var ts = new Date().toISOString();
    if (existing.data) {
      var res = await _client.from('orders').update({ shipped_qty: shippedQty, updated_at: ts, updated_by: 'import' }).eq('id', existing.data.id);
      if (res.error) throw res.error;
    } else {
      var res = await _client.from('orders').insert({ customer_id: customerId, product_id: productId, shipped_qty: shippedQty, updated_at: ts, updated_by: 'import' });
      if (res.error) throw res.error;
    }
    return true;
  } catch (err) { console.error('dbImportOrder:', err); return false; }
}

/* LIMITS */
async function dbGetLimits() {
  try {
    var res = await _client.from('limits').select('*');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetLimits:', err); return []; }
}

async function dbUpsertLimit(limit) {
  if (!limit.customer_id) return false;
  try {
    var res = await _client.from('limits').upsert(limit, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpsertLimit:', err); return false; }
}

/* PAYMENTS */
async function dbGetPayments() {
  try {
    var res = await _client.from('incoming_payments').select('*').order('payment_date');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetPayments:', err); return []; }
}

async function dbUpsertPayment(payment) {
  if (!payment.customer_id || !payment.amount_eur || !payment.payment_date) return false;
  try {
    var res = await _client.from('incoming_payments').upsert(payment, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpsertPayment:', err); return false; }
}

async function dbDeletePayment(paymentId) {
  if (!paymentId) return false;
  try {
    var res = await _client.from('incoming_payments').delete().eq('id', paymentId);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbDeletePayment:', err); return false; }
}

/* PROFILES */
async function dbGetProfiles() {
  try {
    var res = await _client.from('profiles').select('*').order('name');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetProfiles:', err); return []; }
}

async function dbCreateProfile(name, region) {
  if (!name) return null;
  try {
    var res = await _client.from('profiles').insert({ name: name, region: region || '', link_token: uid() }).select().single();
    if (res.error) throw res.error;
    return res.data;
  } catch (err) { console.error('dbCreateProfile:', err); return null; }
}

/* RESETS */
async function dbSoftReset() {
  try {
    var dummy = '00000000-0000-0000-0000-000000000000';
    await _client.from('orders').delete().neq('id', dummy);
    await _client.from('limits').delete().neq('id', dummy);
    await _client.from('incoming_payments').delete().neq('id', dummy);
    return true;
  } catch (err) { console.error('dbSoftReset:', err); return false; }
}

async function dbHardReset() {
  try {
    var dummy = '00000000-0000-0000-0000-000000000000';
    var tables = ['orders', 'limits', 'incoming_payments', 'targets', 'products', 'customers'];
    for (var i = 0; i < tables.length; i++) {
      await _client.from(tables[i]).delete().neq('id', dummy);
    }
    return true;
  } catch (err) { console.error('dbHardReset:', err); return false; }
}

async function dbGetLastUpdated() {
  try {
    var res = await _client.from('orders').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (res.error) throw res.error;
    return res.data ? res.data.updated_at : null;
  } catch (err) { return null; }
}

/* ============================================================
   DELETE OPERATIONS
   ============================================================ */
async function dbDeleteProduct(productId) {
  if (!productId) return false;
  try {
    var res = await _client.from('products').delete().eq('id', productId);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbDeleteProduct:', err); return false; }
}

async function dbDeleteCustomer(customerId) {
  if (!customerId) return false;
  try {
    var res = await _client.from('customers').delete().eq('id', customerId);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbDeleteCustomer:', err); return false; }
}
