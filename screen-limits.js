/* NSDATA - screen-limits.js v1.4.0 */
/* Limit-1: dense tablo + expand | Limit-2: inline tablo */
(function() {
  'use strict';

  var _state = {
    customers: [], customerMap: {},
    orders: [], products: [], productMap: {},
    limits: [], limitsMap: {},
    payments: [],
    searchQuery: '',
    filters: { countries: [] },
    sort: { col: 'name', dir: 'asc' },
    openDropdown: null,
    currentMonth: null, currentYear: null,
    viewMode: 'limit1',   // 'limit1' | 'limit2'
    expanded: {}           // limit1: expanded customer ids
  };

  var _saveTimer = null;
  var _saveIndicator = null;

  document.addEventListener('nsdata:appReady', function() { _init(); });

  async function _init() {
    var my = currentMonthYear();
    _state.currentMonth = my.month; _state.currentYear = my.year;
    await _loadAll();
    _injectSaveIndicator();
    _bindGlobalEvents();
  }

  async function _loadAll() {
    var r = await Promise.all([dbGetCustomers(), dbGetOrders(), dbGetProducts(), dbGetLimits(), dbGetPayments()]);
    _state.customers = r[0]; _state.orders = r[1]; _state.products = r[2];
    _state.limits = r[3]; _state.payments = r[4];
    _state.customerMap = buildCustomerMap(_state.customers);
    _state.productMap  = buildProductMap(_state.products);
    _state.limitsMap = {};
    _state.limits.forEach(function(l) { _state.limitsMap[l.customer_id] = l; });
  }

  function _render() {
    var screen = document.getElementById('screen-limits');
    if (!screen) return;
    screen.innerHTML = _buildHTML();
    _bindScreenEvents();
  }

  function _buildHTML() {
    return _buildFilterBar() + _buildActiveChips() +
      (_state.viewMode === 'limit1' ? _buildLimit1() : _buildLimit2());
  }

  /* ============================================================ FILTER BAR */
  function _buildFilterBar() {
    var allCountries = [];
    _state.customers.forEach(function(c) {
      // country filter removed - destination_country now in orders
    });
    allCountries.sort();

    var sortOptions = [
      { val: 'name', label: 'Müşteri Adı' },
      { val: 'total_limit', label: 'Toplam Limit' },
      { val: 'conservative', label: 'Kullanılabilir' }
    ];
    var sortSel = sortOptions.map(function(o) {
      return '<option value="' + o.val + '"' + (_state.sort.col === o.val ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');

    var hasFilter = _state.filters.countries.length > 0;
    var filterBtnCls = hasFilter ? 'orders-filter-btn orders-filter-btn--active' : 'orders-filter-btn';
    var badge = hasFilter ? '<span class="orders-filter-count">' + _state.filters.countries.length + '</span>' : '';

    var dd = '';
    if (_state.openDropdown === 'country') {
      var items = allCountries.map(function(c) {
        return '<label class="orders-dd-item"><input type="checkbox" class="limits-dd-cb" data-value="' + _esc(c) + '" ' + (_state.filters.countries.includes(c) ? 'checked' : '') + '><span>' + _esc(c) + '</span></label>';
      }).join('');
      dd = '<div class="orders-dropdown">' +
        '<input type="search" class="orders-dd-search" placeholder="Ülke ara..." />' +
        '<div class="orders-dd-list">' + (items || '<div class="orders-dd-empty">Ülke bulunamadı</div>') + '</div>' +
        '<div class="orders-dd-footer"><button class="orders-dd-reset" id="limits-dd-reset">Sıfırla</button></div>' +
      '</div>';
    }

    return '<div class="limits-filterbar" id="limits-filterbar">' +
      '<div class="limits-filterbar-inner">' +
        '<div class="orders-search-wrap">' +
          '<span class="orders-search-icon">🔍</span>' +
          '<input type="search" id="limits-search" class="orders-search-input" placeholder="Müşteri ara..." value="' + _esc(_state.searchQuery) + '" />' +
        '</div>' +
        '<button class="' + filterBtnCls + '" id="limits-filter-country">Ülke' + badge + ' ▾</button>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-left:8px">' +
          '<span style="font-size:13px;color:#4A5068;font-weight:500">Sırala:</span>' +
          '<select id="limits-sort-col" style="height:34px;min-height:unset;font-size:13px;padding:0 8px;border-radius:4px;border:1.5px solid #E2E5EF">' + sortSel + '</select>' +
          '<button id="limits-sort-dir" class="orders-filter-btn" style="padding:0 10px">' + (_state.sort.dir === 'asc' ? '↑' : '↓') + '</button>' +
        '</div>' +
        '<div style="margin-left:auto;display:flex;gap:6px">' +
          '<button class="orders-filter-btn' + (_state.viewMode === 'limit1' ? ' orders-filter-btn--active' : '') + '" id="limits-view-1">Limit-1</button>' +
          '<button class="orders-filter-btn' + (_state.viewMode === 'limit2' ? ' orders-filter-btn--active' : '') + '" id="limits-view-2">Limit-2</button>' +
        '</div>' +
      '</div>' +
      dd +
    '</div>';
  }

  function _buildActiveChips() {
    var chips = '';
    _state.filters.countries.forEach(function(c) {
      chips += '<span class="orders-chip">Ülke: ' + _esc(c) + '<button class="limits-chip-x" data-value="' + _esc(c) + '">×</button></span>';
    });
    if (_state.searchQuery) chips += '<span class="orders-chip">Arama: ' + _esc(_state.searchQuery) + '<button class="limits-chip-x" data-value="" data-type="search">×</button></span>';
    if (!chips) return '';
    return '<div class="orders-chips-bar">' + chips + '<button id="limits-chips-clear" class="orders-chips-clear">Tümünü Temizle</button></div>';
  }

  /* ============================================================ CUSTOMER FILTER + SORT */
  function _filteredCustomers() {
    var q  = _state.searchQuery.toLowerCase();
    var fC = _state.filters.countries;
    var customers = _state.customers.filter(function(c) {
      if (c.active === false) return false;
      // country filter: skip - based on orders.destination_country
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
    var dir = _state.sort.dir === 'asc' ? 1 : -1;
    return customers.slice().sort(function(a, b) {
      if (_state.sort.col === 'name') return dir * a.name.localeCompare(b.name, 'tr');
      var la = _state.limitsMap[a.id] || {}; var lb = _state.limitsMap[b.id] || {};
      if (_state.sort.col === 'total_limit') return dir * ((parseNum(la.total_limit_eur)||0) - (parseNum(lb.total_limit_eur)||0));
      if (_state.sort.col === 'conservative') {
        var pa = calcCustomerPlannedEuro(_state.orders, a.id, _state.productMap);
        var pb = calcCustomerPlannedEuro(_state.orders, b.id, _state.productMap);
        return dir * ((calcConservativeLimit(la.total_limit_eur, la.open_balance_eur, pa)||0) - (calcConservativeLimit(lb.total_limit_eur, lb.open_balance_eur, pb)||0));
      }
      return 0;
    });
  }

  /* ============================================================ LIMIT-1: Dense tablo + expand */
  function _buildLimit1() {
    var customers = _filteredCustomers();
    if (!customers.length) return '<div class="limits-empty" style="padding:40px;text-align:center;color:#4A5068">Müşteri bulunamadı</div>';

    var rows = customers.map(function(c) {
      var lim = _state.limitsMap[c.id] || {};
      var pe  = calcCustomerPlannedEuro(_state.orders, c.id, _state.productMap);
      var cp  = _state.payments.filter(function(p){ return p.customer_id === c.id; });
      var con = calcConservativeLimit(lim.total_limit_eur, lim.open_balance_eur, pe);
      var opt = calcOptimisticLimit(lim.total_limit_eur, lim.open_balance_eur, pe, cp, _state.currentMonth, _state.currentYear);
      var isCrit = isLimitCritical(con, lim.total_limit_eur);
      var isExp  = !!_state.expanded[c.id];
      var conClass = con === null ? '' : (con <= 0 ? 'color:#DC2626;font-weight:700' : (lim.total_limit_eur && con < lim.total_limit_eur * 0.15 ? 'color:#D97706;font-weight:700' : 'color:#16A34A;font-weight:700'));

      var mainRow = '<tr class="limits1-row' + (isCrit ? ' limits1-critical' : '') + '" data-customer-id="' + c.id + '">' +
        '<td class="limits1-td limits1-name-td">' +
          '<button class="limits1-expand-btn" data-cid="' + c.id + '">' + (isExp ? '▼' : '▶') + '</button>' +
          '<button class="limits1-cust-btn" data-customer-id="' + c.id + '">' + (isCrit ? '<span style="color:#DC2626;margin-right:4px">!</span>' : '') + _esc(CustomerManager.displayName(c)) + '</button>' +
                  '</td>' +
        '<td class="limits1-td limits1-num">' + (lim.total_limit_eur ? fmtEuro(lim.total_limit_eur) : '—') + '</td>' +
        '<td class="limits1-td limits1-num">' + (lim.open_balance_eur ? fmtEuro(lim.open_balance_eur) : '—') + '</td>' +
        '<td class="limits1-td limits1-num">' + fmtEuro(pe) + '</td>' +
        '<td class="limits1-td limits1-num" style="' + conClass + '">' + (con !== null ? fmtEuro(con) : '—') + '</td>' +
        '<td class="limits1-td limits1-num" style="color:var(--color-accent)">' + (opt !== null ? fmtEuro(opt) : '—') + '</td>' +
      '</tr>';

      var expandRow = '';
      if (isExp) {
        expandRow = '<tr class="limits1-expand-row"><td colspan="6" style="padding:0;background:#F8F9FF">' +
          _buildExpandDetail(c, lim, pe, cp, con, opt) +
        '</td></tr>';
      }
      return mainRow + expandRow;
    }).join('');

    return '<div style="margin:16px">' +
      '<table class="limits1-table">' +
        '<thead><tr>' +
          '<th class="limits1-th">Müşteri</th>' +
          '<th class="limits1-th limits1-num">Toplam Limit</th>' +
          '<th class="limits1-th limits1-num">Açık Bakiye</th>' +
          '<th class="limits1-th limits1-num">Planlanan</th>' +
          '<th class="limits1-th limits1-num">Şu An Kullanılabilir</th>' +
          '<th class="limits1-th limits1-num">Ödeme Gelince</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  function _buildExpandDetail(customer, lim, plannedEuro, custPayments, conservative, optimistic) {
    var payRows = custPayments.map(function(p) {
      var same = isSameMonth(p.payment_date, _state.currentMonth, _state.currentYear);
      return '<div class="limits-payment-row' + (same ? ' same-month' : '') + '" data-payment-id="' + p.id + '">' +
        '<input type="date" class="limits-payment-date-input" data-payment-id="' + p.id + '" data-customer-id="' + customer.id + '" value="' + (p.payment_date||'').slice(0,10) + '" style="height:32px;min-height:unset;width:140px;font-size:13px" />' +
        '<input type="number" min="0" class="limits-payment-amount-input" data-payment-id="' + p.id + '" data-customer-id="' + customer.id + '" value="' + (p.amount_eur||'') + '" placeholder="EUR" style="height:32px;min-height:unset;width:120px;font-size:13px;text-align:right" />' +
        (same ? '<span class="limits-payment-same-month-tag">✓ Bu ay</span>' : '') +
        '<button class="limits-payment-delete" data-payment-id="' + p.id + '">×</button>' +
      '</div>';
    }).join('');

    return '<div style="padding:16px;display:flex;gap:24px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:260px">' +
        '<div style="font-size:12px;font-weight:700;color:#4A5068;letter-spacing:0.4px;margin-bottom:10px">LİMİT BİLGİLERİ</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +
          '<div><div style="font-size:11px;color:#4A5068;font-weight:600;margin-bottom:4px">Toplam Limit (EUR)</div>' +
            '<input type="number" min="0" class="limits-total-input" data-customer-id="' + customer.id + '" value="' + (lim.total_limit_eur||'') + '" placeholder="0" style="height:36px;min-height:unset;font-size:15px;font-weight:700;text-align:right" /></div>' +
          '<div><div style="font-size:11px;color:#4A5068;font-weight:600;margin-bottom:4px">Açık Bakiye (EUR)</div>' +
            '<input type="number" min="0" class="limits-balance-input" data-customer-id="' + customer.id + '" value="' + (lim.open_balance_eur||'') + '" placeholder="0" style="height:36px;min-height:unset;font-size:15px;font-weight:700;text-align:right" /></div>' +
        '</div>' +
        '<div style="background:#F1F3F9;border-radius:6px;padding:10px;font-size:13px;display:flex;justify-content:space-between">' +
          '<span style="color:#4A5068">Bu ay planlanan çıkış</span>' +
          '<span style="font-weight:700">' + fmtEuro(plannedEuro) + '</span>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1;min-width:220px">' +
        '<div style="font-size:12px;font-weight:700;color:#4A5068;letter-spacing:0.4px;margin-bottom:10px">GELECEK ÖDEMELER</div>' +
        '<div class="limits-payment-list" id="limits-payment-list-' + customer.id + '">' + payRows + '</div>' +
        '<button class="limits-add-payment-btn" data-customer-id="' + customer.id + '">+ Ödeme Ekle</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================ LIMIT-2: Inline tablo */
  function _buildLimit2() {
    var customers = _filteredCustomers();
    if (!customers.length) return '<div class="limits-empty" style="padding:40px;text-align:center;color:#4A5068">Müşteri bulunamadı</div>';

    var rows = customers.map(function(c) {
      var lim = _state.limitsMap[c.id] || {};
      var pe  = calcCustomerPlannedEuro(_state.orders, c.id, _state.productMap);
      var cp  = _state.payments.filter(function(p){ return p.customer_id === c.id; });
      var con = calcConservativeLimit(lim.total_limit_eur, lim.open_balance_eur, pe);
      var opt = calcOptimisticLimit(lim.total_limit_eur, lim.open_balance_eur, pe, cp, _state.currentMonth, _state.currentYear);
      var isCrit = isLimitCritical(con, lim.total_limit_eur);
      var conStyle = con === null ? '' : (con <= 0 ? 'color:#DC2626;font-weight:700' : (lim.total_limit_eur && con < lim.total_limit_eur * 0.15 ? 'color:#D97706;font-weight:700' : 'color:#16A34A;font-weight:700'));

      return '<tr class="limits1-row' + (isCrit ? ' limits1-critical' : '') + '" data-customer-id="' + c.id + '">' +
        '<td class="limits1-td">' +
          '<button class="limits1-cust-btn" data-customer-id="' + c.id + '">' + (isCrit ? '<span style="color:#DC2626;margin-right:4px">!</span>' : '') + _esc(CustomerManager.displayName(c)) + '</button>' +
                  '</td>' +
        '<td class="limits1-td limits1-num"><input type="number" min="0" class="limits-total-input" data-customer-id="' + c.id + '" value="' + (lim.total_limit_eur||'') + '" placeholder="0" style="height:32px;min-height:unset;width:110px;text-align:right;font-size:14px" /></td>' +
        '<td class="limits1-td limits1-num"><input type="number" min="0" class="limits-balance-input" data-customer-id="' + c.id + '" value="' + (lim.open_balance_eur||'') + '" placeholder="0" style="height:32px;min-height:unset;width:110px;text-align:right;font-size:14px" /></td>' +
        '<td class="limits1-td limits1-num">' + fmtEuro(pe) + '</td>' +
        '<td class="limits1-td limits1-num" style="' + conStyle + '">' + (con !== null ? fmtEuro(con) : '—') + '</td>' +
        '<td class="limits1-td limits1-num" style="color:var(--color-accent)">' + (opt !== null ? fmtEuro(opt) : '—') + '</td>' +
        '<td class="limits1-td">' +
          '<button class="limits-add-payment-btn" data-customer-id="' + c.id + '" style="width:auto;padding:0 10px;height:30px;font-size:12px;margin:0">+ Ödeme</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<div style="margin:16px">' +
      '<table class="limits1-table">' +
        '<thead><tr>' +
          '<th class="limits1-th">Müşteri</th>' +
          '<th class="limits1-th limits1-num">Toplam Limit</th>' +
          '<th class="limits1-th limits1-num">Açık Bakiye</th>' +
          '<th class="limits1-th limits1-num">Planlanan</th>' +
          '<th class="limits1-th limits1-num">Şu An Kullanılabilir</th>' +
          '<th class="limits1-th limits1-num">Ödeme Gelince</th>' +
          '<th class="limits1-th">Ödeme</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  /* ============================================================ RECALC */
  function _recalcRow(customerId) {
    // Update limit row values in-place for limit2
    var lim = _state.limitsMap[customerId] || {};
    var card = document.querySelector('[data-customer-id="' + customerId + '"]');
    if (!card) return;
    var ti = document.querySelector('.limits-total-input[data-customer-id="' + customerId + '"]');
    var bi = document.querySelector('.limits-balance-input[data-customer-id="' + customerId + '"]');
    var totalLimit  = ti ? parseNum(ti.value) : null;
    var openBalance = bi ? parseNum(bi.value) || 0 : 0;
    var pe = calcCustomerPlannedEuro(_state.orders, customerId, _state.productMap);
    var cp = _state.payments.filter(function(p){ return p.customer_id === customerId; });
    var con = calcConservativeLimit(totalLimit, openBalance, pe);
    var opt = calcOptimisticLimit(totalLimit, openBalance, pe, cp, _state.currentMonth, _state.currentYear);
    // Re-render just that row
    _render();
  }

  /* ============================================================ SAVE */
  function _scheduleLimitSave(cid) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() { _saveLimitRow(cid); }, 700);
  }

  async function _saveLimitRow(cid) {
    var ti = document.querySelector('.limits-total-input[data-customer-id="' + cid + '"]');
    var bi = document.querySelector('.limits-balance-input[data-customer-id="' + cid + '"]');
    var ex = _state.limitsMap[cid];
    var ok = await dbUpsertLimit(Object.assign(ex && ex.id ? { id: ex.id } : {}, {
      customer_id: cid,
      total_limit_eur:  ti ? parseNum(ti.value) : null,
      open_balance_eur: bi ? parseNum(bi.value) : null
    }));
    if (ok) {
      _showSaved();
      _state.limits = await dbGetLimits();
      _state.limitsMap = {};
      _state.limits.forEach(function(l){ _state.limitsMap[l.customer_id] = l; });
      emitDataChange('limits', {});
    }
  }

  async function _addPayment(cid) {
    var now = new Date();
    var ds = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    var ok = await dbUpsertPayment({ customer_id: cid, amount_eur: 0, payment_date: ds });
    if (ok) { _state.payments = await dbGetPayments(); _render(); emitDataChange('incoming_payments', {}); }
  }

  async function _deletePayment(pid) {
    var ok = await dbDeletePayment(pid);
    if (ok) { _state.payments = await dbGetPayments(); _render(); emitDataChange('incoming_payments', {}); }
  }

  async function _savePayment(pid, cid) {
    var row = document.querySelector('[data-payment-id="' + pid + '"]');
    if (!row) return;
    var di = row.querySelector('.limits-payment-date-input');
    var ai = row.querySelector('.limits-payment-amount-input');
    if (!di || !ai) return;
    var ok = await dbUpsertPayment({ id: pid, customer_id: cid, amount_eur: parseNum(ai.value)||0, payment_date: di.value });
    if (ok) { _showSaved(); _state.payments = await dbGetPayments(); emitDataChange('incoming_payments', {}); }
  }

  function _showSaved() {
    if (!_saveIndicator) return;
    _saveIndicator.classList.add('visible');
    setTimeout(function(){ _saveIndicator.classList.remove('visible'); }, 1800);
  }

  function _injectSaveIndicator() {
    if (document.getElementById('limits-save-indicator')) return;
    var el = document.createElement('div');
    el.id = 'limits-save-indicator'; el.className = 'limits-save-indicator';
    el.textContent = '✓ Kaydedildi';
    document.body.appendChild(el);
    _saveIndicator = el;
  }

  /* ============================================================ BIND EVENTS */
  function _bindGlobalEvents() {
    document.addEventListener('nsdata:dataChanged', function(e) {
      if (['orders','products','customers','limits','incoming_payments'].includes(e.detail.table)) {
        _loadAll().then(function() { if (document.getElementById('screen-limits').classList.contains('active')) _render(); });
      }
    });
    document.addEventListener('nsdata:screenActivated', function(e) { if (e.detail.screen === 'limits') _render(); });
    document.addEventListener('nsdata:filterCleared', function() { _state.searchQuery = ''; _state.filters = { countries: [] }; _render(); });
    document.addEventListener('click', function(e) {
      if (_state.openDropdown && !e.target.closest('.limits-filterbar')) { _state.openDropdown = null; _render(); }
    });
  }

  function _bindScreenEvents() {
    // Search
    var se = document.getElementById('limits-search');
    if (se) se.addEventListener('input', debounce(function(){ _state.searchQuery = se.value.trim(); _render(); }, 250));

    // View mode
    var v1 = document.getElementById('limits-view-1'); var v2 = document.getElementById('limits-view-2');
    if (v1) v1.addEventListener('click', function(){ _state.viewMode = 'limit1'; _render(); });
    if (v2) v2.addEventListener('click', function(){ _state.viewMode = 'limit2'; _render(); });

    // Filter country
    var fcBtn = document.getElementById('limits-filter-country');
    if (fcBtn) fcBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      _state.openDropdown = _state.openDropdown === 'country' ? null : 'country'; _render();
    });

    document.querySelectorAll('.limits-dd-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var v = cb.getAttribute('data-value');
        if (cb.checked) { if (!_state.filters.countries.includes(v)) _state.filters.countries.push(v); }
        else _state.filters.countries = _state.filters.countries.filter(function(x){ return x !== v; });
        _render();
      });
    });

    var ddReset = document.getElementById('limits-dd-reset');
    if (ddReset) ddReset.addEventListener('click', function(){ _state.filters.countries = []; _render(); });

    document.querySelectorAll('.orders-dd-search').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var q = inp.value.toLowerCase();
        inp.closest('.orders-dropdown').querySelectorAll('.orders-dd-item').forEach(function(item) {
          item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    });

    document.querySelectorAll('.limits-chip-x').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var t = btn.getAttribute('data-type'); var v = btn.getAttribute('data-value');
        if (t === 'search') _state.searchQuery = '';
        else _state.filters.countries = _state.filters.countries.filter(function(x){ return x !== v; });
        _render();
      });
    });

    var clearAll = document.getElementById('limits-chips-clear');
    if (clearAll) clearAll.addEventListener('click', function(){ _state.searchQuery = ''; _state.filters = { countries: [] }; _render(); });

    // Sort
    var sc = document.getElementById('limits-sort-col');
    if (sc) sc.addEventListener('change', function(){ _state.sort.col = sc.value; _render(); });
    var sd = document.getElementById('limits-sort-dir');
    if (sd) sd.addEventListener('click', function(){ _state.sort.dir = _state.sort.dir === 'asc' ? 'desc' : 'asc'; _render(); });

    // Expand (limit1)
    document.querySelectorAll('.limits1-expand-btn').forEach(function(btn) {
      btn.addEventListener('click', function(){ var cid = btn.getAttribute('data-cid'); _state.expanded[cid] = !_state.expanded[cid]; _render(); });
    });

    // Customer name click
    document.querySelectorAll('.limits1-cust-btn').forEach(function(btn) {
      btn.addEventListener('click', function(){ var id = btn.getAttribute('data-customer-id'); if (id) navigateTo('customer', { id: id }); });
    });

    // Limit inputs
    document.querySelectorAll('.limits-total-input, .limits-balance-input').forEach(function(inp) {
      inp.addEventListener('input', function(){ var cid = inp.getAttribute('data-customer-id'); _scheduleLimitSave(cid); });
    });

    // Payments
    document.querySelectorAll('.limits-add-payment-btn').forEach(function(btn) {
      btn.addEventListener('click', function(){ _addPayment(btn.getAttribute('data-customer-id')); });
    });
    document.querySelectorAll('.limits-payment-delete').forEach(function(btn) {
      btn.addEventListener('click', function(){ _deletePayment(btn.getAttribute('data-payment-id')); });
    });
    document.querySelectorAll('.limits-payment-date-input, .limits-payment-amount-input').forEach(function(inp) {
      inp.addEventListener('change', function(){
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function(){ _savePayment(inp.getAttribute('data-payment-id'), inp.getAttribute('data-customer-id')); }, 600);
      });
    });
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
