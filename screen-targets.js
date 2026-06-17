/* NSDATA - screen-targets.js */
/* Hedefler ekranı — Ülke → Müşteri → Ürün → Ay */

(function() {

var _state = {
  targets:        [],
  customers:      [],
  products:       [],
  year:           new Date().getFullYear(),
  metric:         'eur',
  openCountries:  {},
  openCustomers:  {},
  filterBolge:    '',
  filterCountry:  '',
  importStep:     'idle',
  importPreview:  null
};

var _cMap = {};
var _pMap = {};
var _MN   = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

/* ============================================================
   ACTIVATION
   ============================================================ */
document.addEventListener('nsdata:screenActivated', function(e) {
  if (e.detail.screen !== 'targets') return;
  _init();
});

document.addEventListener('nsdata:dataChanged', function() {
  var el = document.getElementById('screen-targets');
  if (!el || !el.classList.contains('active')) return;
  _loadData();
});

async function _init() {
  await _loadData();
}

async function _loadData() {
  var results = await Promise.all([
    dbGetTargets(),
    dbGetCustomers(),
    dbGetProducts()
  ]);
  _state.targets   = results[0] || [];
  _state.customers = results[1] || [];
  _state.products  = results[2] || [];
  _buildMaps();
  _render();
}

/* ============================================================
   MAP BUILDERS
   ============================================================ */
function _buildMaps() {
  _cMap = {};
  _pMap = {};
  _state.customers.forEach(function(c) { _cMap[c.id] = c; });
  _state.products.forEach(function(p)  { _pMap[p.id] = p; });
}

/* ============================================================
   TREE BUILDER — Ülke → Müşteri → Ürün → Ay[12]
   ============================================================ */
function _buildTree() {
  var filtered = _state.targets.filter(function(t) {
    if (t.scope !== 'customer' || !t.customer_id || !t.country) return false;
    if (t.year !== _state.year) return false;
    if (_state.filterBolge   && String(t.bolge)   !== _state.filterBolge)   return false;
    if (_state.filterCountry && t.country          !== _state.filterCountry) return false;
    return true;
  });

  var tree = {};
  filtered.forEach(function(t) {
    if (!tree[t.country]) tree[t.country] = {};
    if (!tree[t.country][t.customer_id]) tree[t.country][t.customer_id] = {};
    if (!tree[t.country][t.customer_id][t.product_id]) {
      tree[t.country][t.customer_id][t.product_id] = Array(12).fill(null);
    }
    tree[t.country][t.customer_id][t.product_id][t.month - 1] = t;
  });
  return tree;
}

/* ============================================================
   HELPERS
   ============================================================ */
function _field() {
  if (_state.metric === 'eur') return 'target_eur';
  if (_state.metric === 'usd') return 'target_usd';
  return 'target_qty';
}

function _fmtVal(v) {
  if (v === null || v === undefined || v === 0) return null;
  var n = parseFloat(v);
  if (isNaN(n)) return null;
  var s = n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  if (_state.metric === 'eur') return s + '\u00a0€';
  if (_state.metric === 'usd') return '$\u00a0' + s;
  return s;
}

function _sumCells(cells, f) {
  return cells.reduce(function(s, t) { return s + (t ? (t[f] || 0) : 0); }, 0);
}

function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _allBolge() {
  var seen = {};
  _state.targets.forEach(function(t) { if (t.bolge) seen[t.bolge] = true; });
  return Object.keys(seen).map(Number).sort(function(a,b){return a-b;});
}

function _allCountries() {
  var seen = {};
  _state.targets.forEach(function(t) { if (t.country) seen[t.country] = true; });
  return Object.keys(seen).sort();
}

function _getBolgeForCustomer(countryData, custId) {
  var prodIds = Object.keys(countryData[custId]);
  for (var pi = 0; pi < prodIds.length; pi++) {
    var cells = countryData[custId][prodIds[pi]];
    for (var mi = 0; mi < cells.length; mi++) {
      if (cells[mi] && cells[mi].bolge) return cells[mi].bolge;
    }
  }
  return null;
}

/* ============================================================
   RENDER
   ============================================================ */
function _render() {
  var el = document.getElementById('screen-targets');
  if (!el) return;

  var hasData = _state.targets.some(function(t) { return t.year === _state.year; });
  var tree     = _buildTree();
  var countries = Object.keys(tree).sort();
  var f         = _field();

  var html = _renderHeader() + _renderControls();

  if (!hasData) {
    html += '<div class="tgt-empty">' +
      '<i class="ti ti-database-off" style="font-size:32px;display:block;margin-bottom:12px" aria-hidden="true"></i>' +
      '<p>' + _state.year + ' yılı için hedef verisi bulunamadı.</p>' +
      '<p style="font-size:12px;margin-top:6px">Excel bütçe dosyanızı yüklemek için yukarıdaki butonu kullanın.</p>' +
    '</div>';
    el.innerHTML = html + _renderImportModal();
    _bind();
    return;
  }

  html += '<div class="tgt-table-wrap"><table class="tgt-table"><thead><tr class="tgt-head-row">' +
    '<th class="tgt-col-name">Ülke / Müşteri / Ürün</th>' +
    _MN.map(function(m) { return '<th class="tgt-col-month">' + m + '</th>'; }).join('') +
    '<th class="tgt-col-total">Yıllık</th>' +
    '</tr></thead><tbody>';

  countries.forEach(function(country) {
    var custIds = Object.keys(tree[country]).sort(function(a, b) {
      return (_cMap[a] ? _cMap[a].name : '').localeCompare(_cMap[b] ? _cMap[b].name : '');
    });
    var isOpen = !!_state.openCountries[country];

    var countryMonths = Array(12).fill(0);
    custIds.forEach(function(cid) {
      Object.values(tree[country][cid]).forEach(function(cells) {
        cells.forEach(function(t, mi) { if (t && t[f]) countryMonths[mi] += t[f]; });
      });
    });
    var countryTotal = countryMonths.reduce(function(s,v){return s+v;},0);

    html += '<tr class="tgt-row-country" data-country="' + _esc(country) + '">' +
      '<td class="tgt-cell-name tgt-country-name">' +
        '<span class="tgt-chevron">' + (isOpen ? '▾' : '▸') + '</span>' +
        '<strong>' + _esc(country) + '</strong>' +
        '<span class="tgt-row-meta">' + custIds.length + ' müşteri</span>' +
      '</td>' +
      countryMonths.map(function(v) {
        var d = _fmtVal(v);
        return '<td class="tgt-cell-total">' + (d || '<span class="tgt-null">–</span>') + '</td>';
      }).join('') +
      '<td class="tgt-cell-total tgt-grand">' + (_fmtVal(countryTotal) || '–') + '</td>' +
    '</tr>';

    if (!isOpen) return;

    custIds.forEach(function(custId) {
      var cust     = _cMap[custId] || { name: custId };
      var cuKey    = country + '|' + custId;
      var isCuOpen = !!_state.openCustomers[cuKey];
      var prodIds  = Object.keys(tree[country][custId]).sort(function(a, b) {
        return (_pMap[a] ? _pMap[a].name : '').localeCompare(_pMap[b] ? _pMap[b].name : '');
      });
      var bolge    = _getBolgeForCustomer(tree[country], custId);

      var custMonths = Array(12).fill(0);
      prodIds.forEach(function(pid) {
        tree[country][custId][pid].forEach(function(t, mi) { if (t && t[f]) custMonths[mi] += t[f]; });
      });
      var custTotal = custMonths.reduce(function(s,v){return s+v;},0);

      html += '<tr class="tgt-row-customer" data-country="' + _esc(country) + '" data-cust="' + custId + '">' +
        '<td class="tgt-cell-name tgt-customer-name">' +
          '<span class="tgt-chevron">' + (isCuOpen ? '▾' : '▸') + '</span>' +
          _esc(cust.name) +
          (bolge ? '<span class="tgt-bolge-badge">B' + bolge + '</span>' : '') +
        '</td>' +
        custMonths.map(function(v) {
          var d = _fmtVal(v);
          return '<td class="tgt-cell-total tgt-cust-total">' + (d || '<span class="tgt-null">–</span>') + '</td>';
        }).join('') +
        '<td class="tgt-cell-total tgt-grand">' + (_fmtVal(custTotal) || '–') + '</td>' +
      '</tr>';

      if (!isCuOpen) return;

      prodIds.forEach(function(prodId) {
        var prod   = _pMap[prodId] || { name: prodId };
        var cells  = tree[country][custId][prodId];
        var rowTotal = 0;

        html += '<tr class="tgt-row-product"><td class="tgt-cell-name tgt-product-name">' + _esc(prod.name) + '</td>';

        cells.forEach(function(t, mi) {
          var val = t ? t[f] : null;
          if (val) rowTotal += val;
          var tid = t ? t.id : '';
          var d   = _fmtVal(val);
          html += '<td class="tgt-cell-editable" data-tid="' + _esc(tid) + '" data-field="' + f + '" data-val="' + (val || '') + '">' +
            (d ? d : '<span class="tgt-null">–</span>') +
          '</td>';
        });

        html += '<td class="tgt-cell-total">' + (_fmtVal(rowTotal) || '–') + '</td></tr>';
      });
    });
  });

  html += '</tbody></table></div>';
  html += '<input id="tgt-editor" class="tgt-editor-input" type="number" step="any">';
  html += _renderImportModal();

  el.innerHTML = html;
  _bind();

  if (_state.importStep === 'preview' && _state.importPreview) {
    _showImportModal();
  }
}

/* ============================================================
   PARTIAL HTML BUILDERS
   ============================================================ */
function _renderHeader() {
  return '<div class="tgt-header">' +
    '<div class="tgt-title"><i class="ti ti-target" aria-hidden="true"></i> Hedefler ' + _state.year + '</div>' +
    '<div class="tgt-header-actions">' +
      '<input type="file" id="tgt-file-in" accept=".xlsx,.xls" style="display:none">' +
      '<button class="tgt-btn-import" id="tgt-import-btn">' +
        '<i class="ti ti-upload" aria-hidden="true"></i> Excel\'den Yükle' +
      '</button>' +
    '</div>' +
  '</div>';
}

function _renderControls() {
  var bolges    = _allBolge();
  var countries = _allCountries();
  return '<div class="tgt-controls">' +
    '<select id="tgt-year">' +
      [_state.year - 1, _state.year, _state.year + 1].map(function(y) {
        return '<option value="' + y + '"' + (y === _state.year ? ' selected' : '') + '>' + y + '</option>';
      }).join('') +
    '</select>' +
    '<select id="tgt-bolge"><option value="">Tüm Bölgeler</option>' +
      bolges.map(function(b) {
        return '<option value="' + b + '"' + (_state.filterBolge === String(b) ? ' selected' : '') + '>Bölge ' + b + '</option>';
      }).join('') +
    '</select>' +
    '<select id="tgt-country"><option value="">Tüm Ülkeler</option>' +
      countries.map(function(c) {
        return '<option value="' + _esc(c) + '"' + (_state.filterCountry === c ? ' selected' : '') + '>' + _esc(c) + '</option>';
      }).join('') +
    '</select>' +
    '<div class="tgt-metric-btns">' +
      ['eur','usd','qty'].map(function(m) {
        var lbl = m === 'eur' ? 'EUR' : m === 'usd' ? 'USD' : 'Adet';
        return '<button class="tgt-metric-btn' + (_state.metric === m ? ' active' : '') + '" data-metric="' + m + '">' + lbl + '</button>';
      }).join('') +
    '</div>' +
  '</div>';
}

function _renderImportModal() {
  return '<div id="tgt-modal-backdrop" class="tgt-modal-backdrop" style="display:none">' +
    '<div class="tgt-modal"><div id="tgt-modal-body"></div></div>' +
  '</div>';
}

/* ============================================================
   EVENT BINDING
   ============================================================ */
function _bind() {
  _bindControls();
  _bindImport();
  _bindTableClicks();
  _bindCellEditor();
  _bindImportModal();
}

function _bindControls() {
  var el;
  el = document.getElementById('tgt-year');
  if (el) el.addEventListener('change', function() {
    _state.year = parseInt(this.value);
    _state.openCountries = {};
    _state.openCustomers = {};
    _render();
  });
  el = document.getElementById('tgt-bolge');
  if (el) el.addEventListener('change', function() {
    _state.filterBolge = this.value;
    _render();
  });
  el = document.getElementById('tgt-country');
  if (el) el.addEventListener('change', function() {
    _state.filterCountry = this.value;
    _render();
  });
  document.querySelectorAll('.tgt-metric-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _state.metric = this.dataset.metric;
      _render();
    });
  });
}

