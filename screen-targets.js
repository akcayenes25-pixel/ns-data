/* NSDATA - screen-targets.js v3.1.0 */
/* Hedefler pivot — index, delegated events, drag+drop, excel collapse, col resize */

(function () {
'use strict';

/* ============================================================ STATE */
var _state = {
  targets: [], customers: [], products: [], customerCountries: [],
  customerMap: {}, productMap: {},
  importPreview: null, importStep: 'idle'
};

var _S = {
  rows:        ['ulke', 'musteri', 'urun'],
  cols:        [],
  vals:        { eur: true, usd: false, qty: false },
  form:        'tabular',
  editMode:    false,
  stShow:      false,
  gtShow:      true,
  showEmpty:   false,
  filters:     { ulke: [], musteri: [], urun: [], bolge: [], ay: [] },
  collapsed:   {},
  sort:        { key: null, dir: 'none' },
  year:        new Date().getFullYear(),
  search:      '',
  selectedDim: null,
  rowBudget:   500
};

/* ============================================================ CONSTANTS */
var ALL_DIMS  = ['ulke', 'musteri', 'urun', 'bolge', 'ay'];
var DIM_LABEL = { ulke: 'Ülke', musteri: 'Müşteri', urun: 'Ürün', bolge: 'Bölge', ay: 'Aylar' };
var VAL_DEFS  = [{ k: 'eur', l: 'EUR' }, { k: 'usd', l: 'USD' }, { k: 'qty', l: 'Adet' }];
var MN   = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
var MNF  = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

/* ============================================================ INDEX SYSTEM */
var _filteredTargets = [];
var _leafIdx   = {};  // rowDimKey -> targets[]
var _dimIdx    = {};  // dim -> val -> targets[]

function _buildIndexes() {
  _filteredTargets = filtTargets();
  _leafIdx  = {};
  _dimIdx   = {};

  // Per-dim index for group-level aggregates
  ALL_DIMS.forEach(function(d) { _dimIdx[d] = {}; });

  _filteredTargets.forEach(function(t) {
    // Per-dim
    ALL_DIMS.forEach(function(d) {
      var v = dv(t, d);
      if (v === null || v === undefined) return;
      if (!_dimIdx[d][v]) _dimIdx[d][v] = [];
      _dimIdx[d][v].push(t);
    });
    // Leaf key (all row dims)
    var lk = _S.rows.map(function(dim) { return dv(t, dim) || '_'; }).join('|||');
    if (!_leafIdx[lk]) _leafIdx[lk] = [];
    _leafIdx[lk].push(t);
  });
}

/* ============================================================ SESSION STATE */
var _PK = 'nsdata_tgt_v31';
function _saveState() {
  try {
    sessionStorage.setItem(_PK, JSON.stringify({
      rows: _S.rows, cols: _S.cols, vals: _S.vals, form: _S.form,
      stShow: _S.stShow, gtShow: _S.gtShow, showEmpty: _S.showEmpty,
      filters: _S.filters, year: _S.year, sort: _S.sort
    }));
  } catch(e) {}
}
function _restoreState() {
  try {
    var s = JSON.parse(sessionStorage.getItem(_PK) || 'null');
    if (!s) return;
    if (s.rows)  _S.rows  = s.rows;
    if (s.cols)  _S.cols  = s.cols;
    if (s.vals)  _S.vals  = s.vals;
    if (s.form)  _S.form  = s.form;
    if (s.stShow  !== undefined) _S.stShow  = s.stShow;
    if (s.gtShow  !== undefined) _S.gtShow  = s.gtShow;
    if (s.showEmpty !== undefined) _S.showEmpty = s.showEmpty;
    if (s.sort) {
      // Migrate old {dim,...} shape to {key,...}
      if (s.sort.key !== undefined) _S.sort = {key: s.sort.key, dir: s.sort.dir || 'none'};
      else if (s.sort.dim !== undefined) _S.sort = {key: s.sort.dim, dir: s.sort.dir || 'none'};
    }
    if (s.year) _S.year = s.year;
    if (s.filters) {
      ['ulke','urun','bolge','ay'].forEach(function(d) {
        if (s.filters[d]) _S.filters[d] = s.filters[d];
      });
      if (s.filters.musteri) {
        var ids = _state.customers.map(function(c){ return c.id; });
        _S.filters.musteri = s.filters.musteri.filter(function(id){ return ids.includes(id); });
      }
    }
  } catch(e) {}
}

/* ============================================================ ACTIVATION */
var _initialized = false;

document.addEventListener('nsdata:appReady', function() {
  _loadData().then(function() {
    _restoreState();
    var p = new URLSearchParams(window.location.search);
    if (p.get('screen') === 'targets') _firstRender();
  });
});

document.addEventListener('nsdata:screenActivated', function(e) {
  if (e.detail.screen !== 'targets') return;
  _loadData().then(function() {
    _restoreState();
    if (!_initialized) _firstRender();
    else _updateAll();
  }).catch(function(err) {
    var el = document.getElementById('screen-targets');
    if (el) el.innerHTML = '<div class="tgt-error">Hata: ' + _esc(String(err)) + '</div>';
  });
});

document.addEventListener('nsdata:dataChanged', function() {
  var el = document.getElementById('screen-targets');
  if (!el || !el.classList.contains('active')) return;
  _loadData().then(function() { _buildIndexes(); _updateTable(); });
});

/* ============================================================ DATA */
async function _loadData() {
  var res = await Promise.all([dbGetTargets(), dbGetCustomers(), dbGetProducts(), dbGetCustomerCountries()]);
  _state.targets           = _adapt(res[0] || []);
  _state.customers         = res[1] || [];
  _state.products          = res[2] || [];
  _state.customerCountries = res[3] || [];
  _state.customerMap = {}; _state.productMap = {};
  _state.customers.forEach(function(c) { _state.customerMap[c.id] = c; });
  _state.products.forEach(function(p)  { _state.productMap[p.id]  = p; });
  _buildIndexes();
}

function _adapt(raw) {
  return (raw || []).map(function(t) {
    return { id: t.id, musteri: t.customer_id, urun: t.product_id,
             ulke: t.country || '', bolge: t.bolge ? String(t.bolge) : null,
             month: t.month, year: t.year,
             eur: parseFloat(t.target_eur) || 0,
             usd: parseFloat(t.target_usd) || 0,
             qty: parseFloat(t.target_qty) || 0 };
  });
}

/* ============================================================ HELPERS */
function dvLabel(dim, val) {
  if (val === null || val === undefined) return '';
  if (dim === 'ay')      return MN[parseInt(val) - 1] || String(val);
  if (dim === 'musteri') { var c = _state.customerMap[val]; return c ? c.name : val; }
  if (dim === 'urun')    { var p = _state.productMap[val];  return p ? p.name  : val; }
  if (dim === 'bolge')   return 'Bölge ' + val;
  return String(val || '');
}
function dv(t, dim) {
  if (dim === 'ulke')    return t.ulke;
  if (dim === 'musteri') return t.musteri;
  if (dim === 'urun')    return t.urun;
  if (dim === 'bolge')   return t.bolge;
  if (dim === 'ay')      return String(t.month);
  return null;
}
function dimVals(dim, source) {
  if (dim === 'ay') {
    var ms = {}, mv = [];
    (source||[]).forEach(function(t) { if (!ms[t.month]){ ms[t.month]=1; mv.push(String(t.month)); } });
    return mv.length ? mv : ['1','2','3','4','5','6','7','8','9','10','11','12'];
  }
  if (dim === 'urun') return _state.products.filter(function(p){ return p.active!==false; }).map(function(p){ return p.id; });
  var seen = {}, vals = [];
  (source||[]).forEach(function(t){ var v=dv(t,dim); if(v&&!seen[v]){seen[v]=1;vals.push(v);} });
  return vals;
}
function activeVals() { return VAL_DEFS.filter(function(v){ return _S.vals[v.k]; }); }
function poolDims()   { return ALL_DIMS.filter(function(d){ return !_S.rows.includes(d)&&!_S.cols.includes(d); }); }
function fmtE(v) { if(!v||v===0) return '—'; return Math.round(v).toLocaleString('tr-TR')+' €'; }
function fmtU(v) { if(!v||v===0) return '—'; return '$ '+Math.round(v).toLocaleString('tr-TR'); }
function fmtN(v) { if(!v||v===0) return '—'; return Number(v).toLocaleString('tr-TR',{maximumFractionDigits:1}); }
function fmtVal(v,k) { return k==='eur'?fmtE(v):k==='usd'?fmtU(v):fmtN(v); }
function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ============================================================ FILTER */
function filtTargets() {
  return _state.targets.filter(function(t) {
    if (t.year !== _S.year) return false;
    var f = _S.filters;
    if (f.ulke.length    && !f.ulke.includes(t.ulke))       return false;
    if (f.musteri.length && !f.musteri.includes(t.musteri)) return false;
    if (f.urun.length    && !f.urun.includes(t.urun))       return false;
    if (f.bolge.length   && !f.bolge.includes(t.bolge))     return false;
    if (f.ay.length      && !f.ay.includes(String(t.month)))return false;
    if (_S.search) {
      var q  = _S.search.toLowerCase();
      var cn = dvLabel('musteri', t.musteri).toLowerCase();
      if (!t.ulke.toLowerCase().includes(q) && !cn.includes(q)) return false;
    }
    return true;
  });
}

/* Full-year targets (ignores ay filter) for Yıllık column */
function filtTargetsYearly() {
  return _state.targets.filter(function(t) {
    if (t.year !== _S.year) return false;
    var f = _S.filters;
    if (f.ulke.length    && !f.ulke.includes(t.ulke))       return false;
    if (f.musteri.length && !f.musteri.includes(t.musteri)) return false;
    if (f.urun.length    && !f.urun.includes(t.urun))       return false;
    if (f.bolge.length   && !f.bolge.includes(t.bolge))     return false;
    if (_S.search) {
      var q  = _S.search.toLowerCase();
      var cn = dvLabel('musteri', t.musteri).toLowerCase();
      if (!t.ulke.toLowerCase().includes(q) && !cn.includes(q)) return false;
    }
    return true;
  });
}

/* ============================================================ COMPUTE */
function compute(arr) {
  var e=0,u=0,q=0;
  (arr||[]).forEach(function(t){ e+=t.eur; u+=t.usd; q+=t.qty; });
  return { eur:Math.round(e), usd:Math.round(u), qty:Math.round(q*10)/10 };
}
function cv(m,k) { return k==='eur'?m.eur:k==='usd'?m.usd:m.qty; }

/* ============================================================ SORT */
function _defaultSortVals(dim, vals) {
  // Each dimension's natural order
  if (dim === 'ay')    return vals.slice().sort(function(a,b){ return parseInt(a)-parseInt(b); });           // calendar
  if (dim === 'bolge') return vals.slice().sort(function(a,b){ return parseFloat(a)-parseFloat(b); });       // 1-9 numeric
  return vals.slice().sort(function(a,b){ return dvLabel(dim,a).localeCompare(dvLabel(dim,b),'tr'); });       // A-Z turkish
}

function sortVals(dim, vals, sourceArr) {
  var s = _S.sort || {};
  // Is the active sort targeting THIS name dimension by its own label/value?
  if (s.key === dim && s.dir && s.dir !== 'none') {
    var sorted = _defaultSortVals(dim, vals);
    return s.dir === 'desc' ? sorted.reverse() : sorted;
  }
  // Is the active sort targeting a VALUE column (eur/usd/qty)? Sort this dim's rows by aggregated value.
  // Only apply value-sort to ROW dimensions; column dims stay in natural order.
  if (s.key && (s.key === 'eur' || s.key === 'usd' || s.key === 'qty') && s.dir && s.dir !== 'none' && _S.rows.indexOf(dim) !== -1) {
    var byVal = vals.slice().sort(function(a,b) {
      var aT = (_dimIdx[dim] && _dimIdx[dim][a]) || [];
      var bT = (_dimIdx[dim] && _dimIdx[dim][b]) || [];
      var av = cv(compute(aT), s.key), bv = cv(compute(bT), s.key);
      return bv - av; // desc by default
    });
    return s.dir === 'asc' ? byVal.reverse() : byVal;
  }
  // No active sort for this dim → natural order
  return _defaultSortVals(dim, vals);
}

/* ============================================================ COL LEAVES */
function buildColLeaves() {
  if (!_S.cols.length) return [{ keys:[], label:'Yıllık', bi:0, isSingle:true }];
  var combos = [[]];
  _S.cols.forEach(function(dim) {
    var vals = sortVals(dim, dimVals(dim, _filteredTargets), _filteredTargets);
    var next = [];
    combos.forEach(function(c) { vals.forEach(function(v){ next.push(c.concat([{dim:dim,val:v}])); }); });
    combos = next;
  });
  return combos.map(function(c,i){ return {keys:c,label:c.map(function(k){return dvLabel(k.dim,k.val);}).join(' / '),bi:i%4}; });
}

/* ============================================================ SCHEMA */
function buildSchema(leaves) {
  var vl = activeVals(); if (!vl.length) return null;
  var isSingle = leaves.length===1 && leaves[0].isSingle;
  var schema = [];
  var ci = 0;
  _S.rows.forEach(function(dim, i) {
    var k = 'n'+i;
    schema.push({ type:'name', dim:dim, label:DIM_LABEL[dim], w:(i===0?200:160), ci:k });
    ci++;
  });
  if (!_S.rows.length) schema.push({ type:'name', dim:'_all', label:'—', w:200, ci:'n0' });
  if (isSingle) {
    vl.forEach(function(v, vi) {
      var k='t'+vi; schema.push({type:'val',li:0,leaf:leaves[0],valK:v.k,valL:v.l,isFirst:vi===0,bi:0,w:(v.k==='eur'?130:95),ci:k,isSingle:true});
    });
  } else {
    leaves.forEach(function(leaf, li) {
      vl.forEach(function(v, vi) {
        var k='v'+li+'_'+vi; schema.push({type:'val',li:li,leaf:leaf,valK:v.k,valL:v.l,isFirst:vi===0,bi:leaf.bi,w:(v.k==='eur'?96:76),ci:k});
      });
    });
    vl.forEach(function(v, vi) {
      var k='T'+vi; schema.push({type:'total',valK:v.k,valL:v.l,w:(v.k==='eur'?120:90),ci:k});
    });
  }
  return schema;
}

/* ============================================================ ROW BUILDER — uses index */
var _rowCount = 0;

function buildRowsRecursive(ctxDimVals, schema, level) {
  if (level >= _S.rows.length) return buildDataRow(ctxDimVals, schema);
  var dim  = _S.rows[level];
  var base;
  // Get dimension values from index (already filtered)
  if (dim === 'urun') {
    base = _state.products.filter(function(p){ return p.active!==false; }).map(function(p){ return p.id; });
  } else {
    // Build candidate values from index intersection
    var source = _getIndexedTargets(ctxDimVals);
    base = dimVals(dim, source);
  }
  base = sortVals(dim, base, null);
  var parts = [];
  base.forEach(function(val) {
    if (_rowCount > _S.rowBudget) return;
    var newCtx = ctxDimVals.concat([{dim:dim,val:val}]);
    // Check if this group has any data
    var grpTargets = _getIndexedTargets(newCtx);
    if (!_S.showEmpty && dim !== 'urun' && !grpTargets.length) return;
    var gk = newCtx.map(function(r){return r.val;}).join('|');
    var lbl = dvLabel(dim, val);
    var isLeaf = (level + 1) >= _S.rows.length;
    var isCollapsed = !!_S.collapsed[gk];
    // Tabular form: flat list, no group headers, no collapse
    if (_S.form === 'tabular') {
      if (isLeaf) {
        parts.push(buildDataRow(newCtx, schema));
        _rowCount++;
      } else {
        parts.push(buildRowsRecursive(newCtx, schema, level + 1));
      }
    } else {
    // Collapse form: group headers + collapse
    parts.push(_groupRow(gk, lbl, grpTargets, schema, newCtx, level, isCollapsed, dim));
    _rowCount++;
    if (!isCollapsed) {
      if (isLeaf) {
        parts.push(buildDataRow(newCtx, schema));
        _rowCount++;
      } else {
        parts.push(buildRowsRecursive(newCtx, schema, level + 1));
      }
      if (_S.stShow && !isLeaf) {
        parts.push(buildAggRow(grpTargets, schema, lbl + ' Top.', (level+1)*14, false, false));
      }
    }
    } // end else (collapse form)
  });
  return parts.join('');
}

function _getIndexedTargets(ctx) {
  if (!ctx.length) return _filteredTargets;
  // Find the smallest indexed set from ctx and intersect
  var smallest = null;
  ctx.forEach(function(c) {
    var set = (_dimIdx[c.dim] && _dimIdx[c.dim][c.val]) || [];
    if (smallest === null || set.length < smallest.length) smallest = set;
  });
  if (!smallest) return [];
  return smallest.filter(function(t) {
    return ctx.every(function(c) { return dv(t, c.dim) === c.val; });
  });
}

/* ============================================================ GROUP ROW (Excel-style +/-) */
function _groupRow(gk, lbl, targets, schema, ctx, level, collapsed, dim) {
  var nc = schema.filter(function(c){return c.type==='name';}).length;
  var pad = level * 18 + 10;
  var btn = '<button class="tgt-tog" data-action="tog" data-gk="' + _esc(gk) + '" data-dim="' + dim + '" style="margin-right:6px;color:#fff;font-size:13px;font-weight:700;background:rgba(255,255,255,.15);border:none;border-radius:3px;width:20px;height:20px;cursor:pointer;padding:0;line-height:20px;flex-shrink:0">' + (collapsed?'+':'-') + '</button>';
  var nameCells = '<td class="tgt-td tgt-grp-name" colspan="' + nc + '" style="padding:7px 10px 7px ' + pad + 'px;font-size:13px;font-weight:700;color:#fff;background:#374151;border-bottom:1px solid #4B5563" data-gk="' + _esc(gk) + '" data-dim="' + dim + '">' +
    '<div style="display:flex;align-items:center">' + btn + _esc(lbl) + '</div></td>';
  var valCells = schema.filter(function(c){return c.type!=='name';}).map(function(c) {
    var bl = c.isFirst ? 'border-left:2px solid #4B5563;' : '';
    if (c.type === 'total') {
      var yt = filtTargetsYearly().filter(function(t){ return ctx.every(function(cx){ return dv(t,cx.dim)===cx.val; }); });
      return '<td style="background:#374151;color:#fff;font-weight:700;text-align:right;padding:7px 10px;border-left:2px solid #4B5563">'+fmtVal(cv(compute(yt),c.valK),c.valK)+'</td>';
    }
    var lt = targets.filter(function(t){ return c.leaf.keys.every(function(k){ return dv(t,k.dim)===k.val; }); });
    var v = cv(compute(lt), c.valK);
    return '<td style="background:#374151;color:#e5e7eb;font-weight:600;text-align:right;padding:7px 10px;' + bl + '">' + (v?fmtVal(v,c.valK):'—') + '</td>';
  }).join('');
  return '<tr class="tgt-grp" data-gk="' + _esc(gk) + '" data-dim="' + dim + '">' + nameCells + valCells + '</tr>';
}

/* ============================================================ DATA ROW */
function buildDataRow(ctx, schema) {
  // Use leaf index for O(1) lookups
  var lk = _S.rows.map(function(dim) {
    var c = ctx.find(function(r){ return r.dim===dim; });
    return c ? c.val : '_';
  }).join('|||');
  var leafTargets = _leafIdx[lk] || [];
  // Yearly targets (no ay filter)
  var yrKey = lk; // same key, different source
  var parts = [];
  var nc = schema.filter(function(c){return c.type==='name';});
  nc.forEach(function(ncol, i) {
    if (ncol.dim==='_all') { parts.push('<td class="tgt-td tgt-td-name">—</td>'); return; }
    var c2 = ctx.find(function(r){ return r.dim===ncol.dim; });
    var lbl = c2 ? dvLabel(ncol.dim, c2.val) : '';
    var isLast = (i===nc.length-1);
    parts.push('<td class="tgt-td tgt-td-name" style="padding-left:' + (i*14+12) + 'px;font-weight:' + (isLast?'600':'400') + '" title="' + _esc(lbl) + '">' + _esc(lbl) + '</td>');
  });
  schema.forEach(function(c) {
    if (c.type==='name') return;
    var bl = c.isFirst ? 'border-left:2px solid #D1D5DB;' : '';
    if (c.type==='total') {
      // Use yearly targets for total column
      var yrTargets = filtTargetsYearly().filter(function(t){ return ctx.every(function(cx){ return dv(t,cx.dim)===cx.val; }); });
      var ym = compute(yrTargets);
      parts.push('<td class="tgt-td tgt-td-total" style="border-left:2px solid #374151">' + fmtVal(cv(ym,c.valK),c.valK) + '</td>');
      return;
    }
    // Filter leaf targets by col leaf keys — O(k) where k ≤ 12
    var lt = leafTargets.filter(function(t){ return c.leaf.keys.every(function(k){ return dv(t,k.dim)===k.val; }); });
    var m2 = compute(lt);
    var v  = cv(m2, c.valK);
    var bg = c.bi%2===0 ? '#fff' : '#F8F9FC';
    var single = lt.length===1 ? lt[0] : null;
    var canEdit = _S.editMode && single && single.id;
    if (canEdit) {
      var raw = c.valK==='eur'?single.eur:c.valK==='usd'?single.usd:single.qty;
      parts.push('<td class="tgt-td tgt-ce" style="background:#EFF6FF;'+bl+'" data-tid="'+_esc(single.id)+'" data-field="target_'+c.valK+'" data-val="'+(raw||'')+'">'+(raw?'<strong>'+fmtVal(raw,c.valK)+'</strong>':'<span style="color:#9CA3AF">-</span>')+'</td>');
    } else {
      parts.push('<td class="tgt-td" style="background:'+bg+';'+bl+';color:#0F1117">'+(v?'<strong>'+fmtVal(v,c.valK)+'</strong>':'<span style="color:#9CA3AF">—</span>')+'</td>');
    }
  });
  return '<tr class="tgt-dr">' + parts.join('') + '</tr>';
}

/* ============================================================ AGG ROW */
function buildAggRow(targets, schema, label, pad, isGrand) {
  var bg = isGrand ? 'background:#0F1117;color:#fff;' : 'background:#4B5563;color:#fff;';
  var nc = schema.filter(function(c){return c.type==='name';});
  var parts = [];
  nc.forEach(function(c,i) {
    if (i===0) parts.push('<td class="tgt-td tgt-td-name tgt-agg-name" style="'+bg+'padding-left:'+(pad||10)+'px;font-size:13px;font-weight:700">'+_esc(label)+'</td>');
    else parts.push('<td class="tgt-td tgt-td-name tgt-agg-name" style="'+bg+'"></td>');
  });
  schema.forEach(function(c) {
    if (c.type==='name') return;
    var bl = c.isFirst?'border-left:2px solid rgba(255,255,255,.3);':'';
    if (c.type==='total') {
      var yt = filtTargetsYearly();
      parts.push('<td class="tgt-td" style="'+bg+'border-left:2px solid rgba(255,255,255,.5);text-align:right;font-size:13px;font-weight:700;padding:7px 10px">'+fmtVal(cv(compute(yt),c.valK),c.valK)+'</td>');
      return;
    }
    var lt = (targets||[]).filter(function(t){return c.leaf.keys.every(function(k){return dv(t,k.dim)===k.val;});});
    parts.push('<td class="tgt-td" style="'+bg+bl+'text-align:right;font-size:13px;font-weight:700;padding:7px 10px">'+fmtVal(cv(compute(lt),c.valK),c.valK)+'</td>');
  });
  return '<tr class="tgt-agg">' + parts.join('') + '</tr>';
}

/* ============================================================ HEADER */
function renderHeader(schema, leaves) {
  var vl = activeVals();
  var isSingle = leaves.length===1 && leaves[0].isSingle;
  var nColDims = isSingle ? 0 : _S.cols.length;
  var nHR = nColDims + 1;
  var cg = '<colgroup>' + schema.map(function(c){
    return '<col class="tgt-col" data-ci="'+c.ci+'" style="width:'+c.w+'px;min-width:'+c.w+'px">';
  }).join('') + '</colgroup>';
  var rows = []; for (var i=0;i<nHR;i++) rows.push([]);
  // Name cols
  schema.filter(function(c){return c.type==='name';}).forEach(function(nc) {
    rows[0].push('<th class="tgt-th tgt-th-name tgt-th-sortable" rowspan="'+nHR+'" data-ci="'+nc.ci+'" data-action="sort" data-sortkey="'+nc.dim+'">'+
      '<div class="tgt-th-inner"><span>'+_esc(nc.label)+'</span>' +
      '<span class="tgt-sort-btn">'+_sortIcon(nc.dim)+'</span></div></th>');
  });
  if (isSingle) {
    vl.forEach(function(v,vi) {
      var c = schema.find(function(s){return s.type==='val'&&s.valK===v.k;});
      rows[0].push('<th class="tgt-th tgt-th-sortable" data-ci="'+(c?c.ci:'')+'" data-action="sort" data-sortkey="'+v.k+'">' + 'Yıllık ' + v.l + ' <span class="tgt-sort-btn">'+_sortIcon(v.k)+'</span></th>');
    });
  } else {
    // Multi-level col headers
    for (var level=0; level<nColDims; level++) {
      var groups=[],prev=null,cnt=0,sLeaf=null;
      leaves.forEach(function(leaf,li) {
        var k=leaf.keys[level]; var key=k?k.dim+':'+k.val:'_';
        if(key!==prev){if(cnt>0)groups.push({count:cnt,leaf:sLeaf});prev=key;cnt=1;sLeaf=leaf;}
        else cnt++;
      });
      if(cnt>0) groups.push({count:cnt,leaf:sLeaf});
      groups.forEach(function(g,gi){
        var k=g.leaf.keys[level]; var lbl=k?dvLabel(k.dim,k.val):'';
        var span=g.count*vl.length;
        var bl=gi>0?'border-left:2px solid #D1D5DB;':'';
        rows[level].push('<th class="tgt-th" colspan="'+span+'" style="text-align:center;'+bl+'">'+_esc(lbl)+'</th>');
      });
    }
    leaves.forEach(function(leaf,li){
      vl.forEach(function(v,vi){
        var c=schema.find(function(s){return s.type==='val'&&s.li===li&&s.valK===v.k;});
        var bl=vi===0?'border-left:1.5px solid #D1D5DB;':'';
        rows[nHR-1].push('<th class="tgt-th tgt-th-val tgt-th-sortable" style="'+bl+'" data-ci="'+(c?c.ci:'')+'" data-action="sort" data-sortkey="'+v.k+'">'+v.l+' <span class="tgt-sort-btn">'+_sortIcon(v.k)+'</span></th>');
      });
    });
    // Total header
    rows[0].push('<th class="tgt-th tgt-th-total" colspan="'+vl.length+'" rowspan="'+(nHR>1?nHR-1:1)+'" style="border-left:2px solid #374151;text-align:center">Yıllık</th>');
    vl.forEach(function(v,vi){
      var c=schema.find(function(s){return s.type==='total'&&s.valK===v.k;});
      rows[nHR-1].push('<th class="tgt-th tgt-th-total tgt-th-sortable" style="border-left:'+(vi===0?'2px solid #374151':'none')+';" data-ci="'+(c?c.ci:'')+'" data-action="sort" data-sortkey="'+v.k+'">'+v.l+' <span class="tgt-sort-btn">'+_sortIcon(v.k)+'</span></th>');
    });
  }
  return cg+'<thead class="tgt-thead">'+rows.map(function(r){return '<tr>'+r.join('')+'</tr>';}).join('')+'</thead>';
}

function _sortIcon(key) {
  if (_S.sort.key !== key) return '<span style="color:#9CA3AF;font-size:10px;margin-left:2px">⇅</span>';
  return _S.sort.dir==='asc' ? '<span style="color:#4F46E5;font-size:11px;margin-left:2px;font-weight:700">↑</span>'
                              : '<span style="color:#4F46E5;font-size:11px;margin-left:2px;font-weight:700">↓</span>';
}


/* ============================================================ SHELL + RENDER */
var _editActive = false;

function _firstRender() {
  var el = document.getElementById('screen-targets');
  if (!el) return;
  el.innerHTML =
    '<div id="tgt-bar"></div>' +
    '<div id="tgt-fbar"></div>' +
    '<div id="tgt-tw" class="tgt-tw">' +
      '<div id="tgt-tbl-wrap"><table class="tgt-table" id="tgt-table"></table></div>' +
      '<div id="tgt-more-wrap" style="display:none;padding:10px 16px;border-top:1px solid #E2E5EF">' +
        '<button id="tgt-more-btn" style="background:#4F46E5;color:#fff;border:none;border-radius:7px;padding:6px 18px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-family);min-height:unset!important;width:auto!important">Daha fazla göster</button>' +
        '<span id="tgt-more-info" style="margin-left:12px;color:#4A5068;font-size:12px"></span>' +
      '</div>' +
    '</div>' +
    '<input id="tgt-editor" class="tgt-editor" type="number" step="any">' +
    '<div id="tgt-ctx-menu" class="tgt-ctx-menu" style="display:none"></div>' +
    '<input type="file" id="tgt-file-in" accept=".xlsx,.xls" style="display:none">' +
    '<div id="tgt-modal-backdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;align-items:center;justify-content:center">' +
      '<div style="background:#fff;border-radius:12px;padding:24px;width:680px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2)"><div id="tgt-modal-body"></div></div>' +
    '</div>';
  _initialized = true;
  _bindDelegated();
  _bindDrag();
  _updateAll();
}

function _updateAll() {
  _updatePivotBar();
  _updateFilterBar();
  _updateTable();
  _saveState();
}

function _fixStickyColumns() {
  var table = document.getElementById('tgt-table');
  if (!table) return;

  // --- 1. Compute cumulative LEFT offsets for each name column ---
  var nameThs = table.querySelectorAll('thead .tgt-th-name');
  if (!nameThs.length) return;
  var lefts = [];
  var acc = 0;
  nameThs.forEach(function(th) { lefts.push(acc); acc += th.offsetWidth; });
  var nameCount = lefts.length;
  var stickyWidth = acc; // total width of all name columns

  // --- 2. Header: name th stick left+top, value th stick top only ---
  nameThs.forEach(function(th, i) {
    th.style.setProperty('position', 'sticky', 'important');
    th.style.setProperty('left', lefts[i] + 'px', 'important');
    th.style.setProperty('top', '0px', 'important');
    th.style.setProperty('z-index', '6', 'important');
  });
  table.querySelectorAll('thead .tgt-th:not(.tgt-th-name)').forEach(function(th) {
    th.style.setProperty('left', 'auto', 'important');
    th.style.setProperty('z-index', '3', 'important');
  });

  // --- 3. Body: every row's first nameCount cells stick left ---
  // Works for data rows, group header rows, and agg/grand-total rows.
  table.querySelectorAll('tbody tr').forEach(function(tr) {
    var cells = tr.children;
    var used = 0;       // visual columns consumed
    var applied = 0;    // name cells styled
    for (var i = 0; i < cells.length && used < nameCount; i++) {
      var cell = cells[i];
      var span = cell.colSpan || 1;
      cell.style.setProperty('position', 'sticky', 'important');
      cell.style.setProperty('left', lefts[used] + 'px', 'important');
      cell.style.setProperty('z-index', '4', 'important');
      used += span;
      applied++;
    }
  });
}

function _updateTable() {
  if (_editActive) return;
  if (_S.rows.includes('ay') && _S.cols.includes('ay')) {
    _S.cols = _S.cols.filter(function(d){ return d !== 'ay'; });
    if (typeof showToast === 'function') showToast('Aylar aynı anda iki eksende olamaz.');
  }
  _buildIndexes();
  _rowCount = 0;
  var leaves = buildColLeaves();
  var schema = buildSchema(leaves);
  if (!schema) {
    document.getElementById('tgt-table').innerHTML = '<tbody><tr><td style="padding:40px;text-align:center;color:#4A5068">Değer seçin (EUR / USD / Adet)</td></tr></tbody>';
    return;
  }
  var body = buildRowsRecursive([], schema, 0);
  if (_S.gtShow) body += buildAggRow(_filteredTargets, schema, 'GENEL TOPLAM', 12, true);
  document.getElementById('tgt-table').innerHTML = renderHeader(schema, leaves) + '<tbody>' + body + '</tbody>';
  setTimeout(_fixStickyColumns, 0);
  // Show/hide "more" button
  var moreWrap = document.getElementById('tgt-more-wrap');
  var moreInfo = document.getElementById('tgt-more-info');
  var total = _filteredTargets.length;
  if (moreWrap) {
    if (_rowCount >= _S.rowBudget) {
      moreWrap.style.display = 'block';
      if (moreInfo) moreInfo.textContent = _rowCount + ' satır gösteriliyor';
    } else { moreWrap.style.display = 'none'; }
  }
}

function _updatePivotBar() {
  var el = document.getElementById('tgt-bar'); if (!el) return;
  el.innerHTML = _pivotBarHTML();
}

function _updateFilterBar() {
  var el = document.getElementById('tgt-fbar'); if (!el) return;
  el.innerHTML = _filterBarHTML();
}

/* ============================================================ PIVOT BAR HTML */
var _openFilter = null;
var _drag = { active: false, dim: null, fromZone: null };

function _pivotBarHTML() {
  var pool = poolDims();
  var sel  = _S.selectedDim;
  var parts = ['<div class="tgt-bar">'];

  // HAVUZ — always shown
  parts.push('<div class="tgt-zone" id="tz-pool"><span class="tgt-zlbl">HAVUZ</span>');
  if (pool.length) {
    pool.forEach(function(d, i) {
      var isSel = sel === d;
      parts.push(
        '<div class="tgt-gap tgt-gap-pool" data-zone="pool" data-idx="' + i + '"></div>' +
        '<button class="tgt-chip' + (isSel?' tgt-chip-sel':'') + '" draggable="true" data-dim="' + d + '" data-zone="pool" data-action="chip">' +
        DIM_LABEL[d] + '</button>'
      );
    });
    parts.push('<div class="tgt-gap tgt-gap-pool" data-zone="pool" data-idx="' + pool.length + '"></div>');
  } else {
    parts.push('<span class="tgt-pool-ph">— boş —</span>');
  }
  parts.push('</div>');

  // SATIRLAR
  var dropHint = sel && pool.includes(sel);
  parts.push('<div class="tgt-zone' + (dropHint?' tgt-zone-ready':'') + '" id="tz-rows">');
  parts.push('<span class="tgt-zlbl" data-action="zone-drop" data-zone="rows">SATIRLAR' + (dropHint?'<span class="tgt-drop-hint">+ ekle</span>':'') + '</span>');
  _S.rows.forEach(function(d, i) {
    parts.push(
      '<div class="tgt-gap" data-zone="rows" data-idx="' + i + '"></div>' +
      '<span class="tgt-chip tgt-chip-row" draggable="true" data-dim="' + d + '" data-zone="rows" data-action="chip">' +
        (i>0?'<button class="tgt-mv" data-action="mv" data-dim="' + d + '" data-zone="rows" data-dir="-1">‹</button>':'') +
        DIM_LABEL[d] +
        (i<_S.rows.length-1?'<button class="tgt-mv" data-action="mv" data-dim="' + d + '" data-zone="rows" data-dir="1">›</button>':'') +
        '<button class="tgt-rm" data-action="rm" data-dim="' + d + '" data-zone="rows">×</button>' +
      '</span>'
    );
  });
  parts.push('<div class="tgt-gap" data-zone="rows" data-idx="' + _S.rows.length + '"></div>');
  parts.push('</div>');

  // SÜTUNLAR
  parts.push('<div class="tgt-zone' + (dropHint?' tgt-zone-ready':'') + '" id="tz-cols">');
  parts.push('<span class="tgt-zlbl" data-action="zone-drop" data-zone="cols">SÜTUNLAR' + (dropHint?'<span class="tgt-drop-hint">+ ekle</span>':'') + '</span>');
  _S.cols.forEach(function(d, i) {
    parts.push(
      '<div class="tgt-gap" data-zone="cols" data-idx="' + i + '"></div>' +
      '<span class="tgt-chip tgt-chip-col" draggable="true" data-dim="' + d + '" data-zone="cols" data-action="chip">' +
        (i>0?'<button class="tgt-mv" data-action="mv" data-dim="' + d + '" data-zone="cols" data-dir="-1">&#8249;</button>':'') +
        DIM_LABEL[d] +
        (i<_S.cols.length-1?'<button class="tgt-mv" data-action="mv" data-dim="' + d + '" data-zone="cols" data-dir="1">&#8250;</button>':'') +
        '<button class="tgt-rm" data-action="rm" data-dim="' + d + '" data-zone="cols">×</button>' +
      '</span>'
    );
  });
  parts.push('<div class="tgt-gap" data-zone="cols" data-idx="' + _S.cols.length + '"></div>');
  parts.push('</div>');

  // DEĞERLER
  parts.push('<div class="tgt-zone"><span class="tgt-zlbl">DEĞERLER</span>');
  VAL_DEFS.forEach(function(v) {
    parts.push('<button class="tgt-vbtn' + (_S.vals[v.k]?' tgt-vbtn-on':'') + '" data-action="val" data-val="' + v.k + '">' + v.l + '</button>');
  });
  parts.push('</div>');

  // FORM
  parts.push('<div class="tgt-zone"><span class="tgt-zlbl">FORM</span>');
  [['tabular','Tabular'],['collapse','Collapse']].forEach(function(f) {
    parts.push('<button class="tgt-fbtn' + (_S.form===f[0]?' active':'') + '" data-action="form" data-form="' + f[0] + '">' + f[1] + '</button>');
  });
  parts.push('</div>');

  // Actions
  parts.push('<div class="tgt-actions">' +
    '<button class="tgt-act-btn' + (_S.editMode?' tgt-act-edit':'') + '" data-action="edit">' + (_S.editMode ? '✎ Düzenleme Açık' : '✎ Düzenle') + '</button>' +
    '<button class="tgt-act-btn tgt-act-import" data-action="import">Excel\'den Yükle</button>' +
  '</div>');
  parts.push('</div>');
  return parts.join('');
}

/* ============================================================ FILTER BAR HTML */
function _filterBarHTML() {
  var FDIMS = [
    { dim:'ulke',    lbl:'Ülke' },
    { dim:'musteri', lbl:'Müşteri' },
    { dim:'urun',    lbl:'Ürün' },
    { dim:'bolge',   lbl:'Bölge' },
    { dim:'ay',      lbl:'Ay' }
  ];
  var parts = ['<div class="tgt-fbar">'];
  parts.push('<select id="tgt-yr" class="tgt-yr" data-action="year">' +
    [_S.year-1,_S.year,_S.year+1].map(function(y){
      return '<option value="'+y+'"'+(y===_S.year?' selected':'')+'>'+y+'</option>';
    }).join('') + '</select>');

  FDIMS.forEach(function(fd) {
    var act = _S.filters[fd.dim].length;
    var isO = _openFilter === fd.dim;
    var vals = _fVals(fd.dim);
    parts.push('<div class="tgt-fpw">');
    parts.push('<button class="tgt-fp' + (act?' tgt-fp-on':'') + '" data-action="filter-open" data-fdim="' + fd.dim + '">' +
      fd.lbl + (act?' ('+act+')':'') + ' ▾</button>');
    if (isO) parts.push(_fDropHTML(fd.dim, vals));
    parts.push('</div>');
  });

  var hasF = _S.search || Object.values(_S.filters).some(function(f){return f.length>0;});
  parts.push('<div style="margin-left:auto;display:flex;gap:8px;align-items:center">');
  parts.push('<input id="tgt-search" class="tgt-search" data-action="search" placeholder="Ara..." value="' + _esc(_S.search) + '">');
  if (hasF) parts.push('<button class="tgt-clr" data-action="clear-filters">× Temizle</button>');
  parts.push('</div></div>');
  return parts.join('');
}

function _fVals(dim) {
  if (dim==='musteri') return _state.customers.slice().sort(function(a,b){return a.name.localeCompare(b.name,'tr');});
  if (dim==='urun')    return _state.products.filter(function(p){return p.active!==false;}).sort(function(a,b){return a.name.localeCompare(b.name,'tr');});
  if (dim==='ay')      return MN.map(function(_,i){return {id:String(i+1),lbl:MN[i]+' ('+MNF[i]+')'}; });
  var seen={},vals=[];
  _state.targets.forEach(function(t){var v=dv(t,dim);if(v&&!seen[v]){seen[v]=1;vals.push(v);}});
  if (dim==='bolge') return vals.map(Number).sort(function(a,b){return a-b;}).map(function(n){return String(n);});
  return vals.sort();
}

function _fDropHTML(dim, vals) {
  var sel = _S.filters[dim];
  var isId  = (dim==='musteri'||dim==='urun');
  var isAy  = dim==='ay';
  var items = isAy ? vals :
    vals.map(function(v){ return {id:isId?v.id:v, lbl:isId?v.name:(dim==='bolge'?'Bölge '+v:v)}; });

  var rows = items.map(function(it){
    var id = String(it.id||it), lbl = it.lbl||it;
    var chk = sel.includes(id);
    return '<label class="tgt-fi"><input type="checkbox" class="tgt-fchk" data-action="filter-chk" data-dim="'+dim+'" value="'+_esc(id)+'"'+(chk?' checked':'')+'><span>'+_esc(lbl)+'</span></label>';
  }).join('');

  return '<div class="tgt-fdrop" id="fdrop-'+dim+'">' +
    '<input class="tgt-fsrch" data-action="filter-srch" data-dim="'+dim+'" placeholder="Ara...">' +
    '<div class="tgt-flist" id="flist-'+dim+'">' + rows + '</div>' +
    '<div class="tgt-ffoot">' +
      '<button class="tgt-fall" data-action="filter-all" data-dim="'+dim+'">Tümünü Seç</button>' +
      '<button class="tgt-fnone" data-action="filter-none" data-dim="'+dim+'">Sıfırla</button>' +
    '</div></div>';
}


/* ============================================================ SINGLE DELEGATED EVENT LISTENER */
function _bindDelegated() {
  var screen = document.getElementById('screen-targets');
  if (!screen) return;

  screen.addEventListener('click', function(e) {
    var t = e.target;
    // Don't handle if editor is active and click is on editor
    if (_editActive && t.id === 'tgt-editor') return;

    var action = t.dataset.action || (t.closest('[data-action]') && t.closest('[data-action]').dataset.action);
    var el     = t.dataset.action ? t : t.closest('[data-action]');
    if (!el) { _closeCtxMenu(); return; }

    switch(action) {
      case 'chip':
        var dim = el.dataset.dim, zone = el.dataset.zone;
        if (zone === 'pool') {
          _S.selectedDim = (_S.selectedDim === dim) ? null : dim;
          _updatePivotBar();
        } else {
          // Click on active chip → return to pool
          if (e.target.classList.contains('tgt-mv') || e.target.classList.contains('tgt-rm')) return;
          _S.rows = _S.rows.filter(function(d){return d!==dim;});
          _S.cols = _S.cols.filter(function(d){return d!==dim;});
          _S.selectedDim = null;
          _updateAll();
        }
        break;

      case 'zone-drop':
        if (!_S.selectedDim || !poolDims().includes(_S.selectedDim)) return;
        var zone2 = el.dataset.zone;
        if (zone2==='rows') _S.rows.push(_S.selectedDim);
        else _S.cols.push(_S.selectedDim);
        _S.selectedDim = null;
        _updateAll();
        break;

      case 'val':
        _S.vals[el.dataset.val] = !_S.vals[el.dataset.val];
        _updateAll();
        break;

      case 'form':
        _S.form = el.dataset.form;
        _updateTable();
        _updatePivotBar();
        break;

      case 'edit':
        _S.editMode = !_S.editMode;
        _updateTable();
        _updatePivotBar();
        break;

      case 'import':
        var fi = document.getElementById('tgt-file-in'); if (fi) fi.click();
        break;

      case 'year':
        break; // handled by change event below

      case 'filter-open':
        var fdim = el.dataset.fdim;
        _openFilter = (_openFilter === fdim) ? null : fdim;
        _updateFilterBar();
        break;

      case 'filter-chk':
        var d2 = el.dataset.dim, v2 = el.value;
        if (el.checked) { if (!_S.filters[d2].includes(v2)) _S.filters[d2].push(v2); }
        else _S.filters[d2] = _S.filters[d2].filter(function(x){return x!==v2;});
        _buildIndexes();
        _updateTable();
        break;

      case 'filter-all':
        var da = el.dataset.dim, vals2 = _fVals(da);
        var isId = (da==='musteri'||da==='urun');
        var isAy2 = da==='ay';
        if (isAy2) _S.filters.ay = MN.map(function(_,i){return String(i+1);});
        else _S.filters[da] = vals2.map(function(v){return String(isId?v.id:v);});
        _buildIndexes(); _updateTable(); _updateFilterBar();
        break;

      case 'filter-none':
        _S.filters[el.dataset.dim] = [];
        _buildIndexes(); _updateTable(); _updateFilterBar();
        break;

      case 'filter-srch':
        break; // handled by input event

      case 'clear-filters':
        _S.filters = {ulke:[],musteri:[],urun:[],bolge:[],ay:[]}; _S.search = '';
        _buildIndexes(); _updateAll();
        break;

      case 'sort':
        var skey = el.dataset.sortkey;
        if (_S.sort.key !== skey) _S.sort = {key:skey, dir:'asc'};
        else if (_S.sort.dir==='asc') _S.sort.dir = 'desc';
        else _S.sort = {key:null, dir:'none'};
        _buildIndexes(); _updateTable();
        break;

      case 'rm':
        var rdim = el.dataset.dim, rzone = el.dataset.zone;
        if (rzone === 'rows') _S.rows = _S.rows.filter(function(d){return d!==rdim;});
        else _S.cols = _S.cols.filter(function(d){return d!==rdim;});
        _S.selectedDim = null;
        _updateAll();
        break;

      case 'mv':
        var mdim = el.dataset.dim, mzone = el.dataset.zone, mdir = parseInt(el.dataset.dir);
        var arr = mzone === 'rows' ? _S.rows : _S.cols;
        var mi = arr.indexOf(mdim);
        if (mi >= 0 && mi + mdir >= 0 && mi + mdir < arr.length) {
          arr.splice(mi, 1);
          arr.splice(mi + mdir, 0, mdim);
        }
        _updateAll();
        break;

      case 'tog':
        var gk2 = el.dataset.gk; _S.collapsed[gk2] = !_S.collapsed[gk2];
        _updateTable();
        break;

      case 'more':
        _S.rowBudget += 500; _updateTable();
        break;
    }
  });

  // Input/change events
  screen.addEventListener('change', function(e) {
    if (e.target.id === 'tgt-yr') { _S.year = parseInt(e.target.value); _buildIndexes(); _updateAll(); }
  });
  screen.addEventListener('input', function(e) {
    var t = e.target;
    if (t.id === 'tgt-search') { _S.search = t.value; _buildIndexes(); _updateTable(); return; }
    if (t.dataset.action === 'filter-srch') {
      var q = t.value.toLowerCase();
      var list = document.getElementById('flist-'+t.dataset.dim);
      if (list) list.querySelectorAll('.tgt-fi').forEach(function(l){
        l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }
  });

  // Context menu on table rows
  screen.addEventListener('contextmenu', function(e) {
    var grp = e.target.closest('.tgt-grp') || e.target.closest('.tgt-tog');
    if (!grp) return;
    e.preventDefault();
    var gk3 = grp.dataset.gk, dim3 = grp.dataset.dim;
    if (!gk3) return;
    _showCtxMenu(e.clientX, e.clientY, gk3, dim3);
  });

  // Close filter/ctxmenu on outside click
  document.addEventListener('click', function(e) {
    if (_openFilter && !e.target.closest('.tgt-fpw')) {
      _openFilter = null; _updateFilterBar();
    }
    if (document.getElementById('tgt-ctx-menu') &&
        document.getElementById('tgt-ctx-menu').style.display !== 'none' &&
        !e.target.closest('#tgt-ctx-menu')) {
      _closeCtxMenu();
    }
  });

  // File input
  var fi = document.getElementById('tgt-file-in');
  if (fi) fi.addEventListener('change', function() {
    var file = this.files[0]; if (!file) return; this.value='';
    if (typeof showToast==='function') showToast('Dosya okunuyor...');
    processBudgetImportFile(file, function(preview) {
      if (preview.error) { if(typeof showToast==='function') showToast('Hata: '+preview.error); return; }
      _state.importPreview = preview; _state.importStep = 'preview'; _showImportModal();
    });
  });

  // More button
  screen.addEventListener('click', function(e) {
    if (e.target.id === 'tgt-more-btn') { _S.rowBudget += 500; _updateTable(); }
  });

  // Cell editor events
  var editor = document.getElementById('tgt-editor');
  if (editor) {
    screen.addEventListener('click', function(e) {
      var td = e.target.closest('.tgt-ce');
      if (td) { e.stopPropagation(); _activateCell(td); }
    });
    editor.addEventListener('blur',    function()  { _commitEdit(); });
    editor.addEventListener('keydown', function(e) {
      if (e.key==='Enter')  { e.preventDefault(); _commitEdit(); }
      if (e.key==='Escape') { _cancelEdit(); }
    });
  }
}

/* ============================================================ DRAG AND DROP */
function _bindDrag() {
  var screen = document.getElementById('screen-targets'); if (!screen) return;

  screen.addEventListener('dragstart', function(e) {
    var chip = e.target.closest('[data-action="chip"]'); if (!chip) return;
    _drag.active   = true;
    _drag.dim      = chip.dataset.dim;
    _drag.fromZone = chip.dataset.zone;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', chip.dataset.dim);
    chip.classList.add('tgt-dragging');
  });

  screen.addEventListener('dragend', function(e) {
    _drag.active = false;
    screen.querySelectorAll('.tgt-dragging').forEach(function(el){ el.classList.remove('tgt-dragging'); });
    screen.querySelectorAll('.tgt-gap-over').forEach(function(el){ el.classList.remove('tgt-gap-over'); });
  });

  screen.addEventListener('dragover', function(e) {
    e.preventDefault();
    var gap = e.target.closest('.tgt-gap'); if (!gap) return;
    screen.querySelectorAll('.tgt-gap-over').forEach(function(el){ el.classList.remove('tgt-gap-over'); });
    gap.classList.add('tgt-gap-over');
  });

  screen.addEventListener('dragleave', function(e) {
    var gap = e.target.closest('.tgt-gap'); if (gap) gap.classList.remove('tgt-gap-over');
  });

  screen.addEventListener('drop', function(e) {
    e.preventDefault();
    var gap = e.target.closest('.tgt-gap'); if (!gap) return;
    var dim = _drag.dim; if (!dim) return;
    var targetZone = gap.dataset.zone;
    var insertIdx  = parseInt(gap.dataset.idx);

    // Remove from current zone
    _S.rows = _S.rows.filter(function(d){return d!==dim;});
    _S.cols = _S.cols.filter(function(d){return d!==dim;});
    _S.selectedDim = null;

    // Insert into target zone at position
    if (targetZone === 'rows') {
      _S.rows.splice(insertIdx, 0, dim);
    } else if (targetZone === 'cols') {
      _S.cols.splice(insertIdx, 0, dim);
    }
    // If dropped on pool, dim is already removed above — stays in pool

    _drag.active = false;
    _updateAll();
  });
}

/* ============================================================ CONTEXT MENU */
function _showCtxMenu(x, y, gk, dim) {
  var menu = document.getElementById('tgt-ctx-menu'); if (!menu) return;
  var isCol = !!_S.collapsed[gk];
  menu.innerHTML =
    '<div class="ctx-item" onclick="_toggleGroup(\'' + _esc(gk) + '\')">'  + (isCol?'+ Bu grubu aç':'- Bu grubu kapat') + '</div>' +
    '<div class="ctx-sep"></div>' +
    '<div class="ctx-item" onclick="_collapseAllByDim(\'' + dim + '\')">Tüm ' + DIM_LABEL[dim] + ' gruplarını kapat</div>' +
    '<div class="ctx-item" onclick="_expandAllByDim(\'' + dim + '\')">Tüm ' + DIM_LABEL[dim] + ' gruplarını aç</div>' +
    '<div class="ctx-sep"></div>' +
    '<div class="ctx-item" onclick="_collapseAll()">Tümünü kapat</div>' +
    '<div class="ctx-item" onclick="_expandAll()">Tümünü aç</div>';
  menu.style.display = 'block';
  menu.style.left    = Math.min(x, window.innerWidth-180) + 'px';
  menu.style.top     = Math.min(y, window.innerHeight-200) + 'px';
}
function _closeCtxMenu() { var m=document.getElementById('tgt-ctx-menu'); if(m) m.style.display='none'; }
window._toggleGroup       = function(gk)  { _S.collapsed[gk]=!_S.collapsed[gk]; _closeCtxMenu(); _updateTable(); };
window._collapseAllByDim  = function(dim) {
  _filteredTargets.forEach(function(t){ var v=dv(t,dim); if(v) _S.collapsed[v]=true; });
  _closeCtxMenu(); _updateTable();
};
window._expandAllByDim    = function(dim) {
  _filteredTargets.forEach(function(t){ var v=dv(t,dim); if(v) delete _S.collapsed[v]; });
  _closeCtxMenu(); _updateTable();
};
window._collapseAll       = function()    { /* mark all groups collapsed */
  var keys = {};
  _filteredTargets.forEach(function(t) { ALL_DIMS.forEach(function(d){ var v=dv(t,d); if(v) keys[v]=true; }); });
  Object.keys(keys).forEach(function(k){ _S.collapsed[k]=true; });
  _closeCtxMenu(); _updateTable();
};
window._expandAll         = function()    { _S.collapsed={}; _closeCtxMenu(); _updateTable(); };

/* ============================================================ CELL EDITOR */
function _activateCell(td) {
  _editActive = true;
  var editor = document.getElementById('tgt-editor'); if (!editor) return;
  var wrap   = document.getElementById('tgt-tw');
  var wr     = wrap ? wrap.getBoundingClientRect() : {left:0,top:0};
  var tr     = td.getBoundingClientRect();
  editor.style.left    = (tr.left - wr.left + (wrap?wrap.scrollLeft:0)) + 'px';
  editor.style.top     = (tr.top  - wr.top  + (wrap?wrap.scrollTop:0))  + 'px';
  editor.style.width   = tr.width  + 'px';
  editor.style.height  = tr.height + 'px';
  editor.style.display = 'block';
  editor.dataset.tid   = td.dataset.tid;
  editor.dataset.field = td.dataset.field;
  editor.value         = td.dataset.val || '';
  editor.focus(); editor.select();
  td.style.outline = '2px solid #4F46E5';
  editor._td = td;
}
async function _commitEdit() {
  var editor = document.getElementById('tgt-editor'); if (!editor) return;
  var tid    = editor.dataset.tid;
  var field  = editor.dataset.field;
  var raw    = editor.value.trim();
  var val    = raw===''?null:parseFloat(raw.replace(',','.'));
  editor.style.display = 'none';
  if (editor._td) { editor._td.style.outline=''; editor._td=null; }
  _editActive = false;
  if (!tid||!field) return;
  if (isNaN(val)) val = null;
  await dbUpdateTarget(tid, field, val);
  var t = _state.targets.find(function(x){return x.id===tid;});
  if (t) { if(field==='target_eur')t.eur=val||0; else if(field==='target_usd')t.usd=val||0; else t.qty=val||0; }
  _buildIndexes();
  _updateTable();
}
function _cancelEdit() {
  var editor = document.getElementById('tgt-editor'); if (!editor) return;
  editor.style.display = 'none';
  if (editor._td) { editor._td.style.outline=''; editor._td=null; }
  _editActive = false;
}


/* ============================================================ IMPORT MODAL */
var _pvOpen = { c:{}, cu:{} };
function _fE(v){var n=parseFloat(v);return isNaN(n)||n===0?'—':n.toLocaleString('tr-TR',{maximumFractionDigits:0})+' €';}
function _fU(v){var n=parseFloat(v);return isNaN(n)||n===0?'—':'$ '+n.toLocaleString('tr-TR',{maximumFractionDigits:0});}
function _fQ(v){var n=parseFloat(v);return isNaN(n)||n===0?'—':n.toLocaleString('tr-TR',{maximumFractionDigits:0});}
var _MNF2 = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

function _buildPreviewTree(combos){var tree={};(combos||[]).forEach(function(c){var ct=c.country;if(!tree[ct])tree[ct]={eur:0,usd:0,qty:0,customers:{}};var cu=c.custName;if(!tree[ct].customers[cu])tree[ct].customers[cu]={eur:0,usd:0,qty:0,products:{}};var pr=c.prodName;if(!tree[ct].customers[cu].products[pr])tree[ct].customers[cu].products[pr]={eur:0,usd:0,qty:0,months:c.months};c.months.forEach(function(m){tree[ct].eur+=(m.target_eur||0);tree[ct].usd+=(m.target_usd||0);tree[ct].qty+=(m.target_qty||0);tree[ct].customers[cu].eur+=(m.target_eur||0);tree[ct].customers[cu].usd+=(m.target_usd||0);tree[ct].customers[cu].qty+=(m.target_qty||0);tree[ct].customers[cu].products[pr].eur+=(m.target_eur||0);tree[ct].customers[cu].products[pr].usd+=(m.target_usd||0);tree[ct].customers[cu].products[pr].qty+=(m.target_qty||0);});});return tree;}

function _renderPreviewExplorer(tree){var cs=Object.keys(tree).sort();if(!cs.length)return '<div style="padding:16px;color:#4A5068">Veri yok.</div>';var h='<div style="font-size:11px;display:flex;gap:8px;padding:6px 0 10px;color:#4A5068;font-weight:600"><span style="flex:1">Ülke/Müşteri/Ürün</span><span style="min-width:90px;text-align:right">EUR</span><span style="min-width:90px;text-align:right">USD</span><span style="min-width:70px;text-align:right">Adet</span></div>';cs.forEach(function(ct){var n=tree[ct];var io=!!_pvOpen.c[ct];var cks=Object.keys(n.customers).sort();h+='<div style="display:flex;align-items:center;gap:6px;padding:7px 8px;background:#F1F3F9;border-radius:6px;cursor:pointer;border-bottom:1px solid #E2E5EF;font-size:13px;font-weight:600" data-pvc="'+_esc(ct)+'">'+(io?'▾':'▸')+' <span style="flex:1">'+_esc(ct)+'</span><span style="min-width:90px;text-align:right">'+_fE(n.eur)+'</span><span style="min-width:90px;text-align:right;color:#059669">'+_fU(n.usd)+'</span><span style="min-width:70px;text-align:right;color:#4A5068">'+_fQ(n.qty)+'</span></div>';if(!io)return;cks.forEach(function(cu){var cun=n.customers[cu];var ck=ct+'|'+cu;var ico=!!_pvOpen.cu[ck];h+='<div style="display:flex;align-items:center;gap:6px;padding:6px 8px 6px 20px;cursor:pointer;border-bottom:1px solid #E2E5EF;font-size:12px" data-pvcu="'+_esc(ck)+'">'+(ico?'▾':'▸')+' <span style="flex:1">'+_esc(cu)+'</span><span style="min-width:90px;text-align:right">'+_fE(cun.eur)+'</span><span style="min-width:90px;text-align:right;color:#059669">'+_fU(cun.usd)+'</span><span style="min-width:70px;text-align:right">'+_fQ(cun.qty)+'</span></div>';if(!ico)return;Object.keys(cun.products).sort().forEach(function(pr){var prn=cun.products[pr];var pk=ck+'|'+pr;var ipo=!!_pvOpen.cu[pk];h+='<div style="display:flex;align-items:center;gap:6px;padding:5px 8px 5px 36px;cursor:pointer;border-bottom:1px solid #E2E5EF;font-size:11px;color:#4A5068" data-pvpr="'+_esc(pk)+'">'+(ipo?'▾':'▸')+' <span style="flex:1">'+_esc(pr)+'</span><span style="min-width:90px;text-align:right">'+_fE(prn.eur)+'</span><span style="min-width:90px;text-align:right;color:#059669">'+_fU(prn.usd)+'</span><span style="min-width:70px;text-align:right">'+_fQ(prn.qty)+'</span></div>';if(ipo){h+='<div style="padding:4px 8px 4px 48px;border-bottom:1px solid #E2E5EF"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;padding:3px 6px;color:#4A5068">Ay</th><th style="text-align:right;padding:3px 6px">EUR</th><th style="text-align:right;padding:3px 6px;color:#059669">USD</th><th style="text-align:right;padding:3px 6px">Adet</th></tr></thead><tbody>';prn.months.forEach(function(m,mi){var hv=m.target_eur||m.target_usd||m.target_qty;h+='<tr style="'+(hv?'':'opacity:.4')+'"><td style="padding:3px 6px">'+_MNF2[mi]+'</td><td style="text-align:right;padding:3px 6px">'+_fE(m.target_eur)+'</td><td style="text-align:right;padding:3px 6px;color:#059669">'+_fU(m.target_usd)+'</td><td style="text-align:right;padding:3px 6px">'+_fQ(m.target_qty)+'</td></tr>';});h+='</tbody></table></div>';}});});});return h;}

function _sbox(l,v){return '<div style="background:#F1F3F9;border-radius:8px;padding:12px 16px;text-align:center;flex:1;min-width:76px"><div style="font-size:20px;font-weight:700;color:#0F1117">'+(typeof v==='number'?v.toLocaleString('tr-TR'):v)+'</div><div style="font-size:10px;color:#4A5068;margin-top:2px;text-transform:uppercase;letter-spacing:.3px">'+l+'</div></div>';}

function _showImportModal(activeTab){
  var bd=document.getElementById('tgt-modal-backdrop'),body=document.getElementById('tgt-modal-body');
  if(!bd||!body)return;
  var p=_state.importPreview;if(!p)return;
  if(!activeTab)activeTab='ozet';
  var tree=_buildPreviewTree(p.rawCombos);
  var wh=(p.warnings||[]).map(function(w){var c=w.type==='ok'?'#D1FAE5':w.type==='info'?'#DBEAFE':w.type==='duplicate'?'#FEF3C7':'#FEE2E2';var tc=w.type==='ok'?'#065F46':w.type==='info'?'#1E40AF':w.type==='duplicate'?'#92400E':'#991B1B';return '<div style="padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:6px;background:'+c+';color:'+tc+'">'+_esc(w.msg)+'</div>';}).join('');
  var tabs=[['ozet','Özet'],['incele','İncele ('+p.stats.combos+')'],['uyarilar','Uyarılar ('+((p.warnings||[]).length)+')']];
  body.innerHTML='<div style="font-size:16px;font-weight:700;color:#0F1117;margin-bottom:14px">Excel Import Önizleme</div>'+
    '<div style="display:flex;gap:2px;border-bottom:1.5px solid #E2E5EF;margin-bottom:14px">'+
    tabs.map(function(t){var a=t[0]===activeTab;return '<button data-pvtab="'+t[0]+'" style="border:none;background:none;cursor:pointer;padding:7px 14px;font-size:12px;font-weight:'+(a?'600':'400')+';color:'+(a?'#0F1117':'#4A5068')+';border-bottom:2px solid '+(a?'#4F46E5':'transparent')+';margin-bottom:-1.5px;font-family:inherit">'+t[1]+'</button>';}).join('')+'</div>'+
    '<div id="pv-ozet"'+(activeTab!=='ozet'?' style="display:none"':'')+'>'+
      '<div style="background:#FEF3C7;color:#92400E;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:14px">⚠ Bu işlem <strong>TÜM mevcut datayı siler</strong> ve Excel\'den yeniden oluşturur.</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+_sbox('Müşteri',p.stats.customers)+_sbox('Ürün',p.stats.products)+_sbox('Ülke',p.stats.countries)+_sbox('Combo',p.stats.combos)+_sbox('Target',p.stats.targetRows)+'</div>'+
      (wh?'<div style="margin-bottom:14px">'+wh+'</div>':'<div style="padding:8px 12px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:12px;margin-bottom:14px">✓ Kritik uyarı yok</div>')+
    '</div>'+
    '<div id="pv-incele"'+(activeTab!=='incele'?' style="display:none"':'')+' style="max-height:360px;overflow-y:auto">'+_renderPreviewExplorer(tree)+'</div>'+
    '<div id="pv-uyarilar"'+(activeTab!=='uyarilar'?' style="display:none"':'')+'>'+( wh||'<div style="padding:8px 12px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:12px">✓ Uyarı yok</div>')+'</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'+
      '<button id="tgt-mc" style="background:none;border:1.5px solid #E2E5EF;border-radius:8px;padding:0 18px;height:38px;font-size:13px;cursor:pointer;font-family:inherit;color:#0F1117;min-height:unset!important;width:auto!important">İptal</button>'+
      '<button id="tgt-mf" style="background:#DC2626;color:#fff;border:none;border-radius:8px;padding:0 18px;height:38px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;min-height:unset!important;width:auto!important">Sil ve Import Et</button>'+
    '</div>'+
    '<div id="tgt-pw" style="display:none;margin-top:12px;padding:12px 14px;background:#F1F3F9;border-radius:8px">'+
      '<div id="tgt-pm" style="font-size:12px;color:#0F1117;margin-bottom:8px"></div>'+
      '<div style="height:8px;background:#E2E5EF;border-radius:99px;overflow:hidden"><div id="tgt-pb" style="height:100%;background:#4F46E5;border-radius:99px;transition:width .3s;width:0%"></div></div>'+
      '<div id="tgt-pc" style="font-size:11px;color:#4A5068;text-align:right;margin-top:4px"></div>'+
    '</div>';
  bd.style.display='flex';
  _bindImportModal(tree,activeTab);
}

function _bindImportModal(tree,activeTab){
  document.querySelectorAll('[data-pvtab]').forEach(function(b){b.addEventListener('click',function(){_showImportModal(this.dataset.pvtab);});});
  document.querySelectorAll('[data-pvc]').forEach(function(r){r.addEventListener('click',function(){_pvOpen.c[this.dataset.pvc]=!_pvOpen.c[this.dataset.pvc];_showImportModal('incele');});});
  document.querySelectorAll('[data-pvcu]').forEach(function(r){r.addEventListener('click',function(){_pvOpen.cu[this.dataset.pvcu]=!_pvOpen.cu[this.dataset.pvcu];_showImportModal('incele');});});
  document.querySelectorAll('[data-pvpr]').forEach(function(r){r.addEventListener('click',function(){_pvOpen.cu[this.dataset.pvpr]=!_pvOpen.cu[this.dataset.pvpr];_showImportModal('incele');});});
  var mc=document.getElementById('tgt-mc');
  if(mc)mc.addEventListener('click',function(){_pvOpen={c:{},cu:{}};document.getElementById('tgt-modal-backdrop').style.display='none';_state.importStep='idle';_state.importPreview=null;});
  var mf=document.getElementById('tgt-mf');if(!mf)return;
  mf.addEventListener('click',async function(){
    var mc2=document.getElementById('tgt-mc');
    mf.disabled=true;if(mc2)mc2.disabled=true;
    var pw=document.getElementById('tgt-pw');if(pw)pw.style.display='block';
    _state.importStep='importing';
    var result=await confirmBudgetImport(_state.importPreview,function(msg,cur,tot){
      var pm=document.getElementById('tgt-pm');if(pm)pm.textContent=msg;
      if(cur!==undefined&&tot&&tot>0){var pb=document.getElementById('tgt-pb');if(pb)pb.style.width=Math.round(cur/tot*100)+'%';var pc=document.getElementById('tgt-pc');if(pc)pc.textContent=cur.toLocaleString('tr-TR')+' / '+tot.toLocaleString('tr-TR')+' kayıt';}
    });
    if(result.ok){
      var pm2=document.getElementById('tgt-pm');if(pm2)pm2.textContent='✓ Tamamlandı — '+result.inserted.toLocaleString('tr-TR')+' hedef kaydı.';
      var pb2=document.getElementById('tgt-pb');if(pb2)pb2.style.width='100%';
      setTimeout(function(){_pvOpen={c:{},cu:{}};var bd=document.getElementById('tgt-modal-backdrop');if(bd)bd.style.display='none';_state.importStep='idle';_state.importPreview=null;_loadData().then(function(){_updateAll();});},1800);
    } else {
      var pm3=document.getElementById('tgt-pm');if(pm3)pm3.textContent='✗ Hata: '+result.error;
      mf.disabled=false;if(mc2)mc2.disabled=false;
    }
  });
}

})();
