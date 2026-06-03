/* NSDATA - db.js */
/* All Supabase read/write operations live here */
/* No screen logic, no DOM — pure data layer */

var SUPABASE_URL = 'YOUR_SUPABASE_URL';
var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

var _client = null;
var _realtimeChannel = null;

/* ============================================================
   INIT
   ============================================================ */

function dbInit() {
  try {
    _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    dbInitRealtime();
  } catch (err) {
    console.error('Supabase init failed:', err);
  }
}

/* ============================================================
   REALTIME
   ============================================================ */

function dbInitRealtime() {
  if (!_client) return;

  var tables = ['orders', 'limits', 'incoming_payments', 'products', 'customers', 'targets', 'production_calendar'];

  _realtimeChannel = _client
    .channel('nsdata-realtime')
    .on('postgres_changes', { event: '*', schema: 'public' }, function(payload) {
      emitDataChange(payload.table, payload);
    })
    .subscribe();
}

/* ============================================================
   PRODUCTS
   ============================================================ */

async function dbGetProducts() {
  try {
    var res = await _client.from('products').select('*').order('name');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) {
    console.error('dbGetProducts:', err);
    return [];
  }
}

async function dbUpsertProduct(product) {
  try {
    var res = await _client.from('products').upsert(product, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbUpsertProduct:', err);
    return false;
  }
}

async function dbUpdateProductPrice(productId, newPrice) {
  if (!productId || newPrice === null) return false;
  var safePrice = Math.max(0.01, parseFloat(newPrice));
  try {
    var res = await _client
      .from('products')
      .update({ avg_price_eur: safePrice })
      .eq('id', productId);
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbUpdateProductPrice:', err);
    return false;
  }
}

/* ============================================================
   CUSTOMERS
   ============================================================ */

async function dbGetCustomers() {
  try {
    var res = await _client.from('customers').select('*').order('name');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) {
    console.error('dbGetCustomers:', err);
    return [];
  }
}

async function dbUpsertCustomer(customer) {
  try {
    var res = await _client.from('customers').upsert(customer, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbUpsertCustomer:', err);
    return false;
  }
}

async function dbSetCustomerActive(customerId, active) {
  try {
    var res = await _client
      .from('customers')
      .update({ active: active })
      .eq('id', customerId);
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbSetCustomerActive:', err);
    return false;
  }
}

/* ============================================================
   TARGETS
   ============================================================ */

async function dbGetTargets() {
  try {
    var res = await _client.from('targets').select('*');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) {
    console.error('dbGetTargets:', err);
    return [];
  }
}

async function dbUpsertTarget(target) {
  try {
    var res = await _client.from('targets').upsert(target, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbUpsertTarget:', err);
    return false;
  }
}

/* ============================================================
   ORDERS
   ============================================================ */

async function dbGetOrders() {
  try {
    var res = await _client.from('orders').select('*');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) {
    console.error('dbGetOrders:', err);
    return [];
  }
}

async function dbUpsertOrder(order) {
  if (!order.customer_id || !order.product_id) return false;
  order.updated_at = new Date().toISOString();
  try {
    var res = await _client.from('orders').upsert(order, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbUpsertOrder:', err);
    return false;
  }
}

// Import: update only shipped_qty + euro, never touch planned_qty or notes
async function dbImportOrder(customerId, productId, shippedQty, euroValue) {
  if (!customerId || !productId) return false;
  try {
    // Check if row exists
    var existing = await _client
      .from('orders')
      .select('id, planned_qty, note')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing.error) throw existing.error;

    var payload = {
      customer_id: customerId,
      product_id: productId,
      shipped_qty: shippedQty,
      updated_at: new Date().toISOString(),
      updated_by: 'import'
    };

    if (existing.data) {
      // Update only shipped fields, preserve manual fields
      var res = await _client
        .from('orders')
        .update({ shipped_qty: shippedQty, updated_at: payload.updated_at, updated_by: 'import' })
        .eq('id', existing.data.id);
      if (res.error) throw res.error;
    } else {
      // Insert new row
      var res = await _client.from('orders').insert(payload);
      if (res.error) throw res.error;
    }

    return true;
  } catch (err) {
    console.error('dbImportOrder:', err);
    return false;
  }
}

async function dbUpdateOrderPlanned(orderId, plannedQty, note) {
  if (!orderId) return false;
  var update = { updated_at: new Date().toISOString(), updated_by: 'user' };
  if (plannedQty !== undefined) update.planned_qty = plannedQty;
  if (note !== undefined) update.note = note;
  try {
    var res = await _client.from('orders').update(update).eq('id', orderId);
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbUpdateOrderPlanned:', err);
    return false;
  }
}

/* ============================================================
   LIMITS
   ============================================================ */

async function dbGetLimits() {
  try {
    var res = await _client.from('limits').select('*');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) {
    console.error('dbGetLimits:', err);
    return [];
  }
}

async function dbUpsertLimit(limit) {
  if (!limit.customer_id) return false;
  try {
    var res = await _client.from('limits').upsert(limit, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbUpsertLimit:', err);
    return false;
  }
}

/* ============================================================
   INCOMING PAYMENTS
   ============================================================ */

async function dbGetPayments() {
  try {
    var res = await _client.from('incoming_payments').select('*').order('payment_date');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) {
    console.error('dbGetPayments:', err);
    return [];
  }
}

async function dbUpsertPayment(payment) {
  if (!payment.customer_id || !payment.amount_eur || !payment.payment_date) return false;
  try {
    var res = await _client.from('incoming_payments').upsert(payment, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbUpsertPayment:', err);
    return false;
  }
}

async function dbDeletePayment(paymentId) {
  if (!paymentId) return false;
  try {
    var res = await _client.from('incoming_payments').delete().eq('id', paymentId);
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbDeletePayment:', err);
    return false;
  }
}

/* ============================================================
   PRODUCTION CALENDAR
   ============================================================ */

async function dbGetProductionCalendar() {
  try {
    var res = await _client.from('production_calendar').select('*');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) {
    console.error('dbGetProductionCalendar:', err);
    return [];
  }
}

async function dbUpsertProductionEntry(entry) {
  if (!entry.order_id) return false;
  try {
    var res = await _client.from('production_calendar').upsert(entry, { onConflict: 'id' });
    if (res.error) throw res.error;
    return true;
  } catch (err) {
    console.error('dbUpsertProductionEntry:', err);
    return false;
  }
}

/* ============================================================
   PROFILES
   ============================================================ */

async function dbGetProfiles() {
  try {
    var res = await _client.from('profiles').select('*').order('name');
    if (res.error) throw res.error;
    return res.data || [];
  } catch (err) {
    console.error('dbGetProfiles:', err);
    return [];
  }
}

async function dbCreateProfile(name, region) {
  if (!name) return null;
  var token = uid();
  try {
    var res = await _client.from('profiles').insert({
      name: name,
      region: region || '',
      link_token: token
    }).select().single();
    if (res.error) throw res.error;
    return res.data;
  } catch (err) {
    console.error('dbCreateProfile:', err);
    return null;
  }
}

/* ============================================================
   SOFT RESET (keep customers + targets + products)
   ============================================================ */

async function dbSoftReset() {
  try {
    await _client.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await _client.from('limits').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await _client.from('incoming_payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await _client.from('production_calendar').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return true;
  } catch (err) {
    console.error('dbSoftReset:', err);
    return false;
  }
}

/* ============================================================
   HARD RESET (everything)
   ============================================================ */

async function dbHardReset() {
  try {
    var tables = ['orders', 'limits', 'incoming_payments', 'production_calendar', 'targets', 'products', 'customers'];
    for (var i = 0; i < tables.length; i++) {
      await _client.from(tables[i]).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    return true;
  } catch (err) {
    console.error('dbHardReset:', err);
    return false;
  }
}

/* ============================================================
   LAST UPDATED TIMESTAMP
   ============================================================ */

async function dbGetLastUpdated() {
  try {
    var res = await _client
      .from('orders')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data ? res.data.updated_at : null;
  } catch (err) {
    console.error('dbGetLastUpdated:', err);
    return null;
  }
}