function _bindTableClicks() {
  var tbody = document.querySelector('.tgt-table tbody');
  if (!tbody) return;
  tbody.addEventListener('click', function(e) {
    if (e.target.closest('.tgt-cell-editable')) return;

    var cRow = e.target.closest('.tgt-row-country');
    if (cRow) {
      var c = cRow.dataset.country;
      _state.openCountries[c] = !_state.openCountries[c];
      _render();
      return;
    }
    var cuRow = e.target.closest('.tgt-row-customer');
    if (cuRow) {
      var key = cuRow.dataset.country + '|' + cuRow.dataset.cust;
      _state.openCustomers[key] = !_state.openCustomers[key];
      _render();
    }
  });
}

/* ============================================================
   CELL EDITOR
   ============================================================ */
var _activeCell = null;

function _bindCellEditor() {
  var editor = document.getElementById('tgt-editor');
  if (!editor) return;

  document.querySelectorAll('.tgt-cell-editable').forEach(function(td) {
    td.addEventListener('click', function(e) {
      e.stopPropagation();
      _activateCell(td, editor);
    });
  });

  editor.addEventListener('blur', function() { _commitEdit(editor); });
  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Enter')  { e.preventDefault(); _commitEdit(editor); }
    if (e.key === 'Escape') { _cancelEdit(editor); }
  });
}

