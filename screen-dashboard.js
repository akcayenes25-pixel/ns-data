/* NSDATA - screen-dashboard.js */
/* Dashboard screen — reads from calc-engine, never calculates directly */

(function() {
  'use strict';

  /* ============================================================
     STATE
     ============================================================ */

  var _state = {
    orders: [],
    products: [],
    customers: [],
    targets: [],
    limits: [],
    payments: [],
    productMap: {},
    customerMap: {},
    targetMap: {},
    searchQuery: '',
    lastUpdated: null,
    currentMonth: null,
    currentYear: null
  };

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
    _render();
    _bindEvents();
    _startDataAgeTimer();
  }

  /* ============================================================
     DATA LOADING
     ============================================================ */

  async function _loadAll() {
    var results = await Promise.all([
      dbGetOrders(),
      dbGetProducts(),
      dbGetCustomers(),
      dbGetTargets(),
      dbGetLimits(),
      dbGetPayments(),
      dbGetLastUpdated()
    ]);

    _state.orders      = results[0];
    _state.products    = results[1];
    _state.customers   = results[2];
    _state.targets     = results[3];
    _state.limits      = results[4];
    _state.payments    = results[5];
    _state.lastUpdated = results[6];

    _state.productMap  = buildProductMap(_state.products);
    _state.customerMap = buildCustomerMap(_state.customers);
    _state.targetMap   = buildTargetMap(_state.targets);
  }

  /* ============================================================
     RENDER
     ============================================================ */

  function _render() {
    var screen = document.getElementById('screen-dashboard');
    if (!screen) return;

    var totals      = calcGrandTotals(_state.orders, _state.productMap);
    var totalTarget = _totalTargetEuro();
    var pct         = calcTargetPct(totals.expected_eur, totalTarget);
    var status      = scenarioStatus(pct);

    screen.innerHTML = _buildHTML(totals, totalTarget, pct, status);

    _updateDataAge();
    _bindTableEvents();
  }

  function _totalTargetEuro() {
    var total = 0;
    _state.targets.forEach(function(t) {
      if (t.month === _state.currentMonth && t.year === _state.currentYear) {
        total += parseNum(t.target_eur) || 0;
      }
    });
    return total;
  }

  function _buildHTML(totals, totalTarget, pct, status) {
    var filtered = _filteredCustomers();
    var summaries = calcCustomerSummaries(_state.orders, _state.productMap);

    // Filter summaries to match search
    if (_state.searchQuery) {
      var q = _state.searchQuery.toLowerCase();
      summaries = summaries.filter(function(s) {
        var c = _state.customerMap[s.customer_id];
        if (!c) return false;
        return c.name.toLowerCase().includes(q);
      });

      // Recalculate totals from filtered
      var filteredTotals = { confirmed_eur: 0, expected_eur: 0 };
      summaries.forEach(function(s) {
        filteredTotals.confirmed_eur += s.confirmed_eur || 0;
        filteredTotals.expected_eur  += s.expected_eur  || 0;
      });
      totals = filteredTotals;
      totalTarget = _filteredTargetEuro(summaries);
      pct = calcTargetPct(totals.expected_eur, totalTarget);
      status = scenarioStatus(pct);
    }

    var pctCapped = pct !== null ? Math.min(pct, 100) : 0;
    var progressClass = status;

    return [
      _buildMetricRow(totals, totalTarget, pct, pctCapped, status, progressClass),
      _buildSecondRow(summaries),
      _buildTableCard(summaries)
    ].join('');
  }

  function _buildMetricRow(totals, totalTarget, pct, pctCapped, status, progressClass) {
    var confirmedStr = fmtEuro(totals.confirmed_eur, true);
    var expectedStr  = fmtEuro(totals.expected_eur, true);
    var targetStr    = fmtEuro(totalTarget, true);
    var pctStr       = fmtPct(pct);

    var statusLabel = {
      'achieved': 'Hedef Asildi',
      'on-track': 'Yolunda',
      'at-risk':  'Riskli',
      'critical': 'Kritik',
      'unknown':  ''
    }[status] || '';

    return '<div class="dashboard-metric-row">' +

      // Card 1: Confirmed
      '<div class="dashboard-metric-card">' +
        '<div class="dashboard-metric-label">' +
          '<span>✓</span> Kesinleşen Ciro' +
        '</div>' +
        '<div class="dashboard-metric-value dashboard-confirmed">' + confirmedStr + '</div>' +
        '<div class="dashboard-metric-sub">Fabrikadan gerçekten sevk edildi</div>' +
      '</div>' +

      // Card 2: Expected
      '<div class="dashboard-metric-card dashboard-expected-card">' +
        '<div class="dashboard-metric-label">' +
          '<span>○</span> Ay Sonu Öngörüsü' +
        '</div>' +
        '<div class="dashboard-metric-value dashboard-expected">' + expectedStr + '</div>' +
        '<div class="dashboard-expected-note">Kesinleşen + Planlanan</div>' +
      '</div>' +

      // Card 3: Budget %
      '<div class="dashboard-metric-card' + (status === 'achieved' ? ' achieved' : '') + '">' +
        '<div class="dashboard-metric-label">' +
          '<span>■</span> Bütçe Yüzdesi' +
        '</div>' +
        '<div class="dashboard-metric-value dashboard-' + status + '">' + pctStr + '</div>' +
        '<div class="dashboard-progress-wrap">' +
          '<div class="dashboard-progress-bar">' +
            '<div class="dashboard-progress-fill ' + progressClass + '" style="width:' + pctCapped + '%"></div>' +
          '</div>' +
        '</div>' +
        '<div class="dashboard-metric-sub">Hedef: ' + targetStr + '</div>' +
        (statusLabel ? '<span class="dashboard-metric-badge ' + status + '">' + statusLabel + '</span>' : '') +
      '</div>' +

    '</div>';
  }

  function _buildSecondRow(summaries) {
    return '<div class="dashboard-second-row">' +
      _buildAchieversCard(summaries) +
      _buildLimitWarningsCard() +
    '</div>';
  }

  function _buildAchieversCard(summaries) {
    // Find customers at or above 100% target
    var achievers = summaries.filter(function(s) {
      var tgtKey = s.customer_id + '_' + _state.currentMonth + '_' + _state.currentYear;
      var target = _state.targetMap[tgtKey];
      if (!target) return false;
      var pct = calcTargetPct(s.expected_eur, target.target_eur);
      return pct !== null && pct >= 100;
    }).map(function(s) {
      var tgtKey = s.customer_id + '_' + _state.currentMonth + '_' + _state.currentYear;
      var target = _state.targetMap[tgtKey];
      var pct = calcTargetPct(s.expected_eur, target.target_eur);
      var c = _state.customerMap[s.customer_id];
      return { name: c ? c.name : '?', pct: pct, customer_id: s.customer_id };
    }).sort(function(a, b) { return b.pct - a.pct; });

    var listHtml = '';
    if (achievers.length === 0) {
      listHtml = '<div class="dashboard-empty">Henüz hedefini aşan müşteri yok</div>';
    } else {
      listHtml = '<ul class="dashboard-achiever-list">';
      achievers.forEach(function(a) {
        listHtml += '<li class="dashboard-achiever-item" data-customer-id="' + a.customer_id + '">' +
          '<span class="dashboard-achiever-name">' +
            '<span style="color:var(--color-positive)">★</span>' +
            _escHtml(a.name) +
          '</span>' +
          '<span class="dashboard-achiever-pct" style="color:var(--color-positive)">' + fmtPct(a.pct) + '</span>' +
        '</li>';
      });
      listHtml += '</ul>';
    }

    return '<div class="dashboard-achievers-card">' +
      '<div class="dashboard-card-header">' +
        '<span class="dashboard-card-title">' +
          '<span style="color:var(--color-positive)">★</span> Hedefini Asan Müşteriler' +
        '</span>' +
        '<span class="badge badge-positive">' + achievers.length + '</span>' +
      '</div>' +
      listHtml +
    '</div>';
  }

  function _buildLimitWarningsCard() {
    var criticals = [];

    _state.limits.forEach(function(lim) {
      var customer = _state.customerMap[lim.customer_id];
      if (!customer) return;

      var plannedEuro = calcCustomerPlannedEuro(_state.orders, lim.customer_id, _state.productMap);
      var conservative = calcConservativeLimit(lim.total_limit_eur, lim.open_balance_eur, plannedEuro);

      if (isLimitCritical(conservative, lim.total_limit_eur)) {
        criticals.push({
          name: customer.name,
          customer_id: lim.customer_id,
          conservative: conservative
        });
      }
    });

    var listHtml = '';
    if (criticals.length === 0) {
      listHtml = '<div class="dashboard-empty">Limit sorunu olan müşteri yok</div>';
    } else {
      listHtml = '<ul class="dashboard-limit-list">';
      criticals.forEach(function(c) {
        listHtml += '<li class="dashboard-limit-item" data-customer-id="' + c.customer_id + '">' +
          '<span class="dashboard-limit-name">' +
            '<span class="limit-warning-icon" aria-label="Uyari">!</span>' +
            _escHtml(c.name) +
          '</span>' +
          '<span class="dashboard-limit-value">' + fmtEuro(c.conservative) + '</span>' +
        '</li>';
      });
      listHtml += '</ul>';
    }

    return '<div class="dashboard-achievers-card">' +
      '<div class="dashboard-card-header">' +
        '<span class="dashboard-card-title">' +
          '<span style="color:var(--color-negative)">!</span> Limit Uyarıları' +
        '</span>' +
        (criticals.length > 0 ? '<span class="badge badge-negative">' + criticals.length + '</span>' : '') +
      '</div>' +
      listHtml +
    '</div>';
  }

  function _buildTableCard(summaries) {
    // Sort: active first, then by expected desc
    var active   = summaries.filter(function(s) {
      var c = _state.customerMap[s.customer_id];
      return c && c.active !== false;
    });
    var inactive = summaries.filter(function(s) {
      var c = _state.customerMap[s.customer_id];
      return c && c.active === false;
    });

    active.sort(function(a, b) { return (b.expected_eur || 0) - (a.expected_eur || 0); });

    // Also add customers with no orders but have targets
    var summaryIds = summaries.map(function(s) { return s.customer_id; });
    _state.customers.forEach(function(c) {
      if (summaryIds.includes(c.id)) return;
      active.push({ customer_id: c.id, confirmed_eur: 0, expected_eur: 0, total_shipped_qty: 0, total_planned_qty: 0 });
    });

    var rows = '';
    active.forEach(function(s) {
      rows += _buildTableRow(s, false);
    });
    inactive.forEach(function(s) {
      rows += _buildTableRow(s, true);
    });

    return '<div class="dashboard-table-card">' +
      '<div class="dashboard-table-toolbar">' +
        '<div class="dashboard-search-wrap">' +
          '<span class="dashboard-search-icon">🔍</span>' +
          '<input type="search" id="dashboard-search" class="dashboard-search-input" ' +
            'placeholder="Müşteri veya ülke ara..." ' +
            'aria-label="Müşteri veya ülke ara" ' +
            'value="' + _escHtml(_state.searchQuery) + '" />' +
        '</div>' +
      '</div>' +
      '<div class="dashboard-table-wrap">' +
        '<table class="dashboard-table" role="grid">' +
          '<thead>' +
            '<tr>' +
              '<th scope="col">Müşteri</th>' +
              '<th scope="col">Ülke</th>' +
              '<th scope="col">Kesinleşen</th>' +
              '<th scope="col">BEKLENEN</th>' +
              '<th scope="col">HEDEF</th>' +
              '<th scope="col">Bütçe %</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody id="dashboard-tbody">' +
            (rows || '<tr><td colspan="6" class="dashboard-empty">Veri bulunamadı</td></tr>') +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function _buildTableRow(s, inactive) {
    var c = _state.customerMap[s.customer_id];
    if (!c) return '';

    var tgtKey = s.customer_id + '_' + _state.currentMonth + '_' + _state.currentYear;
    var target = _state.targetMap[tgtKey];
    var targetEur = target ? parseNum(target.target_eur) : null;
    var pct = calcTargetPct(s.expected_eur, targetEur);
    var pctCapped = pct !== null ? Math.min(pct, 100) : 0;
    var colorClass = pctColorClass(pct);

    // Limit warning
    var lim = _state.limits.find(function(l) { return l.customer_id === s.customer_id; });
    var limitWarn = '';
    if (lim) {
      var plannedEuro = calcCustomerPlannedEuro(_state.orders, s.customer_id, _state.productMap);
      var conservative = calcConservativeLimit(lim.total_limit_eur, lim.open_balance_eur, plannedEuro);
      if (isLimitCritical(conservative, lim.total_limit_eur)) {
        limitWarn = '<span class="limit-warning-icon" aria-label="Limit uyarisi" title="Limit kritik seviyede">!</span>';
      }
    }

    var rowClass = inactive ? 'dashboard-inactive-row' : '';

    return '<tr class="' + rowClass + '">' +
      '<td>' +
        '<div class="dashboard-customer-name-cell">' +
          '<button class="dashboard-customer-name-btn" data-customer-id="' + c.id + '">' +
            _escHtml(c.name) +
            limitWarn +
          '</button>' +
          '<div class="dashboard-mini-progress" aria-label="Hedef dolulugu">' +
            '<div class="dashboard-mini-fill ' + colorClass + '" style="width:' + pctCapped + '%"></div>' +
          '</div>' +
        '</div>' +
      '</td>' +
      '<td>' +
        _buildCountryCell(s.customer_id) +
      '</td>' +
      '<td class="dashboard-num confirmed">' + fmtEuro(s.confirmed_eur) + '</td>' +
      '<td class="dashboard-num expected">' + fmtEuro(s.expected_eur) + '</td>' +
      '<td class="dashboard-num">' + (targetEur !== null ? fmtEuro(targetEur) : '—') + '</td>' +
      '<td class="dashboard-num ' + colorClass + '">' + (pct !== null ? fmtPct(pct) : '—') + '</td>' +
    '</tr>';
  }

  /* ============================================================
     FILTERED HELPERS
     ============================================================ */


  function _buildCountryCell(customerId) {
    // Get unique destination countries for this customer from orders
    var countries = [];
    _state.orders.forEach(function(o) {
      if (o.customer_id === customerId && o.destination_country && !countries.includes(o.destination_country)) {
        countries.push(o.destination_country);
      }
    });
    if (!countries.length) return '<span style="color:#4A5068">—</span>';
    return countries.map(function(c) {
      return '<button class="dashboard-customer-name-btn" style="color:var(--color-text-secondary);font-weight:500;display:block" data-country="' + _escHtml(c) + '">' + _escHtml(c) + '</button>';
    }).join('');
  }

  function _filteredCustomers() {
    if (!_state.searchQuery) return _state.customers;
    var q = _state.searchQuery.toLowerCase();
    return _state.customers.filter(function(c) {
      return c.name.toLowerCase().includes(q);
    });
  }

  function _filteredTargetEuro(summaries) {
    var total = 0;
    summaries.forEach(function(s) {
      var tgtKey = s.customer_id + '_' + _state.currentMonth + '_' + _state.currentYear;
      var target = _state.targetMap[tgtKey];
      if (target) total += parseNum(target.target_eur) || 0;
    });
    return total;
  }

  /* ============================================================
     BIND EVENTS
     ============================================================ */

  function _bindEvents() {
    // Realtime data changes
    document.addEventListener('nsdata:dataChanged', function(e) {
      var affected = ['orders', 'products', 'customers', 'targets', 'limits', 'incoming_payments'];
      if (affected.includes(e.detail.table)) {
        _loadAll().then(function() {
          if (document.getElementById('screen-dashboard').classList.contains('active')) {
            _render();
          }
        });
      }
    });

    // Screen activated
    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'dashboard') {
        _render();
      }
    });
  }

  function _bindTableEvents() {
    // Search input
    var searchInput = document.getElementById('dashboard-search');
    if (searchInput) {
      var debouncedSearch = debounce(function(val) {
        _state.searchQuery = val.trim();
        if (_state.searchQuery) {
          showFilterBanner(_state.searchQuery);
        } else {
          hideFilterBanner();
        }
        _render();
      }, 250);

      searchInput.addEventListener('input', function() {
        debouncedSearch(searchInput.value);
      });

      // Focus search
      searchInput.focus();
    }

    // Customer name clicks
    document.querySelectorAll('[data-customer-id]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });

    // Country clicks
    document.querySelectorAll('[data-country]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var country = btn.getAttribute('data-country');
        if (country) navigateTo('country', { id: country });
      });
    });

    // Achiever list clicks
    document.querySelectorAll('.dashboard-achiever-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var id = item.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });

    // Limit warning clicks
    document.querySelectorAll('.dashboard-limit-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var id = item.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });

    // Filter cleared externally
    document.addEventListener('nsdata:filterCleared', function() {
      _state.searchQuery = '';
      var si = document.getElementById('dashboard-search');
      if (si) si.value = '';
      _render();
    });
  }

  /* ============================================================
     DATA AGE TIMER
     ============================================================ */

  function _updateDataAge() {
    if (_state.lastUpdated) {
      updateDataAge(_state.lastUpdated);
    }
  }

  function _startDataAgeTimer() {
    setInterval(function() {
      _updateDataAge();
    }, 60000);
  }

  /* ============================================================
     ESCAPE HTML
     ============================================================ */

  function _escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
