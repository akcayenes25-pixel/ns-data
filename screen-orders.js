/* NSDATA - screen-orders.js v2.0.0 */
/* Pivot tablo motoru — V24 entegrasyonu */
(function () {
  'use strict';

  /* ============================================================ DATA STATE */
  var _state = {
    orders: [], products: [], customers: [],
    productMap: {}, customerMap: {},
    importPreviewData: null,
    addRowOpen: false,
  };

  /* ============================================================ PIVOT STATE */
  var _S = {
    rows: ['ulke', 'musteri'],
    cols: ['urun'],
    vals: { cnt: true, qty: false, eur: true },
    form: 'tabular',
    repeat: false,
    stShow: true,
    stTop: false,
    gtShow: true,
    blankRow: false,
    showEmpty: false,
    filters: { ulke: [], musteri: [], urun: [] },
    search: '',
    collapsed: {},
    sort: { key: null, dir: 'none' },
  };

  /* ============================================================ CONSTANTS */
  var TARAF_DIMS = ['cikan', 'cikacak'];
  var ALL_DIMS   = ['ulke', 'musteri', 'urun', 'cikan', 'cikacak'];
  var DIM_LABEL  = { ulke: 'Ülke', musteri: 'Müşteri', urun: 'Ürün', cikan: 'Çıkan', cikacak: 'Çıkacak' };
  var VAL_DEFS   = [{ k: 'cnt', l: 'Knt' }, { k: 'qty', l: 'Adet' }, { k: 'eur', l: 'Euro' }];
  var BAND_BG    = ['#FFFFFF', '#F9F9F9', '#FFFFFF', '#F9F9F9'];

  var _sel = null;
  var _saveTimer = null;

  /* ============================================================ INIT */
  document.addEventListener('nsdata:appReady', function () { _init(); });

  async function _init() {
    await _loadAll();
    _bindGlobalEvents();
  }

  async function _loadAll() {
    var r = await Promise.all([dbGetOrders(), dbGetProducts(), dbGetCustomers()]);
    _state.orders    = _adaptOrders(r[0]);
    _state.products  = _adaptProducts(r[1]);
    _state.customers = r[2];
    _state.productMap  = {};
    _state.customerMap = {};
    _state.products.forEach(function (p) { _state.productMap[p.id] = p; });
    _state.customers.forEach(function (c) { _state.customerMap[c.id] = c; });
  }

  /* ============================================================ ADAPTERS */
  function _adaptOrders(dbOrders) {
    return (dbOrders || []).map(function (o) {
      return {
        id:      o.id,
        musteri: o.customer_id,
        urun:    o.product_id,
        ulke:    o.destination_country || '',
        cikan:   parseFloat(o.shipped_qty) || 0,
        cikacak: parseFloat(o.planned_qty) || 0,
        note:    o.note || '',
        _dbId:   o.id,
        _customerId: o.customer_id,
        _productId:  o.product_id,
      };
    });
  }

  function _adaptProducts(dbProducts) {
    return (dbProducts || []).map(function (p) {
      return {
        id:    p.id,
        name:  p.name,
        price: parseFloat(p.avg_price_eur) || 0,
        ratio: parseFloat(p.container_ratio) || 0,
        active: p.active !== false,
      };
    });
  }

  /* ============================================================ HELPERS */
  function isTarafDim(dim) { return dim === 'cikan' || dim === 'cikacak'; }
  function dimLabel(dim)   { return DIM_LABEL[dim] || dim; }
  function activeVals()    { return VAL_DEFS.filter(function (v) { return _S.vals[v.k]; }); }

  function prd(id) { return _state.productMap[id] || { price: 0, ratio: 0 }; }

  function dvLabel(dim, val) {
    if (dim === 'musteri') { var c = _state.customerMap[val]; return c ? c.name : val; }
    if (dim === 'urun')    { var p = _state.productMap[val];  return p ? p.name  : val; }
    if (dim === 'cikan')   return 'Çıkan';
    if (dim === 'cikacak') return 'Çıkacak';
    return val || '';
  }

  function dv(o, dim) {
    if (dim === 'ulke')    return o.ulke;
    if (dim === 'musteri') return o.musteri;
    if (dim === 'urun')    return o.urun;
    if (isTarafDim(dim))   return dim;
    return null;
  }

  function dimVals(dim, orders) {
    if (isTarafDim(dim)) return [dim];
    var seen = {}, vals = [];
    orders.forEach(function (o) { var v = dv(o, dim); if (v && !seen[v]) { seen[v] = 1; vals.push(v); } });
    return vals.sort();
  }

  function fmtN(v) { if (!v || v === 0) return '—'; return Number(v).toLocaleString('de-DE', { maximumFractionDigits: 1 }); }
  function fmtK(v) { if (!v || v === 0) return '—'; return Number(v).toLocaleString('de-DE', { maximumFractionDigits: 3 }); }
  function fmtE(v) { if (!v || v === 0) return '—'; return Math.round(v).toLocaleString('de-DE') + ' €'; }
  function fmtVal(v, k) { return k === 'eur' ? fmtE(v) : k === 'cnt' ? fmtK(v) : fmtN(v); }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ============================================================ COMPUTE */
  function compute(orders, taraf) {
    var qty = 0, cnt = 0, eur = 0;
    orders.forEach(function (o) {
      var p = prd(o.urun);
      var ratio = p.ratio || 0, price = p.price || 0;
      var val = 0;
      if (!taraf || taraf === 'cikan')   val += o.cikan || 0;
      if (!taraf || taraf === 'cikacak') val += o.cikacak || 0;
      qty += val;
      cnt += ratio ? val / ratio : 0;
      eur += val * price;
    });
    return { qty: Math.round(qty * 100) / 100, cnt: Math.round(cnt * 1000) / 1000, eur: Math.round(eur) };
  }

  /* ============================================================ FILTER */
  function filtOrders() {
    return _state.orders.filter(function (o) {
      var f = _S.filters;
      if (f.ulke.length    && !f.ulke.includes(o.ulke))     return false;
      if (f.musteri.length && !f.musteri.includes(o.musteri)) return false;
      if (f.urun.length    && !f.urun.includes(o.urun))     return false;
      if (_S.search) {
        var q  = _S.search.toLowerCase();
        var cn = dvLabel('musteri', o.musteri).toLowerCase();
        if (!o.ulke.toLowerCase().includes(q) && !cn.includes(q)) return false;
      }
      return true;
    });
  }

  /* ============================================================ PLACEMENT */
  function tarafStatus() {
    return {
      cikanInRows:   _S.rows.includes('cikan'),
      cikanInCols:   _S.cols.includes('cikan'),
      cikacakInRows: _S.rows.includes('cikacak'),
      cikacakInCols: _S.cols.includes('cikacak'),
    };
  }

  function validateTaraf() {
    var t = tarafStatus();
    if (!t.cikanInRows && !t.cikanInCols && !t.cikacakInRows && !t.cikacakInCols) return 'both_pool';
    if ((t.cikanInRows && t.cikacakInCols) || (t.cikanInCols && t.cikacakInRows)) return 'cross_axis';
    return 'ok';
  }

  function canMove(dim, toZone) {
    if (!isTarafDim(dim)) {
      if (toZone === 'pool') return _S.rows.includes(dim) || _S.cols.includes(dim);
      if (toZone === 'rows') return !_S.rows.includes(dim);
      if (toZone === 'cols') return !_S.cols.includes(dim);
      return false;
    }
    var other = dim === 'cikan' ? 'cikacak' : 'cikan';
    if (toZone === 'pool') return _S.rows.includes(dim) || _S.cols.includes(dim);
    if (toZone === 'rows') return !_S.rows.includes(dim) && !_S.cols.includes(other);
    if (toZone === 'cols') return !_S.cols.includes(dim) && !_S.rows.includes(other);
    return false;
  }

  function addTarafToAxis(axis, dimToAdd) {
    var other = dimToAdd === 'cikan' ? 'cikacak' : 'cikan';
    var newAxis = axis.filter(function (d) { return d !== dimToAdd; });
    var otherIdx = newAxis.indexOf(other);
    if (otherIdx !== -1) {
      var withoutOther = newAxis.filter(function (d) { return d !== other; });
      return [other, dimToAdd].concat(withoutOther);
    }
    return newAxis.concat([dimToAdd]);
  }

  /* ============================================================ COL LEAVES */
  function filterByColKeys(orders, keys) {
    return orders.filter(function (o) {
      return keys.every(function (k) {
        if (isTarafDim(k.dim)) return true;
        return dv(o, k.dim) === k.val;
      });
    });
  }

  function colLeafTaraf(keys) {
    var t = keys.find(function (k) { return isTarafDim(k.dim); });
    return t ? t.val : null;
  }

  function buildColLeaves(orders) {
    var cols = _S.cols;
    if (!cols.length) return [{ keys: [], label: '', bi: 0 }];
    var bothTarefs = cols.includes('cikan') && cols.includes('cikacak');
    if (bothTarefs) {
      var ciIdx = cols.indexOf('cikan'), ckIdx = cols.indexOf('cikacak');
      var tarafOrder = ciIdx < ckIdx ? ['cikan', 'cikacak'] : ['cikacak', 'cikan'];
      var otherCols = cols.filter(function (d) { return !isTarafDim(d); });
      var combos = [[]];
      otherCols.forEach(function (dim) {
        var vals = dimVals(dim, orders), next = [];
        combos.forEach(function (combo) { vals.forEach(function (v) { next.push(combo.concat([{ dim: dim, val: v }])); }); });
        combos = next;
      });
      var expanded = [];
      tarafOrder.forEach(function (taraf) {
        combos.forEach(function (combo) { expanded.push([{ dim: taraf, val: taraf }].concat(combo)); });
      });
      return expanded.map(function (combo, i) { return { keys: combo, label: combo.map(function (k) { return dvLabel(k.dim, k.val); }).join(' / '), bi: i % 4 }; });
    }
    var combos2 = [[]];
    cols.forEach(function (dim) {
      var vals = dimVals(dim, orders), next = [];
      combos2.forEach(function (combo) { vals.forEach(function (v) { next.push(combo.concat([{ dim: dim, val: v }])); }); });
      combos2 = next;
    });
    return combos2.map(function (combo, i) { return { keys: combo, label: combo.map(function (k) { return dvLabel(k.dim, k.val); }).join(' / '), bi: i % 4 }; });
  }

  function effectiveColDimCount() {
    var cols = _S.cols;
    var bothTarefs = cols.includes('cikan') && cols.includes('cikacak');
    if (bothTarefs) return 1 + cols.filter(function (d) { return !isTarafDim(d); }).length;
    return cols.length;
  }

  /* ============================================================ SCHEMA */
  function buildSchema(orders) {
    var vl = activeVals();
    if (!vl.length) return null;
    var leaves = buildColLeaves(orders);
    var schema = [];

    if (_S.form === 'compact') {
      schema.push({ type: 'name', dim: '_compact', label: _S.rows.map(dimLabel).join(' / ') || 'Boyut', w: 180 });
    } else if (_S.rows.length === 0) {
      schema.push({ type: 'name', dim: '_all', label: 'Boyut', w: 160 });
    } else {
      var tarafColAdded = false, nameIdx = 0;
      _S.rows.forEach(function (d) {
        if (isTarafDim(d)) {
          if (!tarafColAdded) {
            schema.push({ type: 'name', dim: '_taraf', label: 'Durum', w: nameIdx === 0 ? 120 : 100 });
            tarafColAdded = true; nameIdx++;
          }
        } else {
          schema.push({ type: 'name', dim: d, label: dimLabel(d), w: nameIdx === 0 ? 150 : 120 });
          nameIdx++;
        }
      });
    }

    var tarafInCols = _S.cols.some(isTarafDim);
    var tarafDimsInRows = _S.rows.filter(isTarafDim);
    var tarafPairInRows = tarafDimsInRows.length > 0;

    leaves.forEach(function (leaf, li) {
      var leafTaraf = colLeafTaraf(leaf.keys);
      if (tarafInCols) {
        vl.forEach(function (v, vi) {
          schema.push({ type: 'val', leafIdx: li, leaf: leaf, taraf: leafTaraf, valK: v.k, valL: v.l, isFirstInLeaf: vi === 0, bi: leaf.bi, w: v.k === 'eur' ? 120 : 64 });
        });
      } else if (tarafPairInRows) {
        vl.forEach(function (v, vi) {
          schema.push({ type: 'val', leafIdx: li, leaf: leaf, taraf: null, valK: v.k, valL: v.l, isFirstInLeaf: vi === 0, bi: leaf.bi, w: v.k === 'eur' ? 120 : 64 });
        });
      } else {
        vl.forEach(function (v, vi) {
          schema.push({ type: 'val', leafIdx: li, leaf: leaf, taraf: null, valK: v.k, valL: v.l, isFirstInLeaf: vi === 0, bi: leaf.bi, w: v.k === 'eur' ? 120 : 64 });
        });
      }
    });

    // Total cols — one per active val
    vl.forEach(function (v) {
      schema.push({ type: 'total', valK: v.k, valL: v.l, w: v.k === 'eur' ? 120 : 64, label: 'Top.' + v.l });
    });

    return schema;
  }

  /* ============================================================ SORT */
  function sortVals(vals, dim, orders) {
    if (isTarafDim(dim)) return vals.slice();
    if (!_S.sort.key || _S.sort.dir === 'none') {
      return vals.slice().sort(function (a, b) { return dvLabel(dim, a).localeCompare(dvLabel(dim, b), 'tr'); });
    }
    if (_S.sort.key.startsWith('name_')) {
      var sortDim = _S.sort.key.replace('name_', '');
      if (sortDim === dim) {
        var sorted = vals.slice().sort(function (a, b) { return dvLabel(dim, a).localeCompare(dvLabel(dim, b), 'tr'); });
        return _S.sort.dir === 'asc' ? sorted : sorted.reverse();
      }
    }
    var sorted2 = vals.slice().sort(function (a, b) {
      var ordA = orders.filter(function (o) { return dv(o, dim) === a; });
      var ordB = orders.filter(function (o) { return dv(o, dim) === b; });
      var vA = _getSortValue(ordA, _S.sort.key);
      var vB = _getSortValue(ordB, _S.sort.key);
      return vB - vA;
    });
    return _S.sort.dir === 'asc' ? sorted2.reverse() : sorted2;
  }

  function _getSortValue(orders, sortKey) {
    if (!sortKey) return 0;
    var parts = sortKey.split('_');
    var taraf = parts[0], valK = parts[1];
    var m = compute(orders, taraf === 'cikan' ? 'cikan' : 'cikacak');
    return valK === 'cnt' ? m.cnt : valK === 'qty' ? m.qty : m.eur;
  }

  /* ============================================================ ROW BUILDER */
  function buildRowsRecursive(orders, schema, rowContext, level) {
    if (level >= _S.rows.length) return buildDataRow(orders, schema, rowContext, false);
    var dim = _S.rows[level];

    if (isTarafDim(dim)) {
      var tarafVals = [], nextLevel = level;
      while (nextLevel < _S.rows.length && isTarafDim(_S.rows[nextLevel])) { tarafVals.push(_S.rows[nextLevel]); nextLevel++; }
      var html = '';
      tarafVals.forEach(function (taraf, ti) {
        var tOrders = _S.showEmpty ? orders : orders.filter(function (o) { return (o[taraf] || 0) > 0; });
        if (!tOrders.length) return;
        var groupKey = rowContext.map(function (c) { return c.val; }).join('|') + '|' + taraf;
        var label = dvLabel(taraf, taraf);
        var newContext = rowContext.concat([{ dim: taraf, val: taraf }]);
        var isFirstTaraf = ti === 0;
        if (_S.form === 'tabular') html += buildTabularGroup(tOrders, schema, newContext, level, taraf, label, groupKey, nextLevel, isFirstTaraf);
        else if (_S.form === 'outline') html += buildOutlineGroup(tOrders, schema, newContext, level, taraf, label, groupKey, nextLevel);
        else html += buildCompactGroup(tOrders, schema, newContext, level, taraf, label, groupKey, nextLevel);
      });
      return html;
    }

    var rawVals = dimVals(dim, orders);
    var baseVals = _S.showEmpty ? dimVals(dim, _state.orders) : rawVals;
    var sortedVals = sortVals(baseVals, dim, orders);
    var html2 = '';
    sortedVals.forEach(function (val) {
      var groupOrders = orders.filter(function (o) { return dv(o, dim) === val; });
      if (!_S.showEmpty && !groupOrders.length) return;
      var groupKey = rowContext.map(function (c) { return c.val; }).join('|') + '|' + val;
      var label = dvLabel(dim, val);
      var newContext = rowContext.concat([{ dim: dim, val: val }]);
      if (_S.form === 'tabular') html2 += buildTabularGroup(groupOrders, schema, newContext, level, val, label, groupKey, level + 1, true);
      else if (_S.form === 'outline') html2 += buildOutlineGroup(groupOrders, schema, newContext, level, val, label, groupKey, level + 1);
      else html2 += buildCompactGroup(groupOrders, schema, newContext, level, val, label, groupKey, level + 1);
    });
    return html2;
  }

  function buildTabularGroup(orders, schema, context, level, val, label, groupKey, nextLevel, isFirstInParent) {
    if (nextLevel === undefined) nextLevel = level + 1;
    if (isFirstInParent === undefined) isFirstInParent = true;
    var isLeaf = nextLevel >= _S.rows.length;
    var html = '';
    if (isLeaf) html += buildDataRow(orders, schema, context, isFirstInParent);
    else html += buildRowsRecursive(orders, schema, context, nextLevel);
    if (_S.stShow && !isLeaf) html += buildAggRows(orders, schema, 'str', label + ' Top.', 0, context);
    if (_S.blankRow && level === 0) html += '<tr class="blank"><td colspan="' + schema.length + '"></td></tr>';
    return html;
  }

  function buildOutlineGroup(orders, schema, context, level, val, label, groupKey, nextLevel) {
    if (nextLevel === undefined) nextLevel = level + 1;
    var isLeaf = nextLevel >= _S.rows.length;
    var nameCols = schema.filter(function (c) { return c.type === 'name'; });
    var html = '';
    if (_S.stShow && _S.stTop && !isLeaf) html += buildAggRows(orders, schema, 'str', label + ' Top.', 0, context);
    var cells = '';
    nameCols.forEach(function (nc, i) {
      if (i === level) cells += '<td style="padding-left:6px"><div class="nc"><button class="nc-tog" data-gk="' + _esc(groupKey) + '">' + (!!_S.collapsed[groupKey] ? '▶' : '▼') + '</button>' + buildDimTag(_S.rows[level], val) + '<span class="nc-meta">' + orders.length + ' sipariş</span></div></td>';
      else cells += '<td></td>';
    });
    schema.filter(function (c) { return c.type !== 'name'; }).forEach(function () { cells += '<td></td>'; });
    html += '<tr class="gr">' + cells + '</tr>';
    if (!_S.collapsed[groupKey]) {
      html += buildRowsRecursive(orders, schema, context, nextLevel);
      if (_S.stShow && !_S.stTop && !isLeaf) html += buildAggRows(orders, schema, 'str', label + ' Top.', 0, context);
    }
    return html;
  }

  function buildCompactGroup(orders, schema, context, level, val, label, groupKey, nextLevel) {
    if (nextLevel === undefined) nextLevel = level + 1;
    var isLeaf = nextLevel >= _S.rows.length;
    var html = '';
    if (level === 0) {
      html += '<tr class="gr"><td colspan="' + schema.length + '"><div class="nc"><button class="nc-tog" data-gk="' + _esc(groupKey) + '">' + (!!_S.collapsed[groupKey] ? '▶' : '▼') + '</button>' + buildDimTag(_S.rows[level], val) + '<span class="nc-meta">' + orders.length + ' sipariş</span></div></td></tr>';
    }
    if (!_S.collapsed[groupKey]) {
      html += buildRowsRecursive(orders, schema, context, nextLevel);
      if (_S.stShow && !isLeaf) html += buildAggRows(orders, schema, 'str', label + ' Top.', (level + 1) * 12, context);
    }
    return html;
  }

  function buildDimTag(dim, val) {
    if (isTarafDim(dim)) return '<span class="taraf-tag ' + val + '">' + dvLabel(dim, val) + '</span>';
    return '<span class="nc-txt" style="font-weight:700">' + _esc(dvLabel(dim, val)) + '</span>';
  }

  /* ============================================================ DATA ROW */
  function buildDataRow(orders, schema, rowContext, isFirstInGroup) {
    var nameCols = schema.filter(function (c) { return c.type === 'name'; });
    var tarafCtx = rowContext.find(function (r) { return isTarafDim(r.dim); });
    var cells = '';

    nameCols.forEach(function (nc) {
      if (nc.dim === '_compact') {
        var ctx = rowContext[rowContext.length - 1];
        var lbl = ctx ? dvLabel(ctx.dim, ctx.val) : '—';
        cells += '<td style="padding-left:' + (rowContext.length * 12) + 'px"><div class="nc"><span class="nc-txt">' + _esc(lbl) + '</span></div></td>';
      } else if (nc.dim === '_all') {
        cells += '<td style="padding-left:8px"><div class="nc"><span class="nc-txt">—</span></div></td>';
      } else if (nc.dim === '_taraf') {
        if (tarafCtx) cells += '<td style="padding-left:8px"><span class="taraf-tag ' + tarafCtx.val + '">' + dvLabel(tarafCtx.dim, tarafCtx.val) + '</span></td>';
        else cells += '<td></td>';
      } else {
        var ctx2 = rowContext.find(function (c) { return c.dim === nc.dim; });
        if (!ctx2) { cells += '<td></td>'; return; }
        var effectiveRows = _S.rows.filter(function (d, i, arr) { return !isTarafDim(d) || (i === arr.findIndex(function (x) { return isTarafDim(x); })); });
        var effIdx = effectiveRows.indexOf(nc.dim);
        var isOuter = effIdx < effectiveRows.length - 1;
        var showLabel = !isOuter || _S.repeat || isFirstInGroup;
        if (!showLabel) { cells += '<td></td>'; return; }
        cells += '<td style="padding-left:8px"><div class="nc"><span class="nc-txt">' + _esc(dvLabel(ctx2.dim, ctx2.val)) + '</span></div></td>';
      }
    });

    schema.forEach(function (c) {
      if (c.type === 'name') return;
      var bg = BAND_BG[c.bi || 0];
      var bl = c.isFirstInLeaf ? 'border-left:2px solid #000;' : '';

      if (c.type === 'total') {
        var taraf = tarafCtx ? tarafCtx.val : null;
        var m = compute(orders, taraf);
        var tv = c.valK === 'cnt' ? m.cnt : c.valK === 'qty' ? m.qty : m.eur;
        cells += '<td style="background:#F3F4F6;border-left:2px solid #000"><span class="o-cv">' + fmtVal(tv, c.valK) + '</span></td>';
        return;
      }

      var leafOrders = c.leaf && c.leaf.keys.length ? filterByColKeys(orders, c.leaf.keys) : orders;
      var tarafFromCol = colLeafTaraf(c.leaf.keys);
      var tarafNow = tarafFromCol || (tarafCtx ? tarafCtx.val : null);
      var bgNow = tarafNow === 'cikan' ? '#F0FFF4' : tarafNow === 'cikacak' ? '#E0F2FE' : bg;

      var m2 = compute(leafOrders, tarafNow);
      var val = c.valK === 'cnt' ? m2.cnt : c.valK === 'qty' ? m2.qty : m2.eur;

      var singleOrder = leafOrders.length === 1 ? leafOrders[0] : null;
      var noOrder = leafOrders.length === 0;
      var canInput = tarafNow && (singleOrder || noOrder);



      if (canInput) {
        var rawQty = singleOrder ? (tarafNow === 'cikan' ? singleOrder.cikan : singleOrder.cikacak) : 0;
        var urunId = singleOrder ? singleOrder.urun : '';
        var ctxMusteri = '', ctxUrun = '', ctxUlke = '';
        rowContext.forEach(function(rc) {
          if (rc.dim === 'musteri') ctxMusteri = rc.val;
          if (rc.dim === 'urun')    ctxUrun    = rc.val;
          if (rc.dim === 'ulke')    ctxUlke    = rc.val;
        });
        if (!ctxUrun && c.leaf && c.leaf.keys) {
          var urunKey = c.leaf.keys.find(function(k) { return k.dim === 'urun'; });
          if (urunKey) ctxUrun = urunKey.val;
        }
        if (!urunId) urunId = ctxUrun;
        var prod2 = prd(urunId);

        var oidAttr;
        if (singleOrder) {
          oidAttr = 'data-oid="' + singleOrder.id + '" data-rk="' + tarafNow + '_' + singleOrder.id + '"';
        } else {
          oidAttr = 'data-new-cust="' + ctxMusteri + '" data-new-urun="' + ctxUrun + '" data-new-ulke="' + ctxUlke + '"';
        }

        if (c.valK === 'cnt') {
          cells += '<td style="background:' + bgNow + ';' + bl + '"><input class="o-ci" ' + oidAttr + ' data-field="' + tarafNow + '" data-source="container" value="' + (rawQty ? (prod2.ratio ? Math.round(rawQty / prod2.ratio * 10000) / 10000 : rawQty) : '') + '" placeholder="-"/></td>';
        } else if (c.valK === 'qty') {
          var adetVal = rawQty;
          cells += '<td style="background:' + bgNow + ';' + bl + '"><input class="o-ci" ' + oidAttr + ' data-field="' + tarafNow + '" data-source="adet" value="' + (adetVal || '') + '" placeholder="-"/></td>';
        } else if (c.valK === 'eur') {
          var euroVal2 = Math.round(rawQty * prod2.price);
          cells += '<td style="background:' + bgNow + ';' + bl + '"><input class="o-ci" ' + oidAttr + ' data-field="' + tarafNow + '" data-source="euro" value="' + (euroVal2 || '') + '" placeholder="-"/></td>';
        }
      } else {
        cells += '<td style="background:' + bgNow + ';' + bl + '"><span class="o-cv">' + fmtVal(val, c.valK) + '</span></td>';
      }
    });

    var rowCls = tarafCtx ? 'dr taraf-' + tarafCtx.val : 'dr';
    return '<tr class="' + rowCls + '">' + cells + '</tr>';
  }

  /* ============================================================ AGG ROWS */
  function buildAggRows(orders, schema, cls, label, pad, context) {
    if (cls === 'gtr') return buildSingleAggRow(orders, schema, cls, label, pad, null);
    var tarafDimsInRows = _S.rows.filter(isTarafDim);
    if (tarafDimsInRows.length > 0) {
      return tarafDimsInRows.map(function (taraf) {
        var tOrders = _S.showEmpty ? orders : orders.filter(function (o) { return (o[taraf] || 0) > 0; });
        return buildSingleAggRow(tOrders, schema, cls, label, pad, taraf);
      }).join('');
    }
    return buildSingleAggRow(orders, schema, cls, label, pad, null);
  }

  function buildSingleAggRow(orders, schema, cls, label, pad, fixedTaraf) {
    var nameCols = schema.filter(function (c) { return c.type === 'name'; });
    var cells = '';
    nameCols.forEach(function (nc, i) {
      if (i === 0) {
        var style = 'padding-left:' + (pad || 6) + 'px;font-weight:700;';
        if (cls === 'str') style += 'background:#9CA3AF;color:#fff;';
        if (cls === 'gtr') style += 'background:#000;color:#fff;';
        if (fixedTaraf) {
          cells += '<td style="' + style + '"><span>' + _esc(label) + ' </span><span class="taraf-tag ' + fixedTaraf + '" style="font-size:10px">' + dvLabel(fixedTaraf, fixedTaraf) + '</span></td>';
        } else {
          cells += '<td style="' + style + '">' + _esc(label) + '</td>';
        }
      } else {
        var s2 = cls === 'str' ? 'background:#9CA3AF;' : cls === 'gtr' ? 'background:#000;' : '';
        cells += '<td style="' + s2 + '"></td>';
      }
    });

    schema.forEach(function (c) {
      if (c.type === 'name') return;
      var bl = c.isFirstInLeaf ? 'border-left:2px solid #000;' : '';
      if (c.type === 'total') {
        var m = compute(orders, fixedTaraf);
        var tv = c.valK === 'cnt' ? m.cnt : c.valK === 'qty' ? m.qty : m.eur;
        var s3 = cls === 'str' ? 'background:#9CA3AF;color:#fff;' : cls === 'gtr' ? 'background:#000;color:#fff;' : 'background:#F3F4F6;';
        cells += '<td style="' + s3 + 'border-left:2px solid #000;text-align:right;font-weight:700">' + fmtVal(tv, c.valK) + '</td>';
        return;
      }
      var leafOrders = c.leaf && c.leaf.keys.length ? filterByColKeys(orders, c.leaf.keys) : orders;
      var tarafFromCol = colLeafTaraf(c.leaf.keys);
      var taraf = tarafFromCol || fixedTaraf || c.taraf;
      var m2 = compute(leafOrders, taraf);
      var val = c.valK === 'cnt' ? m2.cnt : c.valK === 'qty' ? m2.qty : m2.eur;
      var s4 = cls === 'str' ? 'background:#9CA3AF;color:#fff;' : cls === 'gtr' ? 'background:#000;color:#fff;' : 'background:' + BAND_BG[c.bi || 0] + ';';
      cells += '<td style="' + s4 + bl + 'text-align:right;font-weight:700">' + fmtVal(val, c.valK) + '</td>';
    });

    return '<tr class="' + cls + '">' + cells + '</tr>';
  }

  /* ============================================================ RENDER HEADER */
  function renderHeader(schema, orders) {
    var ht = document.getElementById('o-ht');
    if (!ht) return;
    var vl = activeVals();
    var nameCols = schema.filter(function (c) { return c.type === 'name'; });
    var valCols  = schema.filter(function (c) { return c.type === 'val'; });
    var hasTot   = schema.some(function (c) { return c.type === 'total'; });
    var nColDims = effectiveColDimCount();
    var nHdrRows = Math.max(nColDims, 1) + 1;

    var cg = '<colgroup>';
    schema.forEach(function (c) { cg += '<col style="width:' + c.w + 'px;min-width:' + c.w + 'px">'; });
    cg += '</colgroup>';

    var rows = [];
    for (var r = 0; r < nHdrRows; r++) rows.push('');

    nameCols.forEach(function (c) {
      var nameKey = 'name_' + c.dim;
      var nameIco = _S.sort.key === nameKey ? (_S.sort.dir === 'asc' ? ' A→Z' : _S.sort.dir === 'desc' ? ' Z→A' : '') : '';
      rows[0] += '<th class="th-n srt-name" rowspan="' + nHdrRows + '" style="background:#fff;color:#000;vertical-align:bottom;padding-bottom:4px;text-align:left;font-weight:700;cursor:pointer" data-dim="' + c.dim + '">' + _esc(c.label) + nameIco + '</th>';
    });

    var tarafInCols = _S.cols.some(isTarafDim);
    var bothTarefs = _S.cols.includes('cikan') && _S.cols.includes('cikacak');

    if (nColDims === 0) {
      var cikVals = valCols.filter(function (c) { return c.taraf === 'cikan'; }).length;
      var ckVals  = valCols.filter(function (c) { return c.taraf === 'cikacak'; }).length;
      var nullVals = valCols.filter(function (c) { return c.taraf === null; }).length;
      if (cikVals)  rows[0] += '<th colspan="' + cikVals + '" style="background:#3C3C43;border-left:2px solid #000;text-align:center;color:#fff;font-weight:700">ÇIKAN</th>';
      if (ckVals)   rows[0] += '<th colspan="' + ckVals + '" style="background:#6C6C70;border-left:2px solid #000;text-align:center;color:#fff;font-weight:700">ÇIKACAK</th>';
      if (nullVals) rows[0] += '<th colspan="' + nullVals + '" style="background:#3C3C43;border-left:2px solid #000;text-align:center;color:#fff;font-weight:700">Değerler</th>';
      valCols.forEach(function (c) {
        var bg = '#F2F2F7';
        var bl = c.isFirstInLeaf ? 'border-left:2px solid #000;' : '';
        var fKey = (c.taraf || '_') + '_' + c.valK;
        var fIco = _S.sort.key === fKey ? (_S.sort.dir === 'desc' ? ' ↓' : _S.sort.dir === 'asc' ? ' ↑' : '') : '';
        var fPfx = c.taraf === 'cikan' ? '↑ ' : c.taraf === 'cikacak' ? '↓ ' : '';
        rows[1] += '<th class="srt" style="background:' + bg + ';' + bl + 'color:#000;font-weight:700" data-skey="' + fKey + '">' + fPfx + c.valL + fIco + '</th>';
      });
      if (hasTot) {
        var totCols = schema.filter(function (x) { return x.type === 'total'; });
        if (totCols.length === 1) {
          rows[0] += '<th rowspan="2" style="background:#1C1C1E;border-left:2px solid #000;text-align:right;vertical-align:bottom;padding-bottom:4px;color:#fff;font-weight:700">' + totCols[0].valL + ' Top.</th>';
        } else {
          rows[0] += '<th colspan="' + totCols.length + '" style="background:#1C1C1E;border-left:2px solid #000;text-align:center;color:#fff;font-weight:700">Toplam</th>';
          totCols.forEach(function (tc) { rows[1] += '<th style="background:#1C1C1E;border-left:1px solid #333;text-align:right;color:#fff;font-weight:700">' + tc.valL + '</th>'; });
        }
      }
    } else {
      var effectiveDims;
      if (bothTarefs) {
        var ciIdx2 = _S.cols.indexOf('cikan'), ckIdx2 = _S.cols.indexOf('cikacak');
        var fti = Math.min(ciIdx2, ckIdx2);
        var othersBefore = _S.cols.filter(function (d, i) { return !isTarafDim(d) && i < fti; });
        var othersAfter  = _S.cols.filter(function (d, i) { return !isTarafDim(d) && i > Math.max(ciIdx2, ckIdx2); });
        effectiveDims = othersBefore.concat(['_taraf_pair']).concat(othersAfter);
      } else {
        effectiveDims = _S.cols.slice();
      }

      for (var level = 0; level < effectiveDims.length; level++) {
        var eDim = effectiveDims[level];
        var groups = [];
        valCols.forEach(function (c) {
          var groupKey, label2, bi2;
          if (eDim === '_taraf_pair') {
            var lt = colLeafTaraf(c.leaf.keys);
            groupKey = lt || '_'; label2 = lt === 'cikan' ? 'Çıkan' : 'Çıkacak'; bi2 = c.leaf.bi;
          } else {
            var kd = c.leaf.keys.find(function (k) { return k.dim === eDim; });
            groupKey = kd ? kd.dim + ':' + kd.val : '_'; label2 = kd ? dvLabel(kd.dim, kd.val) : ''; bi2 = c.leaf.bi;
          }
          if (!groups.length || groups[groups.length - 1].key !== groupKey) groups.push({ key: groupKey, label: label2, bi: bi2, cols: [] });
          groups[groups.length - 1].cols.push(c);
        });

        groups.forEach(function (g) {
          var bgOvr = BAND_BG[g.bi];
          var txOvr = '#000';
          var bl2 = g.cols[0].isFirstInLeaf ? 'border-left:2px solid #000;' : '';
          if (eDim === '_taraf_pair') {
            bgOvr = g.key === 'cikan' ? '#064E3B' : '#0284C7'; txOvr = '#fff';
          }
          rows[level] += '<th colspan="' + g.cols.length + '" style="background:' + bgOvr + ';' + bl2 + 'text-align:center;color:' + txOvr + ';font-weight:700">' + _esc(g.label) + '</th>';
        });
      }

      valCols.forEach(function (c) {
        var bg2 = c.taraf === 'cikan' ? '#D1FAE5' : c.taraf === 'cikacak' ? '#BAE6FD' : '#F2F2F7';
        var bl3 = c.isFirstInLeaf ? 'border-left:2px solid #000;' : '';
        var txC = c.taraf === 'cikan' ? '#064E3B' : c.taraf === 'cikacak' ? '#0284C7' : '#000';
        var thisKey = (c.taraf || '_') + '_' + c.valK + '_' + c.leafIdx;
        var sortIco = _S.sort.key === thisKey ? (_S.sort.dir === 'desc' ? ' ↓' : _S.sort.dir === 'asc' ? ' ↑' : '') : '';
        var realPfx = c.taraf === 'cikan' ? '↑ ' : c.taraf === 'cikacak' ? '↓ ' : '';
        rows[nColDims] += '<th class="srt" style="background:' + bg2 + ';' + bl3 + 'color:' + txC + ';font-weight:700" data-skey="' + thisKey + '">' + realPfx + c.valL + sortIco + '</th>';
      });

      if (hasTot) {
        var totCols2 = schema.filter(function (x) { return x.type === 'total'; });
        if (totCols2.length === 1) {
          rows[0] += '<th rowspan="' + nHdrRows + '" style="background:#1C1C1E;border-left:2px solid #000;text-align:right;vertical-align:bottom;padding-bottom:4px;color:#fff;font-weight:700">' + totCols2[0].valL + ' Top.</th>';
        } else {
          rows[0] += '<th colspan="' + totCols2.length + '" style="background:#1C1C1E;border-left:2px solid #000;text-align:center;color:#fff;font-weight:700">Toplam</th>';
          totCols2.forEach(function (tc) { rows[nColDims] += '<th style="background:#1C1C1E;border-left:1px solid #333;text-align:right;color:#fff;font-weight:700">' + tc.valL + '</th>'; });
        }
      }
    }

    var totalW = schema.reduce(function (s, c) { return s + c.w; }, 0);
    var html = cg;
    rows.forEach(function (r, i) { html += '<tr class="' + (i < nHdrRows - 1 ? 'hg' : 'hs') + '">' + r + '</tr>'; });
    ht.innerHTML = html;
    ht.style.minWidth = totalW + 'px';
    var dt = document.getElementById('o-dt');
    if (dt) dt.style.minWidth = totalW + 'px';
  }

  /* ============================================================ RENDER DATA */
  function renderData() {
    var orders = filtOrders();
    var tv = validateTaraf();
    var dtb = document.getElementById('o-dt-b');
    var ht  = document.getElementById('o-ht');
    if (!dtb) return;

    if (tv === 'both_pool' || tv === 'cross_axis') {
      if (ht) ht.innerHTML = '';
      var msg = tv === 'both_pool'
        ? '<p>⚠️ Çıkan ve Çıkacak ikisi de havuzda</p><span>En az birini Satırlar veya Sütunlar bölümüne taşıyın</span>'
        : '<p>⚠️ Geçersiz yerleşim</p><span>Çıkan ve Çıkacak aynı eksende olmalıdır</span>';
      dtb.innerHTML = '<tr><td colspan="3"><div class="o-warn-big">' + msg + '</div></td></tr>';
      syncScroll(); return;
    }

    var schema = buildSchema(orders);
    if (!schema) {
      if (ht) ht.innerHTML = '';
      dtb.innerHTML = '<tr><td colspan="3" class="o-empty">Değerler kutusundan en az bir değer seçin.</td></tr>';
      syncScroll(); return;
    }

    renderHeader(schema, orders);

    var cg = '<colgroup>';
    schema.forEach(function (c) { cg += '<col style="width:' + c.w + 'px;min-width:' + c.w + 'px">'; });
    cg += '</colgroup>';
    var dt = document.getElementById('o-dt');
    if (dt) {
      var oldCg = dt.querySelector('colgroup');
      if (oldCg) oldCg.remove();
      dt.insertAdjacentHTML('afterbegin', cg);
    }

    if (!orders.length && !_S.showEmpty) {
      dtb.innerHTML = '<tr><td colspan="' + schema.length + '" class="o-empty">Sipariş bulunamadı</td></tr>';
      syncScroll(); return;
    }

    var html = buildRowsRecursive(orders, schema, [], 0);
    if (_S.gtShow) html += buildAggRows(orders, schema, 'gtr', 'GENEL TOPLAM', 0, null);
    dtb.innerHTML = html;
    bindTbl();
    syncScroll();
  }

  function syncScroll() {
    var ts = document.getElementById('o-ts');
    var mirror = document.getElementById('o-th-inner');
    if (!ts || !mirror) return;
    ts.removeEventListener('scroll', ts._sh || null);
    ts._sh = function () { mirror.scrollLeft = ts.scrollLeft; };
    ts.addEventListener('scroll', ts._sh);
  }

  /* ============================================================ TABLE EVENTS */
  function bindTbl() {
    document.querySelectorAll('#screen-orders .nc-tog').forEach(function (b) {
      b.addEventListener('click', function () { _S.collapsed[b.dataset.gk] = !_S.collapsed[b.dataset.gk]; renderData(); });
    });
    document.querySelectorAll('#screen-orders .o-ci').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var field  = inp.dataset.field;
        var source = inp.dataset.source || 'qty';
        var rawStr = inp.value;
        if (rawStr === '' || rawStr === null) return; // boş → kaydetme

        var rawVal = parseFloat(rawStr);
        if (isNaN(rawVal) || rawVal < 0) return;

        // three-way: source → newQty (raw adet)
        var newQty;
        var prod = null;
        var oid = inp.dataset.oid;
        if (oid) {
          var existOrder = _state.orders.find(function (o) { return o.id === oid; });
          if (existOrder) prod = prd(existOrder.urun);
        } else {
          prod = prd(inp.dataset.newUrun || '');
        }
        var price = prod ? (prod.price || 0) : 0;
        var ratio = prod ? (prod.ratio || 0) : 0;

        if (source === 'qty') {
          newQty = rawVal;
        } else if (source === 'adet') {
          // Adet = raw * ratio → raw = adet / ratio
          newQty = ratio > 0 ? rawVal / ratio : rawVal;
        } else if (source === 'euro') {
          newQty = price > 0 ? rawVal / price : 0;
        } else if (source === 'container') {
          newQty = ratio > 0 ? rawVal * ratio : 0;
        } else {
          newQty = rawVal;
        }
        newQty = Math.round(newQty * 100) / 100;

        // Update sibling inputs in same row (DOM update, no re-render)
        var rk = inp.dataset.rk;
        if (rk) {
          document.querySelectorAll('#screen-orders .o-ci[data-rk="' + rk + '"]').forEach(function(sibling) {
            if (sibling === inp) return;
            var sibSource = sibling.dataset.source || 'qty';
            if (sibSource === 'qty')        sibling.value = newQty || '';
            else if (sibSource === 'adet') sibling.value = ratio ? Math.round(newQty * ratio * 100) / 100 : '';
            else if (sibSource === 'euro') sibling.value = price ? Math.round(newQty * price) : '';
            else if (sibSource === 'container') sibling.value = ratio ? Math.round(newQty / ratio * 10000) / 10000 : '';
          });
        }

        var payload;
        if (oid) {
          var order = _state.orders.find(function (o) { return o.id === oid; });
          if (!order) return;
          payload = {
            id: order._dbId,
            customer_id: order._customerId,
            product_id: order._productId,
            shipped_qty: field === 'cikan' ? newQty : order.cikan,
            planned_qty: field === 'cikacak' ? newQty : order.cikacak,
            destination_country: order.ulke || null,
            note: order.note || '',
          };
        } else if (inp.dataset.newCust && inp.dataset.newUrun) {
          payload = {
            customer_id: inp.dataset.newCust,
            product_id: inp.dataset.newUrun,
            shipped_qty: field === 'cikan' ? newQty : 0,
            planned_qty: field === 'cikacak' ? newQty : 0,
            destination_country: inp.dataset.newUlke || null,
            note: '',
          };
        } else { return; }

        // Minimum validasyon: euro equiv < 0.1 ise kaydetme
        var _price = prod ? (prod.price||0) : 0;
        var _ratio = prod ? (prod.ratio||1) : 1;
        var _euroEquiv = source==='euro' ? newQty : source==='adet' ? (newQty/_ratio)*_price : newQty*_price;
        if (newQty > 0 && _euroEquiv < 0.1) { showToast('En az 0.1 Euro değerinde sipariş girin'); return; }

        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function () {
          dbUpsertOrder(payload).then(function (ok) {
            if (ok) { showToast('Kaydedildi'); _loadAll().then(function () { renderData(); emitDataChange('orders', {}); }); }
            else showToast('Kaydedilemedi');
          });
        }, 600);
      });
    });
    document.querySelectorAll('#screen-orders .srt').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.skey;
        if (_S.sort.key === k) {
          if (_S.sort.dir === 'desc') _S.sort.dir = 'asc';
          else if (_S.sort.dir === 'asc') { _S.sort.key = null; _S.sort.dir = 'none'; }
          else _S.sort.dir = 'desc';
        } else { _S.sort.key = k; _S.sort.dir = 'desc'; }
        renderData();
      });
    });
    document.querySelectorAll('#screen-orders .srt-name').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = 'name_' + th.dataset.dim;
        if (_S.sort.key === k) {
          if (_S.sort.dir === 'asc') _S.sort.dir = 'desc';
          else if (_S.sort.dir === 'desc') { _S.sort.key = null; _S.sort.dir = 'none'; }
          else _S.sort.dir = 'asc';
        } else { _S.sort.key = k; _S.sort.dir = 'asc'; }
        renderData();
      });
    });
  }

  /* ============================================================ RENDER PV */
  function renderPV() {
    var inRows = new Set(_S.rows), inCols = new Set(_S.cols);
    var pool = ALL_DIMS.filter(function (d) { return !inRows.has(d) && !inCols.has(d); });

    var zPool = document.getElementById('o-z-pool');
    var zRows = document.getElementById('o-z-rows');
    var zCols = document.getElementById('o-z-cols');
    var zVals = document.getElementById('o-z-vals');
    if (!zPool) return;

    zPool.innerHTML = pool.map(function (d) { return chipHtml(d, 'pool'); }).join('') || '<span class="o-pv-hint">—</span>';
    zRows.innerHTML = _S.rows.map(function (d) { return chipHtml(d, 'rows'); }).join('') || '<span class="o-pv-hint">Seç</span>';
    zCols.innerHTML = _S.cols.map(function (d) { return chipHtml(d, 'cols'); }).join('') || '<span class="o-pv-hint">Seç</span>';

    var vDefs = [
      { k: 'cnt', l: 'Knt', bg: '#E8F5E9', co: '#1B5E20', bd: '#4CAF50' },
      { k: 'qty', l: 'Adet', bg: '#E3F2FD', co: '#0D47A1', bd: '#2196F3' },
      { k: 'eur', l: 'Euro', bg: '#FFF8E1', co: '#E65100', bd: '#FF9800' },
    ];
    zVals.innerHTML = vDefs.map(function (v) {
      return '<span class="o-chip o-chip-val' + (_S.vals[v.k] ? '' : ' off') + '" data-vk="' + v.k + '" style="background:' + v.bg + ';color:' + v.co + ';border:1px solid ' + v.bd + '">' + v.l + '</span>';
    }).join('');

    bindPV();
  }

  function chipHtml(dim, from) {
    var isTaraf = isTarafDim(dim);
    var cls;
    if (isTaraf) cls = from === 'pool' ? 'o-chip o-chip-' + dim + '-pool' : 'o-chip o-chip-' + dim;
    else cls = from === 'pool' ? 'o-chip o-chip-pool' : 'o-chip o-chip-dim';
    var lbl = dim === 'cikan' ? '↑ Çıkan' : dim === 'cikacak' ? '↓ Çıkacak' : dimLabel(dim);
    var sel = _sel && _sel.dim === dim ? ' selected' : '';
    return '<span class="' + cls + sel + '" data-dim="' + dim + '" data-from="' + from + '">' + _esc(lbl) + '<button class="o-chip-rm" data-dim="' + dim + '" data-from="' + from + '">×</button></span>';
  }

  function bindPV() {
    document.querySelectorAll('#screen-orders .o-chip[data-dim]').forEach(function (c) {
      c.addEventListener('click', function (e) {
        e.stopPropagation();
        if (e.target.classList.contains('o-chip-rm')) return;
        if (e.target.classList.contains('o-chip-val')) return;
        var dim = c.dataset.dim;
        if (_sel && _sel.dim === dim) { _sel = null; clearShine(); return; }
        _sel = { dim: dim, from: c.dataset.from };
        clearShine();
        document.querySelectorAll('#screen-orders .o-chip[data-dim]').forEach(function (x) { x.classList.remove('selected'); });
        c.classList.add('selected');
        document.querySelectorAll('#screen-orders .o-pv-sec[data-zone]').forEach(function (sec) {
          if (canMove(dim, sec.dataset.zone)) sec.classList.add('can-drop');
        });
      });
    });

    document.querySelectorAll('#screen-orders .o-pv-sec[data-zone]').forEach(function (sec) {
      sec.addEventListener('click', function (e) {
        if (!_sel) return;
        if (!sec.classList.contains('can-drop')) return;
        if (e.target.classList.contains('o-chip-rm')) return;
        e.stopPropagation();
        var to = sec.dataset.zone, dim = _sel.dim;
        _S.rows = _S.rows.filter(function (d) { return d !== dim; });
        _S.cols = _S.cols.filter(function (d) { return d !== dim; });
        if (to === 'rows') { if (isTarafDim(dim)) _S.rows = addTarafToAxis(_S.rows, dim); else _S.rows.push(dim); }
        if (to === 'cols') { if (isTarafDim(dim)) _S.cols = addTarafToAxis(_S.cols, dim); else _S.cols.push(dim); }
        _sel = null; clearShine(); render();
      });
    });

    document.querySelectorAll('#screen-orders .o-chip-rm').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var dim = b.dataset.dim;
        _S.rows = _S.rows.filter(function (d) { return d !== dim; });
        _S.cols = _S.cols.filter(function (d) { return d !== dim; });
        _sel = null; clearShine(); render();
      });
    });

    document.querySelectorAll('#screen-orders .o-chip-val').forEach(function (c) {
      c.addEventListener('click', function () { _S.vals[c.dataset.vk] = !_S.vals[c.dataset.vk]; render(); });
    });
  }

  function clearShine() {
    document.querySelectorAll('#screen-orders .o-pv-sec[data-zone]').forEach(function (s) { s.classList.remove('can-drop'); });
  }

  /* ============================================================ OPTS */
  function renderOpts() {
    ['compact', 'outline', 'tabular'].forEach(function (f) {
      var el = document.getElementById('o-opt-' + f);
      if (el) el.classList.toggle('on', _S.form === f);
    });
    var repeat = document.getElementById('o-opt-repeat');
    if (repeat) { repeat.classList.toggle('dim', _S.form === 'compact'); repeat.classList.toggle('on', _S.repeat && _S.form !== 'compact'); }
    var stTop = document.getElementById('o-opt-st-top');
    if (stTop) { stTop.classList.toggle('dim', _S.form === 'tabular'); stTop.classList.toggle('on', _S.stTop && _S.form !== 'tabular'); }
    ['st', 'gt', 'blank', 'empty'].forEach(function (k) {
      var el = document.getElementById('o-opt-' + k);
      if (el) el.classList.toggle('on', k === 'st' ? _S.stShow : k === 'gt' ? _S.gtShow : k === 'blank' ? _S.blankRow : _S.showEmpty);
    });
  }

  function bindOpts() {
    ['compact', 'outline', 'tabular'].forEach(function (f) {
      var el = document.getElementById('o-opt-' + f);
      if (el) el.addEventListener('click', function () { _S.form = f; render(); });
    });
    var repeat = document.getElementById('o-opt-repeat');
    if (repeat) repeat.addEventListener('click', function () { if (_S.form !== 'compact') { _S.repeat = !_S.repeat; render(); } });
    var st = document.getElementById('o-opt-st');
    if (st) st.addEventListener('click', function () { _S.stShow = !_S.stShow; render(); });
    var stTop = document.getElementById('o-opt-st-top');
    if (stTop) stTop.addEventListener('click', function () { if (_S.form !== 'tabular') { _S.stTop = !_S.stTop; render(); } });
    var gt = document.getElementById('o-opt-gt');
    if (gt) gt.addEventListener('click', function () { _S.gtShow = !_S.gtShow; render(); });
    var blank = document.getElementById('o-opt-blank');
    if (blank) blank.addEventListener('click', function () { _S.blankRow = !_S.blankRow; render(); });
    var empty = document.getElementById('o-opt-empty');
    if (empty) empty.addEventListener('click', function () { _S.showEmpty = !_S.showEmpty; render(); });
  }

  /* ============================================================ FILTERS */
  function renderFL() {
    ['ulke', 'musteri', 'urun'].forEach(function (key) {
      var vals = [];
      var seen = {};
      _state.orders.forEach(function (o) { var v = dv(o, key); if (v && !seen[v]) { seen[v] = 1; vals.push(v); } });
      vals.sort();

      var sel = _S.filters[key];
      var cnt = sel.length;
      var bBtn = document.getElementById('o-fb-' + key);
      var bBadge = document.getElementById('o-fbb-' + key);
      if (bBtn) bBtn.classList.toggle('on', cnt > 0);
      if (bBadge) { bBadge.textContent = cnt; bBadge.style.display = cnt ? 'inline-flex' : 'none'; }

      var p = document.getElementById('o-ddp-' + key);
      if (!p) return;
      p.innerHTML = '<input class="o-dds" placeholder="Ara..."/>' +
        '<div class="o-ddl">' + vals.map(function (v) {
          return '<label class="o-ddi"><input type="checkbox" data-key="' + key + '" data-val="' + _esc(v) + '" ' + (sel.includes(v) ? 'checked' : '') + '/><span>' + _esc(dvLabel(key, v)) + '</span></label>';
        }).join('') + '</div>' +
        '<div class="o-ddf"><button class="o-da" data-key="' + key + '">Tümünü Seç</button><button class="o-dr" data-key="' + key + '">Sıfırla</button></div>';

      p.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var k = cb.dataset.key, v = cb.dataset.val;
          if (cb.checked) { if (!_S.filters[k].includes(v)) _S.filters[k].push(v); }
          else _S.filters[k] = _S.filters[k].filter(function (x) { return x !== v; });
          renderFL(); renderData();
        });
      });
      var drBtn = p.querySelector('.o-dr');
      if (drBtn) drBtn.addEventListener('click', function () { _S.filters[key] = []; renderFL(); renderData(); });
      var daBtn = p.querySelector('.o-da');
      if (daBtn) daBtn.addEventListener('click', function () { _S.filters[key] = vals.slice(); renderFL(); renderData(); });
      var ds = p.querySelector('.o-dds');
      if (ds) ds.addEventListener('input', function () {
        var q = ds.value.toLowerCase();
        p.querySelectorAll('.o-ddi').forEach(function (it) { it.style.display = it.textContent.toLowerCase().includes(q) ? '' : 'none'; });
      });
    });
    renderChips();
  }

  function renderChips() {
    var w = document.getElementById('o-chips');
    if (!w) return;
    var h = '';
    Object.entries(_S.filters).forEach(function (pair) {
      var key = pair[0], vals = pair[1];
      vals.forEach(function (v) {
        h += '<span class="o-ach">' + dimLabel(key) + ': ' + _esc(dvLabel(key, v)) + '<button class="o-ach-x" data-key="' + key + '" data-val="' + _esc(v) + '">×</button></span>';
      });
    });
    w.innerHTML = h;
    w.querySelectorAll('.o-ach-x').forEach(function (b) {
      b.addEventListener('click', function () {
        _S.filters[b.dataset.key] = _S.filters[b.dataset.key].filter(function (x) { return x !== b.dataset.val; });
        renderFL(); renderData();
      });
    });
  }

  function bindFLEvents() {
    ['ulke', 'musteri', 'urun'].forEach(function (key) {
      var btn = document.getElementById('o-fb-' + key);
      var p   = document.getElementById('o-ddp-' + key);
      if (!btn || !p) return;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = p.classList.contains('open');
        document.querySelectorAll('#screen-orders .o-ddp').forEach(function (x) { x.classList.remove('open'); });
        if (!open) {
          var r = btn.getBoundingClientRect();
          p.style.top  = (r.bottom + 6) + 'px';
          p.style.left = r.left + 'px';
          p.classList.add('open');
        }
      });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#screen-orders .o-dda')) {
        document.querySelectorAll('#screen-orders .o-ddp').forEach(function (x) { x.classList.remove('open'); });
      }
    });
    var srch = document.getElementById('o-srch');
    if (srch) srch.addEventListener('input', function (e) { _S.search = e.target.value.trim(); renderData(); });
  }

  /* ============================================================ ADD ROW */
  function renderAddRow() {
    var bar = document.getElementById('o-addrow-bar');
    if (!bar) return;
    if (!_state.addRowOpen) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    var custOpts = '<option value="">Müşteri seç...</option>' +
      _state.customers.filter(function (c) { return c.active !== false; }).map(function (c) {
        return '<option value="' + c.id + '">' + _esc(c.name) + '</option>';
      }).join('');
    var prodOpts = '<option value="">Ürün seç...</option>' +
      _state.products.map(function (p) { return '<option value="' + p.id + '">' + _esc(p.name) + '</option>'; }).join('');
    bar.innerHTML =
      '<select id="o-new-cust" style="min-width:160px">' + custOpts + '</select>' +
      '<select id="o-new-prod" style="min-width:120px">' + prodOpts + '</select>' +
      '<input type="number" id="o-new-cikan" placeholder="Çıkan" style="width:80px"/>' +
      '<input type="number" id="o-new-cikacak" placeholder="Çıkacak" style="width:90px"/>' +
      '<input type="text" id="o-new-ulke" placeholder="Ülke" style="width:80px"/>' +
      '<button class="o-addrow-btn-save" id="o-new-save">Kaydet</button>' +
      '<button class="o-addrow-btn-cancel" id="o-new-cancel">İptal</button>';

    var saveBtn = document.getElementById('o-new-save');
    var cancelBtn = document.getElementById('o-new-cancel');
    if (saveBtn) saveBtn.addEventListener('click', _saveNewRow);
    if (cancelBtn) cancelBtn.addEventListener('click', function () { _state.addRowOpen = false; renderAddRow(); });
  }

  async function _saveNewRow() {
    var cid  = (document.getElementById('o-new-cust') || {}).value || '';
    var pid  = (document.getElementById('o-new-prod') || {}).value || '';
    if (!cid || !pid) { showToast('Müşteri ve ürün seçilmeli'); return; }
    var cikan  = parseFloat((document.getElementById('o-new-cikan') || {}).value) || 0;
    var cikacak = parseFloat((document.getElementById('o-new-cikacak') || {}).value) || 0;
    var ulke   = ((document.getElementById('o-new-ulke') || {}).value || '').trim();
    var ok = await dbUpsertOrder({ customer_id: cid, product_id: pid, shipped_qty: cikan, planned_qty: cikacak, destination_country: ulke || null, note: '' });
    if (ok) { showToast('Kaydedildi'); _state.addRowOpen = false; await _loadAll(); render(); emitDataChange('orders', {}); }
    else showToast('Kaydedilemedi');
  }

  /* ============================================================ IMPORT */
  function _handleImportFile(file) {
    if (!file || typeof processImportFile !== 'function') return;
    processImportFile(file, _state.customers, _state.products, function (preview) {
      _state.importPreviewData = preview; renderImportPreview();
    });
  }

  function renderImportPreview() {
    var screen = document.getElementById('screen-orders');
    if (!screen) return;
    var existing = document.getElementById('o-import-preview');
    if (existing) existing.remove();
    if (!_state.importPreviewData) return;
    var data = _state.importPreviewData;
    var detailRows = (data.rows || []).slice(0, 100).map(function (row) {
      var custCell = row.matched
        ? '<span style="color:green">✓ ' + _esc(_state.customerMap[row.customer_id] ? _state.customerMap[row.customer_id].name : row.customer_name) + '</span>'
        : '<select class="o-icust" data-ern="' + _esc(row.customer_name) + '" style="font-size:12px;height:28px"><option value="">— Eşleştir —</option>' + _state.customers.map(function (c) { return '<option value="' + c.id + '">' + _esc(c.name) + '</option>'; }).join('') + '</select>';
      var prodCell = row.product_id
        ? '<span style="color:green">✓ ' + _esc(_state.productMap[row.product_id] ? _state.productMap[row.product_id].name : row.product_name) + '</span>'
        : '<select class="o-iprod" data-ern="' + _esc(row.product_name) + '" style="font-size:12px;height:28px"><option value="">— Eşleştir —</option>' + _state.products.map(function (p) { return '<option value="' + p.id + '">' + _esc(p.name) + '</option>'; }).join('') + '</select>';
      return '<tr><td style="padding:6px 10px">' + custCell + '</td><td style="padding:6px 10px">' + prodCell + '</td><td style="padding:6px 10px;text-align:right">' + (row.qty || '—') + '</td></tr>';
    }).join('');

    var div = document.createElement('div');
    div.id = 'o-import-preview';
    div.className = 'o-import-preview';
    div.innerHTML =
      '<div class="o-import-header"><span class="o-import-title">İmport Onay</span><button class="btn btn-secondary" id="o-import-cancel">İptal</button></div>' +
      '<div class="o-import-summary">' +
        '<div class="o-import-sum-item"><span class="o-import-sum-label">Satır</span><span class="o-import-sum-val">' + (data.rowCount || 0) + '</span></div>' +
        '<div class="o-import-sum-item"><span class="o-import-sum-label">Eşleşmeyen</span><span class="o-import-sum-val" style="color:var(--color-warning)">' + (data.unmatchedCount || 0) + '</span></div>' +
      '</div>' +
      '<div class="o-import-body"><table class="o-import-table"><thead><tr><th>Müşteri</th><th>Ürün</th><th>Adet</th></tr></thead><tbody>' + detailRows + '</tbody></table></div>' +
      '<div class="o-import-actions"><button class="btn btn-primary" id="o-import-confirm">Yükle</button></div>';
    screen.insertBefore(div, screen.querySelector('.o-tw'));

    var cancelBtn = document.getElementById('o-import-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { _state.importPreviewData = null; div.remove(); });
    var confirmBtn = document.getElementById('o-import-confirm');
    if (confirmBtn) confirmBtn.addEventListener('click', _confirmImport);
  }

  async function _confirmImport() {
    if (!_state.importPreviewData) return;
    var rows = _state.importPreviewData.rows || [];
    document.querySelectorAll('#screen-orders .o-icust').forEach(function (sel) {
      if (!sel.value) return;
      var ern = sel.getAttribute('data-ern');
      var row = rows.find(function (r) { return r.customer_name === ern && !r.customer_id; });
      if (row) row.customer_id = sel.value;
    });
    document.querySelectorAll('#screen-orders .o-iprod').forEach(function (sel) {
      if (!sel.value) return;
      var ern = sel.getAttribute('data-ern');
      var row = rows.find(function (r) { return r.product_name === ern && !r.product_id; });
      if (row) row.product_id = sel.value;
    });
    var done = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row.customer_id || !row.product_id) continue;
      if (await dbImportOrder(row.customer_id, row.product_id, row.qty)) done++;
    }
    showToast(done + ' satır yüklendi');
    _state.importPreviewData = null;
    await _loadAll(); render(); emitDataChange('orders', {});
  }

  /* ============================================================ GLOBAL EVENTS */
  function _bindGlobalEvents() {
    document.addEventListener('nsdata:dataChanged', function (e) {
      if (['orders', 'products', 'customers'].includes(e.detail.table)) {
        var activeInput = document.activeElement && document.activeElement.classList.contains('o-ci');
        if (activeInput) {
          setTimeout(function () { _loadAll().then(function () { if (_screenActive()) renderData(); }); }, 2000);
        } else {
          _loadAll().then(function () { if (_screenActive()) renderData(); });
        }
      }
    });
    document.addEventListener('nsdata:screenActivated', function (e) { if (e.detail.screen === 'orders') render(); });
    document.addEventListener('nsdata:filterCleared', function () { _S.filters = { ulke: [], musteri: [], urun: [] }; _S.search = ''; render(); });
    document.addEventListener('click', function (e) {
      if (_sel && !e.target.closest('#screen-orders .o-pv')) {
        _sel = null; clearShine();
        document.querySelectorAll('#screen-orders .o-chip[data-dim]').forEach(function (x) { x.classList.remove('selected'); });
      }
    });
  }

  function _screenActive() {
    var s = document.getElementById('screen-orders');
    return s && s.classList.contains('active');
  }

  /* ============================================================ MAIN RENDER */
  function render() {
    renderPV();
    renderOpts();
    renderFL();
    renderAddRow();
    renderData();
  }

  /* ============================================================ HTML SCAFFOLD */
  // Pivot bar, opts, filter bar, add row bar, table — inject into #screen-orders
  (function _injectScaffold() {
    var screen = document.getElementById('screen-orders');
    if (!screen) return;
    screen.innerHTML =
      // Pivot bar
      '<div class="o-pv">' +
        '<div class="o-pv-sec" data-zone="pool"><span class="o-pv-lbl">Havuz</span><div class="o-pv-zone" id="o-z-pool"></div></div>' +
        '<div class="o-pv-sec" data-zone="rows"><span class="o-pv-lbl">Satırlar</span><div class="o-pv-zone" id="o-z-rows"></div></div>' +
        '<div class="o-pv-sec" data-zone="cols"><span class="o-pv-lbl">Sütunlar</span><div class="o-pv-zone" id="o-z-cols"></div></div>' +
        '<div class="o-pv-sec"><span class="o-pv-lbl">Değerler</span><div class="o-pv-zone" id="o-z-vals" style="border-style:solid;cursor:default;min-width:auto"></div></div>' +
        '<div style="margin-left:auto;display:flex;gap:6px;padding:0 8px">' +
          '<label class="o-nav-btn o-nav-btn-pri" style="cursor:pointer">ERP\'den Yükle<input type="file" id="o-import-input" accept=".xlsx,.xls" style="display:none"/></label>' +
          '<button class="o-nav-btn o-nav-btn-sec" id="o-addrow-toggle">+ Satır</button>' +
        '</div>' +
      '</div>' +
      // Opts bar
      '<div class="o-opts">' +
        '<div class="o-opts-g"><span class="o-opts-lbl">Form</span>' +
          '<button class="o-ob" id="o-opt-compact">Compact</button>' +
          '<button class="o-ob" id="o-opt-outline">Outline</button>' +
          '<button class="o-ob on" id="o-opt-tabular">Tabular</button>' +
        '</div>' +
        '<div class="o-opts-g"><span class="o-opts-lbl">Etiket</span><button class="o-ob" id="o-opt-repeat">Tekrarla</button></div>' +
        '<div class="o-opts-g"><span class="o-opts-lbl">Alt Top.</span><button class="o-ob on" id="o-opt-st">Göster</button><button class="o-ob" id="o-opt-st-top">Üstte</button></div>' +
        '<div class="o-opts-g"><span class="o-opts-lbl">Genel Top.</span><button class="o-ob on" id="o-opt-gt">Göster</button></div>' +
        '<div class="o-opts-g"><span class="o-opts-lbl">Boş Satır</span><button class="o-ob" id="o-opt-blank">Ekle</button></div>' +
        '<div class="o-opts-g"><span class="o-opts-lbl">Siparişsiz</span><button class="o-ob" id="o-opt-empty">Göster</button></div>' +
      '</div>' +
      // Filter bar
      '<div class="o-fl">' +
        '<div class="o-srch"><span class="o-srch-ic">🔍</span><input type="search" id="o-srch" placeholder="Ara..."/></div>' +
        '<div class="o-dda"><button class="o-fb" id="o-fb-ulke">Ülke <span class="o-fb-b" id="o-fbb-ulke" style="display:none">0</span> ▾</button><div class="o-ddp" id="o-ddp-ulke"></div></div>' +
        '<div class="o-dda"><button class="o-fb" id="o-fb-musteri">Müşteri <span class="o-fb-b" id="o-fbb-musteri" style="display:none">0</span> ▾</button><div class="o-ddp" id="o-ddp-musteri"></div></div>' +
        '<div class="o-dda"><button class="o-fb" id="o-fb-urun">Ürün <span class="o-fb-b" id="o-fbb-urun" style="display:none">0</span> ▾</button><div class="o-ddp" id="o-ddp-urun"></div></div>' +
        '<div id="o-chips" style="display:flex;gap:4px;align-items:center;flex-shrink:0"></div>' +
      '</div>' +
      // Add row bar
      '<div class="o-addrow-bar" id="o-addrow-bar" style="display:none"></div>' +
      // Table
      '<div class="o-tw">' +
        '<div class="o-th-wrap"><div class="o-th-inner" id="o-th-inner"><table class="o-ht" id="o-ht" style="min-width:600px"></table></div></div>' +
        '<div class="o-ts" id="o-ts"><table class="o-dt" id="o-dt" style="min-width:600px"><tbody id="o-dt-b"></tbody></table></div>' +
      '</div>';

    // Bind import input
    var impInp = document.getElementById('o-import-input');
    if (impInp) impInp.addEventListener('change', function () { if (impInp.files[0]) _handleImportFile(impInp.files[0]); impInp.value = ''; });

    // Bind add row toggle
    var addToggle = document.getElementById('o-addrow-toggle');
    if (addToggle) addToggle.addEventListener('click', function () { _state.addRowOpen = !_state.addRowOpen; renderAddRow(); });

    bindOpts();
    bindFLEvents();
  })();

})();
