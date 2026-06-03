/* NSDATA - screen-orders.js v1.4.0 */
/* destination_country, 6-alan three-way, çift konteyner/toplam, pasif toggle kaldırıldı */
(function() {
  'use strict';

  var _state = {
    orders: [], products: [], customers: [], productMap: {}, customerMap: {},
    searchQuery: '',
    importPreviewData: null, importDetailVisible: false,
    currentMonth: null, currentYear: null,
    activeRowKey: null,
    addRowOpen: false,
    filters: { countries: [], products: [] },
    sort: { col: null, dir: 'asc' },
    collapsed: {},
    hiddenCols: {},
    openDropdown: null
  };

  var _saveTimer = null;
  var _saveIndicator = null;

  // Çift grup: ÇIKAN ve ÇIKACAK — her biri 3 editable (adet/euro/konteyner) + 1 computed (toplam euro)
  var COL_GROUPS = [
    {
      id: 'shipped', label: 'ÇIKAN', color: '#F0FDF4', borderColor: '#86EFAC',
      cols: [
        { id: 'shipped_qty',       label: 'Adet',      type: 'input',    sortable: false },
        { id: 'shipped_euro',      label: 'Euro',      type: 'input',    sortable: true  },
        { id: 'shipped_container', label: 'Konteyner', type: 'input',    sortable: false },
        { id: 'shipped_total',     label: 'Toplam €',  type: 'computed', sortable: true  },
      ]
    },
    {
      id: 'planned', label: 'ÇIKACAK', color: '#EFF6FF', borderColor: '#93C5FD',
      cols: [
        { id: 'planned_qty',       label: 'Adet',      type: 'input',    sortable: false },
        { id: 'planned_euro',      label: 'Euro',      type: 'input',    sortable: true  },
        { id: 'planned_container', label: 'Konteyner', type: 'input',    sortable: false },
        { id: 'planned_total',     label: 'Toplam €',  type: 'computed', sortable: true  },
      ]
    },
    {
      id: 'meta', label: '', color: '', borderColor: '',
      cols: [
        { id: 'destination', label: 'Ülke', type: 'input-text', sortable: false },
        { id: 'note',        label: 'Not',  type: 'input-text', sortable: false },
      ]
    }
  ];

  function _allCols() {
    var cols = [];
    COL_GROUPS.forEach(function(g) { g.cols.forEach(function(c) { cols.push(c); }); });
    return cols;
  }

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
    setTimeout(_fixStickyHeader, 0);
  }

  function _fixStickyHeader() {
    var filterbar = document.getElementById('orders-filterbar');
    var chipsBar  = document.querySelector('#screen-orders .orders-chips-bar');
    if (!filterbar) return;
    var top = 64 + (filterbar.offsetHeight || 52) + (chipsBar ? chipsBar.offsetHeight : 0);
    document.querySelectorAll('#screen-orders .orders-th').forEach(function(th) {
      th.style.top = top + 'px';
    });
  }

  function _buildHTML() {
    return _buildFilterBar() + _buildActiveChips() + _buildImportPreview() + _buildTableCard();
  }

  /* ============================================================ FILTER BAR */
  function _buildFilterBar() {
    var allCountries = [];
    // Collect countries from orders.destination_country
    _state.orders.forEach(function(o) {
      if (o.destination_country && !allCountries.includes(o.destination_country)) allCountries.push(o.destination_country);
    });
    allCountries.sort();

    var allProducts = _state.products;

    return '<div class="orders-filterbar" id="orders-filterbar">' +
      '<div class="orders-filterbar-inner">' +
        '<div class="orders-search-wrap">' +
          '<span class="orders-search-icon">🔍</span>' +
          '<input type="search" id="orders-search" class="orders-search-input" placeholder="Müşteri veya ülke ara..." value="' + _esc(_state.searchQuery) + '" />' +
        '</div>' +
        _filterBtn('country', 'Ülke', _state.filters.countries.length) +
        _filterBtn('product', 'Ürün', _state.filters.products.length) +
        _filterBtn('colvis', 'Kolonlar', Object.values(_state.hiddenCols).filter(Boolean).length) +
        '<div style="flex:1"></div>' +
        '<div class="orders-toolbar-actions">' +
          '<button class="btn btn-secondary" id="orders-export-excel" style="font-size:13px;height:36px">Excel İndir</button>' +
          '<label class="btn btn-primary" style="cursor:pointer;font-size:13px;height:36px">' +
            'ERP\'den Yükle (xlsx)' +
            '<input type="file" id="orders-import-input" accept=".xlsx,.xls" style="display:none" />' +
          '</label>' +
        '</div>' +
      '</div>' +
      _buildCountryDD(allCountries) +
      _buildProductDD(allProducts) +
      _buildColVisDD() +
    '</div>';
  }

  function _filterBtn(key, label, count) {
    var active = count > 0;
    var cls = active ? 'orders-filter-btn orders-filter-btn--active' : 'orders-filter-btn';
    var badge = count > 0 ? '<span class="orders-filter-count">' + count + '</span>' : '';
    return '<button class="' + cls + '" data-filter="' + key + '">' + label + badge + ' ▾</button>';
  }

  function _buildCountryDD(countries) {
    if (_state.openDropdown !== 'country') return '<div id="orders-dd-country" class="orders-dropdown" style="display:none"></div>';
    var items = countries.map(function(c) {
      return '<label class="orders-dd-item"><input type="checkbox" class="orders-dd-cb" data-filter="country" data-value="' + _esc(c) + '" ' + (_state.filters.countries.includes(c) ? 'checked' : '') + '><span>' + _esc(c) + '</span></label>';
    }).join('');
    return '<div id="orders-dd-country" class="orders-dropdown">' +
      '<input type="search" class="orders-dd-search" placeholder="Ülke ara..." />' +
      '<div class="orders-dd-list">' + (items || '<div class="orders-dd-empty">Ülke bulunamadı</div>') + '</div>' +
      '<div class="orders-dd-footer"><button class="orders-dd-reset" data-filter="country">Sıfırla</button></div>' +
    '</div>';
  }

  function _buildProductDD(products) {
    if (_state.openDropdown !== 'product') return '<div id="orders-dd-product" class="orders-dropdown" style="display:none"></div>';
    var items = products.map(function(p) {
      return '<label class="orders-dd-item"><input type="checkbox" class="orders-dd-cb" data-filter="product" data-value="' + p.id + '" ' + (_state.filters.products.includes(p.id) ? 'checked' : '') + '><span>' + _esc(p.name) + '</span></label>';
    }).join('');
    return '<div id="orders-dd-product" class="orders-dropdown">' +
      '<input type="search" class="orders-dd-search" placeholder="Ürün ara..." />' +
      '<div class="orders-dd-list">' + (items || '<div class="orders-dd-empty">Ürün bulunamadı</div>') + '</div>' +
      '<div class="orders-dd-footer"><button class="orders-dd-reset" data-filter="product">Sıfırla</button></div>' +
    '</div>';
  }

  function _buildColVisDD() {
    if (_state.openDropdown !== 'colvis') return '<div id="orders-dd-colvis" class="orders-dropdown" style="display:none"></div>';
    var items = _allCols().map(function(col) {
      return '<label class="orders-dd-item"><input type="checkbox" class="orders-colvis-cb" data-col="' + col.id + '" ' + (!_state.hiddenCols[col.id] ? 'checked' : '') + '><span>' + col.label + '</span></label>';
    }).join('');
    return '<div id="orders-dd-colvis" class="orders-dropdown"><div class="orders-dd-list">' + items + '</div></div>';
  }

  /* ============================================================ CHIPS */
  function _buildActiveChips() {
    var chips = '';
    _state.filters.countries.forEach(function(c) {
      chips += '<span class="orders-chip">Ülke: ' + _esc(c) + '<button class="orders-chip-x" data-filter="country" data-value="' + _esc(c) + '">×</button></span>';
    });
    _state.filters.products.forEach(function(pid) {
      var p = _state.productMap[pid];
      chips += '<span class="orders-chip">Ürün: ' + _esc(p ? p.name : pid) + '<button class="orders-chip-x" data-filter="product" data-value="' + pid + '">×</button></span>';
    });
    if (_state.searchQuery) {
      chips += '<span class="orders-chip">Arama: ' + _esc(_state.searchQuery) + '<button class="orders-chip-x" data-filter="search" data-value="">×</button></span>';
    }
    if (!chips) return '';
    return '<div class="orders-chips-bar">' + chips + '<button class="orders-chips-clear" id="orders-chips-clear">Tümünü Temizle</button></div>';
  }

  /* ============================================================ TABLE */
  function _buildTableCard() {
    return '<div class="orders-table-card">' +
      '<div class="orders-table-wrap">' +
        '<table class="orders-table" role="grid">' +
          '<thead>' + _buildThead() + '</thead>' +
          '<tbody id="orders-tbody">' + _buildTableRows() + _buildAddRow() + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function _buildThead() {
    // Single unified header row — no rowspan, cleaner
    var row = '<tr>';
    row += '<th class="orders-th orders-th--name">Müşteri / Ürün</th>';
    COL_GROUPS.forEach(function(g) {
      g.cols.forEach(function(col) {
        if (_state.hiddenCols[col.id]) return;
        var sortIcon = col.sortable ? (_state.sort.col === col.id ? (_state.sort.dir === 'asc' ? ' ↑' : ' ↓') : ' ⇅') : '';
        var bg = g.color ? 'background:' + g.color + ';' : '';
        var bl = g.color ? 'border-left:2px solid ' + g.borderColor + ';' : '';
        var groupLabel = g.label ? '<div style="font-size:9px;letter-spacing:0.8px;color:#888;margin-bottom:1px">' + g.label + '</div>' : '';
        row += '<th class="orders-th orders-th--num' + (col.sortable ? ' orders-th--sortable' : '') + '" ' +
          'style="' + bg + bl + '" ' +
          (col.sortable ? 'data-sort="' + col.id + '"' : '') + '>' +
          groupLabel + col.label + sortIcon + '</th>';
      });
    });
    row += '</tr>';
    return row;
  }

  function _buildTableRows() {
    var q  = _state.searchQuery.toLowerCase();
    var fC = _state.filters.countries;
    var fP = _state.filters.products;

    var customers = _state.customers.filter(function(c) {
      if (c.active === false) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      // Country filter — check if customer has orders to those countries
      if (fC.length) {
        var hasCountry = _state.orders.some(function(o) {
          return o.customer_id === c.id && fC.includes(o.destination_country);
        });
        if (!hasCountry) return false;
      }
      return true;
    });

    if (_state.sort.col) customers = _sortCustomers(customers, fP);

    var html = '';
    customers.forEach(function(c) { html += _buildCustomerGroup(c, fP); });

    if (!html) {
      var colCount = 1 + _visibleColCount();
      html = '<tr><td colspan="' + colCount + '" class="orders-empty">' +
        (_state.customers.length === 0 ? 'Henüz müşteri yok. Ayarlar › Müşteriler bölümünden ekleyin.' : 'Veri bulunamadı') +
      '</td></tr>';
    }
    return html;
  }

  function _sortCustomers(customers, fP) {
    var col = _state.sort.col; var dir = _state.sort.dir === 'asc' ? 1 : -1;
    return customers.slice().sort(function(a, b) {
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
      var p = _state.productMap[o.product_id]; if (!p) return;
      var price = parseNum(p.avg_price_eur) || 0;
      var sq = parseNum(o.shipped_qty) || 0;
      var pq = parseNum(o.planned_qty) || 0;
      if (col === 'shipped_euro' || col === 'shipped_total') total += sq * price;
      else if (col === 'planned_euro' || col === 'planned_total') total += pq * price;
    });
    return total;
  }

  function _buildCustomerGroup(customer, fP) {
    var products = fP.length ? _state.products.filter(function(p){ return fP.includes(p.id); }) : _state.products;
    if (!products.length) return '';

    var isCollapsed = !!_state.collapsed[customer.id];
    var colCount = 1 + _visibleColCount();
    var displayName = CustomerManager.displayName(customer);

    var html = '<tr class="orders-group-row" data-customer-id="' + customer.id + '">' +
      '<td colspan="' + colCount + '" class="orders-group-td">' +
        '<button class="orders-group-collapse" data-customer-id="' + customer.id + '">' + (isCollapsed ? '▶' : '▼') + '</button>' +
        '<button class="orders-customer-btn" data-customer-id="' + customer.id + '">' + _esc(displayName) + '</button>' +
      '</td>' +
    '</tr>';

    if (isCollapsed) return html;

    products.forEach(function(product) {
      var order = _state.orders.find(function(o) { return o.customer_id === customer.id && o.product_id === product.id; });
      var sq    = order ? (parseNum(order.shipped_qty)  || 0) : 0;
      var pq    = order ? (parseNum(order.planned_qty)  || 0) : 0;
      var price = parseNum(product.avg_price_eur) || 0;
      var ratio = parseNum(product.container_ratio);
      var se    = price ? sq * price : 0;
      var pe    = price ? pq * price : 0;
      var sc    = ratio ? sq / ratio : null;
      var pc    = ratio ? pq / ratio : null;
      var rowKey = customer.id + '__' + product.id;
      var dest   = order ? (order.destination_country || '') : '';

      html += '<tr class="orders-data-row' + (_state.activeRowKey === rowKey ? ' orders-active-row' : '') + '" ' +
        'data-row-key="' + rowKey + '" data-customer-id="' + customer.id + '" data-product-id="' + product.id + '">' +
        '<td class="orders-td orders-td--name"><div class="orders-product-name">' + _esc(product.name) + '</div></td>';

      COL_GROUPS.forEach(function(g) {
        g.cols.forEach(function(col) {
          if (_state.hiddenCols[col.id]) return;
          var bg = g.color ? 'background:' + g.color + ';' : '';
          var bl = g.color ? 'border-left:2px solid ' + g.borderColor + ';' : '';
          var style = 'style="' + bg + bl + '"';
          var td = '';

          if (col.id === 'shipped_qty') {
            td = '<input type="number" min="0" class="orders-input orders-shipped-qty" data-row-key="' + rowKey + '" value="' + (sq || '') + '" placeholder="0" />';
          } else if (col.id === 'shipped_euro') {
            td = '<input type="number" min="0" class="orders-input orders-shipped-euro-inp" data-row-key="' + rowKey + '" value="' + (se || '') + '" placeholder="0" />';
          } else if (col.id === 'shipped_container') {
            td = '<input type="number" min="0" class="orders-input orders-shipped-container" data-row-key="' + rowKey + '" value="' + (sc !== null ? (Math.round(sc*100)/100) : '') + '" placeholder="0" />';
          } else if (col.id === 'shipped_total') {
            td = '<div class="orders-computed">' + (se > 0 ? fmtEuro(se) : '—') + '</div>';
          } else if (col.id === 'planned_qty') {
            td = '<input type="number" min="0" class="orders-input orders-planned-qty" data-row-key="' + rowKey + '" value="' + (pq || '') + '" placeholder="0" />';
          } else if (col.id === 'planned_euro') {
            td = '<input type="number" min="0" class="orders-input orders-planned-euro-inp" data-row-key="' + rowKey + '" value="' + (pe || '') + '" placeholder="0" />';
          } else if (col.id === 'planned_container') {
            td = '<input type="number" min="0" class="orders-input orders-planned-container" data-row-key="' + rowKey + '" value="' + (pc !== null ? (Math.round(pc*100)/100) : '') + '" placeholder="0" />';
          } else if (col.id === 'planned_total') {
            td = '<div class="orders-computed orders-planned-total">' + (pe > 0 ? fmtEuro(pe) : '—') + '</div>';
          } else if (col.id === 'destination') {
            td = '<input type="text" class="orders-note-input orders-dest-input" data-row-key="' + rowKey + '" value="' + _esc(dest) + '" placeholder="Ülke..." maxlength="60" />';
          } else if (col.id === 'note') {
            td = '<input type="text" class="orders-note-input" data-row-key="' + rowKey + '" value="' + _esc(order ? (order.note || '') : '') + '" placeholder="Not..." maxlength="200" />';
          }

          html += '<td class="orders-td orders-td--num" ' + style + '>' + td + '</td>';
        });
      });

      html += '</tr>';
    });

    return html;
  }

  function _visibleColCount() {
    return _allCols().filter(function(c){ return !_state.hiddenCols[c.id]; }).length;
  }

  /* ============================================================ THREE-WAY (6 alan) */
  function _applyThreeWay(rowKey, group, source, value) {
    var row = document.querySelector('[data-row-key="' + rowKey + '"]');
    if (!row) return;
    var product = _state.productMap[row.getAttribute('data-product-id')];
    if (!product) return;
    var price = parseNum(product.avg_price_eur);
    var ratio = parseNum(product.container_ratio);
    var result = calcThreeWay(source, value, price, ratio);

    if (group === 'shipped') {
      var qEl  = row.querySelector('.orders-shipped-qty');
      var eEl  = row.querySelector('.orders-shipped-euro-inp');
      var cEl  = row.querySelector('.orders-shipped-container');
      var tEl  = row.querySelector('.orders-computed:not(.orders-planned-total)');
      if (source !== 'qty'       && qEl && result.qty       !== null) { qEl.setAttribute('data-skip','1'); qEl.value = Math.round(result.qty * 100)/100; }
      if (source !== 'euro'      && eEl && result.euro      !== null) { eEl.setAttribute('data-skip','1'); eEl.value = Math.round(result.euro); }
      if (source !== 'container' && cEl && result.container !== null) { cEl.setAttribute('data-skip','1'); cEl.value = Math.round(result.container * 100)/100; }
      if (tEl) tEl.textContent = result.euro > 0 ? fmtEuro(result.euro) : (price ? fmtEuro((parseNum(qEl ? qEl.value : 0)||0)*price) : '—');
    } else {
      var qEl  = row.querySelector('.orders-planned-qty');
      var eEl  = row.querySelector('.orders-planned-euro-inp');
      var cEl  = row.querySelector('.orders-planned-container');
      var tEl  = row.querySelector('.orders-planned-total');
      if (source !== 'qty'       && qEl && result.qty       !== null) { qEl.setAttribute('data-skip','1'); qEl.value = Math.round(result.qty * 100)/100; }
      if (source !== 'euro'      && eEl && result.euro      !== null) { eEl.setAttribute('data-skip','1'); eEl.value = Math.round(result.euro); }
      if (source !== 'container' && cEl && result.container !== null) { cEl.setAttribute('data-skip','1'); cEl.value = Math.round(result.container * 100)/100; }
      if (tEl) tEl.textContent = result.euro > 0 ? fmtEuro(result.euro) : '—';
    }
  }

  /* ============================================================ ADD ROW */
  function _buildAddRow() {
    var colCount = 1 + _visibleColCount();
    if (!_state.addRowOpen) {
      return '<tr><td colspan="' + colCount + '" style="padding:0">' +
        '<button id="orders-add-row-btn" class="orders-add-row-btn">+ Satır Ekle</button>' +
      '</td></tr>';
    }
    var custOpts = '<option value="">Müşteri seç...</option>' +
      _state.customers.filter(function(c){ return c.active !== false; }).map(function(c) {
        return '<option value="' + c.id + '">' + _esc(CustomerManager.displayName(c)) + '</option>';
      }).join('');
    var prodOpts = '<option value="">Ürün seç...</option>' +
      _state.products.map(function(p) { return '<option value="' + p.id + '">' + _esc(p.name) + '</option>'; }).join('');

    return '<tr id="orders-new-row" class="orders-new-row">' +
      '<td colspan="' + colCount + '" style="padding:12px 16px;background:#F8F9FF">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
          '<select id="orders-new-customer" class="orders-new-select" style="min-width:200px">' + custOpts + '</select>' +
          '<select id="orders-new-product" class="orders-new-select" style="min-width:140px">' + prodOpts + '</select>' +
          '<input type="number" id="orders-new-shipped" class="orders-input" placeholder="Çıkan Adet" style="width:110px" />' +
          '<input type="number" id="orders-new-planned" class="orders-input" placeholder="Çıkacak Adet" style="width:120px" />' +
          '<input type="text" id="orders-new-dest" class="orders-note-input" placeholder="Ülke" style="width:100px" />' +
          '<input type="text" id="orders-new-note" class="orders-note-input" placeholder="Not..." style="width:140px" />' +
          '<button id="orders-new-save" class="btn btn-primary" style="font-size:13px;height:34px;padding:0 14px">Kaydet</button>' +
          '<button id="orders-new-cancel" class="btn btn-secondary" style="font-size:13px;height:34px;padding:0 12px">İptal</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }

  /* ============================================================ IMPORT PREVIEW */
  function _buildImportPreview() {
    if (!_state.importPreviewData) return '';
    var data = _state.importPreviewData;

    var detailRows = (data.rows || []).slice(0, 100).map(function(row) {
      var scoreBar = _buildScoreBar(row.customer_score, row.product_score);
      var custCell = row.matched
        ? '<span style="color:var(--color-positive)">✓ ' + _esc(row.customer_id ? _state.customerMap[row.customer_id]?.name || row.customer_name : row.customer_name) + '</span>'
        : '<select class="orders-new-select import-cust-select" data-erp-name="' + _esc(row.customer_name) + '" style="font-size:12px;height:28px;min-height:unset"><option value="">— Eşleştir —</option>' +
          _state.customers.map(function(c){ return '<option value="' + c.id + '">' + _esc(c.name) + '</option>'; }).join('') + '</select>';
      var prodCell = row.product_id
        ? '<span style="color:var(--color-positive)">✓ ' + _esc(_state.productMap[row.product_id]?.name || row.product_name) + '</span>'
        : '<select class="orders-new-select import-prod-select" data-erp-name="' + _esc(row.product_name) + '" style="font-size:12px;height:28px;min-height:unset"><option value="">— Eşleştir —</option>' +
          _state.products.map(function(p){ return '<option value="' + p.id + '">' + _esc(p.name) + '</option>'; }).join('') + '</select>';

      return '<tr>' +
        '<td style="padding:6px 10px">' + custCell + '</td>' +
        '<td style="padding:6px 10px">' + prodCell + '</td>' +
        '<td style="padding:6px 10px;text-align:right">' + fmtQty(row.qty) + '</td>' +
        '<td style="padding:6px 10px;text-align:right">' + fmtEuro(row.euro) + '</td>' +
        '<td style="padding:6px 10px">' + (row.month || '—') + '/' + (row.year || '—') + '</td>' +
        '<td style="padding:6px 10px">' + scoreBar + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="orders-import-preview visible">' +
      '<div class="orders-import-preview-header">' +
        '<span class="orders-import-preview-title">İmport Onay</span>' +
        '<button class="btn btn-secondary" id="orders-import-cancel">İptal</button>' +
      '</div>' +
      '<div class="orders-import-summary">' +
        _sumItem('Müşteri', data.customerCount||0) + _sumItem('Ürün', data.productCount||0) +
        _sumItem('Satır', data.rowCount||0) + _sumItem('Eşleşmeyen', data.unmatchedCount||0, 'var(--color-warning)') +
      '</div>' +
      '<div style="font-size:12px;color:#4A5068;padding:8px 20px;background:#EEF2FF">Eşleşmeyen satırları dropdown\'dan manuel eşleştirin, ardından "Yükle" butonuna basın.</div>' +
      '<div class="orders-import-detail-body visible" style="max-height:400px;overflow-y:auto">' +
        '<table class="orders-import-detail-table" style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<thead><tr style="background:#F1F3F9">' +
            '<th style="padding:8px 10px;text-align:left">Müşteri</th><th style="padding:8px 10px;text-align:left">Ürün</th>' +
            '<th style="padding:8px 10px;text-align:right">Adet</th><th style="padding:8px 10px;text-align:right">Euro</th>' +
            '<th style="padding:8px 10px;text-align:left">Ay/Yıl</th><th style="padding:8px 10px">Güven</th>' +
          '</tr></thead>' +
          '<tbody>' + detailRows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="orders-import-actions">' +
        '<button class="btn btn-primary" id="orders-import-confirm">Yükle</button>' +
      '</div>' +
    '</div>';
  }

  function _buildScoreBar(custScore, prodScore) {
    var avg = ((custScore || 0) + (prodScore || 0)) / 2;
    var pct = Math.round(avg * 100);
    var color = pct >= 80 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
    return '<div style="display:flex;align-items:center;gap:4px">' +
      '<div style="width:60px;height:6px;background:#E2E5EF;border-radius:99px;overflow:hidden">' +
        '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:99px"></div>' +
      '</div>' +
      '<span style="font-size:11px;color:#4A5068">' + pct + '%</span>' +
    '</div>';
  }

  function _sumItem(label, val, color) {
    return '<div class="orders-import-summary-item">' +
      '<span class="orders-import-summary-label">' + label + '</span>' +
      '<span class="orders-import-summary-value"' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</span>' +
    '</div>';
  }

  /* ============================================================ SAVE */
  function _scheduleRowSave(rowKey) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() { _saveRow(rowKey); }, 600);
  }

  async function _saveRow(rowKey) {
    var row = document.querySelector('[data-row-key="' + rowKey + '"]');
    if (!row) return;
    var sqEl = row.querySelector('.orders-shipped-qty');
    var pqEl = row.querySelector('.orders-planned-qty');
    var niEl = row.querySelector('.orders-note-input:not(.orders-dest-input)');
    var diEl = row.querySelector('.orders-dest-input');
    var parts = rowKey.split('__');
    var existing = _state.orders.find(function(o){ return o.customer_id === parts[0] && o.product_id === parts[1]; });
    var ok = await dbUpsertOrder(Object.assign(existing ? { id: existing.id } : {}, {
      customer_id: parts[0], product_id: parts[1],
      shipped_qty: sqEl ? (parseNum(sqEl.value) || 0) : 0,
      planned_qty: pqEl ? (parseNum(pqEl.value) || 0) : 0,
      note: niEl ? niEl.value : '',
      destination_country: diEl ? (diEl.value.trim() || null) : null
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
    el.id = 'orders-save-indicator'; el.className = 'orders-save-indicator';
    el.textContent = '✓ Kaydedildi';
    document.body.appendChild(el);
    _saveIndicator = el;
  }

  async function _saveNewRow() {
    var cid  = (document.getElementById('orders-new-customer') || {}).value || '';
    var pid  = (document.getElementById('orders-new-product')  || {}).value || '';
    if (!cid || !pid) { showToast('Müşteri ve ürün seçilmeli'); return; }
    var sq   = parseNum((document.getElementById('orders-new-shipped') || {}).value) || 0;
    var pq   = parseNum((document.getElementById('orders-new-planned') || {}).value) || 0;
    var dest = ((document.getElementById('orders-new-dest')  || {}).value || '').trim();
    var note = ((document.getElementById('orders-new-note')  || {}).value || '');
    var ok = await dbUpsertOrder({ customer_id: cid, product_id: pid, shipped_qty: sq, planned_qty: pq, destination_country: dest || null, note: note });
    if (ok) { _showSaved(); _state.addRowOpen = false; await _loadAll(); _render(); emitDataChange('orders', {}); }
    else showToast('Kaydedilemedi');
  }

  /* ============================================================ IMPORT */
  function _handleImportFile(file) {
    if (!file || typeof processImportFile !== 'function') return;
    processImportFile(file, _state.customers, _state.products, function(preview) {
      _state.importPreviewData = preview; _state.importDetailVisible = true; _render();
    });
  }

  async function _confirmImport() {
    if (!_state.importPreviewData) return;
    var rows = _state.importPreviewData.rows || [];

    // Collect manual overrides from UI
    document.querySelectorAll('.import-cust-select').forEach(function(sel) {
      if (!sel.value) return;
      var erpName = sel.getAttribute('data-erp-name');
      var row = rows.find(function(r){ return r.customer_name === erpName && !r.customer_id; });
      if (row) {
        row.customer_id = sel.value;
        if (typeof recordImportMapping === 'function') recordImportMapping('customer', erpName, _state.customerMap[sel.value]?.name, true);
      }
    });
    document.querySelectorAll('.import-prod-select').forEach(function(sel) {
      if (!sel.value) return;
      var erpName = sel.getAttribute('data-erp-name');
      var row = rows.find(function(r){ return r.product_name === erpName && !r.product_id; });
      if (row) {
        row.product_id = sel.value;
        if (typeof recordImportMapping === 'function') recordImportMapping('product', erpName, _state.productMap[sel.value]?.name, true);
      }
    });

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
    document.addEventListener('nsdata:screenActivated', function(e) { if (e.detail.screen === 'orders') _render(); });
    document.addEventListener('nsdata:filterCleared', function() { _state.searchQuery = ''; _state.filters = { countries: [], products: [] }; _render(); });
    document.addEventListener('click', function(e) {
      if (_state.openDropdown && !e.target.closest('.orders-filterbar')) { _state.openDropdown = null; _render(); }
    });
  }

  function _bindScreenEvents() {
    // Search
    var se = document.getElementById('orders-search');
    if (se) se.addEventListener('input', debounce(function(){ _state.searchQuery = se.value.trim(); _render(); }, 250));

    // Filter btns
    document.querySelectorAll('[data-filter]').forEach(function(btn) {
      if (!btn.classList.contains('orders-filter-btn') && !btn.classList.contains('orders-chip-x') && !btn.classList.contains('orders-dd-reset')) return;
      btn.addEventListener('click', function(e) {
        if (btn.classList.contains('orders-filter-btn')) {
          e.stopPropagation();
          var key = btn.getAttribute('data-filter');
          _state.openDropdown = _state.openDropdown === key ? null : key;
          _render(); return;
        }
        if (btn.classList.contains('orders-chip-x')) {
          var f = btn.getAttribute('data-filter'); var v = btn.getAttribute('data-value');
          if (f === 'search') _state.searchQuery = '';
          else if (f === 'country') _state.filters.countries = _state.filters.countries.filter(function(x){ return x !== v; });
          else if (f === 'product') _state.filters.products = _state.filters.products.filter(function(x){ return x !== v; });
          _render(); return;
        }
        if (btn.classList.contains('orders-dd-reset')) {
          var f = btn.getAttribute('data-filter');
          if (f === 'country') _state.filters.countries = [];
          else if (f === 'product') _state.filters.products = [];
          _render();
        }
      });
    });

    var clearAll = document.getElementById('orders-chips-clear');
    if (clearAll) clearAll.addEventListener('click', function(){ _state.searchQuery = ''; _state.filters = { countries: [], products: [] }; _render(); });

    // Checkboxes
    document.querySelectorAll('.orders-dd-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var f = cb.getAttribute('data-filter'); var v = cb.getAttribute('data-value');
        if (f === 'country') { if (cb.checked) { if (!_state.filters.countries.includes(v)) _state.filters.countries.push(v); } else _state.filters.countries = _state.filters.countries.filter(function(x){ return x !== v; }); }
        else if (f === 'product') { if (cb.checked) { if (!_state.filters.products.includes(v)) _state.filters.products.push(v); } else _state.filters.products = _state.filters.products.filter(function(x){ return x !== v; }); }
        _render();
      });
    });

    document.querySelectorAll('.orders-colvis-cb').forEach(function(cb) {
      cb.addEventListener('change', function() { _state.hiddenCols[cb.getAttribute('data-col')] = !cb.checked; _render(); });
    });

    document.querySelectorAll('.orders-dd-search').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var q = inp.value.toLowerCase();
        inp.closest('.orders-dropdown').querySelectorAll('.orders-dd-item').forEach(function(item) {
          item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    });

    // Sort
    document.querySelectorAll('.orders-th--sortable').forEach(function(th) {
      th.addEventListener('click', function() {
        var col = th.getAttribute('data-sort');
        if (_state.sort.col === col) { if (_state.sort.dir === 'asc') _state.sort.dir = 'desc'; else { _state.sort.col = null; _state.sort.dir = 'asc'; } }
        else { _state.sort.col = col; _state.sort.dir = 'desc'; }
        _render();
      });
    });

    // Group collapse
    document.querySelectorAll('.orders-group-collapse').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var cid = btn.getAttribute('data-customer-id');
        _state.collapsed[cid] = !_state.collapsed[cid]; _render();
      });
    });

    // Customer name click
    document.querySelectorAll('.orders-customer-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { var id = btn.getAttribute('data-customer-id'); if (id) navigateTo('customer', { id: id }); });
    });

    // Export
    var expBtn = document.getElementById('orders-export-excel');
    if (expBtn) expBtn.addEventListener('click', function() { if (typeof exportOrdersToExcel === 'function') exportOrdersToExcel(_state.orders, _state.products, _state.customers); });

    // Import
    var impInp = document.getElementById('orders-import-input');
    if (impInp) impInp.addEventListener('change', function() { if (impInp.files[0]) _handleImportFile(impInp.files[0]); impInp.value = ''; });
    var impCancel = document.getElementById('orders-import-cancel');
    if (impCancel) impCancel.addEventListener('click', function() { _state.importPreviewData = null; _render(); });
    var impConfirm = document.getElementById('orders-import-confirm');
    if (impConfirm) impConfirm.addEventListener('click', _confirmImport);

    // Add row
    var addBtn = document.getElementById('orders-add-row-btn');
    if (addBtn) addBtn.addEventListener('click', function() { _state.addRowOpen = true; _render(); });
    var cancelNew = document.getElementById('orders-new-cancel');
    if (cancelNew) cancelNew.addEventListener('click', function() { _state.addRowOpen = false; _render(); });
    var saveNew = document.getElementById('orders-new-save');
    if (saveNew) saveNew.addEventListener('click', _saveNewRow);

    // Input handlers — three-way
    function _bindInputGroup(qSel, eSel, cSel, group) {
      document.querySelectorAll(qSel).forEach(function(inp) {
        inp.addEventListener('focus', function() { _state.activeRowKey = inp.getAttribute('data-row-key'); });
        inp.addEventListener('input', function() {
          if (inp.getAttribute('data-skip') === '1') { inp.removeAttribute('data-skip'); return; }
          _applyThreeWay(inp.getAttribute('data-row-key'), group, 'qty', parseNum(inp.value));
          _scheduleRowSave(inp.getAttribute('data-row-key'));
        });
      });
      document.querySelectorAll(eSel).forEach(function(inp) {
        inp.addEventListener('focus', function() { _state.activeRowKey = inp.getAttribute('data-row-key'); });
        inp.addEventListener('input', function() {
          if (inp.getAttribute('data-skip') === '1') { inp.removeAttribute('data-skip'); return; }
          _applyThreeWay(inp.getAttribute('data-row-key'), group, 'euro', parseNum(inp.value));
          _scheduleRowSave(inp.getAttribute('data-row-key'));
        });
      });
      document.querySelectorAll(cSel).forEach(function(inp) {
        inp.addEventListener('focus', function() { _state.activeRowKey = inp.getAttribute('data-row-key'); });
        inp.addEventListener('input', function() {
          if (inp.getAttribute('data-skip') === '1') { inp.removeAttribute('data-skip'); return; }
          _applyThreeWay(inp.getAttribute('data-row-key'), group, 'container', parseNum(inp.value));
          _scheduleRowSave(inp.getAttribute('data-row-key'));
        });
      });
    }

    _bindInputGroup('.orders-shipped-qty', '.orders-shipped-euro-inp', '.orders-shipped-container', 'shipped');
    _bindInputGroup('.orders-planned-qty', '.orders-planned-euro-inp', '.orders-planned-container', 'planned');

    document.querySelectorAll('.orders-note-input, .orders-dest-input').forEach(function(inp) {
      inp.addEventListener('input', function() { var rk = inp.getAttribute('data-row-key'); if (rk) _scheduleRowSave(rk); });
    });
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
