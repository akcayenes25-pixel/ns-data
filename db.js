/* NSDATA - db.js */
/* All Supabase read/write operations */

var SUPABASE_URL = 'https://eiltpqvtdojsmjfukkah.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbHRwcXZ0ZG9qc21qZnVra2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTExMjksImV4cCI6MjA5NjAyNzEyOX0.wHzHUvmGck6bB8PkueCTKd22dB6xb4KdWRO-PDwYS_Y';

var _client = null;
var _realtimeChannel = null;

function dbInit() {
  try {
    _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window._supabaseClient = _client;
    dbInitRealtime();
  } catch (err) {
    console.error('Supabase init failed:', err);
  }
}

function dbInitRealtime() {
  if (!_client) return;
  _realtimeChannel = _client.channel('nsdata-realtime')
    .on('postgres_changes', { event: '*', schema: 'public' }, function(payload) {
      emitDataChange(payload.table, payload);
    })
    .subscribe();
}

function dbPauseRealtime() {
  if (_realtimeChannel && _client) {
    _client.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

function dbResumeRealtime() {
  dbInitRealtime();
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
    var res;
    if (product.id) {
      res = await _client.from('products').update(product).eq('id', product.id);
    } else {
      res = await _client.from('products').insert(product);
    }
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
    var res;
    if (customer.id) {
      res = await _client.from('customers').update(customer).eq('id', customer.id);
    } else {
      res = await _client.from('customers').insert(customer);
    }
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
  // Supabase server caps single select at 1000 rows — paginate to get all
  try {
    var all     = [];
    var PAGE    = 1000;
    var page    = 0;
    while (true) {
      var res = await _client
        .from('targets')
        .select('*')
        .range(page * PAGE, (page + 1) * PAGE - 1);
      if (res.error) throw res.error;
      var batch = res.data || [];
      all = all.concat(batch);
      if (batch.length < PAGE) break; // last page
      page++;
    }
    return all;
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
async function dbGetOrders(month, year) {
  try {
    var q = _client.from('orders').select('*');
    if (month && year) { q = q.eq('month', month).eq('year', year); }
    var res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetOrders:', err); return []; }
}

async function dbUpsertOrder(order) {
  if (!order.customer_id || !order.product_id) return false;
  order.updated_at = new Date().toISOString();
  try {
    var res = order.id
      ? await _client.from('orders').update(order).eq('id', order.id)
      : await _client.from('orders').insert(order);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpsertOrder:', err); return false; }
}

/* dbBatchImportOrders — replaces old single-row dbImportOrder.
   Fixes:
     Bug 1  — destination_country now carried through SELECT + INSERT
     Bug 2  — concurrent updates + one batch INSERT (not N*2 serial calls)
     Bug 10 — zero-qty groups filtered by caller before this is called
     Bug 11 — caller aggregates/sums duplicate file rows before calling this

   groups: array of { customer_id, product_id, country, month, year, qty }
           Groups with qty<=0 must already be filtered by caller.
   taraf:  'cikan' | 'cikacak'
   Returns: { done, inserted, updated, failed }
*/
async function dbBatchImportOrders(groups, taraf) {
  if (!groups || !groups.length) return { done:0, inserted:0, updated:0, failed:0 };
  var field      = (taraf === 'cikacak') ? 'planned_qty'  : 'shipped_qty';
  var euroField  = (taraf === 'cikacak') ? 'planned_euro' : 'shipped_euro';

  // Collect unique month+year pairs
  var periods = {};
  groups.forEach(function(g) { periods[g.month + '-' + g.year] = true; });
  var periodKeys = Object.keys(periods);

  try {
    // CALL 1: fetch all existing orders for these periods (batch, not per-row)
    var existingAll = [];
    for (var pi = 0; pi < periodKeys.length; pi++) {
      var parts = periodKeys[pi].split('-');
      var res = await _client.from('orders')
        .select('id,customer_id,product_id,destination_country,month,year')
        .eq('month', parseInt(parts[0])).eq('year', parseInt(parts[1]));
      if (res.error) throw res.error;
      if (res.data) existingAll = existingAll.concat(res.data);
    }

    // Build lookup map: composite key -> existing row id
    var existingMap = {};
    existingAll.forEach(function(o) {
      var country = o.destination_country ? String(o.destination_country).trim().toUpperCase() : '';
      var key = [o.customer_id, o.product_id, country, o.month, o.year].join('|||');
      existingMap[key] = o.id;
    });

    // Split into UPDATE vs INSERT lists
    var toUpdate = [];
    var toInsert = [];
    var ts = new Date().toISOString();

    groups.forEach(function(g) {
      var country = g.country ? String(g.country).trim().toUpperCase() : '';
      var key = [g.customer_id, g.product_id, country, g.month, g.year].join('|||');
      var existingId = existingMap[key];

      if (existingId) {
        // Only set the taraf field — other taraf stays untouched in DB (Bug 10 protection)
        var upd = { id: existingId, updated_at: ts, updated_by: 'import' };
        upd[field] = g.qty;
        upd[euroField] = g.euro || 0;
        toUpdate.push(upd);
      } else {
        toInsert.push({
          customer_id:         g.customer_id,
          product_id:          g.product_id,
          destination_country: g.country ? String(g.country).trim().toUpperCase() : null,
          month:               g.month,
          year:                g.year,
          shipped_qty:         (taraf === 'cikacak') ? 0 : g.qty,
          planned_qty:         (taraf === 'cikacak') ? g.qty : 0,
          shipped_euro:        (taraf === 'cikacak') ? 0 : (g.euro || 0),
          planned_euro:        (taraf === 'cikacak') ? (g.euro || 0) : 0,
          updated_at:          ts,
          updated_by:          'import'
        });
      }
    });

    var updatedCount  = 0;
    var insertedCount = 0;
    var failedCount   = 0;
    var successGroups = [];
    var failedGroups  = [];

    // CALL 2a: concurrent UPDATE (each row different value, fire in parallel)
    if (toUpdate.length > 0) {
      var updateResults = await Promise.allSettled(toUpdate.map(function(u) {
        var payload = { updated_at: u.updated_at, updated_by: u.updated_by };
        payload[field] = u[field];
        payload[euroField] = u[euroField] || 0;
        return _client.from('orders').update(payload).eq('id', u.id);
      }));
      updateResults.forEach(function(r, i) {
        if (r.status === 'fulfilled' && !r.value.error) {
          updatedCount++;
          successGroups.push({ group: toUpdate[i], action: 'updated' });
        } else {
          failedCount++;
          var errMsg = (r.reason && r.reason.message) || (r.value && r.value.error && r.value.error.message) || 'DB güncelleme hatası';
          failedGroups.push({ group: toUpdate[i], action: 'update_failed', error: errMsg });
          console.error('dbBatchImportOrders update fail:', r.reason || (r.value && r.value.error));
        }
      });
    }

    // CALL 2b: batch INSERT (one call for all new rows)
    if (toInsert.length > 0) {
      var insRes = await _client.from('orders').insert(toInsert);
      if (insRes.error) {
        console.error('dbBatchImportOrders insert fail:', insRes.error);
        failedCount += toInsert.length;
        toInsert.forEach(function(g) {
          failedGroups.push({ group: g, action: 'insert_failed', error: insRes.error.message || 'DB ekleme hatası' });
        });
      } else {
        insertedCount = toInsert.length;
        toInsert.forEach(function(g) { successGroups.push({ group: g, action: 'inserted' }); });
      }
    }

    return { done: updatedCount + insertedCount, inserted: insertedCount, updated: updatedCount, failed: failedCount, successGroups: successGroups, failedGroups: failedGroups };

  } catch (err) {
    console.error('dbBatchImportOrders:', err);
    return { done: 0, inserted: 0, updated: 0, failed: groups.length };
  }
}

async function dbCountPlannedForPeriod(month, year) {
  try {
    var res = await _client.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('month', month).eq('year', year)
      .gt('planned_qty', 0);
    if (res.error) throw res.error;
    return res.count || 0;
  } catch (err) { return 0; }
}

async function dbClearPlannedForPeriod(month, year) {
  try {
    var res = await _client.from('orders')
      .update({ planned_qty: 0, updated_at: new Date().toISOString(), updated_by: 'period-close' })
      .eq('month', month).eq('year', year)
      .gt('planned_qty', 0);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbClearPlannedForPeriod:', err); return false; }
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
    var res = limit.id
      ? await _client.from('limits').update(limit).eq('id', limit.id)
      : await _client.from('limits').insert(limit);
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
    var res = payment.id
      ? await _client.from('incoming_payments').update(payment).eq('id', payment.id)
      : await _client.from('incoming_payments').insert(payment);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpsertPayment:', err); return false; }
}

async function dbDeleteOrder(orderId) {
  if (!orderId) return false;
  try {
    var res = await _client.from('orders').delete().eq('id', orderId);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbDeleteOrder:', err); return false; }
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
    await dbLog('SOFT_RESET', 'orders,limits,payments', 'settings', 'wiping orders+limits+payments');
    var dummy = '00000000-0000-0000-0000-000000000000';
    await _client.from('orders').delete().neq('id', dummy);
    await _client.from('limits').delete().neq('id', dummy);
    await _client.from('incoming_payments').delete().neq('id', dummy);
    return true;
  } catch (err) { console.error('dbSoftReset:', err); return false; }
}

async function dbHardReset() {
  try {
    await dbLog('HARD_RESET', 'all', 'settings', 'wiping everything including customers+products+targets');
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
   ACTIVITY LOG
   ============================================================ */
async function dbLog(action, tableName, screen, detail) {
  try {
    if (!_client) return;
    await _client.from('activity_log').insert({
      action: action,
      table_name: tableName,
      screen: screen || 'unknown',
      detail: detail || ''
    });
  } catch (err) { /* silent — never block the app */ }
}

async function dbLogSnapshot() {
  try {
    if (!_client) return;
    var customers = await _client.from('customers').select('id', { count: 'exact', head: true });
    var products  = await _client.from('products').select('id',  { count: 'exact', head: true });
    var custCount = customers.count || 0;
    var prodCount = products.count  || 0;
    await dbLog('APP_BOOT', 'snapshot', 'app', 'customers=' + custCount + ' products=' + prodCount + ' version=' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'));
  } catch (err) { /* silent */ }
}

async function dbGetActivityLog() {
  try {
    var res = await _client.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200);
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetActivityLog:', err); return []; }
}

/* ============================================================
   DELETE OPERATIONS
   ============================================================ */
async function dbDeleteProduct(productId) {
  if (!productId) return false;
  try {
    await dbLog('DELETE_PRODUCT', 'products', 'settings', 'id=' + productId);
    var res = await _client.from('products').delete().eq('id', productId);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbDeleteProduct:', err); return false; }
}

async function dbDeleteCustomer(customerId) {
  if (!customerId) return false;
  try {
    await dbLog('DELETE_CUSTOMER', 'customers', 'settings', 'id=' + customerId);
    var res = await _client.from('customers').delete().eq('id', customerId);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbDeleteCustomer:', err); return false; }
}
/* CUSTOMER COUNTRIES */
async function dbGetCustomerCountries() {
  try {
    var res = await _client.from('customer_countries').select('*').order('country');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbGetCustomerCountries:', err); return []; }
}

async function dbAddCustomerCountry(customerId, country) {
  if (!customerId || !country) return false;
  try {
    var res = await _client.from('customer_countries').insert({ customer_id: customerId, country: country.toUpperCase().trim() });
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbAddCustomerCountry:', err); return false; }
}

async function dbDeleteCustomerCountry(customerId, country) {
  if (!customerId || !country) return false;
  try {
    var res = await _client.from('customer_countries').delete().eq('customer_id', customerId).eq('country', country);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbDeleteCustomerCountry:', err); return false; }
}


/* BULK IMPORT — Musteri + Ulke toplu ekleme */
async function dbBulkAddCustomers(names) {
  // names: array of strings (unique, validated)
  // Returns: array of {name, id} for successfully inserted
  if (!names || !names.length) return [];
  try {
    var rows = names.map(function(n) { return { name: n, active: true }; });
    var res = await _client.from('customers').insert(rows).select('id, name');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbBulkAddCustomers:', err); return []; }
}

async function dbBulkAddCustomerCountries(pairs) {
  // pairs: array of {customer_id, country}
  if (!pairs || !pairs.length) return false;
  try {
    var rows = pairs.map(function(p) {
      return { customer_id: p.customer_id, country: p.country.trim() };
    });
    var res = await _client.from('customer_countries').insert(rows);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbBulkAddCustomerCountries:', err); return false; }
}

/* ============================================================
   BUDGET IMPORT — Full wipe + bulk insert
   ============================================================ */

async function dbFullWipe() {
  try {
    await dbLog('FULL_WIPE', 'all', 'import', 'budget import full wipe');
    var dummy = '00000000-0000-0000-0000-000000000000';
    // Deleting products cascades: targets, orders
    // Deleting customers cascades: customer_countries, limits, incoming_payments
    await _client.from('products').delete().neq('id', dummy);
    await _client.from('customers').delete().neq('id', dummy);
    return true;
  } catch (err) { console.error('dbFullWipe:', err); return false; }
}

async function dbBulkInsertProducts(products) {
  // products: [{name, avg_price_eur, container_ratio, active}]
  if (!products || !products.length) return [];
  try {
    var res = await _client.from('products').insert(products).select('id, name');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) { console.error('dbBulkInsertProducts:', err); return []; }
}

async function dbBulkInsertTargets(rows, onChunk) {
  // Inserts in chunks of 1000. onChunk(done, total) called after each chunk.
  // setTimeout(0) between chunks lets the browser repaint and stay responsive.
  if (!rows || !rows.length) return 0;
  var CHUNK = 1000;
  var done  = 0;
  try {
    for (var i = 0; i < rows.length; i += CHUNK) {
      var chunk = rows.slice(i, i + CHUNK);
      var res   = await _client.from('targets').insert(chunk);
      if (res.error) throw res.error;
      done += chunk.length;
      if (onChunk) onChunk(done, rows.length);
      // Yield to UI thread — prevents browser freeze between chunks
      await new Promise(function(r) { setTimeout(r, 0); });
    }
    return done;
  } catch (err) {
    console.error('dbBulkInsertTargets at chunk ' + done + ':', err);
    throw err; // let confirmBudgetImport handle it and show the error
  }
}

async function dbUpdateTarget(id, field, value) {
  if (!id) return false;
  try {
    var payload = {};
    payload[field] = value;
    var res = await _client.from('targets').update(payload).eq('id', id);
    if (res.error) throw res.error;
    return true;
  } catch (err) { console.error('dbUpdateTarget:', err); return false; }
}
