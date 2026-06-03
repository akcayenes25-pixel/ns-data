/* NSDATA - calc-engine.js */
/* All calculation logic — no DOM, no Supabase, pure functions */
/* Every screen calls these functions, never calculates on its own */

/* ============================================================
   THREE-WAY CONVERSION
   source: 'qty' | 'euro' | 'container'
   Returns { qty, euro, container } with nulls for invalid
   ============================================================ */

function calcThreeWay(source, value, avgPrice, containerRatio) {
  var result = { qty: null, euro: null, container: null };

  var val        = parseNum(value);
  var price      = parseNum(avgPrice);
  var ratio      = parseNum(containerRatio);

  // Guard: price must be > 0
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
   ORDER CIRO
   ============================================================ */

// Confirmed revenue for a single order row
function calcConfirmed(shippedQty, avgPrice) {
  var qty   = parseNum(shippedQty);
  var price = parseNum(avgPrice);
  if (qty === null || price === null || price < 0.01) return null;
  return qty * price;
}

// Expected revenue for a single order row (shipped + planned)
function calcExpected(shippedQty, plannedQty, avgPrice) {
  var shipped = parseNum(shippedQty) || 0;
  var planned = parseNum(plannedQty) || 0;
  var price   = parseNum(avgPrice);
  if (price === null || price < 0.01) return null;
  return (shipped + planned) * price;
}

// Target achievement percentage
function calcTargetPct(expectedEuro, targetEuro) {
  var exp = parseNum(expectedEuro);
  var tgt = parseNum(targetEuro);
  if (exp === null || tgt === null || tgt <= 0) return null;
  return (exp / tgt) * 100;
}

/* ============================================================
   AGGREGATIONS — given arrays of order rows + product map
   ============================================================ */

// Build a product map: { productId: { avg_price_eur, container_ratio, name } }
function buildProductMap(products) {
  var map = {};
  products.forEach(function(p) {
    map[p.id] = p;
  });
  return map;
}

// Aggregate orders into summary per customer
// Returns array of { customer_id, confirmed_eur, expected_eur, total_shipped_qty, total_planned_qty }
function calcCustomerSummaries(orders, productMap) {
  var map = {};

  orders.forEach(function(order) {
    var product = productMap[order.product_id];
    if (!product) return;

    var price    = parseNum(product.avg_price_eur);
    if (!price || price < 0.01) return;

    var shipped  = parseNum(order.shipped_qty) || 0;
    var planned  = parseNum(order.planned_qty) || 0;

    var confirmed = shipped * price;
    var expected  = (shipped + planned) * price;

    if (!map[order.customer_id]) {
      map[order.customer_id] = {
        customer_id: order.customer_id,
        confirmed_eur: 0,
        expected_eur: 0,
        total_shipped_qty: 0,
        total_planned_qty: 0,
        last_updated: null
      };
    }

    map[order.customer_id].confirmed_eur    += confirmed;
    map[order.customer_id].expected_eur     += expected;
    map[order.customer_id].total_shipped_qty += shipped;
    map[order.customer_id].total_planned_qty += planned;

    // Track latest update
    if (order.updated_at) {
      var ts = new Date(order.updated_at);
      if (!map[order.customer_id].last_updated || ts > new Date(map[order.customer_id].last_updated)) {
        map[order.customer_id].last_updated = order.updated_at;
      }
    }
  });

  return Object.values(map);
}

// Aggregate orders into summary per product
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
      map[order.product_id] = {
        product_id: order.product_id,
        confirmed_eur: 0,
        expected_eur: 0,
        total_shipped_qty: 0,
        total_planned_qty: 0
      };
    }

    map[order.product_id].confirmed_eur     += shipped * price;
    map[order.product_id].expected_eur      += (shipped + planned) * price;
    map[order.product_id].total_shipped_qty += shipped;
    map[order.product_id].total_planned_qty += planned;
  });

  return Object.values(map);
}

// Grand totals across all customers/products
function calcGrandTotals(orders, productMap) {
  var confirmed = 0;
  var expected  = 0;

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
   LIMIT CALCULATIONS
   ============================================================ */

// Conservative available limit
// = total_limit - open_balance - (all planned_qty * price for this customer)
function calcConservativeLimit(totalLimit, openBalance, plannedEuro) {
  var total   = parseNum(totalLimit);
  var balance = parseNum(openBalance);
  var planned = parseNum(plannedEuro) || 0;

  if (total === null) return null;
  if (balance === null) balance = 0;

  return total - balance - planned;
}

// Optimistic available limit
// = total_limit + confirmed_same_month_payments - open_balance - planned_euro
function calcOptimisticLimit(totalLimit, openBalance, plannedEuro, payments, currentMonth, currentYear) {
  var total   = parseNum(totalLimit);
  var balance = parseNum(openBalance);
  var planned = parseNum(plannedEuro) || 0;

  if (total === null) return null;
  if (balance === null) balance = 0;

  // Sum only payments within the current month
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

// Calculate planned euro for a customer from their orders
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
   COUNTRY AGGREGATION
   ============================================================ */

// Group customer summaries by country
function calcCountrySummaries(customerSummaries, customerMap, targetMap, currentMonth, currentYear) {
  var map = {};

  customerSummaries.forEach(function(cs) {
    var customer = customerMap[cs.customer_id];
    if (!customer) return;

    var country = customer.country || 'Diger';

    if (!map[country]) {
      map[country] = {
        country: country,
        confirmed_eur: 0,
        expected_eur: 0,
        target_eur: 0,
        customer_ids: []
      };
    }

    map[country].confirmed_eur += cs.confirmed_eur || 0;
    map[country].expected_eur  += cs.expected_eur  || 0;
    map[country].customer_ids.push(cs.customer_id);

    // Add customer target
    var tgtKey = cs.customer_id + '_' + currentMonth + '_' + currentYear;
    var target = targetMap[tgtKey];
    if (target) {
      map[country].target_eur += parseNum(target.target_eur) || 0;
    }
  });

  return Object.values(map);
}

/* ============================================================
   TARGET MAP HELPER
   Builds a lookup: { "customerId_month_year": targetRow }
   ============================================================ */

function buildTargetMap(targets) {
  var map = {};
  targets.forEach(function(t) {
    var key = t.customer_id + '_' + t.month + '_' + t.year;
    map[key] = t;
  });
  return map;
}

function buildCustomerMap(customers) {
  var map = {};
  customers.forEach(function(c) {
    map[c.id] = c;
  });
  return map;
}

/* ============================================================
   SCENARIO LABELS
   ============================================================ */

function scenarioStatus(pct) {
  if (pct === null) return 'unknown';
  if (pct >= 100) return 'achieved';
  if (pct >= 80)  return 'on-track';
  if (pct >= 50)  return 'at-risk';
  return 'critical';
}
