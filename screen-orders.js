/* NSDATA - screen-orders.js v1.2.0 */
/* TradingView-style filter bar, column sort, group collapse, dense rows */
(function() {
  'use strict';

  var _state = {
    orders: [], products: [], customers: [], productMap: {}, customerMap: {},
    searchQuery: '',
    showInactive: false,
    importPreviewData: null,
    importDetailVisible: false,
    currentMonth: null, currentYear: null,
    activeRowId: null,
    addRowOpen: false,
    // Filters
    filters: { countries: [], products: [] },
    // Sort: { col: 'customer'|'shipped_euro'|'planned_euro'|'total_euro', dir: 'asc'|'desc' }
    sort: { col: null, dir: 'asc' },
    // Collapsed groups
    collapsed: {},
    // Hidden columns
    hiddenCols: {},
    // Dropdowns open
    openDropdown: null
  };

  var _saveTimer = null;
  var _saveIndicator = null;

  var COLS = [
    { id: 'shipped_qty',    label: 'Çıkan Adet',    sortable: false },
    { id: 'shipped_euro',   label: 'Çıkan Euro',     sortable: true  },
    { id: 'planned_qty',    label: 'Çıkacak Adet',  sortable: false },
    { id: 'planned_euro',   label: 'Çıkacak Euro',  sortable: true  },
    { id: 'container',      label: 'Konteyner',      sortable: false },
    { id: 'total_euro',     label: 'Toplam Euro',    sortable: true  },
    { id: 'note',           label: 'Not',            sortable: false }
  ];

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
    var r = await Promise.all([dbGetOrders(), dbGetProducts(), dbGetCustomers()]);
    _state.orders    = r[0];
    _state.products  = r[1];
    _state.customers = r[2];
    _state.productMap  = buildProductMap(_state.products);
    _state.customerMap = buildCustomerMap(_state.customers);
  }

  /* ============================================================ RENDER */
  function _render() {
    var screen = document.getElementById('screen-orders');
    if (!screen) return;
    screen.innerHTML = _buildHTML();
    _bindScreenEvents();
  }

  function _buildHTML() {
    return _buildFilterBar() +
           _buildActiveChips() +
           _buildImportPreview() +
           _buildTableCard();
  }

  /* ============================================================ FILTER BAR */
  function _buildFilterBar() {
    // Unique countries and products from active customers/products
    var allCountries = [];
    _state.customers.forEach(function(c) {
      if (c.active !== false && c.country && !allCountries.includes(c.country)) allCountries.push(c.country);
    });
    allCountries.sort();

    var allProducts = _state.products.map(function(p) { return { id: p.id, name: p.name }; });

    return '<div class="orders-filterbar" id="orders-filterbar">' +
      '<div class="orders-filterbar-inner">' +
        // Search
        '<div class="orders-search-wrap">' +
          '<span class="orders-search-icon">🔍</span>' +
          '<input type="search" id="orders-search" class="orders-search-input" placeholder="Müşteri veya ülke ara..." value="' + _esc(_state.searchQuery) + '" />' +
        '</div>' +
        // Country filter
        _buildFilterBtn('country', 'Ülke', allCountries.map(function(c){ return { id: c, label: c }; }), _state.filters.countries) +
        // Product filter
        _buildFilterBtn('product', 'Ürün', allProducts.map(function(p){ return { id: p.id, label: p.name }; }), _state.filters.products) +
        // Column visibility
        _buildColVisBtn() +
        // Spacer
        '<div style="flex:1"></div>' +
        // Actions
        '<div class="orders-toolbar-actions">' +
          '<button class="btn btn-secondary" id="orders-export-excel" style="font-size:13px;height:36px">Excel İndir</button>' +
          '<label class="btn btn-primary" style="cursor:pointer;font-size:13px;height:36px">' +
            'ERP\'den Yükle (xlsx)' +
            '<input type="file" id="orders-import-input" accept=".xlsx,.xls" style="display:none" />' +
          '</label>' +
        '</div>' +
      '</div>' +
      // Dropdowns
      _buildCountryDropdown(allCountries) +
      _buildProductDropdown(allProducts) +
      _buildColVisDropdown() +
    '</div>';
  }

  function _buildFilterBtn(key, label, items, selected) {
    var hasFilter = selected.length > 0;
    var btnClass  = hasFilter ? 'orders-filter-btn orders-filter-btn--active' : 'orders-filter-btn';
    var countBadge = hasFilter ? '<span class="orders-filter-count">' + selected.length + '</span>' : '';
    return '<button class="' + btnClass + '" data-filter="' + key + '">' +
      label + countBadge + ' ▾' +
    '</button>';
  }

  function _buildColVisBtn() {
    var hiddenCount = Object.keys(_state.hiddenCols).filter(function(k){ return _state.hiddenCols[k]; }).length;
    var badge = hiddenCount > 0 ? '<span class="orders-filter-count">' + hiddenCount + '</span>' : '';
    return '<button class="orders-filter-btn" data-filter="colvis">Kolonlar' + badge + ' ▾</button>';
  }

  function _buildCountryDropdown(allCountries) {
    var open = _state.openDropdown === 'country';
    if (!open) return '<div id="orders-dd-country" class="orders-dropdown" style="display:none"></div>';

    var items = allCountries.map(function(c) {
      var checked = _state.filters.countries.includes(c);
      return '<label class="orders-dd-item">' +
        '<input type="checkbox" class="orders-dd-cb" data-filter="country" data-value="' + _esc(c) + '" ' + (checked ? 'checked' : '') + '>' +
        '<span>' + _esc(c) + '</span>' +
      '</label>';
    }).join('');

    return '<div id="orders-dd-country" class="orders-dropdown">' +
      '<input type="search" class="orders-dd-search" placeholder="Ülke ara..." />' +
      '<div class="orders-dd-list">' + (items || '<div class="orders-dd-empty">Ülke bulunamadı</div>') + '</div>' +
      '<div class="orders-dd-footer"><button class="orders-dd-reset" data-filter="country">Sıfırla</button></div>' +
    '</div>';
  }

  function _buildProductDropdown(allProducts) {
    var open = _state.openDropdown === 'product';
    if (!open) return '<div id="orders-dd-product" class="orders-dropdown" style="display:none"></div>';

    var items = allProducts.map(function(p) {
      var checked = _state.filters.products.includes(p.id);
      return '<label class="orders-dd-item">' +
        '<input type="checkbox" class="orders-dd-cb" data-filter="product" data-value="' + p.id + '" ' + (checked ? 'checked' : '') + '>' +
        '<span>' + _esc(p.name) + '</span>' +
      '</label>';
    }).join('');

    return '<div id="orders-dd-product" class="orders-dropdown">' +
      '<input type="search" class="orders-dd-search" placeholder="Ürün ara..." />' +
      '<div class="orders-dd-list">' + (items || '<div class="orders-dd-empty">Ürün bulunamadı</div>') + '</div>' +
      '<div class="orders-dd-footer"><button class="orders-dd-reset" data-filter="product">Sıfırla</button></div>' +
    '</div>';
  }

  function _buildColVisDropdown() {
    var open = _state.openDropdown === 'colvis';
    if (!open) return '<div id="orders-dd-colvis" class="orders-dropdown" style="display:none"></div>';

    var items = COLS.map(function(col) {
      var hidden = !!_state.hiddenCols[col.id];
      return '<label class="orders-dd-item">' +
        '<input type="checkbox" class="orders-colvis-cb" data-col="' + col.id + '" ' + (!hidden ? 'checked' : '') + '>' +
        '<span>' + col.label + '</span>' +
      '</label>';
    }).join('');

    return '<div id="orders-dd-colvis" class="orders-dropdown">' +
      '<div class="orders-dd-list">' + items + '</div>' +
    '</div>';
  }

  /* ============================================================ ACTIVE CHIPS */
  function _buildActiveChips() {
    var chips = '';

    _state.filters.countries.forEach(function(c) {
      chips += '<span class="orders-chip">Ülke: ' + _esc(c) +
        '<button class="orders-chip-x" data-filter="country" data-value="' + _esc(c) + '">×</button></span>';
    });
    _state.filters.products.forEach(function(pid) {
      var p = _state.productMap[pid];
      var label = p ? p.name : pid;
      chips += '<span class="orders-chip">Ürün: ' + _esc(label) +
        '<button class="orders-chip-x" data-filter="product" data-value="' + pid + '">×</button></span>';
    });
    if (_state.searchQuery) {
      chips += '<span class="orders-chip">Arama: ' + _esc(_state.searchQuery) +
        '<button class="orders-chip-x" data-filter="search" data-value="">×</button></span>';
    }

    if (!chips) return '';
    return '<div class="orders-chips-bar">' + chips +
      '<button class="orders-chips-clear" id="orders-chips-clear">Tümünü Temizle</button>' +
    '</div>';
  }

  /* ============================================================ TABLE */
  function _buildTableCard() {
    var rows = _buildTableRows();
    var thead = _buildThead();

    return '<div class="orders-table-card">' +
      '<div class="orders-table-wrap">' +
        '<table class="orders-table" role="grid">' +
          '<thead>' + thead + '</thead>' +
          '<tbody id="orders-tbody">' + rows + _buildAddRow() + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="orders-inactive-toggle" id="orders-inactive-toggle">' +
        '<span>' + (_state.showInactive ? 'Pasif müşterileri gizle' : 'Pasif müşterileri göster') + '</span>' +
        '<span>' + (_state.showInactive ? '▲' : '▼') + '</span>' +
      '</div>' +
    '</div>';
  }

  function _buildThead() {
    var cols = '<th class="orders-th orders-th--name">Müşteri / Ürün</th>';
    COLS.forEach(function(col) {
      if (_state.hiddenCols[col.id]) return;
      var sortIcon = '';
      if (col.sortable) {
        if (_state.sort.col === col.id) {
          sortIcon = _state.sort.dir === 'asc' ? ' ↑' : ' ↓';
        } else {
          sortIcon = ' ⇅';
        }
      }
      cols += '<th class="orders-th orders-th--num' + (col.sortable ? ' orders-th--sortable' : '') + '" ' +
        (col.sortable ? 'data-sort="' + col.id + '"' : '') + '>' +
        col.label + sortIcon + '</th>';
    });
    return '<tr>' + cols + '</tr>';
  }

  function _buildTableRows() {
    var q   = _state.searchQuery.toLowerCase();
    var fC  = _state.filters.countries;
    var fP  = _state.filters.products;

    var activeCustomers = _state.customers.filter(function(c) {
      if (c.active === false) return false;
      if (fC.length && !fC.includes(c.country)) return false;
      if (q && !c.name.toLowerCase().includes(q) && !(c.country||'').toLowerCase().includes(q)) return false;
      return true;
    });

    var inactiveCustomers = _state.customers.filter(function(c) { return c.active === false; });

    // Sort customers
    if (_state.sort.col) {
      activeCustomers = _sortCustomers(activeCustomers, fP);
    }

    var html = '';
    activeCustomers.forEach(function(c) { html += _buildCustomerGroup(c, false, fP); });
    if (_state.showInactive) {
      inactiveCustomers.forEach(function(c) { html += _buildCustomerGroup(c, true, fP); });
    }

    if (!html) {
      html = '<tr><td colspan="' + (2 + _visibleColCount()) + '" class="orders-empty">' +
        (_state.customers.length === 0 ? 'Henüz müşteri yok. Ayarlar › Müşteriler bölümünden ekleyin.' : 'Veri bulunamadı') +
      '</td></tr>';
    }
    return html;
  }

  function _sortCustomers(customers, fP) {
    var col = _state.sort.col;
    var dir = _state.sort.dir === 'asc' ? 1 : -1;

    return customers.slice().sort(function(a, b) {
      if (col === 'customer') {
        return dir * a.name.localeCompare(b.name, 'tr');
      }
      var aVal = _customerColTotal(a.id, col, fP);
      var bVal = _customerColTotal(b.id, col, fP);
      return dir * (aVal - bVal);
    });
  }

  function _customerColTotal(customerId, col, fP) {
    var total = 0;
    _state.orders.forEach(function(o) {
      if (o.customer_id !== customerId) return;
      if (fP.length && !fP.includes(o.product_id)) return;
      var product = _state.productMap[o.product_id];
      if (!product) return;
      var price = parseNum(product.avg_price_eur) || 0;
      var shipped = parseNum(o.shipped_qty) || 0;
      var planned = parseNum(o.planned_qty) || 0;
      if (col === 'shipped_euro') total += shipped * price;
      else if (col === 'planned_euro') total += planned * price;
      else if (col === 'total_euro') total += (shipped + planned) * price;
    });
    return total;
  }

  function _buildCustomerGroup(customer, inactive, fP) {
    var products = fP.length
      ? _state.products.filter(function(p) { return fP.includes(p.id); })
      : _state.products;

    if (!products.length) return '';

    var isCollapsed = !!_state.collapsed[customer.id];
    var rowClass = inactive ? 'orders-inactive-section' : '';

    // Group header row
    var colCount = 1 + _visibleColCount();
    var displayName = CustomerManager.displayName(customer);
    var html = '<tr class="orders-group-row ' + rowClass + '" data-customer-id="' + customer.id + '">' +
      '<td colspan="' + colCount + '" class="orders-group-td">' +
        '<button class="orders-group-collapse" data-customer-id="' + customer.id + '">' +
          (isCollapsed ? '▶' : '▼') +
        '</button>' +
        '<button class="orders-customer-btn" data-customer-id="' + customer.id + '">' +
          _esc(displayName) +
        '</button>' +
        (customer.country ? '<span class="orders-group-country">' + _esc(customer.country) + '</span>' : '') +
        (customer.sub_market ? '<span class="orders-group-submarket">' + _esc(customer.sub_market) + '</span>' : '') +
      '</td>' +
    '</tr>';

    if (isCollapsed) return html;

    products.forEach(function(product) {
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
      var rowKey      = customer.id + '__' + product.id;
      var isActive    = _state.activeRowId === rowKey;

      html += '<tr class="orders-data-row ' + (inactive ? 'orders-inactive-section' : '') + (isActive ? ' orders-active-row' : '') + '" ' +
        'data-row-key="' + rowKey + '" data-customer-id="' + customer.id + '" data-product-id="' + product.id + '">' +
        '<td class="orders-td orders-td--name"><div class="orders-product-name">' + _esc(product.name) + '</div></td>';

      COLS.forEach(function(col) {
        if (_state.hiddenCols[col.id]) return;
        if (col.id === 'shipped_qty') {
          html += '<td class="orders-td orders-td--num"><input type="number" min="0" class="orders-input orders-shipped-qty" data-source="shipped" data-row-key="' + rowKey + '" value="' + (shippedQty || '') + '" placeholder="0" /></td>';
        } else if (col.id === 'shipped_euro') {
          html += '<td class="orders-td orders-td--num"><div class="orders-computed orders-shipped-euro">' + (shippedEuro > 0 ? fmtEuro(shippedEuro) : '—') + '</div></td>';
        } else if (col.id === 'planned_qty') {
          html += '<td class="orders-td orders-td--num"><input type="number" min="0" class="orders-input orders-planned-qty" data-source="qty" data-row-key="' + rowKey + '" value="' + (plannedQty || '') + '" placeholder="0" /></td>';
        } else if (col.id === 'planned_euro') {
          html += '<td class="orders-td orders-td--num"><input type="number" min="0" class="orders-input orders-planned-euro" data-source="euro" data-row-key="' + rowKey + '" value="' + (plannedEuro || '') + '" placeholder="0" /></td>';
        } else if (col.id === 'container') {
          html += '<td class="orders-td orders-td--num"><div class="orders-computed">' + (containers !== null ? fmtQty(containers) : '—') + '</div></td>';
        } else if (col.id === 'total_euro') {
          html += '<td class="orders-td orders-td--num"><div class="orders-computed orders-total-euro">' + (totalEuro > 0 ? fmtEuro(totalEuro) : '—') + '</div></td>';
        } else if (col.id === 'note') {
          html += '<td class="orders-td"><input type="text" class="orders-note-input" data-row-key="' + rowKey + '" value="' + _esc(order ? (order.note || '') : '') + '" placeholder="Not..." maxlength="200" /></td>';
        }
      });

      html += '</tr>';
    });

    return html;
  }

  function _visibleColCount() {
    return COLS.filter(function(col) { return !_state.hiddenCols[col.id]; }).length;
  }

  /* ============================================================ ADD ROW */
  function _buildAddRow() {
    var colCount = 1 + _visibleColCount();
    if (!_state.addRowOpen) {
      return '<tr><td colspan="' + colCount + '" style="padding:0">' +
        '<button id="orders-add-row-btn" class="orders-add-row-btn">+ Satır Ekle</button>' +
      '</td></tr>';
    }

    var activeCustomers = _state.customers.filter(function(c) { return c.active !== false; });
    var custOpts = '<option value="">Müşteri seç...</option>' +
      activeCustomers.map(function(c) {
        return '<option value="' + c.id + '">' + _esc(CustomerManager.displayName(c)) + '</option>';
      }).join('');
    var prodOpts = '<option value="">Ürün seç...</option>' +
      _state.products.map(function(p) {
        return '<option value="' + p.id + '">' + _esc(p.name) + '</option>';
      }).join('');

    return '<tr id="orders-new-row" class="orders-new-row">' +
      '<td><select id="orders-new-customer" class="orders-new-select">' + custOpts + '</select>' +
          '<select id="orders-new-product" class="orders-new-select" style="margin-top:4px">' + prodOpts + '</select></td>' +
      '<td><input type="number" min="0" id="orders-new-shipped" class="orders-input" placeholder="0" /></td>' +
      '<td><div class="orders-computed" id="orders-new-shipped-euro">—</div></td>' +
      '<td><input type="number" min="0" id="orders-new-planned-qty" class="orders-input" placeholder="0" /></td>' +
      '<td><input type="number" min="0" id="orders-new-planned-euro" class="orders-input" placeholder="0" /></td>' +
      '<td><div class="orders-computed" id="orders-new-container">—</div></td>' +
      '<td><div class="orders-computed" id="orders-new-total-euro">—</div></td>' +
      '<td>' +
        '<input type="text" id="orders-new-note" class="orders-note-input" placeholder="Not..." maxlength="200" />' +
        '<div style="display:flex;gap:6px;margin-top:4px">' +
          '<button id="orders-new-save" class="btn btn-primary" style="font-size:13px;height:32px;padding:0 12px">Kaydet</button>' +
          '<button id="orders-new-cancel" class="btn btn-secondary" style="font-size:13px;height:32px;padding:0 10px">İptal</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }

  /* ============================================================ IMPORT PREVIEW */
  function _buildImportPreview() {
    if (!_state.importPreviewData) return '';
    var data = _state.importPreviewData;
    var detailRows = (data.rows || []).slice(0, 50).map(function(row) {
      var cls = row.matched ? '' : 'style="color:var(--color-warning)"';
      return '<tr><td ' + cls + '>' + _esc(row.customer_name) + '</td>' +
        '<td>' + _esc(row.product_name) + '</td>' +
        '<td style="text-align:right">' + fmtQty(row.qty) + '</td>' +
        '<td style="text-align:right">' + fmtEuro(row.euro) + '</td>' +
        '<td>' + (row.matched ? '<span style="color:var(--color-positive)">✓ Eşleşti</span>' : '<span style="color:var(--color-warning)">Yeni</span>') + '</td></tr>';
    }).join('');

    return '<div class="orders-import-preview visible" id="orders-import-preview">' +
      '<div class="orders-import-preview-header">' +
        '<span class="orders-import-preview-title">İmport Onay</span>' +
        '<button class="btn btn-secondary" id="orders-import-cancel">İptal</button>' +
      '</div>' +
      '<div class="orders-import-summary">' +
        _sumItem('Müşteri', data.customerCount || 0) +
        _sumItem('Ürün', data.productCount || 0) +
        _sumItem('Satır', data.rowCount || 0) +
        _sumItem('Eşleşmeyenler', data.unmatchedCount || 0, 'var(--color-warning)') +
      '</div>' +
      '<div class="orders-import-detail-toggle" id="orders-import-detail-toggle">' +
        '<span>' + (_state.importDetailVisible ? '▼' : '▶') + ' Ayrıntılı görüntüle</span>' +
      '</div>' +
      '<div class="orders-import-detail-body' + (_state.importDetailVisible ? ' visible' : '') + '" id="orders-import-detail-body">' +
        '<table class="orders-import-detail-table">' +
          '<thead><tr><th>Müşteri</th><th>Ürün</th><th>Adet</th><th>Euro</th><th>Durum</th></tr></thead>' +
          '<tbody>' + detailRows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="orders-import-actions">' +
        '<button class="btn btn-primary" id="orders-import-confirm">Evet, yükle</button>' +
      '</div>' +
    '</div>';
  }

  function _sumItem(label, val, color) {
    return '<div class="orders-import-summary-item">' +
      '<span class="orders-import-summary-label">' + label + '</span>' +
      '<span class="orders-import-summary-value"' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</span>' +
    '</div>';
  }

  /* ============================================================ THREE-WAY CALC */
  function _applyThreeWay(rowKey, source, value) {
    var row = document.querySelector('[data-row-key="' + rowKey + '"]');
    if (!row) return;
    var product = _state.productMap[row.getAttribute('data-product-id')];
    if (!product) return;
    var price = parseNum(product.avg_price_eur);
    var ratio = parseNum(product.container_ratio);

    if (source === 'shipped') {
      var se = row.querySelector('.orders-shipped-euro');
      if (se) se.textContent = price && value ? fmtEuro(value * price) : '—';
      _updateTotalEuro(row, value, null, price);
      return;
    }
    var result = calcThreeWay(source, value, price, ratio);
    var qtyEl  = row.querySelector('.orders-planned-qty');
    var eurEl  = row.querySelector('.orders-planned-euro');
    var ctnEl  = row.querySelector('.orders-computed:not(.orders-shipped-euro):not(.orders-total-euro)');

    if (source !== 'qty'  && qtyEl && result.qty  !== null) { qtyEl.setAttribute('data-skip','1'); qtyEl.value = Math.round(result.qty * 100)/100; }
    if (source !== 'euro' && eurEl && result.euro !== null) { eurEl.setAttribute('data-skip','1'); eurEl.value = Math.round(result.euro); }
    if (ctnEl && result.container !== null) ctnEl.textContent = fmtQty(result.container);
    _updateTotalEuro(row, null, result.euro, price);
  }

  function _updateTotalEuro(row, newShipped, newPlanned, price) {
    var totalEl = row.querySelector('.orders-total-euro');
    if (!totalEl) return;
    var si = row.querySelector('.orders-shipped-qty');
    var pi = row.querySelector('.orders-planned-euro');
    var shipped = newShipped !== null ? newShipped : (si ? parseNum(si.value) || 0 : 0);
    var planned = newPlanned !== null ? newPlanned : (pi ? parseNum(pi.value) || 0 : 0);
    var total = (price ? shipped * price : 0) + planned;
    totalEl.textContent = total > 0 ? fmtEuro(total) : '—';
  }

  /* ============================================================ SAVE */
  function _scheduleRowSave(rowKey) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() { _saveRow(rowKey); }, 600);
  }

  async function _saveRow(rowKey) {
    var row = document.querySelector('[data-row-key="' + rowKey + '"]');
    if (!row) return;
    var si = row.querySelector('.orders-shipped-qty');
    var qi = row.querySelector('.orders-planned-qty');
    var ni = row.querySelector('.orders-note-input');
    var shippedQty = si ? (parseNum(si.value) || 0) : 0;
    var plannedQty = qi ? (parseNum(qi.value) || 0) : 0;
    var note       = ni ? ni.value : '';
    var parts      = rowKey.split('__');
    var order = _state.orders.find(function(o) { return o.customer_id === parts[0] && o.product_id === parts[1]; });
    var ok = await dbUpsertOrder(Object.assign(order ? { id: order.id } : {}, {
      customer_id: parts[0], product_id: parts[1],
      shipped_qty: shippedQty, planned_qty: plannedQty, note: note
    }));
    if (ok) { _showSaved(); await _loadAll(); emitDataChange('orders', {}); }
  }

  function _showSaved() {
    if (!_saveIndicator) return;
    _saveIndicator.classList.add('visible');
    setTimeout(function() { _saveIndicator.classList.remove('visible'); }, 1800);
  }

  function _injectSaveIndicator() {
    if (document.getElementById('orders-save-indicator')) return;
    var el = document.createElement('div');
    el.id = 'orders-save-indicator';
    el.className = 'orders-save-indicator';
    el.innerHTML = '✓ Kaydedildi';
    document.body.appendChild(el);
    _saveIndicator = el;
  }

  /* ============================================================ NEW ROW */
  function _bindNewRowEvents() {
    var addBtn = document.getElementById('orders-add-row-btn');
    if (addBtn) addBtn.addEventListener('click', function() {
      _state.addRowOpen = true; _render();
      var s = document.getElementById('orders-new-customer'); if (s) s.focus();
    });
    var cancelBtn = document.getElementById('orders-new-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function() { _state.addRowOpen = false; _render(); });
    var saveBtn = document.getElementById('orders-new-save');
    if (saveBtn) saveBtn.addEventListener('click', _saveNewRow);

    var si = document.getElementById('orders-new-shipped');
    var qi = document.getElementById('orders-new-planned-qty');
    var ei = document.getElementById('orders-new-planned-euro');
    var ps = document.getElementById('orders-new-product');

    function _calc() {
      var product = ps ? _state.productMap[ps.value] : null;
      var price   = product ? parseNum(product.avg_price_eur) : 0;
      var ratio   = product ? parseNum(product.container_ratio) : null;
      var sq = si ? parseNum(si.value) || 0 : 0;
      var pq = qi ? parseNum(qi.value) || 0 : 0;
      var se = price ? sq * price : 0;
      var pe = price ? pq * price : 0;
      var ct = ratio && ratio > 0 ? (sq + pq) / ratio : null;
      var seEl = document.getElementById('orders-new-shipped-euro');
      var cEl  = document.getElementById('orders-new-container');
      var tEl  = document.getElementById('orders-new-total-euro');
      if (seEl) seEl.textContent = se > 0 ? fmtEuro(se) : '—';
      if (cEl)  cEl.textContent  = ct !== null ? fmtQty(ct) : '—';
      if (tEl)  tEl.textContent  = (se + pe) > 0 ? fmtEuro(se + pe) : '—';
      if (ei && document.activeElement === qi) ei.value = pe > 0 ? Math.round(pe) : '';
    }
    if (si) si.addEventListener('input', _calc);
    if (qi) qi.addEventListener('input', _calc);
    if (ei) ei.addEventListener('input', _calc);
    if (ps) ps.addEventListener('change', _calc);
  }

  async function _saveNewRow() {
    var cid = (document.getElementById('orders-new-customer') || {}).value || '';
    var pid = (document.getElementById('orders-new-product')  || {}).value || '';
    if (!cid || !pid) { showToast('Müşteri ve ürün seçilmeli'); return; }
    var sq = parseNum((document.getElementById('orders-new-shipped')      || {}).value) || 0;
    var pq = parseNum((document.getElementById('orders-new-planned-qty')  || {}).value) || 0;
    var note = (document.getElementById('orders-new-note') || {}).value || '';
    var ok = await dbUpsertOrder({ customer_id: cid, product_id: pid, shipped_qty: sq, planned_qty: pq, note: note });
    if (ok) { _showSaved(); _state.addRowOpen = false; await _loadAll(); _render(); emitDataChange('orders', {}); }
    else showToast('Kaydedilemedi');
  }

  /* ============================================================ IMPORT */
  function _handleImportFile(file) {
    if (!file || typeof processImportFile !== 'function') return;
    processImportFile(file, _state.customers, _state.products, function(preview) {
      _state.importPreviewData = preview;
      _state.importDetailVisible = false;
      _render();
    });
  }

  async function _confirmImport() {
    if (!_state.importPreviewData) return;
    var rows = _state.importPreviewData.rows || [];
    var done = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row.customer_id || !row.product_id) continue;
      if (await dbImportOrder(row.customer_id, row.product_id, row.qty)) done++;
    }
    showToast(done + ' satır yüklendi');
    _state.importPreviewData = null;
    await _loadAll(); _render(); emitDataChange('orders', {});
  }

  /* ============================================================ BIND EVENTS */
  function _bindGlobalEvents() {
    document.addEventListener('nsdata:dataChanged', function(e) {
      if (['orders','products','customers'].includes(e.detail.table)) {
        _loadAll().then(function() {
          if (document.getElementById('screen-orders').classList.contains('active')) _render();
        });
      }
    });
    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'orders') _render();
    });
    document.addEventListener('nsdata:filterCleared', function() {
      _state.searchQuery = ''; _state.filters = { countries: [], products: [] }; _render();
    });
    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
      if (_state.openDropdown && !e.target.closest('.orders-filterbar')) {
        _state.openDropdown = null; _render();
      }
    });
  }

  function _bindScreenEvents() {
    // Search
    var searchEl = document.getElementById('orders-search');
    if (searchEl) {
      var dSearch = debounce(function(v) { _state.searchQuery = v.trim(); _render(); }, 250);
      searchEl.addEventListener('input', function() { dSearch(searchEl.value); });
    }

    // Filter buttons
    document.querySelectorAll('.orders-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var key = btn.getAttribute('data-filter');
        _state.openDropdown = _state.openDropdown === key ? null : key;
        _render();
      });
    });

    // Dropdown checkboxes
    document.querySelectorAll('.orders-dd-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var filter = cb.getAttribute('data-filter');
        var value  = cb.getAttribute('data-value');
        if (filter === 'country') {
          if (cb.checked) { if (!_state.filters.countries.includes(value)) _state.filters.countries.push(value); }
          else _state.filters.countries = _state.filters.countries.filter(function(v){ return v !== value; });
        } else if (filter === 'product') {
          if (cb.checked) { if (!_state.filters.products.includes(value)) _state.filters.products.push(value); }
          else _state.filters.products = _state.filters.products.filter(function(v){ return v !== value; });
        }
        _render();
      });
    });

    // Column visibility
    document.querySelectorAll('.orders-colvis-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        _state.hiddenCols[cb.getAttribute('data-col')] = !cb.checked;
        _render();
      });
    });

    // Dropdown search (live filter of items)
    document.querySelectorAll('.orders-dd-search').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var q = inp.value.toLowerCase();
        var list = inp.closest('.orders-dropdown').querySelector('.orders-dd-list');
        if (!list) return;
        list.querySelectorAll('.orders-dd-item').forEach(function(item) {
          item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    });

    // Reset buttons
    document.querySelectorAll('.orders-dd-reset').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var filter = btn.getAttribute('data-filter');
        if (filter === 'country') _state.filters.countries = [];
        else if (filter === 'product') _state.filters.products = [];
        _render();
      });
    });

    // Chip remove
    document.querySelectorAll('.orders-chip-x').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var filter = btn.getAttribute('data-filter');
        var value  = btn.getAttribute('data-value');
        if (filter === 'country') _state.filters.countries = _state.filters.countries.filter(function(v){ return v !== value; });
        else if (filter === 'product') _state.filters.products = _state.filters.products.filter(function(v){ return v !== value; });
        else if (filter === 'search') _state.searchQuery = '';
        _render();
      });
    });

    var clearAll = document.getElementById('orders-chips-clear');
    if (clearAll) clearAll.addEventListener('click', function() {
      _state.searchQuery = ''; _state.filters = { countries: [], products: [] }; _render();
    });

    // Sort headers
    document.querySelectorAll('.orders-th--sortable').forEach(function(th) {
      th.addEventListener('click', function() {
        var col = th.getAttribute('data-sort');
        if (_state.sort.col === col) {
          if (_state.sort.dir === 'asc') _state.sort.dir = 'desc';
          else { _state.sort.col = null; _state.sort.dir = 'asc'; }
        } else {
          _state.sort.col = col; _state.sort.dir = 'desc';
        }
        _render();
      });
    });

    // Group collapse
    document.querySelectorAll('.orders-group-collapse').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-customer-id');
        _state.collapsed[cid] = !_state.collapsed[cid];
        _render();
      });
    });

    // Customer name click
    document.querySelectorAll('.orders-customer-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-customer-id');
        if (id) navigateTo('customer', { id: id });
      });
    });

    // Inactive toggle
    var inactiveToggle = document.getElementById('orders-inactive-toggle');
    if (inactiveToggle) inactiveToggle.addEventListener('click', function() {
      _state.showInactive = !_state.showInactive; _render();
    });

    // Export
    var exportBtn = document.getElementById('orders-export-excel');
    if (exportBtn) exportBtn.addEventListener('click', function() {
      if (typeof exportOrdersToExcel === 'function') exportOrdersToExcel(_state.orders, _state.products, _state.customers);
    });

    // Import
    var importInput = document.getElementById('orders-import-input');
    if (importInput) importInput.addEventListener('change', function() {
      if (importInput.files[0]) _handleImportFile(importInput.files[0]);
      importInput.value = '';
    });
    var importCancel  = document.getElementById('orders-import-cancel');
    var importConfirm = document.getElementById('orders-import-confirm');
    var importDetail  = document.getElementById('orders-import-detail-toggle');
    if (importCancel)  importCancel.addEventListener('click', function() { _state.importPreviewData = null; _render(); });
    if (importConfirm) importConfirm.addEventListener('click', _confirmImport);
    if (importDetail)  importDetail.addEventListener('click', function() {
      _state.importDetailVisible = !_state.importDetailVisible;
      var body = document.getElementById('orders-import-detail-body');
      if (body) body.classList.toggle('visible', _state.importDetailVisible);
    });

    // Inputs
    document.querySelectorAll('.orders-shipped-qty').forEach(function(inp) {
      inp.addEventListener('focus', function() { _state.activeRowId = inp.getAttribute('data-row-key'); });
      inp.addEventListener('input', function() {
        var rk = inp.getAttribute('data-row-key');
        _applyThreeWay(rk, 'shipped', parseNum(inp.value) || 0);
        _scheduleRowSave(rk);
      });
    });
    document.querySelectorAll('.orders-planned-qty').forEach(function(inp) {
      inp.addEventListener('focus', function() { _state.activeRowId = inp.getAttribute('data-row-key'); });
      inp.addEventListener('input', function() {
        if (inp.getAttribute('data-skip') === '1') { inp.removeAttribute('data-skip'); return; }
        var rk = inp.getAttribute('data-row-key');
        _applyThreeWay(rk, 'qty', parseNum(inp.value));
        _scheduleRowSave(rk);
      });
    });
    document.querySelectorAll('.orders-planned-euro').forEach(function(inp) {
      inp.addEventListener('focus', function() { _state.activeRowId = inp.getAttribute('data-row-key'); });
      inp.addEventListener('input', function() {
        if (inp.getAttribute('data-skip') === '1') { inp.removeAttribute('data-skip'); return; }
        var rk = inp.getAttribute('data-row-key');
        _applyThreeWay(rk, 'euro', parseNum(inp.value));
        _scheduleRowSave(rk);
      });
    });
    document.querySelectorAll('.orders-note-input').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var rk = inp.getAttribute('data-row-key');
        if (rk) _scheduleRowSave(rk);
      });
    });

    _bindNewRowEvents();
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
