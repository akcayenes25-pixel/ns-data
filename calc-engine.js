/* NSDATA - calc-engine.js v1.4.0 */
/* destination_country mimarisi, 6-alan three-way, çift konteyner/toplam */

/* ============================================================
   THREE-WAY CONVERSION — tek grup için
   source: 'qty' | 'euro' | 'container'
   ============================================================ */
function calcThreeWay(source, value, avgPrice, containerRatio) {
  var result = { qty: null, euro: null, container: null };
  var val   = parseNum(value);
  var price = parseNum(avgPrice);
  var ratio = parseNum(containerRatio);
  if (price === null || price < 0.01) return result;
  if (val === null || val < 0) return result;

  if (source === 'qty') {
    result.qty       = val;
    result.euro      = val * price;
    result.container = ratio ? val / ratio : null;
  } else if (source === 'euro') {
    result.euro      = val;
    result.qty       = val / price;
    result.container = ratio ? (val / price) / ratio : null;
  } else if (source === 'container') {
    if (!ratio) return result;
    result.container = val;
    result.qty       = val * ratio;
    result.euro      = val * ratio * price;
  }
  return result;
}

/* ============================================================
   ORDER CALCULATIONS
   ============================================================ */
function calcConfirmed(shippedQty, avgPrice) {
  var qty = parseNum(shippedQty); var price = parseNum(avgPrice);
  if (qty === null || price === null || price < 0.01) return null;
  return qty * price;
}

function calcExpected(shippedQty, plannedQty, avgPrice) {
  var shipped = parseNum(shippedQty) || 0;
  var planned = parseNum(plannedQty) || 0;
  var price   = parseNum(avgPrice);
  if (price === null || price < 0.01) return null;
  return (shipped + planned) * price;
}

function calcTargetPct(expectedEuro, targetEuro) {
  var exp = parseNum(expectedEuro); var tgt = parseNum(targetEuro);
  if (exp === null || tgt === null || tgt <= 0) return null;
  return (exp / tgt) * 100;
}

/* ============================================================
   MAP BUILDERS
   ============================================================ */
function buildProductMap(products) {
  var map = {};
  products.forEach(function(p) { map[p.id] = p; });
  return map;
}

function buildCustomerMap(customers) {
  var map = {};
  customers.forEach(function(c) { map[c.id] = c; });
  return map;
}

/* ============================================================
   AGGREGATIONS
   ============================================================ */
function calcCustomerSummaries(orders, productMap) {
  var map = {};
  orders.forEach(function(order) {
    var product = productMap[order.product_id];
    if (!product) return;
    var price   = parseNum(product.avg_price_eur);
    if (!price || price < 0.01) return;
    var shipped = parseNum(order.shipped_qty) || 0;
    var planned = parseNum(order.planned_qty) || 0;
    if (!map[order.customer_id]) {
      map[order.customer_id] = { customer_id: order.customer_id, confirmed_eur: 0, expected_eur: 0, total_shipped_qty: 0, total_planned_qty: 0, last_updated: null };
    }
    map[order.customer_id].confirmed_eur     += shipped * price;
    map[order.customer_id].expected_eur      += (shipped + planned) * price;
    map[order.customer_id].total_shipped_qty += shipped;
    map[order.customer_id].total_planned_qty += planned;
    if (order.updated_at) {
      var ts = new Date(order.updated_at);
      if (!map[order.customer_id].last_updated || ts > new Date(map[order.customer_id].last_updated)) {
        map[order.customer_id].last_updated = order.updated_at;
      }
    }
  });
  return Object.values(map);
}

function calcProductSummaries(orders, productMap) {
  var map = {};
  orders.forEach(function(order) {
    var product = productMap[order.product_id];
    if (!product) return;
    var price   = parseNum(product.avg_price_eur);
    if (!price || price < 0.01) return;
    var shipped = parseNum(order.shipped_qty) || 0;
    var planned = parseNum(order.planned_qty) || 0;
    if (!map[order.product_id]) {
      map[order.product_id] = { product_id: order.product_id, confirmed_eur: 0, expected_eur: 0, total_shipped_qty: 0, total_planned_qty: 0 };
    }
    map[order.product_id].confirmed_eur     += shipped * price;
    map[order.product_id].expected_eur      += (shipped + planned) * price;
    map[order.product_id].total_shipped_qty += shipped;
    map[order.product_id].total_planned_qty += planned;
  });
  return Object.values(map);
}

