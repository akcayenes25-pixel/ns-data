/* NSDATA - screen-customer.js */
/* Customer detail panel */

(function() {
  'use strict';

  var CHART_COLORS = ['#4F46E5','#16A34A','#D97706','#DC2626','#0891B2','#7C3AED'];

  var _state = {
    customerId: null,
    customer: null,
    orders: [],
    products: [],
    productMap: {},
    targets: [],
    targetMap: {},
    limits: [],
    payments: [],
    currentMonth: null,
    currentYear: null
  };

  document.addEventListener('nsdata:appReady', function() {
    var my = currentMonthYear();
    _state.currentMonth = my.month;
    _state.currentYear  = my.year;
    _bindGlobalEvents();
  });

  async function _loadAll(customerId) {
    _state.customerId = customerId;
    var results = await Promise.all([
      dbGetOrders(),
      dbGetProducts(),
      dbGetCustomers(),
      dbGetTargets(),
      dbGetLimits(),
      dbGetPayments()
    ]);
    _state.orders    = results[0];
    _state.products  = results[1];
    var customers    = results[2];
    _state.targets   = results[3];
    _state.limits    = results[4];
    _state.payments  = results[5];
    _state.productMap = buildProductMap(_state.products);
    _state.targetMap  = buildTargetMap(_state.targets);
    _state.customer   = customers.find(function(c) { return c.id === customerId; }) || null;
  }

  function _render() {
    var screen = document.getElementById('screen-customer');
    if (!screen || !_state.customer) {
      if (screen) screen.innerHTML = '<div class="empty-state"><div class="empty-state-title">Musteri bulunamadi</div></div>';
      return;
    }
    screen.innerHTML = _buildHTML();
    _bindScreenEvents();
  }

  function _buildHTML() {
    var c         = _state.customer;
    var custOrders = _state.orders.filter(function(o) { return o.customer_id === c.id; });
    var tgtKey    = c.id + '_' + _state.currentMonth + '_' + _state.currentYear;
    var target    = _state.targetMap[tgtKey];
    var targetEur = target ? parseNum(target.target_eur) : null;

    var confirmed = 0, expected = 0;
    custOrders.forEach(function(o) {
      var p = _state.productMap[o.product_id];
      if (!p) return;
      var price   = parseNum(p.avg_price_eur) || 0;
      var shipped = parseNum(o.shipped_qty)   || 0;
      var planned = parseNum(o.planned_qty)   || 0;
      confirmed  += shipped * price;
      expected   += (shipped + planned) * price;
    });

    var pct       = calcTargetPct(expected, targetEur);
    var colorClass = pctColorClass(pct);
    var pctCapped  = pct !== null ? Math.min(pct, 100) : 0;

    var lim         = _state.limits.find(function(l) { return l.customer_id === c.id; }) || {};
    var plannedEuro = calcCustomerPlannedEuro(_state.orders, c.id, _state.productMap);
    var custPayments = _state.payments.filter(function(p) { return p.customer_id === c.id; });
    var conservative = calcConservativeLimit(lim.total_limit_eur, lim.open_balance_eur, plannedEuro);
    var optimistic   = calcOptimisticLimit(lim.total_limit_eur, lim.open_balance_eur, plannedEuro, custPayments, _state.currentMonth, _state.currentYear);

    return _buildBackBar() +
      _buildHeaderCard(c, pct, pctCapped, colorClass, targetEur) +
      _buildMetricsRow(confirmed, expected, targetEur, plannedEuro) +
      _buildTwoCol(custOrders, conservative, optimistic) +
      _buildNotesCard(custOrders);
  }

  function _buildBackBar() {
    return '<div class="customer-back-bar">' +
      '<button class="customer-back-btn" id="customer-back-btn">&#x2190; Geri</button>' +
      '<div class="customer-breadcrumb">' +
        '<span>Dashboard</span>' +
        '<span>›</span>' +
        '<span class="customer-breadcrumb-current">' + _esc(_state.customer ? _state.customer.name : '') + '</span>' +
      '</div>' +
    '</div>';
  }

  function _buildHeaderCard(c, pct, pctCapped, colorClass, targetEur) {
    var fillColor = colorClass === 'positive' ? 'var(--color-positive)' :
                   colorClass === 'warning'  ? 'var(--color-warning)'  :
                   colorClass === 'negative' ? 'var(--color-negative)' : 'var(--color-border)';

    var pctColor  = colorClass === 'positive' ? 'var(--color-positive)' :
                   colorClass === 'warning'  ? 'var(--color-warning)'  :
                   colorClass === 'negative' ? 'var(--color-negative)' : 'var(--color-text-secondary)';

    return '<div class="customer-header-card">' +
      '<div class="customer-header-left">' +
        '<div class="customer-header-name">' +
          _esc(c.name) +
          (isLimitCritical(0, 0) ? '' : '') +
        '</div>' +
        '<div class="customer-header-country" id="customer-country-btn" data-country="' + _esc(c.country || '') + '">' +
          '<span>&#x1F30D;</span> ' + _esc(c.country || 'Ulke yok') +
        '</div>' +
      '</div>' +
      '<div class="customer-header-right">' +
        '<div class="customer-target-pct" style="color:' + pctColor + '">' + fmtPct(pct) + '</div>' +
        '<div class="customer-target-label">Hedef: ' + (targetEur !== null ? fmtEuro(targetEur) : '—') + '</div>' +
        '<div class="customer-header-progress">' +
          '<div class="customer-header-progress-fill" style="width:' + pctCapped + '%;background:' + fillColor + '"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _buildMetricsRow(confirmed, expected, targetEur, plannedEuro) {
    var remaining = targetEur !== null ? Math.max(0, targetEur - expected) : null;

    return '<div class="customer-metrics-row">' +
      '<div class="customer-metric-card">' +
        '<span class="customer-metric-label">Kesinlesen Ciro</span>' +
        '<span class="customer-metric-value">' + fmtEuro(confirmed) + '</span>' +
      '</div>' +
      '<div class="customer-metric-card">' +
        '<span class="customer-metric-label">Beklenen Ciro</span>' +
        '<span class="customer-metric-value accent">' + fmtEuro(expected) + '</span>' +
      '</div>' +
      '<div class="customer-metric-card">' +
        '<span class="customer-metric-label">Planlanan Cikis</span>' +
        '<span class="customer-metric-value">' + fmtEuro(plannedEuro) + '</span>' +
      '</div>' +
      '<div class="customer-metric-card">' +
        '<span class="customer-metric-label">Hedefe Kalan</span>' +
        '<span class="customer-metric-value ' + (remaining !== null && remaining > 0 ? 'warning' : 'positive') + '">' +
          (remaining !== null ? fmtEuro(remaining) : '—') +
        '</span>' +
      '</div>' +
    '</div>';
  }

  function _buildTwoCol(custOrders, conservative, optimistic) {
    return '<div class="customer-two-col">' +
      _buildProductBreakdown(custOrders) +
      _buildDonutAndLimit(custOrders, conservative, optimistic) +
    '</div>';
  }

  function _buildProductBreakdown(custOrders) {
    var rows = _state.products.map(function(p) {
      var order   = custOrders.find(function(o) { return o.product_id === p.id; });
      var price   = parseNum(p.avg_price_eur) || 0;
      var shipped = order ? (parseNum(order.shipped_qty) || 0) : 0;
      var planned = order ? (parseNum(order.planned_qty) || 0) : 0;
      var conf    = shipped * price;
      var exp     = (shipped + planned) * price;
      if (conf === 0 && exp === 0) return '';

      return '<tr data-product-id="' + p.id + '">' +
        '<td style="font-weight:600">' + _esc(p.name) + '</td>' +
        '<td style="text-align:right">' + fmtQty(shipped) + '</td>' +
        '<td style="text-align:right">' + fmtQty(planned) + '</td>' +
        '<td style="text-align:right;font-weight:700">' + fmtEuro(conf) + '</td>' +
        '<td style="text-align:right;color:var(--color-accent);opacity:.85;font-weight:700">' + fmtEuro(exp) + '</td>' +
      '</tr>';
    }).filter(Boolean).join('');

    return '<div class="customer-section-card">' +
      '<div class="customer-section-header">Urun Bazli Dagilim</div>' +
      '<table class="customer-product-table">' +
        '<thead><tr>' +
          '<th>URUN</th><th style="text-align:right">CIKAN</th><th style="text-align:right">CIKACAK</th>' +
          '<th style="text-align:right">KESINLESEN</th><th style="text-align:right">BEKLENEN</th>' +
        '</tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;padding:24px;color:#4A5068">Veri yok</td></tr>') + '</tbody>' +
      '</table>' +
    '</div>';
  }

  function _buildDonutAndLimit(custOrders, conservative, optimistic) {
    var total = 0;
    var slices = _state.products.map(function(p, i) {
      var order = custOrders.find(function(o) { return o.product_id === p.id; });
      var price = parseNum(p.avg_price_eur) || 0;
      var shipped = order ? (parseNum(order.shipped_qty) || 0) : 0;
      var planned = order ? (parseNum(order.planned_qty) || 0) : 0;
      var val = (shipped + planned) * price;
      total += val;
      return { name: p.name, value: val, color: CHART_COLORS[i % CHART_COLORS.length], product_id: p.id };
    }).filter(function(s) { return s.value > 0; });

    var cx = 80, cy = 80, r = 60, innerR = 34;
    var startAngle = -Math.PI / 2;
    var paths = '';
    var legend = '';

    slices.forEach(function(s) {
      var pct   = total > 0 ? s.value / total : 0;
      var angle = pct * 2 * Math.PI;
      if (pct < 0.001) return;
      var endAngle = startAngle + angle;
      var x1 = cx + r * Math.cos(startAngle);
      var y1 = cy + r * Math.sin(startAngle);
      var x2 = cx + r * Math.cos(endAngle);
      var y2 = cy + r * Math.sin(endAngle);
      var ix1 = cx + innerR * Math.cos(startAngle);
      var iy1 = cy + innerR * Math.sin(startAngle);
      var ix2 = cx + innerR * Math.cos(endAngle);
      var iy2 = cy + innerR * Math.sin(endAngle);
      var large = angle > Math.PI ? 1 : 0;
      paths += '<path d="M ' + ix1 + ' ' + iy1 + ' L ' + x1 + ' ' + y1 +
        ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 +
        ' L ' + ix2 + ' ' + iy2 + ' A ' + innerR + ' ' + innerR + ' 0 ' + large + ' 0 ' + ix1 + ' ' + iy1 + ' Z"' +
        ' fill="' + s.color + '" data-product-id="' + s.product_id + '" style="cursor:pointer" />';
      legend += '<div class="customer-donut-legend-item" data-product-id="' + s.product_id + '">' +
        '<span class="customer-donut-legend-dot" style="background:' + s.color + '"></span>' +
        '<span class="customer-donut-legend-name">' + _esc(s.name) + '</span>' +
        '<span class="customer-donut-legend-pct">' + Math.round(pct * 100) + '%</span>' +
      '</div>';
      startAngle = endAngle;
    });

    var svg = '<svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">' +
      paths +
      '<text x="80" y="76" text-anchor="middle" font-size="10" font-weight="700" fill="#4A5068" font-family="Inter,sans-serif">Toplam</text>' +
      '<text x="80" y="90" text-anchor="middle" font-size="12" font-weight="800" fill="#0F1117" font-family="Inter,sans-serif">' + fmtEuro(total, true) + '</text>' +
    '</svg>';

    var consClass = conservative !== null && conservative <= 0 ? 'negative' : 'positive';
    var optClass  = optimistic  !== null && optimistic  <= 0 ? 'negative' : 'accent';

    return '<div style="display:flex;flex-direction:column;gap:var(--space-5)">' +
      '<div class="customer-section-card">' +
        '<div class="customer-section-header">Urun Karmas&#x131;</div>' +
        '<div class="customer-donut-wrap">' +
          svg +
          '<div class="customer-donut-legend">' + legend + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="customer-section-card">' +
        '<div class="customer-section-header">Limit Durumu</div>' +
        '<div class="customer-limit-row">' +
          '<div class="customer-limit-box conservative">' +
            '<span class="customer-limit-label">Su an kullanilabilir</span>' +
            '<span class="customer-limit-value ' + consClass + '">' + (conservative !== null ? fmtEuro(conservative) : '\u2014') + '</span>' +
          '</div>' +
          '<div class="customer-limit-box optimistic">' +
            '<span class="customer-limit-label">Odeme gelince</span>' +
            '<span class="customer-limit-value ' + optClass + '">' + (optimistic !== null ? fmtEuro(optimistic) : '\u2014') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _buildNotesCard(custOrders) {
    var notesHtml = '';
    custOrders.forEach(function(o) {
      if (!o.note || !o.note.trim()) return;
      var p = _state.productMap[o.product_id];
      notesHtml += '<div class="customer-note-row">' +
        '<span class="customer-note-product">' + _esc(p ? p.name : '?') + '</span>' +
        '<span class="customer-note-text">' + _esc(o.note) + '</span>' +
      '</div>';
    });

    return '<div class="customer-section-card">' +
      '<div class="customer-section-header">Notlar</div>' +
      (notesHtml
        ? '<div class="customer-notes-list">' + notesHtml + '</div>'
        : '<div class="customer-notes-empty">Bu musteri icin not yok</div>') +
    '</div>';
  }

  function _bindScreenEvents() {
    var backBtn = document.getElementById('customer-back-btn');
    if (backBtn) backBtn.addEventListener('click', function() { window.history.back(); });

    var countryBtn = document.getElementById('customer-country-btn');
    if (countryBtn) {
      countryBtn.addEventListener('click', function() {
        var country = countryBtn.getAttribute('data-country');
        if (country) navigateTo('country', { id: country });
      });
    }

    document.querySelectorAll('[data-product-id]').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.getAttribute('data-product-id');
        if (id) navigateTo('product', { id: id });
      });
    });
  }

  function _bindGlobalEvents() {
    document.addEventListener('nsdata:dataChanged', function(e) {
      if (document.getElementById('screen-customer').classList.contains('active') && _state.customerId) {
        _loadAll(_state.customerId).then(_render);
      }
    });

    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'customer') {
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