function _activateCell(td, editor) {
  if (_activeCell) _activeCell.classList.remove('tgt-cell-active');
  _activeCell = td;
  td.classList.add('tgt-cell-active');

  var wrap  = document.querySelector('.tgt-table-wrap');
  var wRect = wrap  ? wrap.getBoundingClientRect()  : { left: 0, top: 0 };
  var tdRect = td.getBoundingClientRect();
  var scrollL = wrap ? wrap.scrollLeft : 0;
  var scrollT = wrap ? wrap.scrollTop  : 0;

  editor.style.left    = (tdRect.left - wRect.left + scrollL) + 'px';
  editor.style.top     = (tdRect.top  - wRect.top  + scrollT) + 'px';
  editor.style.width   = tdRect.width  + 'px';
  editor.style.height  = tdRect.height + 'px';
  editor.style.display = 'block';
  editor.dataset.tid   = td.dataset.tid;
  editor.dataset.field = td.dataset.field;
  editor.value         = td.dataset.val || '';
  editor.focus();
  editor.select();
}

async function _commitEdit(editor) {
  var tid   = editor.dataset.tid;
  var field = editor.dataset.field;
  var raw   = editor.value.trim();
  var val   = raw === '' ? null : parseFloat(raw.replace(',', '.'));

  editor.style.display = 'none';
  if (_activeCell) { _activeCell.classList.remove('tgt-cell-active'); _activeCell = null; }

  if (!tid || !field) return;
  if (isNaN(val)) val = null;

  await dbUpdateTarget(tid, field, val);

  var t = _state.targets.find(function(x) { return x.id === tid; });
  if (t) { t[field] = val; }
  _render();
}

