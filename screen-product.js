/* NSDATA - screen-product.js */
/* Product detail panel */

(function() {
  'use strict';

  var _state = {
    productId: null,
    orders: [],
    products: [],
    customers: [],
    productMap: {},
    customerMap: {},
    currentMonth: null,
    currentYear: null
  };

  document.addEventListener('nsdata:appReady', function() {
    var my = currentMonthYear();
    _state.currentMonth = my.month;
    _state.currentYear  = my.year;
    _bindGlobalEvents();
  });

  async function _loadAll(productId) {
    _state.productId = productId;
    var results = await Promise.all([
      dbGetOrders(), dbGetProducts(), dbGetCustomers()
    ]);
    _state.orders    = results[0];
    _state.products  = results[1];
    _state.customers = results[2];
    _state.productMap  = buildProductMap(_state.products);
    _state.customerMap = buildCustomerMap(_state.customers);
  }

  function _render() {
    var screen = document.getElementById('screen-product');
    if (!screen) return;

    var product = _state.productMap[_state.productId];
    if (!product) {
      screen.innerHTML = '<div class="empty-state"><div class="empty-state-title">Ürün bulunamadı</div></div>';
      return;
    }

    var productOrders = _state.orders.filter(function(o) { return o.product_id === product.id; });
    var price = parseNum(product.avg_price_eur) || 0;

    var totalShipped = 0, totalPlanned = 0;
    productOrders.forEach(function(o) {
      totalShipped += parseNum(o.shipped_qty) || 0;
      totalPlanned += parseNum(o.planned_qty) || 0;
    });

    var confirmed = totalShipped * price;
    var expected  = (totalShipped + totalPlanned) * price;
    var ratio     = parseNum(product.container_ratio);
    var containers = ratio ? (totalShipped + totalPlanned) / ratio : null;

    screen.innerHTML =
      _buildBackBar() +
      _buildHeaderCard(product, confirmed, expected, containers, price) +
      _buildTwoCol(productOrders, product);

    _bindScreenEvents();
  }

  function _buildBackBar() {
    var product = _state.productMap[_state.productId];
    return '<div class="product-back-bar">' +
      '<button class="product-back-btn" id="product-back-btn">&#x2190; Geri</button>' +
      '<div class="product-breadcrumb">' +
        '<span>Dashboard</span><span>›</span>' +
        '<span class="product-breadcrumb-current">' + _esc(product ? product.name : '') + '</span>' +
      '</div>' +
    '</div>';
  }

  function _buildHeaderCard(product, confirmed, expected, containers, price) {
    return '<div class="product-header-card">' +
      '<div>' +
        '<div class="product-header-name">' + _esc(product.name) + '</div>' +
        '<div class="product-header-price">Ort. Fiyat: ' + fmtEuro(price) + ' / adet</div>' +
      '</div>' +
      '<div class="product-header-metrics">' +
        '<div class="product-header-metric">' +
          '<span class="product-header-metric-label">Kesinle&#x15F;en</span>' +
          '<span class="product-header-metric-value">' + fmtEuro(confirmed, true) + '</span>' +
        '</div>' +
        '<div class="product-header-metric">' +
          '<span class="product-header-metric-label">Beklenen</span>' +
          '<span class="product-header-metric-value" style="color:var(--color-accent)">' + fmtEuro(expected, true) + '</span>' +
        '</div>' +
        '<div class="product-header-metric">' +
          '<span class="product-header-metric-label">Konteyner</span>' +
          '<span class="product-header-metric-value">' + (containers !== null ? fmtQty(containers) : '—') + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _buildTwoCol(productOrders, product) {
    return '<div class="product-two-col">' +
      _buildCustomerRanking(productOrders, product) +
      _buildCountryBreakdown(productOrders, product) +
    '</div>';
  }

  function _buildCustomerRanking(productOrders, product) {
    var price = parseNum(product.avg_price_eur) || 0;

    var ranked = productOrders.map(function(o) {
      var c = _state.customerMap[o.customer_id];
      if (!c) return null;
      var shipped = parseNum(o.shipped_qty) || 0;
      var planned = parseNum(o.planned_qty) || 0;
      var expected = (shipped + planned) * price;
      return { customer: c, expected: expected, shipped: shipped, planned: planned };
    }).filter(Boolean).sort(function(a, b) { return b.expected - a.expected; });

    var rows = ranked.map(function(r, i) {
      return '<tr data-customer-id="' + r.customer.id + '">' +
        '<td style="color:var(--color-text-secondary);width:28px">' + (i + 1) + '</td>' +
        '<td style="font-weight:600">' + _esc(r.customer.name) + '</td>' +
        '<td style="text-align:right">' + fmtQty(r.shipped) + '</td>' +
        '<td style="text-align:right">' + fmtQty(r.planned) + '</td>' +
        '<td style="text-align:right;font-weight:700;color:var(--color-accent)">' + fmtEuro(r.expected) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="product-section-card">' +
      '<div class="product-section-header">Müşteri Sıralaması</div>' +
      '<table class="product-customer-table">' +
        '<thead><tr>' +
          '<th>#</th><th>M&#xFC;&#x15F;teri</th><th style="text-align:right">&#xC7;&#x131;kan</th>' +
          '<th style="text-align:right">&#xC7;&#x131;kacak</th><th style="text-align:right">BEKLENEN</th>' +
        '</tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;padding:24px;color:#4A5068">Veri yok</td></tr>') + '</tbody>' +
      '</table>' +
    '</div>';
  }

  function _buildCountryBreakdown(productOrders, product) {
    var price = parseNum(product.avg_price_eur) || 0;
    var countryMap = {};

    productOrders.forEach(function(o) {
      var c = _state.customerMap[o.customer_id];
      if (!c) return;
      var country  = c.country || 'Diger';
      var shipped  = parseNum(o.shipped_qty) || 0;
      var planned  = parseNum(o.planned_qty) || 0;
      var expected = (shipped + planned) * price;
      if (!countryMap[country]) countryMap[country] = 0;
      countryMap[country] += expected;
    });

    var total = Object.values(countryMap).reduce(function(s, v) { return s + v; }, 1);

    var rows = Object.keys(countryMap).sort(function(a, b) {
      return countryMap[b] - countryMap[a];
    }).map(function(country, i) {
      var val = countryMap[country];
      var pct = Math.round(val / total * 100);
      return '<tr data-country="' + _esc(country) + '">' +
        '<td style="color:var(--color-text-secondary);width:28px">' + (i + 1) + '</td>' +
        '<td style="font-weight:600">' + _esc(country) + '</td>' +
        '<td>' +
          '<div style="height:8px;background:#F1F3F9;border-radius:99px;width:100px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:var(--color-accent);border-radius:99px"></div>' +
          '</div>' +
        '</td>' +
        '<td style="text-align:right;font-weight:700">' + fmtEuro(val, true) + '</td>' +
        '<td style="text-align:right;color:var(--color-text-secondary)">' + pct + '%</td>' +
      '</tr>';
    }).join('');

    return '<div class="product-section-card">' +
      '<div class="product-section-header">Ülke Dağılımı</div>' +
      '<table class="product-country-table">' +
        '<thead><tr>' +
          '<th>#</th><th>&#xDC;lke</th><th>PAY</th><th style="text-align:right">BEKLENEN</th><th style="text-align:right">%</th>' +
        '</tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;padding:24px;color:#4A5068">Veri yok</td></tr>') + '</tbody>' +
      '</table>' +
    '</div>';
  }

  function _bindScreenEvents() {
    var backBtn = document.getElementById('product-back-btn');
    if (backBtn) backBtn.addEventListener('click', function() { window.history.back(); });

    document.querySelectorAll('.product-customer-table tr[data-customer-id]').forEach(function(row) {
      row.addEventListener('click', function() {
        var id = row.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });

    document.querySelectorAll('.product-country-table tr[data-country]').forEach(function(row) {
      row.addEventListener('click', function() {
        var country = row.getAttribute('data-country');
        if (country) navigateTo('country', { id: country });
      });
    });
  }

  function _bindGlobalEvents() {
    document.addEventListener('nsdata:dataChanged', function() {
      if (document.getElementById('screen-product').classList.contains('active') && _state.productId) {
        _loadAll(_state.productId).then(_render);
      }
    });

    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'product') {
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
