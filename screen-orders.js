/* NSDATA - screen-orders.js */
/* Orders screen — inline editing, three-way calc, import trigger */

(function() {
  'use strict';

  /* ============================================================
     STATE
     ============================================================ */

  var _state = {
    orders: [],
    products: [],
    customers: [],
    productMap: {},
    customerMap: {},
    searchQuery: '',
    showInactive: false,
    importPreviewData: null,
    importDetailVisible: false,
    currentMonth: null,
    currentYear: null,
    activeRowId: null
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
      dbGetOrders(),
      dbGetProducts(),
      dbGetCustomers()
    ]);
    _state.orders    = results[0];
    _state.products  = results[1];
    _state.customers = results[2];
    _state.productMap  = buildProductMap(_state.products);
    _state.customerMap = buildCustomerMap(_state.customers);
  }

  /* ============================================================
     RENDER
     ============================================================ */

  function _render() {
    var screen = document.getElementById('screen-orders');
    if (!screen) return;
    screen.innerHTML = _buildHTML();
    _bindScreenEvents();
  }

  function _buildHTML() {
    return _buildToolbar() +
           _buildImportZone() +
           _buildImportPreview() +
           _buildTableCard() +
           _buildMobileCards();
  }

  function _buildToolbar() {
    return '<div class="orders-toolbar">' +
      '<div class="orders-search-wrap">' +
        '<span class="orders-search-icon">&#x1F50D;</span>' +
        '<input type="search" id="orders-search" class="orders-search-input" ' +
          'placeholder="M&#xFC;&#x15F;teri veya &#xFC;lke ara..." aria-label="M&#xFC;&#x15F;teri ara" ' +
          'value="' + _esc(_state.searchQuery) + '" />' +
      '</div>' +
      '<div class="orders-toolbar-actions">' +
        '<button class="btn btn-secondary" id="orders-export-excel">Excel olarak indir</button>' +
        '<button class="btn btn-primary" id="orders-open-import">Veri Y&#xFC;kle (xlsx)</button>' +
      '</div>' +
    '</div>';
  }

  function _buildImportZone() {
    return '<div class="orders-import-zone" id="orders-import-zone">' +
      '<div class="orders-import-zone-icon">&#x1F4C2;</div>' +
      '<div class="orders-import-zone-title">ERP verisini s&#xFC;r&#xFC;kle b&#x131;rak</div>' +
      '<div class="orders-import-zone-sub">veya asagidaki butonu kullanin</div>' +
      '<button class="btn btn-primary" id="orders-import-btn">Dosya Se&#xE7;</button>' +
      '<input type="file" id="orders-import-input" class="orders-import-file-input" accept=".xlsx,.xls" />' +
    '</div>';
  }

  function _buildImportPreview() {
    if (!_state.importPreviewData) return '<div id="orders-import-preview"></div>';

    var data = _state.importPreviewData;
    var detailClass = _state.importDetailVisible ? 'visible' : '';

    var detailRows = '';
    (data.rows || []).slice(0, 50).forEach(function(row) {
      var matchClass = row.matched ? '' : 'style="color:var(--color-warning)"';
      detailRows += '<tr>' +
        '<td ' + matchClass + '>' + _esc(row.customer_name) + '</td>' +
        '<td>' + _esc(row.product_name) + '</td>' +
        '<td style="text-align:right">' + fmtQty(row.qty) + '</td>' +
        '<td style="text-align:right">' + fmtEuro(row.euro) + '</td>' +
        '<td>' + (row.matched ? '<span style="color:var(--color-positive)">&#x2713; E&#x15F;le&#x15F;ti</span>' : '<span style="color:var(--color-warning)">Yeni</span>') + '</td>' +
      '</tr>';
    });

    return '<div class="orders-import-preview visible" id="orders-import-preview">' +
      '<div class="orders-import-preview-header">' +
        '<span class="orders-import-preview-title">&#x130;mport Onay</span>' +
        '<button class="btn btn-secondary" id="orders-import-cancel">&#x130;ptal</button>' +
      '</div>' +
      '<div class="orders-import-summary">' +
        '<div class="orders-import-summary-item">' +
          '<span class="orders-import-summary-label">M&#xFC;&#x15F;teri</span>' +
          '<span class="orders-import-summary-value">' + (data.customerCount || 0) + '</span>' +
        '</div>' +
        '<div class="orders-import-summary-item">' +
          '<span class="orders-import-summary-label">&#xDC;r&#xFC;n</span>' +
          '<span class="orders-import-summary-value">' + (data.productCount || 0) + '</span>' +
        '</div>' +
        '<div class="orders-import-summary-item">' +
          '<span class="orders-import-summary-label">Satir</span>' +
          '<span class="orders-import-summary-value">' + (data.rowCount || 0) + '</span>' +
        '</div>' +
        '<div class="orders-import-summary-item">' +
          '<span class="orders-import-summary-label">Eslesmeyenler</span>' +
          '<span class="orders-import-summary-value" style="color:var(--color-warning)">' + (data.unmatchedCount || 0) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="orders-import-detail-toggle" id="orders-import-detail-toggle">' +
        '<span>' + (_state.importDetailVisible ? '&#x25BC;' : '&#x25B6;') + ' Ayr&#x131;nt&#x131;l&#x131; g&#xF6;r&#xFC;nt&#xFC;le</span>' +
      '</div>' +
      '<div class="orders-import-detail-body ' + detailClass + '" id="orders-import-detail-body">' +
        '<table class="orders-import-detail-table">' +
          '<thead><tr>' +
            '<th>M&#xFC;&#x15F;teri</th><th>&#xDC;r&#xFC;n</th><th>ADET</th><th>EURO</th><th>DURUM</th>' +
          '</tr></thead>' +
          '<tbody>' + detailRows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="orders-import-actions">' +
        '<button class="btn btn-primary" id="orders-import-confirm">Evet, y&#xFC;kle</button>' +
      '</div>' +
    '</div>';
  }

  function _buildTableCard() {
    var rows = _buildTableRows();

    return '<div class="orders-table-card">' +
      '<div class="orders-table-wrap">' +
        '<table class="orders-table" role="grid">' +
          '<thead><tr>' +
            '<th>M&#xFC;&#x15F;teri / &#xDC;r&#xFC;n</th>' +
            '<th>&#xC7;&#x131;kan Adet</th>' +
            '<th>&#xC7;&#x131;kan Euro</th>' +
            '<th>&#xC7;&#x131;kacak Adet</th>' +
            '<th>&#xC7;&#x131;kacak Euro</th>' +
            '<th>Konteyner</th>' +
            '<th>Toplam Euro</th>' +
            '<th>NOT</th>' +
          '</tr></thead>' +
          '<tbody id="orders-tbody">' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="orders-inactive-toggle" id="orders-inactive-toggle">' +
        '<span>' + (_state.showInactive ? 'Bu ay aktif olmayanlari gizle' : 'Bu ay aktif olmayanlari goster') + '</span>' +
        '<span>' + (_state.showInactive ? '&#x25B2;' : '&#x25BC;') + '</span>' +
      '</div>' +
    '</div>';
  }

  function _buildTableRows() {
    var q = _state.searchQuery.toLowerCase();

    var activeCustomers = _state.customers.filter(function(c) {
      return c.active !== false;
    });
    var inactiveCustomers = _state.customers.filter(function(c) {
      return c.active === false;
    });

    if (q) {
      activeCustomers = activeCustomers.filter(function(c) {
        return c.name.toLowerCase().includes(q) || (c.country || '').toLowerCase().includes(q);
      });
    }

    var html = '';

    activeCustomers.forEach(function(customer) {
      html += _buildCustomerRows(customer, false);
    });

    if (_state.showInactive) {
      inactiveCustomers.forEach(function(customer) {
        html += _buildCustomerRows(customer, true);
      });
    }

    if (!html) {
      html = '<tr><td colspan="8" class="orders-empty">Veri bulunamad&#x131;</td></tr>';
    }

    return html;
  }

  function _buildCustomerRows(customer, inactive) {
    var html = '';

    _state.products.forEach(function(product, idx) {
      var order = _state.orders.find(function(o) {
        return o.customer_id === customer.id && o.product_id === product.id;
      });

      var shippedQty  = order ? (parseNum(order.shipped_qty)  || 0) : 0;
      var plannedQty  = order ? (parseNum(order.planned_qty)  || 0) : 0;
      var price       = parseNum(product.avg_price_eur) || 0;
      var ratio       = parseNum(product.container_ratio);

      var shippedEuro = price > 0 ? shippedQty * price : 0;
      var plannedEuro = price > 0 ? plannedQty * price : 0;
      var totalEuro   = shippedEuro + plannedEuro;
      var containers  = ratio && ratio > 0 ? (shippedQty + plannedQty) / ratio : null;

      var orderId  = order ? order.id : '';
      var rowKey   = customer.id + '__' + product.id;
      var isActive = _state.activeRowId === rowKey;
      var rowClass = inactive ? 'orders-inactive-section' : (isActive ? 'orders-active-row' : '');

      // First product row for this customer: show customer name
      var customerCell = '';
      if (idx === 0) {
        customerCell = '<button class="orders-customer-btn" data-customer-id="' + customer.id + '">' +
          _esc(customer.name) +
          (isLimitCritical(0, 0) ? '' : '') +
        '</button>';
      }

      html += '<tr class="' + rowClass + '" ' +
        'data-row-key="' + rowKey + '" ' +
        'data-customer-id="' + customer.id + '" ' +
        'data-product-id="' + product.id + '" ' +
        'data-order-id="' + orderId + '">' +

        '<td>' +
          (customerCell ? customerCell : '') +
          '<div class="orders-product-name">' + _esc(product.name) + '</div>' +
        '</td>' +

        // Shipped qty — from ERP, read-only
        '<td>' +
          '<div class="orders-computed" aria-label="&#xC7;&#x131;kan adet (ERP)">' + (shippedQty || '\u2014') + '</div>' +
        '</td>' +

        // Shipped euro — computed
        '<td>' +
          '<div class="orders-computed" aria-label="&#xC7;&#x131;kan euro">' + (shippedEuro > 0 ? fmtEuro(shippedEuro) : '\u2014') + '</div>' +
        '</td>' +

        // Planned qty — editable
        '<td>' +
          '<input type="number" min="0" ' +
            'class="orders-input orders-planned-qty" ' +
            'aria-label="&#xC7;&#x131;kacak adet" ' +
            'data-source="qty" ' +
            'data-row-key="' + rowKey + '" ' +
            'value="' + (plannedQty || '') + '" ' +
            'placeholder="0" />' +
        '</td>' +

        // Planned euro — computed from qty, but also editable (source=euro)
        '<td>' +
          '<input type="number" min="0" ' +
            'class="orders-input orders-planned-euro" ' +
            'aria-label="&#xC7;&#x131;kacak euro" ' +
            'data-source="euro" ' +
            'data-row-key="' + rowKey + '" ' +
            'value="' + (plannedEuro || '') + '" ' +
            'placeholder="0" />' +
        '</td>' +

        // Container — computed
        '<td>' +
          '<div class="orders-computed" aria-label="Konteyner">' +
            (containers !== null ? fmtQty(containers) : '\u2014') +
          '</div>' +
        '</td>' +

        // Total euro — computed
        '<td>' +
          '<div class="orders-computed orders-total-euro" aria-label="Toplam euro">' +
            (totalEuro > 0 ? fmtEuro(totalEuro) : '\u2014') +
          '</div>' +
        '</td>' +

        // Note
        '<td>' +
          '<input type="text" ' +
            'class="orders-note-input" ' +
            'aria-label="Not" ' +
            'data-row-key="' + rowKey + '" ' +
            'value="' + _esc(order ? (order.note || '') : '') + '" ' +
            'placeholder="Not..." ' +
            'maxlength="200" />' +
        '</td>' +

      '</tr>';
    });

    return html;
  }

  function _buildMobileCards() {
    var q = _state.searchQuery.toLowerCase();
    var customers = _state.customers.filter(function(c) {
      if (c.active === false) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.country || '').toLowerCase().includes(q);
    });

    var html = '<div class="orders-card-list">';

    customers.forEach(function(customer) {
      _state.products.forEach(function(product) {
        var order = _state.orders.find(function(o) {
          return o.customer_id === customer.id && o.product_id === product.id;
        });

        var plannedQty = order ? (parseNum(order.planned_qty) || 0) : 0;
        var rowKey = customer.id + '__' + product.id;

        html += '<div class="orders-mobile-card">' +
          '<div class="orders-mobile-card-header">' +
            '<span class="orders-mobile-card-name">' + _esc(customer.name) + '</span>' +
            '<span class="orders-product-name">' + _esc(product.name) + '</span>' +
          '</div>' +
          '<div class="orders-mobile-card-body">' +
            '<div class="orders-mobile-field">' +
              '<span class="orders-mobile-field-label">&#xC7;&#x131;kacak Adet</span>' +
              '<input type="number" min="0" class="orders-input orders-planned-qty" ' +
                'data-source="qty" data-row-key="' + rowKey + '" ' +
                'data-customer-id="' + customer.id + '" data-product-id="' + product.id + '" ' +
                'value="' + (plannedQty || '') + '" placeholder="0" ' +
                'aria-label="&#xC7;&#x131;kacak adet" />' +
            '</div>' +
            '<div class="orders-mobile-field">' +
              '<span class="orders-mobile-field-label">Not</span>' +
              '<input type="text" class="orders-note-input" ' +
                'data-row-key="' + rowKey + '" ' +
                'value="' + _esc(order ? (order.note || '') : '') + '" ' +
                'placeholder="Not..." maxlength="200" aria-label="Not" />' +
            '</div>' +
          '</div>' +
        '</div>';
      });
    });

    html += '</div>';
    return html;
  }

  /* ============================================================
     THREE-WAY CALC — inline update (no re-render)
     ============================================================ */

  function _applyThreeWay(rowKey, source, value) {
    var row = document.querySelector('[data-row-key="' + rowKey + '"]');
    if (!row) return;

    var productId = row.getAttribute('data-product-id');
    var product   = _state.productMap[productId];
    if (!product) return;

    var price = parseNum(product.avg_price_eur);
    var ratio = parseNum(product.container_ratio);

    var result = calcThreeWay(source, value, price, ratio);

    // Update sibling inputs without triggering their events
    var qtyInput   = row.querySelector('.orders-planned-qty');
    var euroInput  = row.querySelector('.orders-planned-euro');
    var containerEl = row.querySelector('.orders-computed[aria-label="Konteyner"]');
    var totalEl    = row.querySelector('.orders-total-euro');

    if (source !== 'qty' && qtyInput && result.qty !== null) {
      qtyInput.setAttribute('data-skip', '1');
      qtyInput.value = Math.round(result.qty * 100) / 100;
    }
    if (source !== 'euro' && euroInput && result.euro !== null) {
      euroInput.setAttribute('data-skip', '1');
      euroInput.value = Math.round(result.euro);
    }
    if (containerEl && result.container !== null) {
      containerEl.textContent = fmtQty(result.container);
    }

    // Update total euro display
    if (totalEl) {
      var order = _state.orders.find(function(o) {
        return o.customer_id === row.getAttribute('data-customer-id') &&
               o.product_id  === productId;
      });
      var shippedQty  = order ? (parseNum(order.shipped_qty) || 0) : 0;
      var shippedEuro = price ? shippedQty * price : 0;
      var plannedEuro = result.euro || 0;
      totalEl.textContent = fmtEuro(shippedEuro + plannedEuro);
    }
  }

  /* ============================================================
     SAVE
     ============================================================ */

  function _scheduleSave(rowKey, plannedQty, note) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() {
      _saveRow(rowKey, plannedQty, note);
    }, 600);
  }

  async function _saveRow(rowKey, plannedQty, note) {
    var parts      = rowKey.split('__');
    var customerId = parts[0];
    var productId  = parts[1];

    // Find existing order
    var order = _state.orders.find(function(o) {
      return o.customer_id === customerId && o.product_id === productId;
    });

    var ok = false;
    if (order) {
      ok = await dbUpdateOrderPlanned(order.id, plannedQty, note);
    } else {
      ok = await dbUpsertOrder({
        customer_id: customerId,
        product_id:  productId,
        shipped_qty: 0,
        planned_qty: plannedQty,
        note:        note || ''
      });
    }

    if (ok) {
      _showSaved();
      // Update local state
      await _loadAll();
    }
  }

  function _showSaved() {
    if (!_saveIndicator) return;
    _saveIndicator.classList.add('visible');
    setTimeout(function() {
      _saveIndicator.classList.remove('visible');
    }, 1800);
  }

  function _injectSaveIndicator() {
    var existing = document.getElementById('orders-save-indicator');
    if (existing) return;
    var el = document.createElement('div');
    el.id = 'orders-save-indicator';
    el.className = 'orders-save-indicator';
    el.innerHTML = '<span>&#x2713;</span> Kaydedildi';
    document.body.appendChild(el);
    _saveIndicator = el;
  }

  /* ============================================================
     IMPORT
     ============================================================ */

  function _handleImportFile(file) {
    if (!file) return;
    if (typeof processImportFile === 'function') {
      processImportFile(file, _state.customers, _state.products, function(previewData) {
        _state.importPreviewData = previewData;
        _state.importDetailVisible = false;
        _render();
      });
    }
  }

  async function _confirmImport() {
    if (!_state.importPreviewData) return;
    var rows = _state.importPreviewData.rows || [];
    var done = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row.customer_id || !row.product_id) continue;
      var ok = await dbImportOrder(row.customer_id, row.product_id, row.qty, row.euro);
      if (ok) done++;
    }

    showToast(done + ' satir y&#xFC;klendi');
    _state.importPreviewData = null;
    await _loadAll();
    _render();
    emitDataChange('orders', {});
  }

  /* ============================================================
     BIND EVENTS
     ============================================================ */

  function _bindGlobalEvents() {
    // Realtime
    document.addEventListener('nsdata:dataChanged', function(e) {
      var affected = ['orders', 'products', 'customers'];
      if (affected.includes(e.detail.table)) {
        _loadAll().then(function() {
          if (document.getElementById('screen-orders').classList.contains('active')) {
            _render();
          }
        });
      }
    });

    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'orders') {
        _render();
      }
    });

    document.addEventListener('nsdata:filterCleared', function() {
      _state.searchQuery = '';
      _render();
    });
  }

  function _bindScreenEvents() {
    // Search
    var searchEl = document.getElementById('orders-search');
    if (searchEl) {
      var dSearch = debounce(function(v) {
        _state.searchQuery = v.trim();
        if (_state.searchQuery) showFilterBanner(_state.searchQuery);
        else hideFilterBanner();
        _render();
      }, 250);
      searchEl.addEventListener('input', function() { dSearch(searchEl.value); });
    }

    // Import zone — drag & drop
    var zone = document.getElementById('orders-import-zone');
    if (zone) {
      zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', function() {
        zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        var file = e.dataTransfer.files[0];
        if (file) _handleImportFile(file);
      });
    }

    // Import file input
    var importBtn   = document.getElementById('orders-import-btn');
    var importInput = document.getElementById('orders-import-input');
    var openImportBtn = document.getElementById('orders-open-import');

    if (importBtn && importInput) {
      importBtn.addEventListener('click', function() { importInput.click(); });
    }
    if (openImportBtn && importInput) {
      openImportBtn.addEventListener('click', function() { importInput.click(); });
    }
    if (importInput) {
      importInput.addEventListener('change', function() {
        if (importInput.files[0]) _handleImportFile(importInput.files[0]);
        importInput.value = '';
      });
    }

    // Import preview buttons
    var cancelBtn  = document.getElementById('orders-import-cancel');
    var confirmBtn = document.getElementById('orders-import-confirm');
    var detailToggle = document.getElementById('orders-import-detail-toggle');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() {
        _state.importPreviewData = null;
        _render();
      });
    }
    if (confirmBtn) {
      confirmBtn.addEventListener('click', _confirmImport);
    }
    if (detailToggle) {
      detailToggle.addEventListener('click', function() {
        _state.importDetailVisible = !_state.importDetailVisible;
        var body = document.getElementById('orders-import-detail-body');
        if (body) body.classList.toggle('visible', _state.importDetailVisible);
        detailToggle.querySelector('span').textContent =
          (_state.importDetailVisible ? '&#x25BC;' : '&#x25B6;') + ' Ayr&#x131;nt&#x131;l&#x131; g&#xF6;r&#xFC;nt&#xFC;le';
      });
    }

    // Inactive toggle
    var inactiveToggle = document.getElementById('orders-inactive-toggle');
    if (inactiveToggle) {
      inactiveToggle.addEventListener('click', function() {
        _state.showInactive = !_state.showInactive;
        _render();
      });
    }

    // Export
    var exportBtn = document.getElementById('orders-export-excel');
    if (exportBtn) {
      exportBtn.addEventListener('click', function() {
        if (typeof exportOrdersToExcel === 'function') {
          exportOrdersToExcel(_state.orders, _state.products, _state.customers);
        }
      });
    }

    // Customer name clicks
    document.querySelectorAll('.orders-customer-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });

    // Planned qty inputs — three-way calc
    document.querySelectorAll('.orders-planned-qty').forEach(function(input) {
      input.addEventListener('focus', function() {
        _state.activeRowId = input.getAttribute('data-row-key');
      });
      input.addEventListener('input', function() {
        if (input.getAttribute('data-skip') === '1') {
          input.removeAttribute('data-skip');
          return;
        }
        var rowKey = input.getAttribute('data-row-key');
        var val    = parseNum(input.value);
        _applyThreeWay(rowKey, 'qty', val);
        _scheduleRowSave(rowKey);
      });
    });

    // Planned euro inputs — three-way calc
    document.querySelectorAll('.orders-planned-euro').forEach(function(input) {
      input.addEventListener('focus', function() {
        _state.activeRowId = input.getAttribute('data-row-key');
      });
      input.addEventListener('input', function() {
        if (input.getAttribute('data-skip') === '1') {
          input.removeAttribute('data-skip');
          return;
        }
        var rowKey = input.getAttribute('data-row-key');
        var val    = parseNum(input.value);
        _applyThreeWay(rowKey, 'euro', val);
        _scheduleRowSave(rowKey);
      });
    });

    // Note inputs
    document.querySelectorAll('.orders-note-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var rowKey = input.getAttribute('data-row-key');
        _scheduleRowSave(rowKey);
      });
    });
  }

  function _scheduleRowSave(rowKey) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() {
      var row = document.querySelector('[data-row-key="' + rowKey + '"]');
      var qtyInput  = row ? row.querySelector('.orders-planned-qty')  : null;
      var noteInput = row ? row.querySelector('.orders-note-input')   : null;
      var plannedQty = qtyInput  ? parseNum(qtyInput.value)  : null;
      var note       = noteInput ? noteInput.value : null;
      _saveRow(rowKey, plannedQty, note);
    }, 600);
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