function _cancelEdit(editor) {
  editor.style.display = 'none';
  if (_activeCell) { _activeCell.classList.remove('tgt-cell-active'); _activeCell = null; }
}

/* ============================================================
   IMPORT FLOW
   ============================================================ */
function _bindImport() {
  var btn    = document.getElementById('tgt-import-btn');
  var fileIn = document.getElementById('tgt-file-in');
  if (!btn || !fileIn) return;

  btn.addEventListener('click', function() { fileIn.click(); });

  fileIn.addEventListener('change', function() {
    var file = this.files[0];
    if (!file) return;
    this.value = '';
    showToast('Dosya okunuyor...');
    processBudgetImportFile(file, function(preview) {
      if (preview.error) {
        showToast('Hata: ' + preview.error);
        return;
      }
      _state.importPreview = preview;
      _state.importStep    = 'preview';
      _showImportModal();
    });
  });
}

/* Preview tree state */
var _pvOpen = { c: {}, cu: {} };

function _fE(v) { var n = parseFloat(v); return isNaN(n)||n===0 ? '—' : n.toLocaleString('tr-TR',{maximumFractionDigits:0}) + ' €'; }
function _fU(v) { var n = parseFloat(v); return isNaN(n)||n===0 ? '—' : '$ ' + n.toLocaleString('tr-TR',{maximumFractionDigits:0}); }
function _fQ(v) { var n = parseFloat(v); return isNaN(n)||n===0 ? '—' : n.toLocaleString('tr-TR',{maximumFractionDigits:0}); }

