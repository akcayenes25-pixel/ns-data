/* NSDATA - screen-country.js */
/* Country detail panel */

(function() {
  'use strict';

  var _state = {
    countryId: null,
    orders: [],
    products: [],
    customers: [],
    targets: [],
    productMap: {},
    customerMap: {},
    targetMap: {},
    currentMonth: null,
    currentYear: null
  };

  document.addEventListener('nsdata:appReady', function() {
    var my = currentMonthYear();
    _state.currentMonth = my.month;
    _state.currentYear  = my.year;
    _bindGlobalEvents();
  });

  async function _loadAll(countryId) {
    _state.countryId = countryId;
    var results = await Promise.all([
      dbGetOrders(getActivePeriod().month, getActivePeriod().year), dbGetProducts(), dbGetCustomers(), dbGetTargets()
    ]);
    _state.orders    = results[0];
    _state.products  = results[1];
    _state.customers = results[2];
    _state.targets   = results[3];
    _state.productMap  = buildProductMap(_state.products);
    _state.customerMap = buildCustomerMap(_state.customers);
    _state.targetMap   = buildTargetMap(_state.targets);
  }

  function _render() {
    var screen = document.getElementById('screen-country');
    if (!screen) return;

    var country = _state.countryId;
    // Filter orders by destination_country
    var countryOrders = _state.orders.filter(function(o) { return o.destination_country === country; });
    var customerIds = [];
    countryOrders.forEach(function(o) { if (!customerIds.includes(o.customer_id)) customerIds.push(o.customer_id); });
    var customers = _state.customers.filter(function(c) { return customerIds.includes(c.id); });

    if (!countryOrders.length) {
      screen.innerHTML = '<div class="empty-state"><div class="empty-state-title">Ülke bulunamadı</div></div>';
      return;
    }

    var totalConfirmed = 0, totalExpected = 0, totalTarget = 0;
    countryOrders.forEach(function(o) {
      var p = _state.productMap[o.product_id];
      if (!p) return;
      var price = parseNum(p.avg_price_eur) || 0;
      totalConfirmed += (parseNum(o.shipped_qty) || 0) * price;
      totalExpected  += ((parseNum(o.shipped_qty) || 0) + (parseNum(o.planned_qty) || 0)) * price;
    });

    // Sum all customer targets for this country in the current month
    _state.targets.filter(function(t) {
      return t.scope === 'customer' &&
             t.country === country &&
             t.month   === _state.currentMonth &&
             t.year    === _state.currentYear;
    }).forEach(function(t) {
      totalTarget += (t.target_eur || 0);
    });

    var pct = calcTargetPct(totalExpected, totalTarget);

    screen.innerHTML =
      _buildBackBar(country) +
      _buildHeaderCard(country, totalConfirmed, totalExpected, totalTarget, pct) +
      _buildCustomerGrid(customers);

    _bindScreenEvents();
  }

  function _buildBackBar(country) {
    return '<div class="country-back-bar">' +
      '<button class="country-back-btn" id="country-back-btn">← Geri</button>' +
      '<div class="country-breadcrumb">' +
        '<span>Dashboard</span><span>›</span>' +
        '<span class="country-breadcrumb-current">' + _esc(country) + '</span>' +
      '</div>' +
    '</div>';
  }

  function _buildHeaderCard(country, confirmed, expected, target, pct) {
    var pctColor = pct === null ? 'var(--color-text-secondary)' :
      pct >= 100 ? 'var(--color-positive)' :
      pct >= 70  ? 'var(--color-warning)'  : 'var(--color-negative)';

    return '<div class="country-header-card">' +
      '<div class="country-header-name">' + _esc(country) + '</div>' +
      '<div class="country-header-metrics">' +
        '<div class="country-header-metric">' +
          '<span class="country-header-metric-label">Kesinleşen</span>' +
          '<span class="country-header-metric-value">' + fmtEuro(confirmed, true) + '</span>' +
        '</div>' +
        '<div class="country-header-metric">' +
          '<span class="country-header-metric-label">Beklenen</span>' +
          '<span class="country-header-metric-value" style="color:var(--color-accent)">' + fmtEuro(expected, true) + '</span>' +
        '</div>' +
        '<div class="country-header-metric">' +
          '<span class="country-header-metric-label">Hedef%</span>' +
          '<span class="country-header-metric-value" style="color:' + pctColor + '">' + fmtPct(pct) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _buildCustomerGrid(customers) {
    var cards = customers.map(function(c) {
      var custOrders = _state.orders.filter(function(o) { return o.customer_id === c.id; });
      var confirmed = 0, expected = 0;
      custOrders.forEach(function(o) {
        var p = _state.productMap[o.product_id];
        if (!p) return;
        var price = parseNum(p.avg_price_eur) || 0;
        confirmed += (parseNum(o.shipped_qty) || 0) * price;
        expected  += ((parseNum(o.shipped_qty) || 0) + (parseNum(o.planned_qty) || 0)) * price;
      });

      var tgtKey = c.id + '_' + _state.currentMonth + '_' + _state.currentYear;
      var target = _state.targetMap[tgtKey];
      var targetEur = target ? parseNum(target.target_eur) : null;
      var pct = calcTargetPct(expected, targetEur);
      var pctCapped = pct !== null ? Math.min(pct, 100) : 0;
      var colorClass = pctColorClass(pct);
      var fillColor = colorClass === 'positive' ? 'var(--color-positive)' :
                     colorClass === 'warning'  ? 'var(--color-warning)'  :
                     colorClass === 'negative' ? 'var(--color-negative)' : 'var(--color-border)';

      return '<div class="country-customer-card" data-customer-id="' + c.id + '">' +
        '<div class="country-customer-card-header">' +
          '<span class="country-customer-card-name">' + _esc(c.name) + '</span>' +
          '<span class="badge badge-' + colorClass + '">' + fmtPct(pct) + '</span>' +
        '</div>' +
        '<div class="country-customer-card-body">' +
          '<div class="country-customer-row">' +
            '<span class="country-customer-row-label">Kesinleşen</span>' +
            '<span class="country-customer-row-value">' + fmtEuro(confirmed) + '</span>' +
          '</div>' +
          '<div class="country-customer-row">' +
            '<span class="country-customer-row-label">Beklenen</span>' +
            '<span class="country-customer-row-value" style="color:var(--color-accent)">' + fmtEuro(expected) + '</span>' +
          '</div>' +
          '<div class="country-customer-row">' +
            '<span class="country-customer-row-label">Hedef</span>' +
            '<span class="country-customer-row-value">' + (targetEur !== null ? fmtEuro(targetEur) : '—') + '</span>' +
          '</div>' +
          '<div class="country-mini-progress">' +
            '<div class="country-mini-fill" style="width:' + pctCapped + '%;background:' + fillColor + '"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="country-customer-grid">' + cards + '</div>';
  }

  function _bindScreenEvents() {
    var backBtn = document.getElementById('country-back-btn');
    if (backBtn) backBtn.addEventListener('click', function() { window.history.back(); });

    document.querySelectorAll('.country-customer-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var id = card.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });
  }

  function _bindGlobalEvents() {
    document.addEventListener('nsdata:dataChanged', function() {
      if (document.getElementById('screen-country').classList.contains('active') && _state.countryId) {
        _loadAll(_state.countryId).then(_render);
      }
    });

    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'country') {
        var params = new URLSearchParams(window.location.search);
        var id = params.get('id');
        if (id) _loadAll(id).then(_render);
      }
    });
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
