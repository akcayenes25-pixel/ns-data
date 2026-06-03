/* NSDATA - screen-limits.js v1.2.0 */
/* Limit cards — filtre bar, sort, sub_market, Türkçe düzeltme */
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
    currentMonth: null, currentYear: null
  };

  var _saveTimer  = null;
  var _saveIndicator = null;

  /* ============================================================ INIT */
  document.addEventListener('nsdata:appReady', function() { _init(); });

  async function _init() {
    var my = currentMonthYear();
    _state.currentMonth = my.month;
    _state.currentYear  = my.year;
    await _loadAll();
    _injectSaveIndicator();
    _bindGlobalEvents();
  }

  async function _loadAll() {
    var r = await Promise.all([dbGetCustomers(), dbGetOrders(), dbGetProducts(), dbGetLimits(), dbGetPayments()]);
    _state.customers = r[0];
    _state.orders    = r[1];
    _state.products  = r[2];
    _state.limits    = r[3];
    _state.payments  = r[4];
    _state.customerMap = buildCustomerMap(_state.customers);
    _state.productMap  = buildProductMap(_state.products);
    _state.limitsMap = {};
    _state.limits.forEach(function(l) { _state.limitsMap[l.customer_id] = l; });
  }

  /* ============================================================ RENDER */
  function _render() {
    var screen = document.getElementById('screen-limits');
    if (!screen) return;
    screen.innerHTML = _buildHTML();
    _bindScreenEvents();
  }

  function _buildHTML() {
    return _buildFilterBar() + _buildActiveChips() + _buildGrid();
  }

  /* ============================================================ FILTER BAR */
  function _buildFilterBar() {
    var allCountries = [];
    _state.customers.forEach(function(c) {
      if (c.active !== false && c.country && !allCountries.includes(c.country)) allCountries.push(c.country);
    });
    allCountries.sort();

    var sortOptions = [
      { val: 'name',          label: 'Müşteri Adı' },
      { val: 'total_limit',   label: 'Toplam Limit' },
      { val: 'conservative',  label: 'Kullanılabilir' }
    ];
    var sortSel = sortOptions.map(function(o) {
      return '<option value="' + o.val + '"' + (_state.sort.col === o.val ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');

    var hasCountryFilter = _state.filters.countries.length > 0;
    var countryBtnClass = hasCountryFilter ? 'orders-filter-btn orders-filter-btn--active' : 'orders-filter-btn';
    var countryBadge = hasCountryFilter ? '<span class="orders-filter-count">' + _state.filters.countries.length + '</span>' : '';

    return '<div class="limits-filterbar" id="limits-filterbar">' +
      '<div class="limits-filterbar-inner">' +
        '<div class="orders-search-wrap">' +
          '<span class="orders-search-icon">🔍</span>' +
          '<input type="search" id="limits-search" class="orders-search-input" placeholder="Müşteri veya ülke ara..." value="' + _esc(_state.searchQuery) + '" />' +
        '</div>' +
        '<button class="' + countryBtnClass + '" data-filter="country">Ülke' + countryBadge + ' ▾</button>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-left:8px">' +
          '<span style="font-size:13px;color:#4A5068;font-weight:500">Sırala:</span>' +
          '<select id="limits-sort-col" style="height:34px;min-height:unset;font-size:13px;padding:0 8px;border-radius:4px;border:1.5px solid #E2E5EF">' + sortSel + '</select>' +
          '<button id="limits-sort-dir" class="orders-filter-btn" style="padding:0 10px;min-width:36px">' +
            (_state.sort.dir === 'asc' ? '↑' : '↓') +
          '</button>' +
        '</div>' +
      '</div>' +
      _buildCountryDropdown(allCountries) +
    '</div>';
  }

  function _buildCountryDropdown(allCountries) {
    if (_state.openDropdown !== 'country') return '<div id="limits-dd-country" class="orders-dropdown" style="display:none"></div>';

    var items = allCountries.map(function(c) {
      var checked = _state.filters.countries.includes(c);
      return '<label class="orders-dd-item">' +
        '<input type="checkbox" class="limits-dd-cb" data-value="' + _esc(c) + '" ' + (checked ? 'checked' : '') + '>' +
        '<span>' + _esc(c) + '</span></label>';
    }).join('');

    return '<div id="limits-dd-country" class="orders-dropdown">' +
      '<input type="search" class="orders-dd-search" placeholder="Ülke ara..." />' +
      '<div class="orders-dd-list">' + (items || '<div class="orders-dd-empty">Ülke bulunamadı</div>') + '</div>' +
      '<div class="orders-dd-footer"><button class="orders-dd-reset" id="limits-dd-reset">Sıfırla</button></div>' +
    '</div>';
  }

  function _buildActiveChips() {
    var chips = '';
    _state.filters.countries.forEach(function(c) {
      chips += '<span class="orders-chip">Ülke: ' + _esc(c) +
        '<button class="orders-chip-x" data-value="' + _esc(c) + '">×</button></span>';
    });
    if (_state.searchQuery) {
      chips += '<span class="orders-chip">Arama: ' + _esc(_state.searchQuery) +
        '<button class="orders-chip-x" data-filter="search">×</button></span>';
    }
    if (!chips) return '';
    return '<div class="orders-chips-bar">' + chips +
      '<button id="limits-chips-clear" class="orders-chips-clear">Tümünü Temizle</button>' +
    '</div>';
  }

  /* ============================================================ GRID */
  function _buildGrid() {
    var q  = _state.searchQuery.toLowerCase();
    var fC = _state.filters.countries;

    var customers = _state.customers.filter(function(c) {
      if (c.active === false) return false;
      if (fC.length && !fC.includes(c.country)) return false;
      if (q && !c.name.toLowerCase().includes(q) && !(c.country||'').toLowerCase().includes(q) && !(c.sub_market||'').toLowerCase().includes(q)) return false;
      return true;
    });

    // Sort
    var dir = _state.sort.dir === 'asc' ? 1 : -1;
    customers = customers.slice().sort(function(a, b) {
      if (_state.sort.col === 'name') return dir * a.name.localeCompare(b.name, 'tr');
      var la = _state.limitsMap[a.id] || {};
      var lb = _state.limitsMap[b.id] || {};
      if (_state.sort.col === 'total_limit') {
        return dir * ((parseNum(la.total_limit_eur) || 0) - (parseNum(lb.total_limit_eur) || 0));
      }
      if (_state.sort.col === 'conservative') {
        var pa = calcCustomerPlannedEuro(_state.orders, a.id, _state.productMap);
        var pb = calcCustomerPlannedEuro(_state.orders, b.id, _state.productMap);
        var ca = calcConservativeLimit(la.total_limit_eur, la.open_balance_eur, pa) || 0;
        var cb = calcConservativeLimit(lb.total_limit_eur, lb.open_balance_eur, pb) || 0;
        return dir * (ca - cb);
      }
      return 0;
    });

    var cards = customers.map(function(c) { return _buildCard(c); }).join('');

    return '<div class="limits-grid">' +
      (cards || '<div class="limits-empty">Müşteri bulunamadı</div>') +
    '</div>';
  }

  function _buildCard(customer) {
    var lim = _state.limitsMap[customer.id] || {};
    var totalLimit  = parseNum(lim.total_limit_eur)  || null;
    var openBalance = parseNum(lim.open_balance_eur) || 0;
    var plannedEuro = calcCustomerPlannedEuro(_state.orders, customer.id, _state.productMap);
    var custPayments = _state.payments.filter(function(p) { return p.customer_id === customer.id; });
    var conservative = calcConservativeLimit(totalLimit, openBalance, plannedEuro);
    var optimistic   = calcOptimisticLimit(totalLimit, openBalance, plannedEuro, custPayments, _state.currentMonth, _state.currentYear);
    var isCritical   = isLimitCritical(conservative, totalLimit);

    var displayName = CustomerManager.displayName(customer);

    return '<div class="limits-card' + (isCritical ? ' limits-critical' : '') + '" data-customer-id="' + customer.id + '">' +
      '<div class="limits-card-header">' +
        '<div style="display:flex;flex-direction:column;gap:2px">' +
          '<button class="limits-card-name-btn" data-customer-id="' + customer.id + '">' +
            (isCritical ? '<span class="limit-warning-icon">!</span>' : '') +
            _esc(displayName) +
          '</button>' +
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
            (customer.country ? '<span class="limits-card-country">' + _esc(customer.country) + '</span>' : '') +
            (customer.sub_market ? '<span class="limits-card-submarket">' + _esc(customer.sub_market) + '</span>' : '') +
          '</div>' +
        '</div>' +
        (isCritical ? '<span class="badge badge-negative">Limit Kritik</span>' : '') +
      '</div>' +
      '<div class="limits-card-body">' +
        _buildInputRow(customer.id, lim) +
        _buildPlannedRow(plannedEuro) +
        _buildResultRow(conservative, optimistic, totalLimit) +
        _buildPaymentsSection(customer.id, custPayments) +
      '</div>' +
    '</div>';
  }

  function _buildInputRow(customerId, lim) {
    return '<div class="limits-input-row">' +
      '<div class="limits-field">' +
        '<label class="limits-field-label">Toplam Limit (EUR)</label>' +
        '<input type="number" min="0" id="limits-total-' + customerId + '" class="limits-field-input limits-total-input" data-customer-id="' + customerId + '" value="' + (lim.total_limit_eur || '') + '" placeholder="0" />' +
      '</div>' +
      '<div class="limits-field">' +
        '<label class="limits-field-label">Açık Bakiye (EUR)</label>' +
        '<input type="number" min="0" id="limits-balance-' + customerId + '" class="limits-field-input limits-balance-input" data-customer-id="' + customerId + '" value="' + (lim.open_balance_eur || '') + '" placeholder="0" />' +
      '</div>' +
    '</div>';
  }

  function _buildPlannedRow(plannedEuro) {
    return '<div class="limits-planned-row">' +
      '<span class="limits-planned-label">Bu ay planlanan çıkış</span>' +
      '<span class="limits-planned-value">' + fmtEuro(plannedEuro || 0) + '</span>' +
    '</div>';
  }

  function _buildResultRow(conservative, optimistic, totalLimit) {
    var consClass = 'positive';
    if (conservative !== null) {
      if (conservative <= 0) consClass = 'negative';
      else if (totalLimit && conservative < totalLimit * 0.15) consClass = 'warning';
    }
    var optClass = conservative !== null && optimistic !== null && optimistic <= 0 ? 'negative' : 'accent';
    var consBoxClass = 'limits-result-box conservative' + (consClass === 'negative' ? ' critical' : '');

    return '<div class="limits-result-row">' +
      '<div class="' + consBoxClass + '">' +
        '<span class="limits-result-label">Şu an kullanılabilir limit</span>' +
        '<span class="limits-result-value ' + consClass + '">' + (conservative !== null ? fmtEuro(conservative) : '—') + '</span>' +
        '<span class="limits-result-sub">Ödeme beklenmeden</span>' +
      '</div>' +
      '<div class="limits-result-box optimistic">' +
        '<span class="limits-result-label">Ödeme gelince kullanılabilir limit</span>' +
        '<span class="limits-result-value ' + optClass + '">' + (optimistic !== null ? fmtEuro(optimistic) : '—') + '</span>' +
        '<span class="limits-result-sub">Bu ayki teyitli ödemeler dahil</span>' +
      '</div>' +
    '</div>';
  }

  function _buildPaymentsSection(customerId, payments) {
    var rowsHtml = payments.map(function(p) {
      var sameMonth = isSameMonth(p.payment_date, _state.currentMonth, _state.currentYear);
      var dateVal   = p.payment_date ? p.payment_date.slice(0,10) : '';
      return '<div class="limits-payment-row' + (sameMonth ? ' same-month' : '') + '" data-payment-id="' + p.id + '">' +
        '<div class="limits-payment-date">' +
          '<input type="date" class="limits-payment-date-input" data-payment-id="' + p.id + '" data-customer-id="' + customerId + '" value="' + dateVal + '" />' +
        '</div>' +
        '<div class="limits-payment-amount">' +
          '<input type="number" min="0" class="limits-payment-amount-input" data-payment-id="' + p.id + '" data-customer-id="' + customerId + '" value="' + (p.amount_eur || '') + '" placeholder="EUR" />' +
        '</div>' +
        (sameMonth ? '<span class="limits-payment-same-month-tag"><span>✓</span> Bu ay</span>' : '') +
        '<button class="limits-payment-delete" data-payment-id="' + p.id + '" aria-label="Ödemeyi sil">×</button>' +
      '</div>';
    }).join('');

    return '<div class="limits-payments-section" data-customer-id="' + customerId + '">' +
      '<div class="limits-payments-header"><span class="limits-payments-title">Gelecek Ödemeler</span></div>' +
      '<div class="limits-payment-list" id="limits-payment-list-' + customerId + '">' + rowsHtml + '</div>' +
      '<button class="limits-add-payment-btn" data-customer-id="' + customerId + '"><span>+</span> Ödeme Ekle</button>' +
    '</div>';
  }

  /* ============================================================ LIVE RECALC */
  function _recalcCard(customerId) {
    var card = document.querySelector('.limits-card[data-customer-id="' + customerId + '"]');
    if (!card) return;
    var ti = card.querySelector('.limits-total-input');
    var bi = card.querySelector('.limits-balance-input');
    var totalLimit  = ti ? parseNum(ti.value) : null;
    var openBalance = bi ? parseNum(bi.value) || 0 : 0;
    var plannedEuro = calcCustomerPlannedEuro(_state.orders, customerId, _state.productMap);

    var custPayments = _state.payments.filter(function(p) { return p.customer_id === customerId; });
    card.querySelectorAll('.limits-payment-row').forEach(function(row) {
      var pid = row.getAttribute('data-payment-id');
      var di  = row.querySelector('.limits-payment-date-input');
      var ai  = row.querySelector('.limits-payment-amount-input');
      if (!di || !ai) return;
      var ex = custPayments.find(function(p) { return p.id === pid; });
      if (ex) { ex.payment_date = di.value; ex.amount_eur = parseNum(ai.value); }
    });

    var conservative = calcConservativeLimit(totalLimit, openBalance, plannedEuro);
    var optimistic   = calcOptimisticLimit(totalLimit, openBalance, plannedEuro, custPayments, _state.currentMonth, _state.currentYear);
    var isCritical   = isLimitCritical(conservative, totalLimit);

    var consClass = conservative !== null ? (conservative <= 0 ? 'negative' : (totalLimit && conservative < totalLimit * 0.15 ? 'warning' : 'positive')) : 'positive';
    var optClass  = optimistic !== null && optimistic <= 0 ? 'negative' : 'accent';

    var consBox = card.querySelector('.conservative .limits-result-value');
    var optBox  = card.querySelector('.optimistic .limits-result-value');
    if (consBox) { consBox.className = 'limits-result-value ' + consClass; consBox.textContent = conservative !== null ? fmtEuro(conservative) : '—'; }
    if (optBox)  { optBox.className  = 'limits-result-value ' + optClass;  optBox.textContent  = optimistic  !== null ? fmtEuro(optimistic)  : '—'; }
    card.classList.toggle('limits-critical', isCritical);
  }

  /* ============================================================ SAVE */
  function _scheduleLimitSave(customerId) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() { _saveLimitRow(customerId); }, 700);
  }

  async function _saveLimitRow(customerId) {
    var card = document.querySelector('.limits-card[data-customer-id="' + customerId + '"]');
    if (!card) return;
    var ti = card.querySelector('.limits-total-input');
    var bi = card.querySelector('.limits-balance-input');
    var existing = _state.limitsMap[customerId];
    var payload = {
      customer_id: customerId,
      total_limit_eur:  ti ? parseNum(ti.value) : null,
      open_balance_eur: bi ? parseNum(bi.value) : null
    };
    if (existing && existing.id) payload.id = existing.id;
    var ok = await dbUpsertLimit(payload);
    if (ok) {
      _showSaved();
      _state.limits = await dbGetLimits();
      _state.limitsMap = {};
      _state.limits.forEach(function(l) { _state.limitsMap[l.customer_id] = l; });
      emitDataChange('limits', {});
    }
  }

  async function _addPayment(customerId) {
    var now = new Date();
    var dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    var ok = await dbUpsertPayment({ customer_id: customerId, amount_eur: 0, payment_date: dateStr });
    if (ok) { _state.payments = await dbGetPayments(); _render(); emitDataChange('incoming_payments', {}); }
  }

  async function _deletePayment(paymentId) {
    var ok = await dbDeletePayment(paymentId);
    if (ok) { _state.payments = await dbGetPayments(); _render(); emitDataChange('incoming_payments', {}); }
  }

  function _schedulePaymentSave(paymentId, customerId) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() { _savePayment(paymentId, customerId); }, 700);
  }

  async function _savePayment(paymentId, customerId) {
    var card = document.querySelector('.limits-card[data-customer-id="' + customerId + '"]');
    if (!card) return;
    var row = card.querySelector('[data-payment-id="' + paymentId + '"]');
    if (!row) return;
    var di = row.querySelector('.limits-payment-date-input');
    var ai = row.querySelector('.limits-payment-amount-input');
    if (!di || !ai) return;
    var ok = await dbUpsertPayment({ id: paymentId, customer_id: customerId, amount_eur: parseNum(ai.value) || 0, payment_date: di.value });
    if (ok) { _showSaved(); _state.payments = await dbGetPayments(); _recalcCard(customerId); emitDataChange('incoming_payments', {}); }
  }

  function _showSaved() {
    if (!_saveIndicator) return;
    _saveIndicator.classList.add('visible');
    setTimeout(function() { _saveIndicator.classList.remove('visible'); }, 1800);
  }

  function _injectSaveIndicator() {
    if (document.getElementById('limits-save-indicator')) return;
    var el = document.createElement('div');
    el.id = 'limits-save-indicator';
    el.className = 'limits-save-indicator';
    el.innerHTML = '✓ Kaydedildi';
    document.body.appendChild(el);
    _saveIndicator = el;
  }

  /* ============================================================ BIND EVENTS */
  function _bindGlobalEvents() {
    document.addEventListener('nsdata:dataChanged', function(e) {
      if (['orders','products','customers','limits','incoming_payments'].includes(e.detail.table)) {
        _loadAll().then(function() {
          if (document.getElementById('screen-limits').classList.contains('active')) _render();
        });
      }
    });
    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'limits') _render();
    });
    document.addEventListener('nsdata:filterCleared', function() {
      _state.searchQuery = ''; _state.filters = { countries: [] }; _render();
    });
    document.addEventListener('click', function(e) {
      if (_state.openDropdown && !e.target.closest('.limits-filterbar')) {
        _state.openDropdown = null; _render();
      }
    });
  }

  function _bindScreenEvents() {
    var searchEl = document.getElementById('limits-search');
    if (searchEl) {
      searchEl.addEventListener('input', debounce(function() {
        _state.searchQuery = searchEl.value.trim(); _render();
      }, 250));
    }

    // Filter btn
    var filterBtn = document.querySelector('[data-filter="country"]');
    if (filterBtn) filterBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      _state.openDropdown = _state.openDropdown === 'country' ? null : 'country';
      _render();
    });

    // Country checkboxes
    document.querySelectorAll('.limits-dd-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var val = cb.getAttribute('data-value');
        if (cb.checked) { if (!_state.filters.countries.includes(val)) _state.filters.countries.push(val); }
        else _state.filters.countries = _state.filters.countries.filter(function(v){ return v !== val; });
        _render();
      });
    });

    // DD search
    document.querySelectorAll('.orders-dd-search').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var q = inp.value.toLowerCase();
        inp.closest('.orders-dropdown').querySelectorAll('.orders-dd-item').forEach(function(item) {
          item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    });

    var ddReset = document.getElementById('limits-dd-reset');
    if (ddReset) ddReset.addEventListener('click', function() { _state.filters.countries = []; _render(); });

    // Chips
    document.querySelectorAll('.orders-chip-x').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var filter = btn.getAttribute('data-filter');
        var val    = btn.getAttribute('data-value');
        if (filter === 'search') _state.searchQuery = '';
        else _state.filters.countries = _state.filters.countries.filter(function(v){ return v !== val; });
        _render();
      });
    });
    var clearAll = document.getElementById('limits-chips-clear');
    if (clearAll) clearAll.addEventListener('click', function() {
      _state.searchQuery = ''; _state.filters = { countries: [] }; _render();
    });

    // Sort
    var sortColEl = document.getElementById('limits-sort-col');
    if (sortColEl) sortColEl.addEventListener('change', function() {
      _state.sort.col = sortColEl.value; _render();
    });
    var sortDirEl = document.getElementById('limits-sort-dir');
    if (sortDirEl) sortDirEl.addEventListener('click', function() {
      _state.sort.dir = _state.sort.dir === 'asc' ? 'desc' : 'asc'; _render();
    });

    // Customer name clicks
    document.querySelectorAll('.limits-card-name-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });

    // Limit inputs
    document.querySelectorAll('.limits-total-input, .limits-balance-input').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var cid = inp.getAttribute('data-customer-id');
        _recalcCard(cid); _scheduleLimitSave(cid);
      });
    });

    // Payments
    document.querySelectorAll('.limits-add-payment-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _addPayment(btn.getAttribute('data-customer-id')); });
    });
    document.querySelectorAll('.limits-payment-delete').forEach(function(btn) {
      btn.addEventListener('click', function() { _deletePayment(btn.getAttribute('data-payment-id')); });
    });
    document.querySelectorAll('.limits-payment-date-input').forEach(function(inp) {
      inp.addEventListener('change', function() {
        _recalcCard(inp.getAttribute('data-customer-id'));
        _schedulePaymentSave(inp.getAttribute('data-payment-id'), inp.getAttribute('data-customer-id'));
      });
    });
    document.querySelectorAll('.limits-payment-amount-input').forEach(function(inp) {
      inp.addEventListener('input', function() {
        _recalcCard(inp.getAttribute('data-customer-id'));
        _schedulePaymentSave(inp.getAttribute('data-payment-id'), inp.getAttribute('data-customer-id'));
      });
    });
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