function _buildPreviewTree(combos) {
  var tree = {};
  (combos || []).forEach(function(combo) {
    var ct = combo.country;
    if (!tree[ct]) tree[ct] = { eur:0, usd:0, qty:0, customers:{} };
    var cu = combo.custName;
    if (!tree[ct].customers[cu]) tree[ct].customers[cu] = { eur:0, usd:0, qty:0, products:{} };
    var pr = combo.prodName;
    if (!tree[ct].customers[cu].products[pr]) tree[ct].customers[cu].products[pr] = { eur:0, usd:0, qty:0, months: combo.months };
    combo.months.forEach(function(m) {
      tree[ct].eur                            += (m.target_eur || 0);
      tree[ct].usd                            += (m.target_usd || 0);
      tree[ct].qty                            += (m.target_qty || 0);
      tree[ct].customers[cu].eur              += (m.target_eur || 0);
      tree[ct].customers[cu].usd              += (m.target_usd || 0);
      tree[ct].customers[cu].qty              += (m.target_qty || 0);
      tree[ct].customers[cu].products[pr].eur += (m.target_eur || 0);
      tree[ct].customers[cu].products[pr].usd += (m.target_usd || 0);
      tree[ct].customers[cu].products[pr].qty += (m.target_qty || 0);
    });
  });
  return tree;
}

var _MN_FULL = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

function _renderPreviewExplorer(tree) {
  var countries = Object.keys(tree).sort();
  if (!countries.length) return '<div style="padding:16px;color:var(--color-text-secondary)">Veri bulunamadı.</div>';

  var h = '<div style="font-size:11px;display:flex;gap:12px;padding:6px 0 10px;color:var(--color-text-secondary);font-weight:500">' +
    '<span style="flex:1">Ülke / Müşteri / Ürün</span><span style="min-width:80px;text-align:right">EUR</span>' +
    '<span style="min-width:80px;text-align:right">USD</span><span style="min-width:60px;text-align:right">Adet</span></div>';

  countries.forEach(function(ct) {
    var node = tree[ct];
    var isOpen = !!_pvOpen.c[ct];
    var custKeys = Object.keys(node.customers).sort();
    h += '<div class="pv-row pv-country" data-pvc="' + _esc(ct) + '">' +
      '<span class="pv-chev">' + (isOpen?'▾':'▸') + '</span>' +
      '<span class="pv-name"><strong>' + _esc(ct) + '</strong> <span class="pv-meta">' + custKeys.length + ' müşteri</span></span>' +
      '<span class="pv-amt">' + _fE(node.eur) + '</span>' +
      '<span class="pv-amt">' + _fU(node.usd) + '</span>' +
      '<span class="pv-amt">' + _fQ(node.qty) + '</span>' +
    '</div>';

    if (!isOpen) return;

    custKeys.forEach(function(cu) {
      var cuNode = node.customers[cu];
      var cuKey = ct + '|' + cu;
      var isCuOpen = !!_pvOpen.cu[cuKey];
      var prodKeys = Object.keys(cuNode.products).sort();
      h += '<div class="pv-row pv-customer" data-pvcu="' + _esc(cuKey) + '">' +
        '<span class="pv-chev">' + (isCuOpen?'▾':'▸') + '</span>' +
        '<span class="pv-name">' + _esc(cu) + '</span>' +
        '<span class="pv-amt">' + _fE(cuNode.eur) + '</span>' +
        '<span class="pv-amt">' + _fU(cuNode.usd) + '</span>' +
        '<span class="pv-amt">' + _fQ(cuNode.qty) + '</span>' +
      '</div>';

      if (!isCuOpen) return;

      prodKeys.forEach(function(pr) {
        var prNode = cuNode.products[pr];
        var prKey = cuKey + '|' + pr;
        var isPrOpen = !!_pvOpen.cu[prKey];
        h += '<div class="pv-row pv-product" data-pvpr="' + _esc(prKey) + '">' +
          '<span class="pv-chev">' + (isPrOpen?'▾':'▸') + '</span>' +
          '<span class="pv-name">' + _esc(pr) + '</span>' +
          '<span class="pv-amt">' + _fE(prNode.eur) + '</span>' +
          '<span class="pv-amt">' + _fU(prNode.usd) + '</span>' +
          '<span class="pv-amt">' + _fQ(prNode.qty) + '</span>' +
        '</div>';

        if (isPrOpen) {
          h += '<div class="pv-months"><table class="pv-month-table"><thead><tr>' +
            '<th>Ay</th><th>EUR</th><th>USD</th><th>Adet</th></tr></thead><tbody>';
          prNode.months.forEach(function(m, mi) {
            var hasVal = m.target_eur || m.target_usd || m.target_qty;
            h += '<tr' + (hasVal ? '' : ' style="opacity:.4"') + '><td>' + _MN_FULL[mi] + '</td>' +
              '<td>' + _fE(m.target_eur) + '</td><td>' + _fU(m.target_usd) + '</td><td>' + _fQ(m.target_qty) + '</td></tr>';
          });
          h += '</tbody></table></div>';
        }
      });
    });
  });
  return h;
}