function calcGrandTotals(orders, productMap) {
  var confirmed = 0, expected = 0;
  orders.forEach(function(order) {
    var product = productMap[order.product_id];
    if (!product) return;
    var price   = parseNum(product.avg_price_eur);
    if (!price || price < 0.01) return;
    var shipped = parseNum(order.shipped_qty) || 0;
    var planned = parseNum(order.planned_qty) || 0;
    confirmed += shipped * price;
    expected  += (shipped + planned) * price;
  });
  return { confirmed_eur: confirmed, expected_eur: expected };
}

/* ============================================================
   DESTINATION COUNTRY AGGREGATION
   Orders'daki destination_country'ye göre grupla
   ============================================================ */
function calcCountrySummaries(orders, productMap, customers) {
  var map = {};

  orders.forEach(function(order) {
    var product = productMap[order.product_id];
    if (!product) return;
    var price   = parseNum(product.avg_price_eur);
    if (!price || price < 0.01) return;

    // destination_country öncelikli, yoksa müşteri ülkesi (geçiş dönemi)
    var country = order.destination_country || 'Diğer';

    if (!map[country]) {
      map[country] = { country: country, confirmed_eur: 0, expected_eur: 0, customer_ids: [], target_eur: 0 };
    }
    var shipped = parseNum(order.shipped_qty) || 0;
    var planned = parseNum(order.planned_qty) || 0;
    map[country].confirmed_eur += shipped * price;
    map[country].expected_eur  += (shipped + planned) * price;
    if (!map[country].customer_ids.includes(order.customer_id)) {
      map[country].customer_ids.push(order.customer_id);
    }
  });

  return Object.values(map);
}

/* ============================================================
   LIMIT CALCULATIONS
   ============================================================ */
function calcConservativeLimit(totalLimit, openBalance, plannedEuro) {
  var total   = parseNum(totalLimit);
  var balance = parseNum(openBalance);
  var planned = parseNum(plannedEuro) || 0;
  if (total === null) return null;
  if (balance === null) balance = 0;
  return total - balance - planned;
}

function calcOptimisticLimit(totalLimit, openBalance, plannedEuro, payments, currentMonth, currentYear) {
  var total   = parseNum(totalLimit);
  var balance = parseNum(openBalance);
  var planned = parseNum(plannedEuro) || 0;
  if (total === null) return null;
  if (balance === null) balance = 0;
  var sameMonthPayments = 0;
  if (payments && payments.length) {
    payments.forEach(function(p) {
      if (isSameMonth(p.payment_date, currentMonth, currentYear)) {
        var amt = parseNum(p.amount_eur);
        if (amt) sameMonthPayments += amt;
      }
    });
  }
  return total + sameMonthPayments - balance - planned;
}

function calcCustomerPlannedEuro(orders, customerId, productMap) {
  var total = 0;
  orders.forEach(function(order) {
    if (order.customer_id !== customerId) return;
    var product = productMap[order.product_id];
    if (!product) return;
    var price   = parseNum(product.avg_price_eur);
    if (!price || price < 0.01) return;
    var planned = parseNum(order.planned_qty) || 0;
    total += planned * price;
  });
  return total;
}

/* ============================================================
   TARGET MAP HELPERS
   ============================================================ */
function buildTargetMap(targets) {
  var map = {};
  targets.forEach(function(t) {
    var key = t.customer_id + '_' + t.month + '_' + t.year;
    map[key] = t;
  });
  return map;
}

/* ============================================================
   COLOR / STATUS HELPERS
   ============================================================ */
function pctColorClass(pct) {
  if (pct === null || pct === undefined) return 'neutral';
  if (pct >= 100) return 'positive';
  if (pct >= 70)  return 'warning';
  return 'negative';
}

function pctColor(pct) {
  if (pct === null || pct === undefined) return '#E2E5EF';
  if (pct >= 100) return '#16A34A';
  if (pct >= 70)  return '#D97706';
  return '#DC2626';
}

function isLimitCritical(conservativeLimit, totalLimit) {
  if (conservativeLimit === null || totalLimit === null) return false;
  if (totalLimit <= 0) return false;
  return conservativeLimit <= (totalLimit * 0.10);
}

function scenarioStatus(pct) {
  if (pct === null) return 'unknown';
  if (pct >= 100) return 'achieved';
  if (pct >= 80)  return 'on-track';
  if (pct >= 50)  return 'at-risk';
  return 'critical';
}
