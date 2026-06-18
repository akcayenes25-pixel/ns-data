/* NSDATA - screen-analysis.js */
/* Analysis screen — pure SVG charts, no external chart library */

(function() {
  'use strict';

  var CHART_COLORS = [
    '#4F46E5', '#16A34A', '#D97706', '#DC2626',
    '#0891B2', '#7C3AED', '#DB2777', '#059669',
    '#EA580C', '#2563EB'
  ];

  /* ============================================================
     STATE
     ============================================================ */

  var _state = {
    orders: [],
    products: [],
    customers: [],
    targets: [],
    productMap: {},
    customerMap: {},
    targetMap: {},
    detailVisible: false,
    currentMonth: null,
    currentYear: null
  };

  var _tooltip = null;

  /* ============================================================
     INIT
     ============================================================ */

  document.addEventListener('nsdata:appReady', function() {
    _init();
  });

  async function _init() {
    var my = currentMonthYear();
    _state.currentMonth = my.month;
    _state.currentYear  = my.year;
    await _loadAll();
    _injectTooltip();
    _bindGlobalEvents();
  }

  async function _loadAll() {
    var results = await Promise.all([
      dbGetOrders(getActivePeriod().month, getActivePeriod().year),
      dbGetProducts(),
      dbGetCustomers(),
      dbGetTargets()
    ]);
    _state.orders    = results[0];
    _state.products  = results[1];
    _state.customers = results[2];
    _state.targets   = results[3];
    _state.productMap  = buildProductMap(_state.products);
    _state.customerMap = buildCustomerMap(_state.customers);
    _state.targetMap   = buildTargetMap(_state.targets);
  }

  /* ============================================================
     RENDER
     ============================================================ */

  function _render() {
    var screen = document.getElementById('screen-analysis');
    if (!screen) return;

    var customerSummaries = calcCustomerSummaries(_state.orders, _state.productMap);
    var productSummaries  = calcProductSummaries(_state.orders, _state.productMap);
    var totals            = calcGrandTotals(_state.orders, _state.productMap);
    var totalTarget       = _totalTargetEuro();
    var pct               = calcTargetPct(totals.expected_eur, totalTarget);

    screen.innerHTML =
      _buildToolbar() +
      _buildScenarioRow(totals, totalTarget, pct) +
      _buildMainGrid(customerSummaries, productSummaries) +
      _buildDetailToggle() +
      _buildDetailSection(customerSummaries, productSummaries);

    _bindScreenEvents();
  }

  /* ============================================================
     TOOLBAR
     ============================================================ */

  function _buildToolbar() {
    return '<div class="analysis-toolbar">' +
      '<span class="analysis-toolbar-title">Analiz</span>' +
      '<button class="btn btn-secondary" id="analysis-export-pdf">PDF rapor al</button>' +
    '</div>';
  }

  /* ============================================================
     SCENARIO ROW
     ============================================================ */

  function _buildScenarioRow(totals, totalTarget, pct) {
    var status = scenarioStatus(pct);
    var pctColor = {
      'achieved': 'var(--color-positive)',
      'on-track': 'var(--color-accent)',
      'at-risk':  'var(--color-warning)',
      'critical': 'var(--color-negative)',
      'unknown':  'var(--color-text-secondary)'
    }[status];

    return '<div class="analysis-scenario-row">' +
      '<div class="analysis-scenario-card">' +
        '<span class="analysis-scenario-label">Kesinleşen Ciro</span>' +
        '<span class="analysis-scenario-value" style="color:var(--color-text-primary)">' + fmtEuro(totals.confirmed_eur, true) + '</span>' +
        '<span class="analysis-scenario-sub">Sevk edilmiş</span>' +
      '</div>' +
      '<div class="analysis-scenario-card">' +
        '<span class="analysis-scenario-label">Ay Sonu Öngörüsü</span>' +
        '<span class="analysis-scenario-value" style="color:var(--color-accent);opacity:0.85">' + fmtEuro(totals.expected_eur, true) + '</span>' +
        '<span class="analysis-scenario-sub">Kesinleşen + Planlanan</span>' +
      '</div>' +
      '<div class="analysis-scenario-card">' +
        '<span class="analysis-scenario-label">Bütçe Yüzdesi</span>' +
        '<span class="analysis-scenario-value" style="color:' + pctColor + '">' + fmtPct(pct) + '</span>' +
        '<span class="analysis-scenario-sub">Hedef: ' + fmtEuro(totalTarget, true) + '</span>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     MAIN GRID (5 default charts)
     ============================================================ */

  function _buildMainGrid(customerSummaries, productSummaries) {
    return '<div class="analysis-main-grid">' +
      _buildCustomerBarCard(customerSummaries) +
      _buildProductDonutCard(productSummaries) +
      _buildHeatmapCard(customerSummaries) +
    '</div>';
  }

  /* ============================================================
     CHART 1 — Customer bar (horizontal)
     ============================================================ */

  function _buildCustomerBarCard(summaries) {
    var sorted = summaries.slice().sort(function(a, b) {
      return (b.expected_eur || 0) - (a.expected_eur || 0);
    }).slice(0, 10);

    var maxVal = sorted.reduce(function(m, s) { return Math.max(m, s.expected_eur || 0); }, 1);

    var svgHeight = Math.max(sorted.length * 52 + 20, 100);
    var svgWidth  = 600;
    var barMaxW   = 380;
    var labelW    = 160;
    var valueW    = 55;

    var bars = sorted.map(function(s, i) {
      var c    = _state.customerMap[s.customer_id];
      var name = c ? _truncate(c.name, 22) : '?';
      var val  = s.expected_eur || 0;
      var conf = s.confirmed_eur || 0;
      var barW = maxVal > 0 ? (val / maxVal) * barMaxW : 0;
      var confW = maxVal > 0 ? (conf / maxVal) * barMaxW : 0;
      var y    = i * 52 + 10;
      var tgtKey = (c ? c.id : '') + '_' + _state.currentMonth + '_' + _state.currentYear;
      var target = _state.targetMap[tgtKey];
      var pct    = calcTargetPct(val, target ? target.target_eur : null);
      var color  = pctColor(pct);

      return '<g class="analysis-bar-group" data-customer-id="' + (c ? c.id : '') + '" style="cursor:pointer">' +
        // Background
        '<rect x="' + labelW + '" y="' + (y + 4) + '" width="' + barMaxW + '" height="32" rx="4" fill="#F1F3F9" />' +
        // Expected bar
        '<rect class="analysis-bar-rect" x="' + labelW + '" y="' + (y + 4) + '" width="' + barW + '" height="32" rx="4" fill="' + color + '" opacity="0.25" />' +
        // Confirmed bar
        '<rect class="analysis-bar-rect" x="' + labelW + '" y="' + (y + 4) + '" width="' + confW + '" height="32" rx="4" fill="' + color + '" />' +
        // Label
        '<text class="analysis-bar-label" x="' + (labelW - 8) + '" y="' + (y + 25) + '" text-anchor="end">' + _escSvg(name) + '</text>' +
        // Value
        '<text class="analysis-bar-value" x="' + (labelW + barW + 6) + '" y="' + (y + 25) + '">' + fmtEuro(val, true) + '</text>' +
      '</g>';
    }).join('');

    var svg = '<svg class="analysis-bar-chart" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Müşteri ciro siralaması">' +
      bars +
    '</svg>';

    return '<div class="analysis-chart-card">' +
      '<div class="analysis-chart-header">' +
        '<span class="analysis-chart-title">Müşteri Bazlı Ciro (Beklenen)</span>' +
        '<button class="analysis-chart-download" id="analysis-dl-customers" aria-label="İndir">⇩</button>' +
      '</div>' +
      '<div class="analysis-chart-body">' + svg + '</div>' +
    '</div>';
  }

  /* ============================================================
     CHART 2 — Product donut
     ============================================================ */

  function _buildProductDonutCard(summaries) {
    var total = summaries.reduce(function(s, p) { return s + (p.expected_eur || 0); }, 0);

    var cx = 90, cy = 90, r = 70, innerR = 40;
    var startAngle = -Math.PI / 2;
    var paths = '';
    var legend = '';

    summaries.forEach(function(s, i) {
      var product = _state.productMap[s.product_id];
      var name    = product ? product.name : '?';
      var val     = s.expected_eur || 0;
      var pct     = total > 0 ? val / total : 0;
      var angle   = pct * 2 * Math.PI;
      var color   = CHART_COLORS[i % CHART_COLORS.length];

      if (pct < 0.001) {
        legend += '<div class="analysis-legend-item">' +
          '<span class="analysis-legend-dot" style="background:' + color + '"></span>' +
          '<span class="analysis-legend-label">' + _escHtml(name) + '</span>' +
          '<span class="analysis-legend-pct">0%</span>' +
        '</div>';
        return;
      }

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
        ' L ' + ix2 + ' ' + iy2 +
        ' A ' + innerR + ' ' + innerR + ' 0 ' + large + ' 0 ' + ix1 + ' ' + iy1 + ' Z"' +
        ' fill="' + color + '" class="analysis-bar-rect"' +
        ' data-product-id="' + s.product_id + '"' +
        ' style="cursor:pointer" />';

      legend += '<div class="analysis-legend-item" data-product-id="' + s.product_id + '">' +
        '<span class="analysis-legend-dot" style="background:' + color + '"></span>' +
        '<span class="analysis-legend-label">' + _escHtml(name) + '</span>' +
        '<span class="analysis-legend-pct">' + Math.round(pct * 100) + '%</span>' +
      '</div>';

      startAngle = endAngle;
    });

    var svg = '<svg class="analysis-donut-svg" width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ürün dagılımı">' +
      paths +
      '<text x="90" y="86" text-anchor="middle" font-size="12" font-weight="700" fill="#4A5068" font-family="Inter,sans-serif">Toplam</text>' +
      '<text x="90" y="100" text-anchor="middle" font-size="14" font-weight="800" fill="#0F1117" font-family="Inter,sans-serif">' + fmtEuro(total, true) + '</text>' +
    '</svg>';

    return '<div class="analysis-chart-card">' +
      '<div class="analysis-chart-header">' +
        '<span class="analysis-chart-title">Ürün Dağılımı</span>' +
        '<button class="analysis-chart-download" id="analysis-dl-products" aria-label="İndir">⇩</button>' +
      '</div>' +
      '<div class="analysis-chart-body">' +
        '<div class="analysis-donut-wrap">' +
          svg +
          '<div class="analysis-donut-legend">' + legend + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     CHART 3 — Customer heatmap
     ============================================================ */

  function _buildHeatmapCard(summaries) {
    var total = summaries.reduce(function(s, c) { return s + (c.expected_eur || 0); }, 1);

    var cells = summaries.map(function(s) {
      var c   = _state.customerMap[s.customer_id];
      if (!c) return '';
      var tgtKey = c.id + '_' + _state.currentMonth + '_' + _state.currentYear;
      var target = _state.targetMap[tgtKey];
      var pct    = calcTargetPct(s.expected_eur, target ? target.target_eur : null);
      var bgColor = pctColor(pct);

      // Size based on share of total
      var share = total > 0 ? (s.expected_eur || 0) / total : 0;
      var minPx = 100;
      var maxPx = 260;
      var cellW  = Math.round(minPx + share * (maxPx - minPx));

      return '<div class="analysis-heatmap-cell" ' +
        'style="background:' + bgColor + ';width:' + cellW + 'px;' +
        'flex-grow:' + (share * 10).toFixed(2) + '" ' +
        'data-customer-id="' + c.id + '" ' +
        'role="button" tabindex="0" ' +
        'aria-label="' + _escHtml(c.name) + ' ' + fmtPct(pct) + '">' +
        '<div class="analysis-heatmap-pct">' + (pct !== null ? Math.round(pct) + '%' : '—') + '</div>' +
        '<div class="analysis-heatmap-name">' + _escHtml(_truncate(c.name, 18)) + '</div>' +
      '</div>';
    }).join('');

    return '<div class="analysis-chart-card">' +
      '<div class="analysis-chart-header">' +
        '<span class="analysis-chart-title">Müşteri Hedef Isı Haritası</span>' +
        '<span style="font-size:12px;color:var(--color-text-secondary)">Boyut=Ciro &nbsp; Renk=Hedef%</span>' +
      '</div>' +
      '<div class="analysis-chart-body">' +
        '<div class="analysis-heatmap-grid">' + cells + '</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     DETAIL TOGGLE
     ============================================================ */

  function _buildDetailToggle() {
    return '<button class="analysis-detail-toggle" id="analysis-detail-toggle">' +
      '<span>' + (_state.detailVisible ? '▲' : '▼') + '</span>' +
      '<span>' + (_state.detailVisible ? 'Daha az göster' : 'Daha fazla göster') + '</span>' +
    '</button>';
  }

  /* ============================================================
     DETAIL SECTION (hidden by default)
     ============================================================ */

  function _buildDetailSection(customerSummaries, productSummaries) {
    var visClass = _state.detailVisible ? 'visible' : '';
    return '<div class="analysis-detail-section ' + visClass + '" id="analysis-detail-section">' +
      '<div class="analysis-detail-grid">' +
        _buildCountryCard(customerSummaries) +
        _buildRankingCard(customerSummaries) +
      '</div>' +
    '</div>';
  }

  function _buildCountryCard(customerSummaries) {
    // Group by country
    var countryMap = {};
    customerSummaries.forEach(function(s) {
      var c = _state.customerMap[s.customer_id];
      if (!c) return;
      var country = c.country || 'Diğer';
      if (!countryMap[country]) countryMap[country] = 0;
      countryMap[country] += s.expected_eur || 0;
    });

    var countries = Object.keys(countryMap).sort(function(a, b) {
      return countryMap[b] - countryMap[a];
    });

    var total = countries.reduce(function(s, c) { return s + countryMap[c]; }, 1);

    var rows = countries.map(function(country, i) {
      var val  = countryMap[country];
      var pct  = total > 0 ? (val / total * 100) : 0;
      var barW = Math.round(pct);
      var color = CHART_COLORS[i % CHART_COLORS.length];

      return '<tr data-country="' + _escHtml(country) + '">' +
        '<td class="analysis-rank-num">' + (i + 1) + '</td>' +
        '<td style="font-weight:600">' + _escHtml(country) + '</td>' +
        '<td>' +
          '<div style="height:8px;background:#F1F3F9;border-radius:99px;width:120px;overflow:hidden">' +
            '<div style="height:100%;width:' + barW + '%;background:' + color + ';border-radius:99px"></div>' +
          '</div>' +
        '</td>' +
        '<td style="text-align:right;font-feature-settings:\'tnum\';font-weight:600">' + fmtEuro(val, true) + '</td>' +
        '<td style="text-align:right;color:var(--color-text-secondary)">' + Math.round(pct) + '%</td>' +
      '</tr>';
    }).join('');

    return '<div class="analysis-chart-card">' +
      '<div class="analysis-chart-header">' +
        '<span class="analysis-chart-title">Ülke Bazlı Dağılım</span>' +
      '</div>' +
      '<div class="analysis-chart-body" style="padding:0">' +
        '<table class="analysis-comparison-table">' +
          '<thead><tr>' +
            '<th>#</th><th>Ülke</th><th>PAZAR PAYI</th><th>BEKLENEN</th><th>%</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function _buildRankingCard(customerSummaries) {
    var sorted = customerSummaries.slice().sort(function(a, b) {
      return (b.expected_eur || 0) - (a.expected_eur || 0);
    });

    var rows = sorted.map(function(s, i) {
      var c = _state.customerMap[s.customer_id];
      if (!c) return '';
      var tgtKey = c.id + '_' + _state.currentMonth + '_' + _state.currentYear;
      var target = _state.targetMap[tgtKey];
      var pct    = calcTargetPct(s.expected_eur, target ? target.target_eur : null);
      var colorClass = pctColorClass(pct);

      return '<tr data-customer-id="' + c.id + '">' +
        '<td class="analysis-rank-num">' + (i + 1) + '</td>' +
        '<td style="font-weight:600">' + _escHtml(_truncate(c.name, 24)) + '</td>' +
        '<td style="font-weight:600;font-feature-settings:\'tnum\'">' + fmtEuro(s.confirmed_eur) + '</td>' +
        '<td style="font-weight:600;font-feature-settings:\'tnum\';color:var(--color-accent);opacity:.85">' + fmtEuro(s.expected_eur) + '</td>' +
        '<td style="font-weight:700;color:var(--color-' + (colorClass === 'positive' ? 'positive' : colorClass === 'warning' ? 'warning' : colorClass === 'negative' ? 'negative' : 'text-secondary') + ')">' + (pct !== null ? fmtPct(pct) : '—') + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="analysis-chart-card">' +
      '<div class="analysis-chart-header">' +
        '<span class="analysis-chart-title">Tam Müşteri Sıralaması</span>' +
      '</div>' +
      '<div class="analysis-chart-body" style="padding:0">' +
        '<table class="analysis-comparison-table">' +
          '<thead><tr>' +
            '<th>#</th><th>Müşteri</th><th>Kesinleşen</th><th>BEKLENEN</th><th>HEDEF%</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     TOOLTIP
     ============================================================ */

  function _injectTooltip() {
    if (document.getElementById('analysis-tooltip')) return;
    var el = document.createElement('div');
    el.id = 'analysis-tooltip';
    el.className = 'analysis-tooltip';
    document.body.appendChild(el);
    _tooltip = el;
  }

  function _showTooltip(text, x, y) {
    if (!_tooltip) return;
    _tooltip.textContent = text;
    _tooltip.style.left  = (x + 12) + 'px';
    _tooltip.style.top   = (y - 8)  + 'px';
    _tooltip.classList.add('visible');
  }

  function _hideTooltip() {
    if (_tooltip) _tooltip.classList.remove('visible');
  }

  /* ============================================================
     HELPERS
     ============================================================ */

  function _totalTargetEuro() {
    var total = 0;
    _state.targets.forEach(function(t) {
      if (t.month === _state.currentMonth && t.year === _state.currentYear) {
        total += parseNum(t.target_eur) || 0;
      }
    });
    return total;
  }

  function _truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _escSvg(str) {
    return _escHtml(str);
  }

  /* ============================================================
     BIND EVENTS
     ============================================================ */

  function _bindGlobalEvents() {
    document.addEventListener('nsdata:dataChanged', function(e) {
      var affected = ['orders', 'products', 'customers', 'targets'];
      if (affected.includes(e.detail.table)) {
        _loadAll().then(function() {
          if (document.getElementById('screen-analysis').classList.contains('active')) {
            _render();
          }
        });
      }
    });

    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'analysis') _render();
    });
  }

  function _bindScreenEvents() {
    // Detail toggle
    var toggle = document.getElementById('analysis-detail-toggle');
    if (toggle) {
      toggle.addEventListener('click', function() {
        _state.detailVisible = !_state.detailVisible;
        var section = document.getElementById('analysis-detail-section');
        if (section) section.classList.toggle('visible', _state.detailVisible);
        var icon = toggle.querySelector('span');
        if (icon) icon.textContent = _state.detailVisible ? '▲' : '▼';
        toggle.querySelectorAll('span')[1].textContent = _state.detailVisible ? 'Daha az göster' : 'Daha fazla göster';
      });
    }

    // Customer bar clicks
    document.querySelectorAll('.analysis-bar-group').forEach(function(g) {
      g.addEventListener('click', function() {
        var id = g.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
      g.addEventListener('mousemove', function(e) {
        var id = g.getAttribute('data-customer-id');
        var c  = id ? _state.customerMap[id] : null;
        if (c) _showTooltip(c.name, e.clientX, e.clientY);
      });
      g.addEventListener('mouseleave', _hideTooltip);
    });

    // Heatmap cell clicks
    document.querySelectorAll('.analysis-heatmap-cell').forEach(function(cell) {
      cell.addEventListener('click', function() {
        var id = cell.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
      cell.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') cell.click();
      });
    });

    // Donut legend clicks
    document.querySelectorAll('.analysis-legend-item[data-product-id]').forEach(function(item) {
      item.addEventListener('click', function() {
        var id = item.getAttribute('data-product-id');
        if (id) navigateTo('product', { id: id });
      });
    });

    // Country table clicks
    document.querySelectorAll('[data-country]').forEach(function(row) {
      row.addEventListener('click', function() {
        var country = row.getAttribute('data-country');
        if (country) navigateTo('country', { id: country });
      });
    });

    // Customer ranking clicks
    document.querySelectorAll('.analysis-comparison-table tr[data-customer-id]').forEach(function(row) {
      row.addEventListener('click', function() {
        var id = row.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });

    // Export PDF
    var pdfBtn = document.getElementById('analysis-export-pdf');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function() {
        if (typeof exportAnalysisPdf === 'function') exportAnalysisPdf();
        else showToast('PDF export yakinda eklenecek');
      });
    }
  }

})();
