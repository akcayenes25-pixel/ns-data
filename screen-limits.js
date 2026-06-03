/* NSDATA - screen-limits.js */
/* Limit cards — conservative/optimistic calc, payment management */

(function() {
  'use strict';

  /* ============================================================
     STATE
     ============================================================ */

  var _state = {
    customers: [],
    customerMap: {},
    orders: [],
    products: [],
    productMap: {},
    limits: [],
    limitsMap: {},
    payments: [],
    searchQuery: '',
    currentMonth: null,
    currentYear: null
  };

  var _saveTimer = null;
  var _saveIndicator = null;

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
    _injectSaveIndicator();
    _bindGlobalEvents();
  }

  async function _loadAll() {
    var results = await Promise.all([
      dbGetCustomers(),
      dbGetOrders(),
      dbGetProducts(),
      dbGetLimits(),
      dbGetPayments()
    ]);

    _state.customers  = results[0];
    _state.orders     = results[1];
    _state.products   = results[2];
    _state.limits     = results[3];
    _state.payments   = results[4];

    _state.customerMap = buildCustomerMap(_state.customers);
    _state.productMap  = buildProductMap(_state.products);

    // Build limits map: customer_id → limit row
    _state.limitsMap = {};
    _state.limits.forEach(function(l) {
      _state.limitsMap[l.customer_id] = l;
    });
  }

  /* ============================================================
     RENDER
     ============================================================ */

  function _render() {
    var screen = document.getElementById('screen-limits');
    if (!screen) return;
    screen.innerHTML = _buildHTML();
    _bindScreenEvents();
  }

  function _buildHTML() {
    var q = _state.searchQuery.toLowerCase();
    var customers = _state.customers.filter(function(c) {
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.country || '').toLowerCase().includes(q);
    });

    var cards = customers.map(function(c) {
      return _buildCard(c);
    }).join('');

    return _buildToolbar() +
      '<div class="limits-grid">' +
        (cards || '<div class="limits-empty">Musteri bulunamadi</div>') +
      '</div>';
  }

  function _buildToolbar() {
    return '<div class="limits-toolbar">' +
      '<div class="limits-search-wrap">' +
        '<span class="limits-search-icon">&#x1F50D;</span>' +
        '<input type="search" id="limits-search" class="limits-search-input" ' +
          'placeholder="Musteri veya ulke ara..." aria-label="Musteri ara" ' +
          'value="' + _esc(_state.searchQuery) + '" />' +
      '</div>' +
    '</div>';
  }

  function _buildCard(customer) {
    var lim = _state.limitsMap[customer.id] || {};
    var totalLimit   = parseNum(lim.total_limit_eur)  || null;
    var openBalance  = parseNum(lim.open_balance_eur) || 0;

    // Planned euro from orders
    var plannedEuro = calcCustomerPlannedEuro(_state.orders, customer.id, _state.productMap);

    // Customer payments
    var custPayments = _state.payments.filter(function(p) {
      return p.customer_id === customer.id;
    });

    // Calc limits
    var conservative = calcConservativeLimit(totalLimit, openBalance, plannedEuro);
    var optimistic   = calcOptimisticLimit(totalLimit, openBalance, plannedEuro, custPayments, _state.currentMonth, _state.currentYear);

    var isCritical = isLimitCritical(conservative, totalLimit);

    var cardClass = 'limits-card' + (isCritical ? ' limits-critical' : '');

    return '<div class="' + cardClass + '" data-customer-id="' + customer.id + '">' +
      _buildCardHeader(customer, isCritical) +
      '<div class="limits-card-body">' +
        _buildInputRow(customer.id, lim) +
        _buildPlannedRow(plannedEuro) +
        _buildResultRow(conservative, optimistic, totalLimit) +
        _buildPaymentsSection(customer.id, custPayments) +
      '</div>' +
    '</div>';
  }

  function _buildCardHeader(customer, isCritical) {
    return '<div class="limits-card-header">' +
      '<div style="display:flex;flex-direction:column;gap:2px">' +
        '<button class="limits-card-name-btn" data-customer-id="' + customer.id + '">' +
          (isCritical ? '<span class="limit-warning-icon" aria-label="Kritik limit">!</span>' : '') +
          _esc(customer.name) +
        '</button>' +
        '<span class="limits-card-country">' + _esc(customer.country || '') + '</span>' +
      '</div>' +
      (isCritical ? '<span class="badge badge-negative">Limit Kritik</span>' : '') +
    '</div>';
  }

  function _buildInputRow(customerId, lim) {
    var totalVal   = lim.total_limit_eur  || '';
    var balanceVal = lim.open_balance_eur || '';

    return '<div class="limits-input-row">' +
      '<div class="limits-field">' +
        '<label class="limits-field-label" for="limits-total-' + customerId + '">Toplam Limit (EUR)</label>' +
        '<input type="number" min="0" ' +
          'id="limits-total-' + customerId + '" ' +
          'class="limits-field-input limits-total-input" ' +
          'data-customer-id="' + customerId + '" ' +
          'aria-label="Toplam limit" ' +
          'value="' + totalVal + '" ' +
          'placeholder="0" />' +
      '</div>' +
      '<div class="limits-field">' +
        '<label class="limits-field-label" for="limits-balance-' + customerId + '">Acik Bakiye (EUR)</label>' +
        '<input type="number" min="0" ' +
          'id="limits-balance-' + customerId + '" ' +
          'class="limits-field-input limits-balance-input" ' +
          'data-customer-id="' + customerId + '" ' +
          'aria-label="Acik bakiye" ' +
          'value="' + balanceVal + '" ' +
          'placeholder="0" />' +
      '</div>' +
    '</div>';
  }

  function _buildPlannedRow(plannedEuro) {
    return '<div class="limits-planned-row">' +
      '<span class="limits-planned-label">Bu ay planlanan cikis</span>' +
      '<span class="limits-planned-value">' + fmtEuro(plannedEuro || 0) + '</span>' +
    '</div>';
  }

  function _buildResultRow(conservative, optimistic, totalLimit) {
    var consClass = 'positive';
    if (conservative !== null) {
      if (conservative <= 0) consClass = 'negative';
      else if (totalLimit && conservative < totalLimit * 0.15) consClass = 'warning';
    }

    var optClass = 'accent';
    if (optimistic !== null && optimistic <= 0) optClass = 'negative';

    var consBoxClass = 'limits-result-box conservative' + (consClass === 'negative' ? ' critical' : '');

    return '<div class="limits-result-row">' +
      '<div class="' + consBoxClass + '">' +
        '<span class="limits-result-label">Su an kullanilabilir limit</span>' +
        '<span class="limits-result-value ' + consClass + '">' + (conservative !== null ? fmtEuro(conservative) : '\u2014') + '</span>' +
        '<span class="limits-result-sub">Odeme beklenmeden</span>' +
      '</div>' +
      '<div class="limits-result-box optimistic">' +
        '<span class="limits-result-label">Odeme gelince kullanilabilir limit</span>' +
        '<span class="limits-result-value ' + optClass + '">' + (optimistic !== null ? fmtEuro(optimistic) : '\u2014') + '</span>' +
        '<span class="limits-result-sub">Bu ayki teyitli odemeler dahil</span>' +
      '</div>' +
    '</div>';
  }

  function _buildPaymentsSection(customerId, payments) {
    var rowsHtml = '';

    payments.forEach(function(p) {
      var sameMonth = isSameMonth(p.payment_date, _state.currentMonth, _state.currentYear);
      var rowClass  = sameMonth ? 'limits-payment-row same-month' : 'limits-payment-row';
      var dateVal   = p.payment_date ? p.payment_date.slice(0, 10) : '';

      rowsHtml += '<div class="' + rowClass + '" data-payment-id="' + p.id + '">' +
        '<div class="limits-payment-date">' +
          '<input type="date" ' +
            'class="limits-payment-date-input" ' +
            'data-payment-id="' + p.id + '" ' +
            'data-customer-id="' + customerId + '" ' +
            'aria-label="Odeme tarihi" ' +
            'value="' + dateVal + '" />' +
        '</div>' +
        '<div class="limits-payment-amount">' +
          '<input type="number" min="0" ' +
            'class="limits-payment-amount-input" ' +
            'data-payment-id="' + p.id + '" ' +
            'data-customer-id="' + customerId + '" ' +
            'aria-label="Odeme tutari (EUR)" ' +
            'value="' + (p.amount_eur || '') + '" ' +
            'placeholder="EUR" />' +
        '</div>' +
        (sameMonth ? '<span class="limits-payment-same-month-tag" aria-label="Bu ay icinde"><span>&#x2713;</span> Bu ay</span>' : '') +
        '<button class="limits-payment-delete" ' +
          'data-payment-id="' + p.id + '" ' +
          'aria-label="Odemeyi sil">&times;</button>' +
      '</div>';
    });

    return '<div class="limits-payments-section" data-customer-id="' + customerId + '">' +
      '<div class="limits-payments-header">' +
        '<span class="limits-payments-title">Gelecek Odemeler</span>' +
      '</div>' +
      '<div class="limits-payment-list" id="limits-payment-list-' + customerId + '">' +
        rowsHtml +
      '</div>' +
      '<button class="limits-add-payment-btn" data-customer-id="' + customerId + '">' +
        '<span>+</span> Odeme Ekle' +
      '</button>' +
    '</div>';
  }

  /* ============================================================
     LIVE RECALC (no re-render — update result boxes in place)
     ============================================================ */

  function _recalcCard(customerId) {
    var card = document.querySelector('.limits-card[data-customer-id="' + customerId + '"]');
    if (!card) return;

    var totalInput   = card.querySelector('.limits-total-input');
    var balanceInput = card.querySelector('.limits-balance-input');
    var totalLimit   = totalInput   ? parseNum(totalInput.value)   : null;
    var openBalance  = balanceInput ? parseNum(balanceInput.value) : 0;
    var plannedEuro  = calcCustomerPlannedEuro(_state.orders, customerId, _state.productMap);

    var custPayments = _state.payments.filter(function(p) { return p.customer_id === customerId; });

    // Also include unsaved payment rows in DOM
    card.querySelectorAll('.limits-payment-row').forEach(function(row) {
      var pid       = row.getAttribute('data-payment-id');
      var dateInput = row.querySelector('.limits-payment-date-input');
      var amtInput  = row.querySelector('.limits-payment-amount-input');
      if (!dateInput || !amtInput) return;

      var existing = custPayments.find(function(p) { return p.id === pid; });
      if (existing) {
        existing.payment_date = dateInput.value;
        existing.amount_eur   = parseNum(amtInput.value);
      }
    });

    var conservative = calcConservativeLimit(totalLimit, openBalance, plannedEuro);
    var optimistic   = calcOptimisticLimit(totalLimit, openBalance, plannedEuro, custPayments, _state.currentMonth, _state.currentYear);
    var isCritical   = isLimitCritical(conservative, totalLimit);

    // Update result boxes
    var resultRow = card.querySelector('.limits-result-row');
    if (resultRow) {
      var consClass = 'positive';
      if (conservative !== null) {
        if (conservative <= 0) consClass = 'negative';
        else if (totalLimit && conservative < totalLimit * 0.15) consClass = 'warning';
      }
      var optClass = 'accent';
      if (optimistic !== null && optimistic <= 0) optClass = 'negative';

      var consBox = resultRow.querySelector('.conservative .limits-result-value');
      var optBox  = resultRow.querySelector('.optimistic .limits-result-value');
      if (consBox) {
        consBox.className = 'limits-result-value ' + consClass;
        consBox.textContent = conservative !== null ? fmtEuro(conservative) : '\u2014';
      }
      if (optBox) {
        optBox.className = 'limits-result-value ' + optClass;
        optBox.textContent = optimistic !== null ? fmtEuro(optimistic) : '\u2014';
      }
    }

    // Update critical state
    card.classList.toggle('limits-critical', isCritical);

    // Update warning icon and badge
    var nameBtn = card.querySelector('.limits-card-name-btn');
    var badge   = card.querySelector('.limits-card-header .badge-negative');
    if (nameBtn) {
      var existingIcon = nameBtn.querySelector('.limit-warning-icon');
      if (isCritical && !existingIcon) {
        var icon = document.createElement('span');
        icon.className = 'limit-warning-icon';
        icon.setAttribute('aria-label', 'Kritik limit');
        icon.textContent = '!';
        nameBtn.insertBefore(icon, nameBtn.firstChild);
      } else if (!isCritical && existingIcon) {
        existingIcon.remove();
      }
    }
  }

  /* ============================================================
     SAVE LIMIT
     ============================================================ */

  function _scheduleLimitSave(customerId) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() {
      _saveLimitRow(customerId);
    }, 700);
  }

  async function _saveLimitRow(customerId) {
    var card = document.querySelector('.limits-card[data-customer-id="' + customerId + '"]');
    if (!card) return;

    var totalInput   = card.querySelector('.limits-total-input');
    var balanceInput = card.querySelector('.limits-balance-input');
    var totalLimit   = totalInput   ? parseNum(totalInput.value)   : null;
    var openBalance  = balanceInput ? parseNum(balanceInput.value) : null;

    var existing = _state.limitsMap[customerId];
    var payload = {
      customer_id:    customerId,
      total_limit_eur:  totalLimit,
      open_balance_eur: openBalance
    };
    if (existing && existing.id) payload.id = existing.id;

    var ok = await dbUpsertLimit(payload);
    if (ok) {
      _showSaved();
      var updated = await dbGetLimits();
      _state.limits = updated;
      _state.limitsMap = {};
      _state.limits.forEach(function(l) { _state.limitsMap[l.customer_id] = l; });
      emitDataChange('limits', {});
    }
  }

  /* ============================================================
     PAYMENT OPERATIONS
     ============================================================ */

  async function _addPayment(customerId) {
    var now = new Date();
    var dateStr = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    var ok = await dbUpsertPayment({
      customer_id:  customerId,
      amount_eur:   0,
      payment_date: dateStr
    });

    if (ok) {
      _state.payments = await dbGetPayments();
      _render();
      emitDataChange('incoming_payments', {});
    }
  }

  async function _deletePayment(paymentId) {
    var ok = await dbDeletePayment(paymentId);
    if (ok) {
      _state.payments = await dbGetPayments();
      _render();
      emitDataChange('incoming_payments', {});
    }
  }

  function _schedulePaymentSave(paymentId, customerId) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() {
      _savePayment(paymentId, customerId);
    }, 700);
  }

  async function _savePayment(paymentId, customerId) {
    var card = document.querySelector('.limits-card[data-customer-id="' + customerId + '"]');
    if (!card) return;

    var row = card.querySelector('[data-payment-id="' + paymentId + '"]');
    if (!row) return;

    var dateInput = row.querySelector('.limits-payment-date-input');
    var amtInput  = row.querySelector('.limits-payment-amount-input');
    if (!dateInput || !amtInput) return;

    var ok = await dbUpsertPayment({
      id:           paymentId,
      customer_id:  customerId,
      amount_eur:   parseNum(amtInput.value) || 0,
      payment_date: dateInput.value
    });

    if (ok) {
      _showSaved();
      _state.payments = await dbGetPayments();
      _recalcCard(customerId);
      emitDataChange('incoming_payments', {});
    }
  }

  /* ============================================================
     SAVE INDICATOR
     ============================================================ */

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
    el.innerHTML = '<span>&#x2713;</span> Kaydedildi';
    document.body.appendChild(el);
    _saveIndicator = el;
  }

  /* ============================================================
     BIND EVENTS
     ============================================================ */

  function _bindGlobalEvents() {
    document.addEventListener('nsdata:dataChanged', function(e) {
      var affected = ['orders', 'products', 'customers', 'limits', 'incoming_payments'];
      if (affected.includes(e.detail.table)) {
        _loadAll().then(function() {
          if (document.getElementById('screen-limits').classList.contains('active')) {
            _render();
          }
        });
      }
    });

    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'limits') _render();
    });

    document.addEventListener('nsdata:filterCleared', function() {
      _state.searchQuery = '';
      _render();
    });
  }

  function _bindScreenEvents() {
    // Search
    var searchEl = document.getElementById('limits-search');
    if (searchEl) {
      var dSearch = debounce(function(v) {
        _state.searchQuery = v.trim();
        if (_state.searchQuery) showFilterBanner(_state.searchQuery);
        else hideFilterBanner();
        _render();
      }, 250);
      searchEl.addEventListener('input', function() { dSearch(searchEl.value); });
    }

    // Customer name clicks
    document.querySelectorAll('.limits-card-name-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });

    // Total limit input
    document.querySelectorAll('.limits-total-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var cid = input.getAttribute('data-customer-id');
        _recalcCard(cid);
        _scheduleLimitSave(cid);
      });
    });

    // Open balance input
    document.querySelectorAll('.limits-balance-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var cid = input.getAttribute('data-customer-id');
        _recalcCard(cid);
        _scheduleLimitSave(cid);
      });
    });

    // Add payment
    document.querySelectorAll('.limits-add-payment-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cid = btn.getAttribute('data-customer-id');
        if (cid) _addPayment(cid);
      });
    });

    // Delete payment
    document.querySelectorAll('.limits-payment-delete').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var pid = btn.getAttribute('data-payment-id');
        if (pid) _deletePayment(pid);
      });
    });

    // Payment date change
    document.querySelectorAll('.limits-payment-date-input').forEach(function(input) {
      input.addEventListener('change', function() {
        var pid = input.getAttribute('data-payment-id');
        var cid = input.getAttribute('data-customer-id');
        _recalcCard(cid);
        _schedulePaymentSave(pid, cid);
      });
    });

    // Payment amount change
    document.querySelectorAll('.limits-payment-amount-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var pid = input.getAttribute('data-payment-id');
        var cid = input.getAttribute('data-customer-id');
        _recalcCard(cid);
        _schedulePaymentSave(pid, cid);
      });
    });
  }

  /* ============================================================
     ESCAPE HTML
     ============================================================ */

  function _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
