/* NSDATA - screen-targets.js */
/* Hedefler pivot ekrani — v3.0.0 */

(function () {
'use strict';

/* ============================================================ DATA STATE */
var _state = {
  targets: [], customers: [], products: [], customerCountries: [],
  customerMap: {}, productMap: {},
  importPreview: null, importStep: 'idle'
};

/* ============================================================ PIVOT STATE */
var _S = {
  rows:      ['ulke', 'musteri', 'urun'],
  cols:      ['ay'],
  vals:      { eur: true, usd: false, qty: false },
  form:      'tabular',
  editMode:  false,
  stShow:    false,
  gtShow:    true,
  showEmpty: false,
  repeat:    false,
  filters:   { ulke: [], musteri: [], urun: [], bolge: [] },
  collapsed: {},
  sort:      { key: null, dir: 'none' },
  year:      new Date().getFullYear(),
  search:    ''
};

/* ============================================================ CONSTANTS */
var ROW_DIMS  = ['ulke', 'musteri', 'urun', 'bolge'];
var DIM_LABEL = { ulke: 'Ulke', musteri: 'Musteri', urun: 'Urun', bolge: 'Bolge', ay: 'Aylar' };
var VAL_DEFS  = [{ k: 'eur', l: 'EUR' }, { k: 'usd', l: 'USD' }, { k: 'qty', l: 'Adet' }];
var MN_SHORT  = ['Oca','\u015eub','Mar','Nis','May','Haz','Tem','\u0130\u011eu','Eyl','Eki','Kas','Ara'];
var BAND_BG   = ['#FFFFFF','#F7F8FC','#FFFFFF','#F7F8FC'];

/* ============================================================ SESSION STATE */
var _PKEY = 'nsdata_tgt_pivot';
function _saveState() {
  try { sessionStorage.setItem(_PKEY, JSON.stringify({ rows:_S.rows, cols:_S.cols, vals:_S.vals, form:_S.form, stShow:_S.stShow, gtShow:_S.gtShow, showEmpty:_S.showEmpty, filters:_S.filters, year:_S.year })); } catch(e) {}
}
function _restoreState() {
  try {
    var s = JSON.parse(sessionStorage.getItem(_PKEY) || 'null'); if (!s) return;
    if (s.rows)  _S.rows  = s.rows;
    if (s.cols)  { _S.cols = s.cols; if (!_S.cols.includes('ay')) _S.cols.unshift('ay'); }
    if (s.vals)  _S.vals  = s.vals;
    if (s.form)  _S.form  = s.form;
    if (s.stShow    !== undefined) _S.stShow    = s.stShow;
    if (s.gtShow    !== undefined) _S.gtShow    = s.gtShow;
    if (s.showEmpty !== undefined) _S.showEmpty = s.showEmpty;
    if (s.year) _S.year = s.year;
    if (s.filters) {
      if (s.filters.ulke)  _S.filters.ulke  = s.filters.ulke;
      if (s.filters.urun)  _S.filters.urun  = s.filters.urun;
      if (s.filters.bolge) _S.filters.bolge = s.filters.bolge;
      if (s.filters.musteri) {
        var ids = _state.customers.map(function(c){ return c.id; });
        _S.filters.musteri = s.filters.musteri.filter(function(id){ return ids.includes(id); });
      }
    }
  } catch(e) {}
}

/* ============================================================ ACTIVATION */
document.addEventListener('nsdata:appReady', function() {
  _loadData().then(function() {
    _restoreState();
    var p = new URLSearchParams(window.location.search);
    if (p.get('screen') === 'targets') render();
  });
});

document.addEventListener('nsdata:screenActivated', function(e) {
  if (e.detail.screen !== 'targets') return;
  _showLoading();
  _loadData().then(function() { _restoreState(); render(); }).catch(function(err) { _showError(err); });
});

document.addEventListener('nsdata:dataChanged', function() {
  var el = document.getElementById('screen-targets');
  if (!el || !el.classList.contains('active')) return;
  _loadData().then(function(){ render(); });
});

function _showLoading() {
  var el = document.getElementById('screen-targets'); if (!el) return;
  el.innerHTML = '<div style="padding:3rem;text-align:center;color:#4A5068;font-size:14px">Yukleniyor...</div>';
}

function _showError(err) {
  var el = document.getElementById('screen-targets'); if (!el) return;
  el.innerHTML = '<div style="padding:2rem;color:#DC2626;font-size:13px;font-family:monospace">Hata: '+(err&&err.message?err.message:String(err))+'</div>';
  console.error('Hedefler render error:', err);
}

function _safeRender() {
  try { render(); } catch(err) { _showError(err); }
}

async function _init() {
  _showLoading();
  await _loadData();
  _restoreState();
  _safeRender();
}

async function _loadData() {
  var res = await Promise.all([dbGetTargets(), dbGetCustomers(), dbGetProducts(), dbGetCustomerCountries()]);
  _state.targets           = _adapt(res[0] || []);
  _state.customers         = res[1] || [];
  _state.products          = res[2] || [];
  _state.customerCountries = res[3] || [];
  _state.customerMap = {}; _state.productMap = {};
  _state.customers.forEach(function(c){ _state.customerMap[c.id] = c; });
  _state.products.forEach(function(p){  _state.productMap[p.id]  = p; });
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
  if (!val && val !== 0) return '';
  if (dim === 'ay')      return MN_SHORT[parseInt(val) - 1] || String(val);
  if (dim === 'musteri') { var c = _state.customerMap[val]; return c ? c.name  : val; }
  if (dim === 'urun')    { var p = _state.productMap[val];  return p ? p.name  : val; }
  if (dim === 'bolge')   return 'Bolge ' + val;
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

function dimVals(dim, targets) {
  if (dim === 'ay') return ['1','2','3','4','5','6','7','8','9','10','11','12'];
  if (dim === 'urun') return _state.products.filter(function(p){ return p.active !== false; }).map(function(p){ return p.id; });
  var seen = {}, vals = [];
  (targets || []).forEach(function(t){ var v = dv(t,dim); if (v && !seen[v]){ seen[v]=1; vals.push(v); } });
  return vals;
}

function activeVals() { return VAL_DEFS.filter(function(v){ return _S.vals[v.k]; }); }

function poolDims() {
  return ['ulke','musteri','urun','bolge','ay'].filter(function(d){ return !_S.rows.includes(d) && !_S.cols.includes(d); });
}

function fmtN(v) { if (!v || v===0) return '\u2014'; return Number(v).toLocaleString('de-DE',{maximumFractionDigits:1}); }
function fmtE(v) { if (!v || v===0) return '\u2014'; return Math.round(v).toLocaleString('de-DE') + ' \u20ac'; }
function fmtU(v) { if (!v || v===0) return '\u2014'; return '$ ' + Math.round(v).toLocaleString('de-DE'); }
function fmtVal(v, k) { return k==='eur' ? fmtE(v) : k==='usd' ? fmtU(v) : fmtN(v); }
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
    if (_S.search) {
      var q = _S.search.toLowerCase();
      if (!t.ulke.toLowerCase().includes(q) && !dvLabel('musteri',t.musteri).toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/* ============================================================ COMPUTE */
function compute(targets) {
  var e=0, u=0, q=0;
  (targets||[]).forEach(function(t){ e+=t.eur; u+=t.usd; q+=t.qty; });
  return { eur: Math.round(e), usd: Math.round(u), qty: Math.round(q*10)/10 };
}
function computeVal(m, k) { return k==='eur' ? m.eur : k==='usd' ? m.usd : m.qty; }

/* ============================================================ SORT */
function sortVals(dim, vals, targets) {
  if (!_S.sort.key || _S.sort.dir === 'none') {
    if (dim === 'ay') return vals.slice().sort(function(a,b){ return parseInt(a)-parseInt(b); });
    return vals.slice().sort(function(a,b){ return dvLabel(dim,a).localeCompare(dvLabel(dim,b),'tr'); });
  }
  var sorted = vals.slice().sort(function(a,b) {
    var tA = (targets||[]).filter(function(t){ return dv(t,dim)===a; });
    var tB = (targets||[]).filter(function(t){ return dv(t,dim)===b; });
    return computeVal(compute(tB),_S.sort.key) - computeVal(compute(tA),_S.sort.key);
  });
  return _S.sort.dir==='asc' ? sorted.reverse() : sorted;
}

/* ============================================================ COL LEAVES */
function buildColLeaves(targets) {
  var combos = [[]];
  _S.cols.forEach(function(dim) {
    var vals = sortVals(dim, dimVals(dim, targets), targets);
    var next = [];
    combos.forEach(function(c){ vals.forEach(function(v){ next.push(c.concat([{dim:dim,val:v}])); }); });
    combos = next;
  });
  return combos.map(function(c,i){ return { keys:c, label:c.map(function(k){ return dvLabel(k.dim,k.val); }).join(' / '), bi:i%4 }; });
}

/* ============================================================ SCHEMA */
function buildSchema(leaves) {
  var vl = activeVals(); if (!vl.length) return null;
  var schema = [];
  _S.rows.forEach(function(dim,i){ schema.push({ type:'name', dim:dim, label:DIM_LABEL[dim], w:i===0?180:140 }); });
  if (!_S.rows.length) schema.push({ type:'name', dim:'_all', label:'\u2014', w:180 });
  leaves.forEach(function(leaf,li){
    vl.forEach(function(v,vi){
      schema.push({ type:'val', li:li, leaf:leaf, valK:v.k, valL:v.l, isFirst:vi===0, bi:leaf.bi, w:v.k==='eur'?90:68 });
    });
  });
  vl.forEach(function(v){ schema.push({ type:'total', valK:v.k, valL:v.l, w:v.k==='eur'?100:76 }); });
  return schema;
}

/* ============================================================ ROW BUILDER */
function buildRowsRecursive(targets, schema, ctx, level) {
  if (level >= _S.rows.length) return buildDataRow(targets, schema, ctx);
  var dim = _S.rows[level];
  var base;
  if (dim === 'urun') {
    base = _state.products.filter(function(p){ return p.active!==false; }).map(function(p){ return p.id; });
  } else if (dim === 'musteri' && _S.showEmpty && _S.filters.musteri.length) {
    var ulkeCtx = ctx.find(function(r){ return r.dim==='ulke'; });
    if (ulkeCtx) {
      var inU = (_state.customerCountries||[]).filter(function(cc){ return cc.country===ulkeCtx.val; }).map(function(cc){ return cc.customer_id; });
      base = _S.filters.musteri.filter(function(id){ return inU.includes(id); });
      if (!base.length) base = _S.filters.musteri.slice();
    } else { base = _S.filters.musteri.slice(); }
  } else if (_S.showEmpty) {
    base = dimVals(dim, _state.targets.filter(function(t){ return t.year===_S.year; }));
  } else {
    base = dimVals(dim, targets);
  }
  var sorted = sortVals(dim, base, targets);
  var html = '';
  sorted.forEach(function(val) {
    var grp = (targets||[]).filter(function(t){ return dv(t,dim)===val; });
    if (!_S.showEmpty && dim!=='urun' && !grp.length) return;
    var gk  = ctx.map(function(r){ return r.val; }).join('|')+'|'+val;
    var lbl = dvLabel(dim, val);
    var nc  = ctx.concat([{ dim:dim, val:val }]);
    if (_S.form==='outline') html += buildOutline(grp, schema, nc, level, val, lbl, gk);
    else if (_S.form==='compact') html += buildCompact(grp, schema, nc, level, val, lbl, gk);
    else html += buildTabular(grp, schema, nc, level, val, lbl, gk, level+1);
  });
  return html;
}

function buildTabular(targets, schema, ctx, level, val, lbl, gk, next) {
  var isLeaf = next >= _S.rows.length;
  var html = isLeaf ? buildDataRow(targets,schema,ctx) : buildRowsRecursive(targets,schema,ctx,next);
  if (_S.stShow && !isLeaf) html += buildAggRow(targets,schema,lbl+' Top.',0,false);
  return html;
}

function buildOutline(targets, schema, ctx, level, val, lbl, gk) {
  var next = level+1, isLeaf = next >= _S.rows.length;
  var nc   = schema.filter(function(c){ return c.type==='name'; }).length;
  var pad  = level*14+6;
  var coll = !!_S.collapsed[gk];
  var meta = isLeaf ? '' : '';
  var html = '<tr class="tgt-gr"><td colspan="'+nc+'" style="padding-left:'+pad+'px;font-weight:600;background:#F1F3F9">'+
    '<div style="display:flex;align-items:center;gap:6px">'+
    '<button class="tgt-nc-tog" data-gk="'+_esc(gk)+'" style="background:none;border:none;cursor:pointer;font-size:11px;padding:0 4px;color:#4A5068">'+(coll?'&#9654;':'&#9660;')+'</button>'+
    '<span>'+_esc(lbl)+'</span></div></td>'+
    schema.filter(function(c){ return c.type!=='name'; }).map(function(){ return '<td style="background:#F1F3F9"></td>'; }).join('')+
    '</tr>';
  if (!coll) {
    html += isLeaf ? buildDataRow(targets,schema,ctx) : buildRowsRecursive(targets,schema,ctx,next);
    if (_S.stShow && !isLeaf) html += buildAggRow(targets,schema,lbl+' Top.',pad+14,false);
  }
  return html;
}

function buildCompact(targets, schema, ctx, level, val, lbl, gk) {
  var next = level+1, isLeaf = next >= _S.rows.length;
  var coll = !!_S.collapsed[gk];
  var html = '';
  if (level===0) html += '<tr class="tgt-gr"><td colspan="'+schema.length+'" style="font-weight:600;background:#F1F3F9;padding:6px 10px">'+
    '<button class="tgt-nc-tog" data-gk="'+_esc(gk)+'" style="background:none;border:none;cursor:pointer;font-size:11px;margin-right:6px;color:#4A5068">'+(coll?'&#9654;':'&#9660;')+'</button>'+_esc(lbl)+'</td></tr>';
  if (!coll) {
    html += isLeaf ? buildDataRow(targets,schema,ctx) : buildRowsRecursive(targets,schema,ctx,next);
    if (_S.stShow && !isLeaf) html += buildAggRow(targets,schema,lbl+' Top.',(level+1)*12,false);
  }
  return html;
}

/* ============================================================ DATA ROW */
function buildDataRow(targets, schema, ctx) {
  var nameCols = schema.filter(function(c){ return c.type==='name'; });
  var cells = '';
  nameCols.forEach(function(nc,i) {
    if (nc.dim==='_all') { cells += '<td style="padding:5px 8px">\u2014</td>'; return; }
    var c = ctx.find(function(r){ return r.dim===nc.dim; });
    if (!c) { cells += '<td></td>'; return; }
    cells += '<td style="padding:5px 8px 5px '+(i*12+8)+'px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px" title="'+_esc(dvLabel(nc.dim,c.val))+'">'+
      '<span style="font-weight:'+(i===nameCols.length-1?'500':'400')+'">'+_esc(dvLabel(nc.dim,c.val))+'</span></td>';
  });
  schema.forEach(function(c) {
    if (c.type==='name') return;
    var bl = c.isFirst ? 'border-left:1.5px solid #D1D5DB;' : '';
    if (c.type==='total') {
      var m = compute(targets);
      cells += '<td style="text-align:right;padding:5px 8px;background:#F1F3F9;border-left:2px solid #374151;font-weight:600;white-space:nowrap">'+fmtVal(computeVal(m,c.valK),c.valK)+'</td>';
      return;
    }
    var lt = (targets||[]).filter(function(t){ return c.leaf.keys.every(function(k){ return dv(t,k.dim)===k.val; }); });
    var m2 = compute(lt);
    var v  = computeVal(m2,c.valK);
    var bg = BAND_BG[c.bi||0];
    var single = lt.length===1 ? lt[0] : null;
    var canEdit = _S.editMode && single && single.id;
    if (canEdit) {
      var raw   = c.valK==='eur' ? single.eur : c.valK==='usd' ? single.usd : single.qty;
      var field = 'target_'+c.valK;
      cells += '<td class="tgt-ce" style="background:#EFF6FF;'+bl+'cursor:pointer;text-align:right;padding:5px 8px;white-space:nowrap" '+
        'data-tid="'+_esc(single.id)+'" data-field="'+field+'" data-val="'+(raw||'')+'">'+(raw?fmtVal(raw,c.valK):'-')+'</td>';
    } else {
      cells += '<td style="background:'+bg+';'+bl+'text-align:right;padding:5px 8px;color:#4A5068;white-space:nowrap">'+fmtVal(v,c.valK)+'</td>';
    }
  });
  return '<tr class="tgt-dr" style="border-bottom:0.5px solid #E2E5EF">'+cells+'</tr>';
}

/* ============================================================ AGG ROW */
function buildAggRow(targets, schema, label, pad, isGrand) {
  var nc = schema.filter(function(c){ return c.type==='name'; });
  var bg = isGrand ? 'background:#0F1117;color:#fff;' : 'background:#6B7280;color:#fff;';
  var cells = '';
  nc.forEach(function(c,i){
    if (i===0) cells += '<td style="'+bg+'padding:5px 8px 5px '+(pad||6)+'px;font-weight:700">'+_esc(label)+'</td>';
    else cells += '<td style="'+bg+'"></td>';
  });
  schema.forEach(function(c){
    if (c.type==='name') return;
    var bl = c.isFirst ? 'border-left:1.5px solid rgba(255,255,255,.3);' : '';
    if (c.type==='total') {
      var m = compute(targets);
      cells += '<td style="'+bg+'border-left:2px solid rgba(255,255,255,.5);text-align:right;padding:5px 8px;font-weight:700">'+fmtVal(computeVal(m,c.valK),c.valK)+'</td>';
      return;
    }
    var lt = (targets||[]).filter(function(t){ return c.leaf.keys.every(function(k){ return dv(t,k.dim)===k.val; }); });
    cells += '<td style="'+bg+bl+'text-align:right;padding:5px 8px;font-weight:700">'+fmtVal(computeVal(compute(lt),c.valK),c.valK)+'</td>';
  });
  return '<tr class="tgt-agg">'+cells+'</tr>';
}

/* ============================================================ HEADER */
function renderHeader(schema, leaves) {
  var vl = activeVals();
  var nc = schema.filter(function(c){ return c.type==='name'; }).length;
  var nColDims = _S.cols.length;
  var nHR = nColDims + 1;
  var rows = []; for (var i=0;i<nHR;i++) rows.push('');

  var cg = '<colgroup>'+schema.map(function(c){ return '<col style="width:'+c.w+'px;min-width:'+c.w+'px">'; }).join('')+'</colgroup>';

  // Name cols
  schema.filter(function(c){ return c.type==='name'; }).forEach(function(nc2){
    rows[0] += '<th rowspan="'+nHR+'" style="text-align:left;padding:6px 8px;background:#F1F3F9;border-bottom:1.5px solid #E2E5EF;font-size:11px;font-weight:600;color:#4A5068;vertical-align:bottom;white-space:nowrap">'+_esc(nc2.label)+'</th>';
  });

  // Group leaves per dim level
  for (var level=0; level<nColDims; level++) {
    var groups=[], prev=null, cnt=0, startLeaf=null;
    leaves.forEach(function(leaf,li){
      var k = leaf.keys[level]; var key = k ? k.dim+':'+k.val : '_';
      if (key!==prev) {
        if (cnt>0) groups.push({ lbl: prev, count:cnt, leaf:startLeaf, level:level });
        prev=key; cnt=1; startLeaf=leaf;
      } else cnt++;
    });
    if (cnt>0) groups.push({ lbl:prev, count:cnt, leaf:startLeaf, level:level });

    groups.forEach(function(g,gi){
      var k = g.leaf.keys[level]; var lbl = k ? dvLabel(k.dim,k.val) : '';
      var span = g.count * vl.length;
      var bl = gi>0 ? 'border-left:1.5px solid #D1D5DB;' : 'border-left:1.5px solid #E2E5EF;';
      rows[level] += '<th colspan="'+span+'" style="text-align:center;padding:5px 6px;background:#F8F9FC;border-bottom:1px solid #E2E5EF;font-size:11px;font-weight:600;color:#0F1117;'+bl+'">'+_esc(lbl)+'</th>';
    });
  }

  // Val label row
  leaves.forEach(function(leaf,li){
    vl.forEach(function(v,vi){
      var bl = vi===0 ? 'border-left:1.5px solid #D1D5DB;' : '';
      rows[nHR-1] += '<th style="text-align:right;padding:5px 8px;background:#F1F3F9;border-bottom:1.5px solid #E2E5EF;font-size:10px;font-weight:600;color:#6B7280;'+bl+'">'+v.l+'</th>';
    });
  });

  // Total header
  var hasTot = schema.some(function(c){ return c.type==='total'; });
  if (hasTot) {
    var rspan = nHR>1 ? nHR-1 : 1;
    rows[0] += '<th colspan="'+vl.length+'" rowspan="'+rspan+'" style="text-align:center;padding:5px 8px;background:#E5E7EB;border-left:2px solid #374151;border-bottom:1px solid #D1D5DB;font-size:11px;font-weight:700;color:#0F1117">Yillik</th>';
    vl.forEach(function(v){
      rows[nHR-1] += '<th style="text-align:right;padding:5px 8px;background:#E5E7EB;border-left:1.5px solid #374151;border-bottom:1.5px solid #E2E5EF;font-size:10px;font-weight:600;color:#374151">'+v.l+'</th>';
    });
  }

  return cg+'<thead>'+rows.map(function(r){ return '<tr>'+r+'</tr>'; }).join('')+'</thead>';
}

/* ============================================================ MAIN RENDER */
function render() {
  var el = document.getElementById('screen-targets'); if (!el) return;
  try {
  var targets = filtTargets();
  var leaves  = buildColLeaves(targets);
  var schema  = buildSchema(leaves);
  if (!schema) { el.innerHTML = '<div style="padding:2rem;text-align:center;color:#4A5068">Deger secin (EUR/USD/Adet).</div>'; return; }
  var body = buildRowsRecursive(targets, schema, [], 0);
  var gran = _S.gtShow ? buildAggRow(targets, schema, 'GENEL TOPLAM', 6, true) : '';
  el.innerHTML =
    _pivotBar() +
    _filterBar() +
    '<div id="tgt-table-wrap" style="overflow:auto;height:calc(100vh - 175px);position:relative">'+
      '<table style="border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;width:100%">'+
        renderHeader(schema, leaves)+
        '<tbody>'+body+gran+'</tbody>'+
      '</table>'+
    '</div>'+
    '<input id="tgt-editor" style="position:absolute;display:none;border:2px solid #4F46E5;border-radius:2px;padding:3px 8px;font-size:12px;text-align:right;background:#fff;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.15);font-family:inherit" type="number" step="any">'+
    '<input type="file" id="tgt-file-in" accept=".xlsx,.xls" style="display:none">'+
    _renderImportModal();
  _bind();
  if (_state.importPreview && _state.importStep==='preview') _showImportModal();
  _saveState();
  } catch(err) { _showError(err); }
}

/* ============================================================ PIVOT BAR */
function _pivotBar() {
  var pool = poolDims();
  var vl   = activeVals();
  var html = '<div id="tgt-pivot-bar" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 16px;background:#0F1117;color:#fff;font-size:11px;font-family:inherit">';

  if (pool.length) {
    html += '<div style="display:flex;align-items:center;gap:4px"><span style="color:#9CA3AF;font-weight:600;font-size:10px;margin-right:2px">HAVUZ</span>';
    pool.forEach(function(d) {
      html += '<span style="display:inline-flex;gap:2px;background:#374151;border-radius:4px;overflow:hidden">'+
        '<button class="tgt-pool-rows" data-dim="'+d+'" style="background:none;border:none;color:#D1D5DB;cursor:pointer;padding:3px 6px;font-size:10px;font-family:inherit" title="SATIRLARA ekle">'+DIM_LABEL[d]+' \u2193</button>'+
        (d!=='ay' ? '<button class="tgt-pool-cols" data-dim="'+d+'" style="background:none;border:none;color:#9CA3AF;cursor:pointer;padding:3px 6px;font-size:10px;font-family:inherit;border-left:1px solid #4B5563" title="SUTUNLARA ekle">\u2192</button>' : '')+
      '</span>';
    });
    html += '</div><div style="width:1px;height:20px;background:#374151;margin:0 2px"></div>';
  }

  html += '<div style="display:flex;align-items:center;gap:4px"><span style="color:#9CA3AF;font-weight:600;font-size:10px;margin-right:2px">SATIRLAR</span>';
  _S.rows.forEach(function(d,i) {
    html += '<span style="display:inline-flex;align-items:center;gap:2px;background:#4F46E5;border-radius:4px;padding:2px 4px">'+
      (i>0 ? '<button class="tgt-mv" data-dim="'+d+'" data-zone="rows" data-dir="-1" style="background:none;border:none;color:#C7D2FE;cursor:pointer;padding:0 2px;font-family:inherit">\u2039</button>' : '')+
      '<span style="color:#fff;font-size:10px;font-weight:600">'+DIM_LABEL[d]+'</span>'+
      (i<_S.rows.length-1 ? '<button class="tgt-mv" data-dim="'+d+'" data-zone="rows" data-dir="1" style="background:none;border:none;color:#C7D2FE;cursor:pointer;padding:0 2px;font-family:inherit">\u203a</button>' : '')+
      '<button class="tgt-rm" data-dim="'+d+'" data-zone="rows" style="background:none;border:none;color:#A5B4FC;cursor:pointer;padding:0 2px;font-family:inherit">\xd7</button>'+
    '</span>';
  });
  html += '</div>';

  html += '<div style="width:1px;height:20px;background:#374151;margin:0 2px"></div>';
  html += '<div style="display:flex;align-items:center;gap:4px"><span style="color:#9CA3AF;font-weight:600;font-size:10px;margin-right:2px">SUTUNLAR</span>';
  _S.cols.forEach(function(d,i) {
    var fixed = d==='ay';
    html += '<span style="display:inline-flex;align-items:center;gap:2px;background:'+(fixed?'#1F2937':'#065F46')+';border-radius:4px;padding:2px 6px">'+
      '<span style="color:#fff;font-size:10px;font-weight:600">'+DIM_LABEL[d]+'</span>'+
      (!fixed ? '<button class="tgt-rm" data-dim="'+d+'" data-zone="cols" style="background:none;border:none;color:#6EE7B7;cursor:pointer;padding:0 2px;font-family:inherit">\xd7</button>' : '')+
    '</span>';
  });
  html += '</div>';

  html += '<div style="width:1px;height:20px;background:#374151;margin:0 2px"></div>';
  html += '<div style="display:flex;align-items:center;gap:4px"><span style="color:#9CA3AF;font-weight:600;font-size:10px;margin-right:2px">DEGERLER</span>';
  VAL_DEFS.forEach(function(v){
    html += '<button class="tgt-val" data-val="'+v.k+'" style="background:'+(_S.vals[v.k]?'#15803D':'#374151')+';border:none;color:#fff;cursor:pointer;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:600;font-family:inherit">'+v.l+'</button>';
  });
  html += '</div>';

  html += '<div style="width:1px;height:20px;background:#374151;margin:0 2px"></div>';
  html += '<div style="display:flex;align-items:center;gap:3px"><span style="color:#9CA3AF;font-weight:600;font-size:10px;margin-right:2px">FORM</span>';
  [['tabular','Tabular'],['outline','Outline'],['compact','Compact']].forEach(function(f){
    html += '<button class="tgt-form" data-form="'+f[0]+'" style="background:'+(_S.form===f[0]?'#6B7280':'#374151')+';border:none;color:#fff;cursor:pointer;border-radius:4px;padding:3px 8px;font-size:10px;font-family:inherit">'+f[1]+'</button>';
  });
  html += '</div>';

  html += '<div style="margin-left:auto;display:flex;gap:6px">'+
    '<button id="tgt-edit-btn" style="background:'+(_S.editMode?'#B45309':'#374151')+';border:none;color:#fff;cursor:pointer;border-radius:4px;padding:4px 12px;font-size:11px;font-weight:600;font-family:inherit">'+(_S.editMode?'\u270F Duzenle Aktif':'\u270F Duzenle')+'</button>'+
    '<button id="tgt-import-btn" style="background:#4F46E5;border:none;color:#fff;cursor:pointer;border-radius:4px;padding:4px 12px;font-size:11px;font-weight:600;font-family:inherit">Excel\u2019den Yukle</button>'+
  '</div></div>';
  return html;
}

/* ============================================================ FILTER BAR */
var _openFilter = null;
function _filterBar() {
  var FDIMS = [
    { dim:'ulke',    lbl:'Ulke',    vals:_fVals('ulke')    },
    { dim:'musteri', lbl:'Musteri', vals:_fVals('musteri') },
    { dim:'urun',    lbl:'Urun',    vals:_fVals('urun')    },
    { dim:'bolge',   lbl:'Bolge',   vals:_fVals('bolge')   },
  ];
  var html = '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 16px;background:#fff;border-bottom:1.5px solid #E2E5EF;font-size:12px">';
  html += '<select id="tgt-yr" style="font-size:12px;border:1.5px solid #E2E5EF;border-radius:5px;padding:4px 8px;cursor:pointer;background:#fff;height:30px;min-height:unset!important;width:auto!important">'+
    [_S.year-1,_S.year,_S.year+1].map(function(y){ return '<option value="'+y+'"'+(y===_S.year?' selected':'')+'>'+y+'</option>'; }).join('')+
  '</select>';

  FDIMS.forEach(function(fd) {
    var act = _S.filters[fd.dim].length;
    var isO = _openFilter===fd.dim;
    html += '<div style="position:relative">'+
      '<button class="tgt-fbtn" data-fdim="'+fd.dim+'" style="background:#fff;border:1.5px solid '+(act?'#4F46E5':'#E2E5EF')+';border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer;color:'+(act?'#4F46E5':'#4A5068')+';font-family:inherit;min-height:unset!important;width:auto!important">'+
        fd.lbl+(act?' ('+act+')':'')+' \u25be'+
      '</button>'+
      (isO ? _fDrop(fd) : '')+
    '</div>';
  });

  html += '<div style="margin-left:auto;display:flex;gap:6px;align-items:center">'+
    '<input id="tgt-search" placeholder="Ara..." value="'+_esc(_S.search)+'" style="font-size:12px;border:1.5px solid #E2E5EF;border-radius:5px;padding:4px 10px;width:180px;min-height:unset!important">'+
    (_hasActiveFilters() ? '<button id="tgt-clr" style="background:none;border:1px solid #DC2626;color:#DC2626;border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;min-height:unset!important;width:auto!important">\xd7 Temizle</button>' : '')+
  '</div></div>';
  return html;
}

function _hasActiveFilters() {
  return _S.search || Object.values(_S.filters).some(function(f){ return f.length>0; });
}

function _fVals(dim) {
  if (dim==='musteri') return _state.customers.slice().sort(function(a,b){ return a.name.localeCompare(b.name,'tr'); });
  if (dim==='urun')    return _state.products.filter(function(p){ return p.active!==false; }).sort(function(a,b){ return a.name.localeCompare(b.name,'tr'); });
  var seen={}, vals=[];
  _state.targets.forEach(function(t){ var v=dv(t,dim); if(v&&!seen[v]){seen[v]=1;vals.push(v);} });
  if (dim==='bolge') return vals.map(Number).sort(function(a,b){return a-b;}).map(String);
  return vals.sort();
}

function _fDrop(fd) {
  var dim=fd.dim, vals=fd.vals, sel=_S.filters[dim], isId=(dim==='musteri'||dim==='urun');
  return '<div id="tgt-fdrop-'+dim+'" style="position:absolute;top:calc(100% + 4px);left:0;z-index:300;background:#fff;border:1.5px solid #E2E5EF;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);min-width:240px;max-width:320px">'+
    '<div style="padding:8px"><input class="tgt-fsrch" data-dim="'+dim+'" placeholder="Ara..." style="width:100%;font-size:12px;border:1.5px solid #E2E5EF;border-radius:5px;padding:5px 8px;min-height:unset!important;box-sizing:border-box"></div>'+
    '<div id="tgt-flist-'+dim+'" style="max-height:240px;overflow-y:auto;padding:0 4px">'+
      vals.map(function(v){
        var id=isId?v.id:v, lbl=isId?v.name:(dim==='bolge'?'Bolge '+v:v), chk=sel.includes(id);
        return '<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;border-radius:4px;font-size:12px" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'\'">'+
          '<input type="checkbox" class="tgt-fchk" data-dim="'+dim+'" value="'+_esc(String(id))+'"'+(chk?' checked':'')+' style="accent-color:#4F46E5;width:14px;height:14px;flex-shrink:0;min-height:unset!important">'+
          '<span>'+_esc(lbl)+'</span></label>';
      }).join('')+
    '</div>'+
    '<div style="display:flex;gap:6px;padding:8px;border-top:1px solid #E2E5EF">'+
      '<button class="tgt-fall" data-dim="'+dim+'" style="flex:1;background:#F3F4F6;border:none;border-radius:5px;padding:5px;font-size:11px;cursor:pointer;font-family:inherit;min-height:unset!important">Tümünü Sec</button>'+
      '<button class="tgt-fnone" data-dim="'+dim+'" style="flex:1;background:#F3F4F6;border:none;border-radius:5px;padding:5px;font-size:11px;cursor:pointer;font-family:inherit;min-height:unset!important">Sifirla</button>'+
    '</div></div>';
}

/* ============================================================ BIND */
function _bind() {
  // Pool → rows
  document.querySelectorAll('.tgt-pool-rows').forEach(function(b){
    b.addEventListener('click', function(){ _S.rows.push(this.dataset.dim); render(); });
  });
  // Pool → cols
  document.querySelectorAll('.tgt-pool-cols').forEach(function(b){
    b.addEventListener('click', function(){ _S.cols.push(this.dataset.dim); render(); });
  });
  // Remove from rows/cols
  document.querySelectorAll('.tgt-rm').forEach(function(b){
    b.addEventListener('click', function(){
      var d=this.dataset.dim, z=this.dataset.zone;
      if (z==='rows') _S.rows=_S.rows.filter(function(x){return x!==d;});
      else            _S.cols=_S.cols.filter(function(x){return x!==d;});
      render();
    });
  });
  // Reorder
  document.querySelectorAll('.tgt-mv').forEach(function(b){
    b.addEventListener('click', function(){
      var d=this.dataset.dim, z=this.dataset.zone, dir=parseInt(this.dataset.dir);
      var arr=z==='rows'?_S.rows:_S.cols, i=arr.indexOf(d);
      if (i+dir>=0 && i+dir<arr.length){ var tmp=arr[i+dir]; arr[i+dir]=arr[i]; arr[i]=tmp; }
      render();
    });
  });
  // Val toggle
  document.querySelectorAll('.tgt-val').forEach(function(b){
    b.addEventListener('click', function(){ _S.vals[this.dataset.val]=!_S.vals[this.dataset.val]; render(); });
  });
  // Form
  document.querySelectorAll('.tgt-form').forEach(function(b){
    b.addEventListener('click', function(){ _S.form=this.dataset.form; render(); });
  });
  // Edit mode
  var eb=document.getElementById('tgt-edit-btn');
  if (eb) eb.addEventListener('click', function(){ _S.editMode=!_S.editMode; render(); });
  // Year
  var yr=document.getElementById('tgt-yr');
  if (yr) yr.addEventListener('change', function(){ _S.year=parseInt(this.value); render(); });
  // Search
  var sr=document.getElementById('tgt-search');
  if (sr) sr.addEventListener('input', function(){ _S.search=this.value; render(); });
  // Clear
  var cl=document.getElementById('tgt-clr');
  if (cl) cl.addEventListener('click', function(){ _S.filters={ulke:[],musteri:[],urun:[],bolge:[]}; _S.search=''; render(); });
  // Outline collapse
  document.querySelectorAll('.tgt-nc-tog').forEach(function(b){
    b.addEventListener('click', function(e){ e.stopPropagation(); var gk=this.dataset.gk; _S.collapsed[gk]=!_S.collapsed[gk]; render(); });
  });
  // Filter buttons
  document.querySelectorAll('.tgt-fbtn').forEach(function(b){
    b.addEventListener('click', function(e){ e.stopPropagation(); var d=this.dataset.fdim; _openFilter=(_openFilter===d)?null:d; render(); });
  });
  document.querySelectorAll('.tgt-fchk').forEach(function(chk){
    chk.addEventListener('change', function(){
      var d=this.dataset.dim, v=this.value;
      if (this.checked) { if (!_S.filters[d].includes(v)) _S.filters[d].push(v); }
      else _S.filters[d]=_S.filters[d].filter(function(x){return x!==v;});
      render();
    });
  });
  document.querySelectorAll('.tgt-fsrch').forEach(function(inp){
    inp.addEventListener('input', function(){
      var q=this.value.toLowerCase(), list=document.getElementById('tgt-flist-'+this.dataset.dim);
      if (!list) return;
      list.querySelectorAll('label').forEach(function(l){ l.style.display=l.textContent.toLowerCase().includes(q)?'':'none'; });
    });
  });
  document.querySelectorAll('.tgt-fall').forEach(function(b){
    b.addEventListener('click', function(){
      var d=this.dataset.dim, vals=_fVals(d), isId=(d==='musteri'||d==='urun');
      _S.filters[d]=vals.map(function(v){ return String(isId?v.id:v); });
      render();
    });
  });
  document.querySelectorAll('.tgt-fnone').forEach(function(b){
    b.addEventListener('click', function(){ _S.filters[this.dataset.dim]=[]; render(); });
  });
  document.addEventListener('click', function(e){
    if (_openFilter && !e.target.closest('[data-fdim]') && !e.target.closest('[id^="tgt-fdrop"]')) {
      _openFilter=null; render();
    }
  }, { once: false });
  // Cell editor
  _bindCellEditor();
  // Import
  _bindImport();
  _bindImportModal();
}

/* ============================================================ CELL EDITOR */
var _aCell=null;
function _bindCellEditor() {
  var editor=document.getElementById('tgt-editor'); if (!editor) return;
  document.querySelectorAll('.tgt-ce').forEach(function(td){
    td.addEventListener('click', function(e){ e.stopPropagation(); _activateCell(td,editor); });
  });
  editor.addEventListener('blur', function(){ _commitEdit(editor); });
  editor.addEventListener('keydown', function(e){
    if (e.key==='Enter'){ e.preventDefault(); _commitEdit(editor); }
    if (e.key==='Escape') _cancelEdit(editor);
  });
}
function _activateCell(td, editor) {
  if (_aCell) _aCell.style.outline='';
  _aCell=td; td.style.outline='2px solid #4F46E5';
  var wrap=document.getElementById('tgt-table-wrap');
  var wr=wrap?wrap.getBoundingClientRect():{left:0,top:0};
  var tr=td.getBoundingClientRect();
  editor.style.left  =(tr.left-wr.left+(wrap?wrap.scrollLeft:0))+'px';
  editor.style.top   =(tr.top -wr.top +(wrap?wrap.scrollTop :0))+'px';
  editor.style.width =tr.width+'px'; editor.style.height=tr.height+'px';
  editor.style.display='block';
  editor.dataset.tid=td.dataset.tid; editor.dataset.field=td.dataset.field;
  editor.value=td.dataset.val||''; editor.focus(); editor.select();
}
async function _commitEdit(editor) {
  var tid=editor.dataset.tid, field=editor.dataset.field;
  var raw=editor.value.trim(), val=raw===''?null:parseFloat(raw.replace(',','.'));
  editor.style.display='none';
  if (_aCell){ _aCell.style.outline=''; _aCell=null; }
  if (!tid||!field) return; if (isNaN(val)) val=null;
  await dbUpdateTarget(tid,field,val);
  var t=_state.targets.find(function(x){ return x.id===tid; });
  if (t) { if (field==='target_eur') t.eur=val||0; else if (field==='target_usd') t.usd=val||0; else t.qty=val||0; }
  render();
}
function _cancelEdit(editor) {
  editor.style.display='none';
  if (_aCell){ _aCell.style.outline=''; _aCell=null; }
}

/* ============================================================ IMPORT MODAL HTML */
function _renderImportModal() {
  return '<div id="tgt-modal-backdrop" style="display:none;position:fixed;inset:0;background:rgba(15,17,23,.5);z-index:200;display:none;align-items:center;justify-content:center">'+
    '<div style="background:#fff;border-radius:12px;padding:24px;width:500px;max-width:95vw;max-height:88vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2)"><div id="tgt-modal-body"></div></div>'+
  '</div>';
}

/* ============================================================ IMPORT TRIGGER */
function _bindImport() {
  var btn=document.getElementById('tgt-import-btn'), fi=document.getElementById('tgt-file-in');
  if (!btn||!fi) return;
  btn.addEventListener('click', function(){ fi.click(); });
  fi.addEventListener('change', function(){
    var file=this.files[0]; if (!file) return; this.value='';
    showToast('Dosya okunuyor...');
    processBudgetImportFile(file, function(preview) {
      if (preview.error){ showToast('Hata: '+preview.error); return; }
      _state.importPreview=preview; _state.importStep='preview'; _showImportModal();
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
        var backdrop = document.getElementById('tgt-modal-backdrop')
        if (backdrop) backdrop.style.display = 'none';
        _pvOpen = { c:{}, cu:{} };
        _state.importStep    = 'idle';
        _state.importPreview = null;
        _loadData().then(function(){ render(); });
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