function _showImportModal(activeTab) {
  var backdrop = document.getElementById('tgt-modal-backdrop');
  var body     = document.getElementById('tgt-modal-body');
  if (!backdrop || !body) return;

  var p = _state.importPreview;
  if (!p) return;
  if (!activeTab) activeTab = 'ozet';

  var tree = _buildPreviewTree(p.rawCombos);

  var warnHtml = (p.warnings || []).map(function(w) {
    return '<div class="tgt-warn tgt-warn-' + w.type + '">' + _esc(w.msg) + '</div>';
  }).join('');

  var tabs = ['ozet','incele','uyarilar'];
  var tabLabels = { ozet:'Özet', incele:'İncele (' + p.stats.combos + ')', uyarilar:'Uyarılar (' + (p.warnings||[]).length + ')' };

  body.innerHTML =
    '<div class="tgt-modal-title">Excel Import Önizleme</div>' +
    '<div class="pv-tabs">' +
      tabs.map(function(t) {
        return '<button class="pv-tab' + (t===activeTab?' pv-tab-active':'') + '" data-pvtab="' + t + '">' + tabLabels[t] + '</button>';
      }).join('') +
    '</div>' +
    '<div class="pv-content">' +
      '<div id="pv-ozet"    style="' + (activeTab==='ozet'    ?'':'display:none') + '">' +
        '<div class="tgt-modal-warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i>&nbsp;Bu işlem <strong>TÜM mevcut datayı siler</strong> ve Excel\'den yeniden oluşturur.</div>' +
        '<div class="tgt-modal-stats">' +
          _sbox('Müşteri',p.stats.customers)+_sbox('Ürün',p.stats.products)+
          _sbox('Ülke',p.stats.countries)+_sbox('Combo',p.stats.combos)+_sbox('Target Kaydı',p.stats.targetRows) +
        '</div>' +
        (warnHtml ? '<div class="tgt-warn-list">' + warnHtml + '</div>' : '<div class="tgt-warn tgt-warn-ok">✓ Kritik uyarı yok</div>') +
      '</div>' +
      '<div id="pv-incele"  style="' + (activeTab==='incele'  ?'':'display:none') + '">' +
        _renderPreviewExplorer(tree) +
      '</div>' +
      '<div id="pv-uyarilar" style="' + (activeTab==='uyarilar'?'':'display:none') + '">' +
        (warnHtml || '<div class="tgt-warn tgt-warn-ok">✓ Uyarı yok</div>') +
      '</div>' +
    '</div>' +
    '<div class="tgt-modal-actions">' +
      '<button id="tgt-modal-cancel" class="tgt-btn-sec">İptal</button>' +
      '<button id="tgt-modal-confirm" class="tgt-btn-danger">Sil ve Import Et</button>' +
    '</div>' +
    '<div id="tgt-progress-wrap" style="display:none" class="tgt-progress">' +
      '<div id="tgt-progress-msg" style="margin-bottom:8px"></div>' +
      '<div class="tgt-pbar-track"><div id="tgt-pbar" class="tgt-pbar-fill" style="width:0%"></div></div>' +
      '<div id="tgt-progress-count" style="margin-top:6px;font-size:11px;text-align:right;color:var(--color-text-secondary)"></div>' +
    '</div>';

  backdrop.style.display = 'flex';
  _bindImportModal(tree, activeTab);
}

function _sbox(label, val) {
  return '<div class="tgt-stat-box"><div class="tgt-stat-val">' +
    (typeof val === 'number' ? val.toLocaleString('tr-TR') : val) +
    '</div><div class="tgt-stat-lbl">' + label + '</div></div>';
}

function _bindImportModal(tree, activeTab) {
  /* Tab switching */
  document.querySelectorAll('.pv-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _showImportModal(this.dataset.pvtab);
    });
  });

  /* Tree toggles — country */
  document.querySelectorAll('.pv-country').forEach(function(row) {
    row.addEventListener('click', function() {
      var ct = this.dataset.pvc;
      _pvOpen.c[ct] = !_pvOpen.c[ct];
      _showImportModal('incele');
    });
  });

  /* Tree toggles — customer */
  document.querySelectorAll('.pv-customer').forEach(function(row) {
    row.addEventListener('click', function() {
      var key = this.dataset.pvcu;
      _pvOpen.cu[key] = !_pvOpen.cu[key];
      _showImportModal('incele');
    });
  });

  /* Tree toggles — product */
  document.querySelectorAll('.pv-product').forEach(function(row) {
    row.addEventListener('click', function() {
      var key = this.dataset.pvpr;
      _pvOpen.cu[key] = !_pvOpen.cu[key];
      _showImportModal('incele');
    });
  });

  var cancel = document.getElementById('tgt-modal-cancel');
  if (cancel) cancel.addEventListener('click', function() {
    _pvOpen = { c:{}, cu:{} };
    document.getElementById('tgt-modal-backdrop').style.display = 'none';
    _state.importStep    = 'idle';
    _state.importPreview = null;
  });

  var confirm = document.getElementById('tgt-modal-confirm');
  if (!confirm) return;

  confirm.addEventListener('click', async function() {
    var cancelBtn = document.getElementById('tgt-modal-cancel');
    confirm.disabled  = true;
    if (cancelBtn) cancelBtn.disabled = true;

    var _progWrap = document.getElementById('tgt-progress-wrap');
    if (_progWrap) _progWrap.style.display = 'block';
    _state.importStep = 'importing';

    var result = await confirmBudgetImport(_state.importPreview, function(msg, current, total) {
      var wrap = document.getElementById('tgt-progress-wrap');
      if (wrap) wrap.style.display = 'block';
      var msgEl = document.getElementById('tgt-progress-msg');
      if (msgEl) msgEl.textContent = msg;
      if (current !== undefined && total && total > 0) {
        var pct = Math.min(Math.round(current / total * 100), 100);
        var bar = document.getElementById('tgt-pbar');
        if (bar) bar.style.width = pct + '%';
        var cnt = document.getElementById('tgt-progress-count');
        if (cnt) cnt.textContent = current.toLocaleString('tr-TR') + ' / ' + total.toLocaleString('tr-TR') + ' kayıt';
      }
    });

    if (result.ok) {
      var _pmsg = document.getElementById('tgt-progress-msg');
      if (_pmsg) _pmsg.textContent = '\u2713 Tamamland\u0131 \u2014 ' + result.inserted.toLocaleString('tr-TR') + ' hedef kayd\u0131 olu\u015fturuldu.';
      var _pbar = document.getElementById('tgt-pbar'); if (_pbar) _pbar.style.width = '100%';
      setTimeout(function() {
        var backdrop = document.getElementById('tgt-modal-backdrop');
        if (backdrop) backdrop.style.display = 'none';
        _pvOpen = { c:{}, cu:{} };
        _state.importStep    = 'idle';
        _state.importPreview = null;
        _loadData();
      }, 1800);
    } else {
      var _perr = document.getElementById('tgt-progress-msg');
      if (_perr) _perr.textContent = '\u2717 Hata: ' + result.error;
      confirm.disabled  = false;
      if (cancelBtn) cancelBtn.disabled = false;
    }
  });
}

})();
