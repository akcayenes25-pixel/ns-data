/* NSDATA - screen-targets.js v3.1.0 */
/* Hedefler pivot ekrani */

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
  colWidths:   {}
};

/* ============================================================ CONSTANTS */
var ALL_DIMS  = ['ulke', 'musteri', 'urun', 'bolge', 'ay'];
var DIM_LABEL = {
  ulke: '\u00dcl\u00fce',
  musteri: 'M\u00fc\u015fteri',
  urun: '\u00dcr\u00fcn',
  bolge: 'B\u00f6lge',
  ay: 'Aylar'
};
var VAL_DEFS = [
  { k: 'eur', l: 'EUR' },
  { k: 'usd', l: 'USD' },
  { k: 'qty', l: 'Adet' }
];
var MN  = ['Oca','\u015eub','Mar','Nis','May','Haz','Tem','A\u011fu','Eyl','Eki','Kas','Ara'];
var MNF = ['Ocak','\u015eubat','Mart','Nisan','May\u0131s','Haziran','Temmuz','A\u011fustos','Eyl\u00fcl','Ekim','Kas\u0131m','Aral\u0131k'];

/* ============================================================ SESSION STATE */
var _PK = 'nsdata_tgt_pv3';
function _saveState() {
  try {
    sessionStorage.setItem(_PK, JSON.stringify({
      rows: _S.rows, cols: _S.cols, vals: _S.vals,
      form: _S.form, stShow: _S.stShow, gtShow: _S.gtShow,
      showEmpty: _S.showEmpty, filters: _S.filters, year: _S.year
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
document.addEventListener('nsdata:appReady', function() {
  _loadData().then(function() {
    _restoreState();
    var p = new URLSearchParams(window.location.search);
    if (p.get('screen') === 'targets') _safeRender();
  });
});

document.addEventListener('nsdata:screenActivated', function(e) {
  if (e.detail.screen !== 'targets') return;
  _showLoading();
  _loadData().then(function() { _restoreState(); _safeRender(); }).catch(_showError);
});

document.addEventListener('nsdata:dataChanged', function() {
  var el = document.getElementById('screen-targets');
  if (!el || !el.classList.contains('active')) return;
  _loadData().then(function() { _safeRender(); });
});

function _showLoading() {
  var el = document.getElementById('screen-targets'); if (!el) return;
  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:#4A5068;font-size:15px;font-family:var(--font-family)">Y\u00fckleniyor...</div>';
}
function _showError(err) {
  var el = document.getElementById('screen-targets'); if (!el) return;
  el.innerHTML = '<div style="padding:24px;color:#DC2626;font-size:13px;font-family:monospace;background:#FEF2F2;border:1px solid #FCA5A5;margin:16px;border-radius:8px"><strong>Hata:</strong> ' + _esc(err && err.message ? err.message : String(err)) + '</div>';
  console.error('[Hedefler] render error:', err);
}
function _safeRender() { try { render(); } catch(err) { _showError(err); } }

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
}
function _adapt(raw) {
  return (raw || []).map(function(t) {
    return {
      id: t.id, musteri: t.customer_id, urun: t.product_id,
      ulke: t.country || '', bolge: t.bolge ? String(t.bolge) : null,
      month: t.month, year: t.year,
      eur: parseFloat(t.target_eur) || 0,
      usd: parseFloat(t.target_usd) || 0,
      qty: parseFloat(t.target_qty) || 0
    };
  });
}

/* ============================================================ HELPERS */
function dvLabel(dim, val) {
  if (val === null || val === undefined) return '';
  if (dim === 'ay')      return MN[parseInt(val) - 1] || String(val);
  if (dim === 'musteri') { var c = _state.customerMap[val]; return c ? c.name : val; }
  if (dim === 'urun')    { var p = _state.productMap[val];  return p ? p.name : val; }
  if (dim === 'bolge')   return 'B\u00f6lge ' + val;
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
  if (dim === 'ay') {
    var ms = {}, mv = [];
    (targets || []).forEach(function(t){ if (!ms[t.month]){ ms[t.month]=1; mv.push(String(t.month)); } });
    return mv.length ? mv : ['1','2','3','4','5','6','7','8','9','10','11','12'];
  }
  if (dim === 'urun') return _state.products.filter(function(p){ return p.active !== false; }).map(function(p){ return p.id; });
  var seen = {}, vals = [];
  (targets || []).forEach(function(t){ var v = dv(t, dim); if (v && !seen[v]){ seen[v]=1; vals.push(v); } });
  return vals;
}
function activeVals() { return VAL_DEFS.filter(function(v){ return _S.vals[v.k]; }); }
function poolDims()   { return ALL_DIMS.filter(function(d){ return !_S.rows.includes(d) && !_S.cols.includes(d); }); }
function fmtE(v)  { if (!v || v===0) return '\u2014'; return Math.round(v).toLocaleString('tr-TR') + '\u00a0\u20ac'; }
function fmtU(v)  { if (!v || v===0) return '\u2014'; return '$\u00a0' + Math.round(v).toLocaleString('tr-TR'); }
function fmtN(v)  { if (!v || v===0) return '\u2014'; return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 }); }
function fmtVal(v, k) { return k==='eur' ? fmtE(v) : k==='usd' ? fmtU(v) : fmtN(v); }
function _esc(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function cw(idx, def) { return _S.colWidths[idx] || def; }

/* ============================================================ FILTER */
function filtTargets() {
  return _state.targets.filter(function(t) {
    if (t.year !== _S.year) return false;
    var f = _S.filters;
    if (f.ulke.length    && !f.ulke.includes(t.ulke))         return false;
    if (f.musteri.length && !f.musteri.includes(t.musteri))   return false;
    if (f.urun.length    && !f.urun.includes(t.urun))         return false;
    if (f.bolge.length   && !f.bolge.includes(t.bolge))       return false;
    if (f.ay.length      && !f.ay.includes(String(t.month)))  return false;
    if (_S.search) {
      var q = _S.search.toLowerCase();
      var cn = dvLabel('musteri', t.musteri).toLowerCase();
      if (!t.ulke.toLowerCase().includes(q) && !cn.includes(q)) return false;
    }
    return true;
  });
}

/* ============================================================ COMPUTE */
function compute(targets) {
  var e=0,u=0,q=0;
  (targets||[]).forEach(function(t){ e+=t.eur; u+=t.usd; q+=t.qty; });
  return { eur: Math.round(e), usd: Math.round(u), qty: Math.round(q*10)/10 };
}
function cv(m, k) { return k==='eur' ? m.eur : k==='usd' ? m.usd : m.qty; }

/* ============================================================ SORT */
function sortVals(dim, vals, targets) {
  if (dim === 'ay') return vals.slice().sort(function(a,b){ return parseInt(a)-parseInt(b); });
  if (!_S.sort.key || _S.sort.dir === 'none')
    return vals.slice().sort(function(a,b){ return dvLabel(dim,a).localeCompare(dvLabel(dim,b),'tr'); });
  var sorted = vals.slice().sort(function(a,b){
    var mA = compute((targets||[]).filter(function(t){ return dv(t,dim)===a; }));
    var mB = compute((targets||[]).filter(function(t){ return dv(t,dim)===b; }));
    return cv(mB,_S.sort.key) - cv(mA,_S.sort.key);
  });
  return _S.sort.dir==='asc' ? sorted.reverse() : sorted;
}

/* ============================================================ COL LEAVES */
function buildColLeaves(targets) {
  if (!_S.cols.length) return [{ keys:[], label:'Y\u0131ll\u0131k', bi:0, isSingle:true }];
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
  var isSingle = leaves.length === 1 && leaves[0].isSingle;

  _S.rows.forEach(function(dim, i) {
    schema.push({ type:'name', dim:dim, label:DIM_LABEL[dim], w:cw('n'+i, i===0?200:150), ci:'n'+i });
  });
  if (!_S.rows.length) schema.push({ type:'name', dim:'_all', label:'\u2014', w:cw('n0',200), ci:'n0' });

  if (isSingle) {
    vl.forEach(function(v, vi) {
      schema.push({ type:'val', li:0, leaf:leaves[0], valK:v.k, valL:v.l, isFirst:vi===0, bi:0, w:cw('t'+vi, v.k==='eur'?120:90), ci:'t'+vi, isSingle:true });
    });
  } else {
    leaves.forEach(function(leaf, li) {
      vl.forEach(function(v, vi) {
        var ci = 'v'+li+'_'+vi;
        schema.push({ type:'val', li:li, leaf:leaf, valK:v.k, valL:v.l, isFirst:vi===0, bi:leaf.bi, w:cw(ci, v.k==='eur'?96:76), ci:ci });
      });
    });
    vl.forEach(function(v, vi) {
      var ci = 'T'+vi;
      schema.push({ type:'total', valK:v.k, valL:v.l, w:cw(ci, v.k==='eur'?110:88), ci:ci });
    });
  }
  return schema;
}

/* ============================================================ ROW BUILDER */
function buildRowsRecursive(targets, schema, ctx, level) {
  if (level >= _S.rows.length) return buildDataRow(targets, schema, ctx);
  var dim  = _S.rows[level];
  var base;
  if (dim==='urun') {
    base = _state.products.filter(function(p){ return p.active!==false; }).map(function(p){ return p.id; });
  } else if (dim==='musteri' && _S.showEmpty && _S.filters.musteri.length) {
    var uCtx = ctx.find(function(r){ return r.dim==='ulke'; });
    if (uCtx) {
      var inU = (_state.customerCountries||[]).filter(function(cc){ return cc.country===uCtx.val; }).map(function(cc){ return cc.customer_id; });
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
    var nc  = ctx.concat([{dim:dim,val:val}]);
    if (_S.form==='outline') html += _buildOutline(grp, schema, nc, level, val, lbl, gk);
    else if (_S.form==='compact') html += _buildCompact(grp, schema, nc, level, val, lbl, gk);
    else html += _buildTabular(grp, schema, nc, level, val, lbl, gk, level+1);
  });
  return html;
}

function _buildTabular(targets, schema, ctx, level, val, lbl, gk, next) {
  var isLeaf = next >= _S.rows.length;
  var html = isLeaf ? buildDataRow(targets,schema,ctx) : buildRowsRecursive(targets,schema,ctx,next);
  if (_S.stShow && !isLeaf) html += buildAggRow(targets, schema, lbl+' Top.', 0, false);
  return html;
}

function _buildOutline(targets, schema, ctx, level, val, lbl, gk) {
  var next = level+1, isLeaf = next >= _S.rows.length;
  var nc   = schema.filter(function(c){ return c.type==='name'; }).length;
  var coll = !!_S.collapsed[gk];
  var pad  = level * 16 + 8;
  var html = '<tr class="tgt-gr">' +
    '<td colspan="'+nc+'" style="padding:7px 12px 7px '+pad+'px;font-size:13px;font-weight:600;color:#0F1117;background:#F1F3F9;border-bottom:1px solid #E2E5EF">' +
    '<button class="tgt-tog" data-gk="'+_esc(gk)+'" style="background:none;border:none;cursor:pointer;font-size:12px;color:#4A5068;margin-right:6px;padding:0">'+
    (coll?'&#9654;':'&#9660;')+'</button>'+_esc(lbl)+'</td>'+
    schema.filter(function(c){ return c.type!=='name'; }).map(function(){ return '<td style="background:#F1F3F9;border-bottom:1px solid #E2E5EF"></td>'; }).join('')+'</tr>';
  if (!coll) {
    html += isLeaf ? buildDataRow(targets,schema,ctx) : buildRowsRecursive(targets,schema,ctx,next);
    if (_S.stShow && !isLeaf) html += buildAggRow(targets,schema,lbl+' Top.',pad+16,false);
  }
  return html;
}

function _buildCompact(targets, schema, ctx, level, val, lbl, gk) {
  var next = level+1, isLeaf = next >= _S.rows.length;
  var coll = !!_S.collapsed[gk];
  var html = '';
  if (level===0) {
    html += '<tr class="tgt-gr"><td colspan="'+schema.length+'" style="padding:7px 12px;font-size:13px;font-weight:700;color:#0F1117;background:#F1F3F9;border-bottom:1px solid #E2E5EF">'+
      '<button class="tgt-tog" data-gk="'+_esc(gk)+'" style="background:none;border:none;cursor:pointer;font-size:12px;color:#4A5068;margin-right:8px;padding:0">'+
      (coll?'&#9654;':'&#9660;')+'</button>'+_esc(lbl)+'</td></tr>';
  }
  if (!coll) {
    html += isLeaf ? buildDataRow(targets,schema,ctx) : buildRowsRecursive(targets,schema,ctx,next);
    if (_S.stShow && !isLeaf) html += buildAggRow(targets,schema,lbl+' Top.',(level+1)*16,false);
  }
  return html;
}

/* ============================================================ DATA ROW */
function buildDataRow(targets, schema, ctx) {
  var nameCols = schema.filter(function(c){ return c.type==='name'; });
  var cells = '';
  nameCols.forEach(function(nc, i) {
    if (nc.dim==='_all') { cells += '<td class="tgt-td tgt-td-name">\u2014</td>'; return; }
    var c2 = ctx.find(function(r){ return r.dim===nc.dim; });
    if (!c2) { cells += '<td class="tgt-td tgt-td-name"></td>'; return; }
    var isLast = i === nameCols.length - 1;
    cells += '<td class="tgt-td tgt-td-name" style="padding-left:'+(i*14+12)+'px;font-weight:'+(isLast?'500':'400')+';color:#0F1117" title="'+_esc(dvLabel(nc.dim,c2.val))+'">'+_esc(dvLabel(nc.dim,c2.val))+'</td>';
  });

  schema.forEach(function(c) {
    if (c.type==='name') return;
    var bl = c.isFirst ? 'border-left:2px solid #D1D5DB;' : '';

    if (c.type==='total') {
      var m = compute(targets);
      cells += '<td class="tgt-td tgt-td-total" style="border-left:2px solid #374151"><strong>'+fmtVal(cv(m,c.valK),c.valK)+'</strong></td>';
      return;
    }

    var lt = (targets||[]).filter(function(t){ return c.leaf.keys.every(function(k){ return dv(t,k.dim)===k.val; }); });
    var m2 = compute(lt);
    var v  = cv(m2, c.valK);
    var rowBg = c.bi%2===0 ? '#FFFFFF' : '#F8F9FC';
    var single = lt.length===1 ? lt[0] : null;
    var canEdit = _S.editMode && single && single.id;

    if (canEdit) {
      var raw   = c.valK==='eur' ? single.eur : c.valK==='usd' ? single.usd : single.qty;
      cells += '<td class="tgt-td tgt-ce" style="background:#EFF6FF;'+bl+'" data-tid="'+_esc(single.id)+'" data-field="target_'+c.valK+'" data-val="'+(raw||'')+'">'+
        (raw ? '<strong>'+fmtVal(raw,c.valK)+'</strong>' : '<span style="color:#9CA3AF">-</span>')+'</td>';
    } else {
      cells += '<td class="tgt-td" style="background:'+rowBg+';'+bl+';color:#0F1117">'+
        (v ? '<strong>'+fmtVal(v,c.valK)+'</strong>' : '<span style="color:#9CA3AF">\u2014</span>')+'</td>';
    }
  });

  return '<tr class="tgt-dr">'+cells+'</tr>';
}

/* ============================================================ AGG ROW */
function buildAggRow(targets, schema, label, pad, isGrand) {
  var nc = schema.filter(function(c){ return c.type==='name'; });
  var bg = isGrand ? 'background:#0F1117;color:#FFFFFF;' : 'background:#374151;color:#FFFFFF;';
  var cells = '';
  nc.forEach(function(c, i) {
    if (i===0) cells += '<td class="tgt-td" style="'+bg+'padding-left:'+(pad||12)+'px;font-size:13px;font-weight:700">'+_esc(label)+'</td>';
    else cells += '<td class="tgt-td" style="'+bg+'"></td>';
  });
  schema.forEach(function(c) {
    if (c.type==='name') return;
    var bl = c.isFirst ? 'border-left:2px solid rgba(255,255,255,0.3);' : '';
    if (c.type==='total') {
      var m = compute(targets);
      cells += '<td class="tgt-td" style="'+bg+'border-left:2px solid rgba(255,255,255,0.5);text-align:right;font-size:13px;font-weight:700;padding:7px 10px">'+fmtVal(cv(m,c.valK),c.valK)+'</td>';
      return;
    }
    var lt = (targets||[]).filter(function(t){ return c.leaf.keys.every(function(k){ return dv(t,k.dim)===k.val; }); });
    var v  = cv(compute(lt), c.valK);
    cells += '<td class="tgt-td" style="'+bg+bl+'text-align:right;font-size:13px;font-weight:700;padding:7px 10px">'+fmtVal(v,c.valK)+'</td>';
  });
  return '<tr class="tgt-agg">'+cells+'</tr>';
}

/* ============================================================ HEADER */
function renderHeader(schema, leaves) {
  var vl = activeVals();
  var isSingle = leaves.length===1 && leaves[0].isSingle;
  var nColDims = isSingle ? 0 : _S.cols.length;
  var nHR = nColDims + 1;

  var cg = '<colgroup>' + schema.map(function(c, ci) {
    return '<col data-ci="'+c.ci+'" style="width:'+c.w+'px;min-width:'+c.w+'px">';
  }).join('') + '</colgroup>';

  var rows = []; for (var i=0; i<nHR; i++) rows.push('');

  // Name cols — rowspan = nHR
  schema.filter(function(c){ return c.type==='name'; }).forEach(function(nc) {
    rows[0] += '<th class="tgt-th tgt-th-name" rowspan="'+nHR+'" data-ci="'+nc.ci+'" oncontextmenu="return _onThRClick(event,\''+ nc.ci +'\','+nc.w+')">'+_esc(nc.label)+'</th>';
  });

  if (isSingle) {
    // Single leaf — just val headers
    vl.forEach(function(v, vi) {
      var c = schema[schema.findIndex(function(s){ return s.type==='val'&&s.valK===v.k; })];
      var bl = vi===0 ? 'border-left:2px solid #D1D5DB;' : '';
      rows[0] += '<th class="tgt-th" style="'+bl+'" data-ci="'+(c?c.ci:'')+'">Y\u0131ll\u0131k '+v.l+'</th>';
    });
  } else {
    // Level headers
    for (var level=0; level<nColDims; level++) {
      var groups=[], prev=null, cnt=0, sLeaf=null;
      leaves.forEach(function(leaf, li) {
        var k = leaf.keys[level]; var key = k ? k.dim+':'+k.val : '_';
        if (key!==prev){ if (cnt>0) groups.push({count:cnt,leaf:sLeaf,level:level}); prev=key; cnt=1; sLeaf=leaf; }
        else cnt++;
      });
      if (cnt>0) groups.push({count:cnt,leaf:sLeaf,level:level});

      groups.forEach(function(g, gi) {
        var k = g.leaf.keys[level]; var lbl = k ? dvLabel(k.dim,k.val) : '';
        var span = g.count * vl.length;
        var bl = gi===0 ? '' : 'border-left:2px solid #D1D5DB;';
        rows[level] += '<th class="tgt-th" colspan="'+span+'" style="text-align:center;'+bl+'">'+_esc(lbl)+'</th>';
      });
    }

    // Val label row
    leaves.forEach(function(leaf, li) {
      vl.forEach(function(v, vi) {
        var c = schema.find(function(s){ return s.type==='val'&&s.li===li&&s.valK===v.k; });
        var bl = vi===0 ? 'border-left:1.5px solid #D1D5DB;' : '';
        rows[nHR-1] += '<th class="tgt-th tgt-th-val" style="'+bl+'" data-ci="'+(c?c.ci:'')+'" oncontextmenu="return _onThRClick(event,\''+(c?c.ci:'')+'\','+(c?c.w:90)+')">'+v.l+'</th>';
      });
    });

    // Total header
    rows[0] += '<th class="tgt-th tgt-th-total" colspan="'+vl.length+'" rowspan="'+(nHR>1?nHR-1:1)+'" style="border-left:2px solid #374151;text-align:center">Y\u0131ll\u0131k</th>';
    vl.forEach(function(v, vi) {
      var c = schema.find(function(s){ return s.type==='total'&&s.valK===v.k; });
      rows[nHR-1] += '<th class="tgt-th tgt-th-total" style="border-left:'+(vi===0?'2px solid #374151':'none')+'" data-ci="'+(c?c.ci:'')+'" oncontextmenu="return _onThRClick(event,\''+(c?c.ci:'')+'\','+(c?c.w:110)+')">'+v.l+'</th>';
    });
  }

  return cg + '<thead class="tgt-thead">' + rows.map(function(r){ return '<tr>'+r+'</tr>'; }).join('') + '</thead>';
}

/* ============================================================ RIGHT-CLICK RESIZE */
window._onThRClick = function(e, ci, currentW) {
  e.preventDefault(); e.stopPropagation();
  var old = document.getElementById('tgt-resize-popup');
  if (old) old.remove();
  var popup = document.createElement('div');
  popup.id = 'tgt-resize-popup';
  popup.style.cssText = 'position:fixed;top:'+(e.clientY-4)+'px;left:'+e.clientX+'px;z-index:999;background:#fff;border:1.5px solid #E2E5EF;border-radius:8px;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,.15);font-family:var(--font-family);font-size:13px;min-width:160px';
  popup.innerHTML = '<div style="font-weight:600;color:#0F1117;margin-bottom:8px">Sütun genişliği</div>'+
    '<input id="tgt-rw-inp" type="number" min="40" max="500" value="'+currentW+'" style="width:100%;border:1.5px solid #E2E5EF;border-radius:5px;padding:5px 8px;font-size:13px;box-sizing:border-box;min-height:unset!important">'+
    '<div style="display:flex;gap:6px;margin-top:8px">'+
    '<button id="tgt-rw-ok" style="flex:1;background:#4F46E5;color:#fff;border:none;border-radius:5px;padding:5px;font-size:12px;cursor:pointer;font-family:inherit;min-height:unset!important">Uygula</button>'+
    '<button id="tgt-rw-cl" style="flex:1;background:#F1F3F9;border:none;border-radius:5px;padding:5px;font-size:12px;cursor:pointer;font-family:inherit;min-height:unset!important">İptal</button>'+
    '</div>';
  document.body.appendChild(popup);
  document.getElementById('tgt-rw-ok').addEventListener('click', function() {
    var v = parseInt(document.getElementById('tgt-rw-inp').value);
    if (v > 30) { _S.colWidths[ci] = v; popup.remove(); _safeRender(); }
  });
  document.getElementById('tgt-rw-cl').addEventListener('click', function() { popup.remove(); });
  document.getElementById('tgt-rw-inp').focus();
  document.getElementById('tgt-rw-inp').select();
  setTimeout(function(){
    document.addEventListener('click', function h(){ popup.remove(); document.removeEventListener('click',h); }, { once:true });
  }, 100);
  return false;
};

/* ============================================================ RENDER */
function render() {
  var el = document.getElementById('screen-targets'); if (!el) return;

  // Validate: 'ay' can't be in both rows and cols
  if (_S.rows.includes('ay') && _S.cols.includes('ay')) {
    _S.cols = _S.cols.filter(function(d){ return d !== 'ay'; });
    showToast && showToast('Aylar hem sat\u0131r hem s\u00fctunda olamaz. S\u00fctunlardan kald\u0131r\u0131ld\u0131.');
  }

  var targets = filtTargets();
  var leaves  = buildColLeaves(targets);
  var schema  = buildSchema(leaves);
  if (!schema) {
    el.innerHTML = _pivotBar() + _filterBar() + '<div class="tgt-empty">De\u011fer se\u00e7in (EUR / USD / Adet).</div>' + _renderImportModal();
    _bind(); return;
  }

  var body = buildRowsRecursive(targets, schema, [], 0);
  var gran = _S.gtShow ? buildAggRow(targets, schema, 'GENEL TOPLAM', 12, true) : '';

  el.innerHTML =
    _pivotBar() +
    _filterBar() +
    '<div id="tgt-tw" class="tgt-tw">'+
      '<table class="tgt-table">'+
        renderHeader(schema, leaves)+
        '<tbody>'+body+gran+'</tbody>'+
      '</table>'+
    '</div>'+
    '<input id="tgt-editor" class="tgt-editor" type="number" step="any">'+
    '<input type="file" id="tgt-file-in" accept=".xlsx,.xls" style="display:none">'+
    _renderImportModal();

  _bind();
  if (_state.importPreview && _state.importStep==='preview') _showImportModal();
  _saveState();
}

/* ============================================================ PIVOT BAR */
function _pivotBar() {
  var pool = poolDims();
  var sel  = _S.selectedDim;
  var html = '<div class="tgt-bar">';

  // HAVUZ — always visible
  html += '<div class="tgt-zone" id="tgt-zone-pool"><span class="tgt-zone-lbl">HAVUZ</span>';
  if (pool.length) {
    pool.forEach(function(d) {
      var isSel = sel === d;
      html += '<button class="tgt-chip tgt-chip-pool'+(isSel?' tgt-chip-sel':'')+'" data-dim="'+d+'" data-action="pool-click" title="Se\u00e7mek i\u00e7in t\u0131klay\u0131n">'+DIM_LABEL[d]+'</button>';
    });
  } else {
    html += '<span class="tgt-pool-empty">\u2014 bo\u015f</span>';
  }
  html += '</div>';

  // SATIRLAR
  html += '<div class="tgt-zone'+(sel&&pool.includes(sel)?' tgt-zone-drop':'')+'" id="tgt-zone-rows">'+
    '<span class="tgt-zone-lbl" data-action="zone-click" data-zone="rows" title="Se\u00e7ili boyutu buraya ekle">SATIRLAR'+(sel&&pool.includes(sel)?'<span class="tgt-add-hint">+ ekle</span>':'')+'</span>';
  _S.rows.forEach(function(d, i) {
    html += '<span class="tgt-chip tgt-chip-active" data-dim="'+d+'" data-action="active-click">'+
      (i>0?'<button class="tgt-mv" data-dim="'+d+'" data-zone="rows" data-dir="-1">&#8249;</button>':'')+
      DIM_LABEL[d]+
      (i<_S.rows.length-1?'<button class="tgt-mv" data-dim="'+d+'" data-zone="rows" data-dir="1">&#8250;</button>':'')+
      '<button class="tgt-rm" data-dim="'+d+'" data-zone="rows">&#215;</button>'+
    '</span>';
  });
  html += '</div>';

  // SÜTUNLAR
  html += '<div class="tgt-zone'+(sel&&pool.includes(sel)?' tgt-zone-drop':'')+'" id="tgt-zone-cols">'+
    '<span class="tgt-zone-lbl" data-action="zone-click" data-zone="cols" title="Se\u00e7ili boyutu buraya ekle">S\u00dcTUNLAR'+(sel&&pool.includes(sel)?'<span class="tgt-add-hint">+ ekle</span>':'')+'</span>';
  _S.cols.forEach(function(d, i) {
    html += '<span class="tgt-chip tgt-chip-active tgt-chip-col" data-dim="'+d+'" data-action="active-click">'+
      DIM_LABEL[d]+
      '<button class="tgt-rm" data-dim="'+d+'" data-zone="cols">&#215;</button>'+
    '</span>';
  });
  html += '</div>';

  // DEĞERLER
  html += '<div class="tgt-zone"><span class="tgt-zone-lbl">DE\u011eERLER</span>';
  VAL_DEFS.forEach(function(v) {
    html += '<button class="tgt-val-btn'+(_S.vals[v.k]?' tgt-val-on':'')+'" data-val="'+v.k+'">'+v.l+'</button>';
  });
  html += '</div>';

  // FORM
  html += '<div class="tgt-zone"><span class="tgt-zone-lbl">FORM</span>';
  [['tabular','Tabular'],['outline','Outline'],['compact','Compact']].forEach(function(f) {
    html += '<button class="tgt-form-btn'+(_S.form===f[0]?' active':'')+'" data-form="'+f[0]+'">'+f[1]+'</button>';
  });
  html += '</div>';

  // Actions
  html += '<div class="tgt-bar-actions">'+
    '<button id="tgt-edit-btn" class="tgt-action-btn'+(_S.editMode?' tgt-edit-on':'')+'" title="H\u00fccre d\u00fczenleme '+ (_S.editMode?'a\u00e7\u0131k':'kapal\u0131') +'">'+
    (_S.editMode ? '&#9998; D\u00fczenleme A\u00e7\u0131k' : '&#9998; D\u00fczenle')+'</button>'+
    '<button id="tgt-import-btn" class="tgt-action-btn tgt-import-btn">Excel\u2019den Y\u00fckle</button>'+
  '</div></div>';
  return html;
}

/* ============================================================ FILTER BAR */
var _openFilter = null;
function _filterBar() {
  var FDIMS = [
    { dim:'ulke',    lbl:'\u00dclke',     vals: _fVals('ulke')    },
    { dim:'musteri', lbl:'M\u00fc\u015fteri', vals: _fVals('musteri') },
    { dim:'urun',    lbl:'\u00dcr\u00fcn',    vals: _fVals('urun')    },
    { dim:'bolge',   lbl:'B\u00f6lge',    vals: _fVals('bolge')   },
    { dim:'ay',      lbl:'Ay',             vals: MN.map(function(_,i){ return String(i+1); }) }
  ];
  var html = '<div class="tgt-fbar">';
  html += '<select id="tgt-yr" class="tgt-yr-sel">'+
    [_S.year-1,_S.year,_S.year+1].map(function(y){
      return '<option value="'+y+'"'+(y===_S.year?' selected':'')+'>'+y+'</option>';
    }).join('')+'</select>';

  FDIMS.forEach(function(fd) {
    var act = _S.filters[fd.dim].length;
    var isO = _openFilter === fd.dim;
    html += '<div class="tgt-fpill-wrap">'+
      '<button class="tgt-fpill'+(act?' tgt-fpill-act':'')+'" data-fdim="'+fd.dim+'">'+
        fd.lbl+(act?' ('+act+')':'')+' &#9662;'+
      '</button>'+
      (isO ? _fDrop(fd) : '')+
    '</div>';
  });

  html += '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">'+
    '<input id="tgt-search" class="tgt-search" placeholder="Ara..." value="'+_esc(_S.search)+'">'+
    (_hasAF() ? '<button id="tgt-clr" class="tgt-clr-btn">&#215; Temizle</button>' : '')+
  '</div></div>';
  return html;
}
function _hasAF() { return _S.search || Object.values(_S.filters).some(function(f){ return f.length>0; }); }
function _fVals(dim) {
  if (dim==='musteri') return _state.customers.slice().sort(function(a,b){ return a.name.localeCompare(b.name,'tr'); });
  if (dim==='urun')    return _state.products.filter(function(p){ return p.active!==false; }).sort(function(a,b){ return a.name.localeCompare(b.name,'tr'); });
  var seen={}, vals=[];
  _state.targets.forEach(function(t){ var v=dv(t,dim); if(v&&!seen[v]){ seen[v]=1; vals.push(v); } });
  if (dim==='bolge') return vals.map(Number).sort(function(a,b){return a-b;}).map(String);
  return vals.sort();
}
function _fDrop(fd) {
  var dim=fd.dim, vals=fd.vals, sel=_S.filters[dim];
  var isId = (dim==='musteri'||dim==='urun');
  var isAy = dim==='ay';
  var items = isAy
    ? MN.map(function(m,i){ return { id:String(i+1), lbl:m+' ('+MNF[i]+')' }; })
    : vals.map(function(v){ return { id:isId?v.id:v, lbl:isId?v.name:(dim==='bolge'?'B\u00f6lge '+v:v) }; });

  return '<div class="tgt-fdrop" id="tgt-fdrop-'+dim+'">'+
    '<input class="tgt-fsrch" data-dim="'+dim+'" placeholder="Ara...">'+
    '<div class="tgt-flist" id="tgt-flist-'+dim+'">'+
      items.map(function(it){
        var chk = sel.includes(String(it.id));
        return '<label class="tgt-fitem"><input type="checkbox" class="tgt-fchk" data-dim="'+dim+'" value="'+_esc(String(it.id))+'"'+(chk?' checked':'')+'><span>'+_esc(it.lbl)+'</span></label>';
      }).join('')+
    '</div>'+
    '<div class="tgt-ffoot">'+
      '<button class="tgt-fall" data-dim="'+dim+'">T\u00fcm\u00fcn\u00fc Se\u00e7</button>'+
      '<button class="tgt-fnone" data-dim="'+dim+'">S\u0131f\u0131rla</button>'+
    '</div></div>';
}

/* ============================================================ BIND */
function _bind() {
  // Pivot bar — pool chips
  document.querySelectorAll('[data-action="pool-click"]').forEach(function(b) {
    b.addEventListener('click', function() {
      var d = this.dataset.dim;
      _S.selectedDim = (_S.selectedDim === d) ? null : d;
      _safeRender();
    });
  });

  // Zone click — place selected dim
  document.querySelectorAll('[data-action="zone-click"]').forEach(function(el) {
    el.addEventListener('click', function() {
      if (!_S.selectedDim || !poolDims().includes(_S.selectedDim)) return;
      var zone = this.dataset.zone;
      if (zone === 'rows') _S.rows.push(_S.selectedDim);
      else _S.cols.push(_S.selectedDim);
      _S.selectedDim = null;
      _safeRender();
    });
  });

  // Active chip click — back to pool
  document.querySelectorAll('[data-action="active-click"]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      if (e.target.classList.contains('tgt-mv') || e.target.classList.contains('tgt-rm')) return;
      var d = this.dataset.dim;
      _S.rows = _S.rows.filter(function(x){ return x!==d; });
      _S.cols = _S.cols.filter(function(x){ return x!==d; });
      _S.selectedDim = null;
      _safeRender();
    });
  });

  // Remove
  document.querySelectorAll('.tgt-rm').forEach(function(b) {
    b.addEventListener('click', function(e) {
      e.stopPropagation();
      var d=this.dataset.dim, z=this.dataset.zone;
      if (z==='rows') _S.rows=_S.rows.filter(function(x){return x!==d;});
      else _S.cols=_S.cols.filter(function(x){return x!==d;});
      _S.selectedDim=null; _safeRender();
    });
  });

  // Reorder
  document.querySelectorAll('.tgt-mv').forEach(function(b) {
    b.addEventListener('click', function(e) {
      e.stopPropagation();
      var d=this.dataset.dim, z=this.dataset.zone, dir=parseInt(this.dataset.dir);
      var arr = z==='rows' ? _S.rows : _S.cols;
      var i=arr.indexOf(d);
      if (i+dir>=0 && i+dir<arr.length){ var tmp=arr[i+dir]; arr[i+dir]=arr[i]; arr[i]=tmp; }
      _safeRender();
    });
  });

  // Değerler
  document.querySelectorAll('.tgt-val-btn').forEach(function(b) {
    b.addEventListener('click', function(){ _S.vals[this.dataset.val]=!_S.vals[this.dataset.val]; _safeRender(); });
  });

  // Form
  document.querySelectorAll('.tgt-form-btn').forEach(function(b) {
    b.addEventListener('click', function(){ _S.form=this.dataset.form; _safeRender(); });
  });

  // Edit
  var eb = document.getElementById('tgt-edit-btn');
  if (eb) eb.addEventListener('click', function(){ _S.editMode=!_S.editMode; _safeRender(); });

  // Import
  var ib=document.getElementById('tgt-import-btn'), fi=document.getElementById('tgt-file-in');
  if (ib&&fi) {
    ib.addEventListener('click', function(){ fi.click(); });
    fi.addEventListener('change', function(){
      var file=this.files[0]; if (!file) return; this.value='';
      if (typeof showToast==='function') showToast('Dosya okunuyor...');
      processBudgetImportFile(file, function(preview){
        if (preview.error){ if(typeof showToast==='function')showToast('Hata: '+preview.error); return; }
        _state.importPreview=preview; _state.importStep='preview'; _showImportModal();
      });
    });
  }

  // Year
  var yr=document.getElementById('tgt-yr');
  if (yr) yr.addEventListener('change', function(){ _S.year=parseInt(this.value); _safeRender(); });

  // Search
  var sr=document.getElementById('tgt-search');
  if (sr) sr.addEventListener('input', function(){ _S.search=this.value; _safeRender(); });

  // Clear
  var cl=document.getElementById('tgt-clr');
  if (cl) cl.addEventListener('click', function(){
    _S.filters={ulke:[],musteri:[],urun:[],bolge:[],ay:[]};
    _S.search=''; _safeRender();
  });

  // Outline toggles
  document.querySelectorAll('.tgt-tog').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var gk=this.dataset.gk; _S.collapsed[gk]=!_S.collapsed[gk]; _safeRender();
    });
  });

  // Filter pills
  document.querySelectorAll('.tgt-fpill').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var d=this.dataset.fdim; _openFilter=(_openFilter===d)?null:d; _safeRender();
    });
  });
  document.querySelectorAll('.tgt-fchk').forEach(function(chk){
    chk.addEventListener('change', function(){
      var d=this.dataset.dim, v=this.value;
      if (this.checked){ if (!_S.filters[d].includes(v)) _S.filters[d].push(v); }
      else _S.filters[d]=_S.filters[d].filter(function(x){return x!==v;});
      _safeRender();
    });
  });
  document.querySelectorAll('.tgt-fsrch').forEach(function(inp){
    inp.addEventListener('input', function(){
      var q=this.value.toLowerCase();
      var list=document.getElementById('tgt-flist-'+this.dataset.dim);
      if (!list) return;
      list.querySelectorAll('.tgt-fitem').forEach(function(it){
        it.style.display=it.textContent.toLowerCase().includes(q)?'':'none';
      });
    });
  });
  document.querySelectorAll('.tgt-fall').forEach(function(b){
    b.addEventListener('click', function(){
      var d=this.dataset.dim;
      if (d==='ay') { _S.filters.ay=MN.map(function(_,i){return String(i+1);}); }
      else {
        var vals=_fVals(d), isId=(d==='musteri'||d==='urun');
        _S.filters[d]=vals.map(function(v){return String(isId?v.id:v);});
      }
      _safeRender();
    });
  });
  document.querySelectorAll('.tgt-fnone').forEach(function(b){
    b.addEventListener('click', function(){ _S.filters[this.dataset.dim]=[]; _safeRender(); });
  });

  // Close filter on outside click
  document.addEventListener('click', function handler(e){
    if (!_openFilter) return;
    if (!e.target.closest('.tgt-fpill-wrap')) {
      _openFilter=null; _safeRender();
    }
  });

  // Cell editor
  _bindCellEditor();
  // Import modal
  _bindImportModal();
}

/* ============================================================ CELL EDITOR */
var _aCell = null;
function _bindCellEditor() {
  var ed = document.getElementById('tgt-editor'); if (!ed) return;
  document.querySelectorAll('.tgt-ce').forEach(function(td){
    td.addEventListener('click', function(e){ e.stopPropagation(); _activateCell(td,ed); });
  });
  ed.addEventListener('blur', function(){ _commitEdit(ed); });
  ed.addEventListener('keydown', function(e){
    if (e.key==='Enter'){ e.preventDefault(); _commitEdit(ed); }
    if (e.key==='Escape') _cancelEdit(ed);
  });
}
function _activateCell(td, ed) {
  if (_aCell) _aCell.style.outline='';
  _aCell=td; td.style.outline='2px solid #4F46E5';
  var wrap=document.getElementById('tgt-tw');
  var wr=wrap?wrap.getBoundingClientRect():{left:0,top:0};
  var tr=td.getBoundingClientRect();
  ed.style.left  =(tr.left-wr.left+(wrap?wrap.scrollLeft:0))+'px';
  ed.style.top   =(tr.top -wr.top +(wrap?wrap.scrollTop :0))+'px';
  ed.style.width =tr.width+'px'; ed.style.height=tr.height+'px';
  ed.style.display='block';
  ed.dataset.tid=td.dataset.tid; ed.dataset.field=td.dataset.field;
  ed.value=td.dataset.val||''; ed.focus(); ed.select();
}
async function _commitEdit(ed) {
  var tid=ed.dataset.tid, field=ed.dataset.field;
  var raw=ed.value.trim(), val=raw===''?null:parseFloat(raw.replace(',','.'));
  ed.style.display='none';
  if (_aCell){ _aCell.style.outline=''; _aCell=null; }
  if (!tid||!field) return; if (isNaN(val)) val=null;
  await dbUpdateTarget(tid,field,val);
  var t=_state.targets.find(function(x){return x.id===tid;});
  if (t){ if(field==='target_eur')t.eur=val||0; else if(field==='target_usd')t.usd=val||0; else t.qty=val||0; }
  _safeRender();
}
function _cancelEdit(ed){ ed.style.display='none'; if(_aCell){_aCell.style.outline='';_aCell=null;} }

/* ============================================================ IMPORT MODAL HTML */
function _renderImportModal() {
  return '<div id="tgt-modal-backdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;align-items:center;justify-content:center">'+
    '<div style="background:#fff;border-radius:12px;padding:24px;width:680px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2)"><div id="tgt-modal-body"></div></div>'+
  '</div>';
}

/* ============================================================ IMPORT MODAL LOGIC */
var _pvOpen = { c: {}, cu: {} };

function _fE(v) { var n = parseFloat(v); return isNaN(n)||n===0 ? '—' : n.toLocaleString('tr-TR',{maximumFractionDigits:0}) + ' €'; }
function _fU(v) { var n = parseFloat(v); return isNaN(n)||n===0 ? '—' : '$ ' + n.toLocaleString('tr-TR',{maximumFractionDigits:0}); }
function _fQ(v) { var n = parseFloat(v); return isNaN(n)||n===0 ? '—' : n.toLocaleString('tr-TR',{maximumFractionDigits:0}); }
var _MN_FULL = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

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
      tree[ct].eur += (m.target_eur||0); tree[ct].usd += (m.target_usd||0); tree[ct].qty += (m.target_qty||0);
      tree[ct].customers[cu].eur += (m.target_eur||0); tree[ct].customers[cu].usd += (m.target_usd||0); tree[ct].customers[cu].qty += (m.target_qty||0);
      tree[ct].customers[cu].products[pr].eur += (m.target_eur||0); tree[ct].customers[cu].products[pr].usd += (m.target_usd||0); tree[ct].customers[cu].products[pr].qty += (m.target_qty||0);
    });
  });
  return tree;
}

function _renderPreviewExplorer(tree) {
  var countries = Object.keys(tree).sort();
  if (!countries.length) return '<div style="padding:16px;color:#4A5068">Veri bulunamadı.</div>';
  var h = '<div style="font-size:11px;display:flex;gap:12px;padding:6px 0 10px;color:#4A5068;font-weight:500"><span style="flex:1">Ülke / Müşteri / Ürün</span><span style="min-width:90px;text-align:right">EUR</span><span style="min-width:90px;text-align:right">USD</span><span style="min-width:70px;text-align:right">Adet</span></div>';
  countries.forEach(function(ct) {
    var node = tree[ct]; var isOpen = !!_pvOpen.c[ct]; var custKeys = Object.keys(node.customers).sort();
    h += '<div style="display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:6px;cursor:pointer;border-bottom:1px solid #E2E5EF;background:#F1F3F9;font-size:13px;font-weight:600" data-pvc="'+_esc(ct)+'">'+
      '<span style="font-size:10px;color:#4A5068;width:12px">'+(isOpen?'▾':'▸')+'</span>'+
      '<span style="flex:1">'+_esc(ct)+'</span>'+
      '<span style="min-width:90px;text-align:right;font-variant-numeric:tabular-nums">'+_fE(node.eur)+'</span>'+
      '<span style="min-width:90px;text-align:right;color:#059669">'+_fU(node.usd)+'</span>'+
      '<span style="min-width:70px;text-align:right;color:#4A5068">'+_fQ(node.qty)+'</span></div>';
    if (!isOpen) return;
    custKeys.forEach(function(cu) {
      var cuNode = node.customers[cu]; var cuKey = ct+'|'+cu; var isCuOpen = !!_pvOpen.cu[cuKey]; var prodKeys = Object.keys(cuNode.products).sort();
      h += '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px 6px 24px;cursor:pointer;border-bottom:1px solid #E2E5EF;font-size:12px" data-pvcu="'+_esc(cuKey)+'">'+
        '<span style="font-size:10px;color:#4A5068;width:12px">'+(isCuOpen?'▾':'▸')+'</span>'+
        '<span style="flex:1">'+_esc(cu)+'</span>'+
        '<span style="min-width:90px;text-align:right;font-variant-numeric:tabular-nums">'+_fE(cuNode.eur)+'</span>'+
        '<span style="min-width:90px;text-align:right;color:#059669">'+_fU(cuNode.usd)+'</span>'+
        '<span style="min-width:70px;text-align:right;color:#4A5068">'+_fQ(cuNode.qty)+'</span></div>';
      if (!isCuOpen) return;
      prodKeys.forEach(function(pr) {
        var prNode = cuNode.products[pr]; var prKey = cuKey+'|'+pr; var isPrOpen = !!_pvOpen.cu[prKey];
        h += '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px 5px 44px;cursor:pointer;border-bottom:1px solid #E2E5EF;font-size:11px;color:#4A5068" data-pvpr="'+_esc(prKey)+'">'+
          '<span style="font-size:10px;width:12px">'+(isPrOpen?'▾':'▸')+'</span>'+
          '<span style="flex:1">'+_esc(pr)+'</span>'+
          '<span style="min-width:90px;text-align:right;font-variant-numeric:tabular-nums">'+_fE(prNode.eur)+'</span>'+
          '<span style="min-width:90px;text-align:right;color:#059669">'+_fU(prNode.usd)+'</span>'+
          '<span style="min-width:70px;text-align:right">'+_fQ(prNode.qty)+'</span></div>';
        if (isPrOpen) {
          h += '<div style="padding:4px 8px 4px 56px;border-bottom:1px solid #E2E5EF"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="text-align:left;padding:3px 6px;color:#4A5068;font-weight:600">Ay</th><th style="text-align:right;padding:3px 6px;color:#4A5068">EUR</th><th style="text-align:right;padding:3px 6px;color:#059669">USD</th><th style="text-align:right;padding:3px 6px;color:#4A5068">Adet</th></tr></thead><tbody>';
          prNode.months.forEach(function(m, mi) {
            var hasVal = m.target_eur||m.target_usd||m.target_qty;
            h += '<tr style="'+(hasVal?'':'opacity:.4')+'"><td style="padding:3px 6px">'+_MN_FULL[mi]+'</td>'+
              '<td style="text-align:right;padding:3px 6px;font-variant-numeric:tabular-nums">'+_fE(m.target_eur)+'</td>'+
              '<td style="text-align:right;padding:3px 6px;color:#059669">'+_fU(m.target_usd)+'</td>'+
              '<td style="text-align:right;padding:3px 6px">'+_fQ(m.target_qty)+'</td></tr>';
          });
          h += '</tbody></table></div>';
        }
      });
    });
  });
  return h;
}

function _sbox(label, val) {
  return '<div style="background:#F1F3F9;border-radius:8px;padding:12px 16px;text-align:center;flex:1;min-width:80px">'+
    '<div style="font-size:20px;font-weight:700;color:#0F1117">'+(typeof val==='number'?val.toLocaleString('tr-TR'):val)+'</div>'+
    '<div style="font-size:10px;color:#4A5068;margin-top:2px;text-transform:uppercase;letter-spacing:.3px">'+label+'</div></div>';
}

function _showImportModal(activeTab) {
  var backdrop = document.getElementById('tgt-modal-backdrop');
  var body     = document.getElementById('tgt-modal-body');
  if (!backdrop || !body) return;
  var p = _state.importPreview; if (!p) return;
  if (!activeTab) activeTab = 'ozet';
  var tree = _buildPreviewTree(p.rawCombos);
  var warnHtml = (p.warnings||[]).map(function(w){
    var clr = w.type==='ok'?'#D1FAE5':w.type==='info'?'#DBEAFE':w.type==='duplicate'?'#FEF3C7':'#FEE2E2';
    var tc  = w.type==='ok'?'#065F46':w.type==='info'?'#1E40AF':w.type==='duplicate'?'#92400E':'#991B1B';
    return '<div style="padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:6px;background:'+clr+';color:'+tc+'">'+_esc(w.msg)+'</div>';
  }).join('');
  var tabs = [['ozet','Özet'],['incele','İncele ('+p.stats.combos+')'],['uyarilar','Uyarılar ('+((p.warnings||[]).length)+')']];
  body.innerHTML =
    '<div style="font-size:16px;font-weight:700;color:#0F1117;margin-bottom:14px">Excel Import Önizleme</div>'+
    '<div style="display:flex;gap:2px;border-bottom:1.5px solid #E2E5EF;margin-bottom:14px">'+
      tabs.map(function(t){
        var isA = t[0]===activeTab;
        return '<button data-pvtab="'+t[0]+'" style="border:none;background:none;cursor:pointer;padding:7px 14px;font-size:12px;font-weight:'+(isA?'600':'400')+';color:'+(isA?'#0F1117':'#4A5068')+';border-bottom:2px solid '+(isA?'#4F46E5':'transparent')+';margin-bottom:-1.5px;font-family:inherit">'+t[1]+'</button>';
      }).join('')+
    '</div>'+
    '<div id="pv-ozet"'+(activeTab!=='ozet'?' style="display:none"':'')+'>'+
      '<div style="background:#FEF3C7;color:#92400E;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:14px">⚠ Bu işlem <strong>TÜM mevcut datayı siler</strong> ve Excel\'den yeniden oluşturur.</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+_sbox('Müşteri',p.stats.customers)+_sbox('Ürün',p.stats.products)+_sbox('Ülke',p.stats.countries)+_sbox('Combo',p.stats.combos)+_sbox('Target',p.stats.targetRows)+'</div>'+
      (warnHtml?'<div style="margin-bottom:14px">'+warnHtml+'</div>':'<div style="padding:8px 12px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:12px;margin-bottom:14px">✓ Kritik uyarı yok</div>')+
    '</div>'+
    '<div id="pv-incele"'+(activeTab!=='incele'?' style="display:none"':'')+' style="max-height:360px;overflow-y:auto">'+_renderPreviewExplorer(tree)+'</div>'+
    '<div id="pv-uyarilar"'+(activeTab!=='uyarilar'?' style="display:none"':'')+'>'+( warnHtml||'<div style="padding:8px 12px;border-radius:6px;background:#D1FAE5;color:#065F46;font-size:12px">✓ Uyarı yok</div>')+'</div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'+
      '<button id="tgt-modal-cancel" style="background:none;border:1.5px solid #E2E5EF;border-radius:8px;padding:0 18px;height:38px;font-size:13px;cursor:pointer;font-family:inherit;color:#0F1117;min-height:unset!important;width:auto!important">İptal</button>'+
      '<button id="tgt-modal-confirm" style="background:#DC2626;color:#fff;border:none;border-radius:8px;padding:0 18px;height:38px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;min-height:unset!important;width:auto!important">Sil ve Import Et</button>'+
    '</div>'+
    '<div id="tgt-progress-wrap" style="display:none;margin-top:12px;padding:12px 14px;background:#F1F3F9;border-radius:8px">'+
      '<div id="tgt-progress-msg" style="font-size:12px;color:#0F1117;margin-bottom:8px"></div>'+
      '<div style="height:8px;background:#E2E5EF;border-radius:99px;overflow:hidden"><div id="tgt-pbar" style="height:100%;background:#4F46E5;border-radius:99px;transition:width .3s;width:0%"></div></div>'+
      '<div id="tgt-progress-count" style="font-size:11px;color:#4A5068;text-align:right;margin-top:4px"></div>'+
    '</div>';

  backdrop.style.display = 'flex';
  _bindImportModal(tree, activeTab);
}

function _bindImportModal(tree, activeTab) {
  document.querySelectorAll('[data-pvtab]').forEach(function(b){
    b.addEventListener('click', function(){ _showImportModal(this.dataset.pvtab); });
  });
  document.querySelectorAll('[data-pvc]').forEach(function(r){
    r.addEventListener('click', function(){ _pvOpen.c[this.dataset.pvc]=!_pvOpen.c[this.dataset.pvc]; _showImportModal('incele'); });
  });
  document.querySelectorAll('[data-pvcu]').forEach(function(r){
    r.addEventListener('click', function(){ _pvOpen.cu[this.dataset.pvcu]=!_pvOpen.cu[this.dataset.pvcu]; _showImportModal('incele'); });
  });
  document.querySelectorAll('[data-pvpr]').forEach(function(r){
    r.addEventListener('click', function(){ _pvOpen.cu[this.dataset.pvpr]=!_pvOpen.cu[this.dataset.pvpr]; _showImportModal('incele'); });
  });
  var cancel = document.getElementById('tgt-modal-cancel');
  if (cancel) cancel.addEventListener('click', function(){
    _pvOpen={c:{},cu:{}};
    document.getElementById('tgt-modal-backdrop').style.display='none';
    _state.importStep='idle'; _state.importPreview=null;
  });
  var confirm = document.getElementById('tgt-modal-confirm');
  if (!confirm) return;
  confirm.addEventListener('click', async function(){
    var cancelBtn = document.getElementById('tgt-modal-cancel');
    confirm.disabled=true; if (cancelBtn) cancelBtn.disabled=true;
    var pw = document.getElementById('tgt-progress-wrap'); if (pw) pw.style.display='block';
    _state.importStep='importing';
    var result = await confirmBudgetImport(_state.importPreview, function(msg,current,total){
      var pm=document.getElementById('tgt-progress-msg'); if(pm) pm.textContent=msg;
      if (current!==undefined&&total&&total>0){
        var pb=document.getElementById('tgt-pbar'); if(pb) pb.style.width=Math.round(current/total*100)+'%';
        var pc=document.getElementById('tgt-progress-count'); if(pc) pc.textContent=current.toLocaleString('tr-TR')+' / '+total.toLocaleString('tr-TR')+' kayıt';
      }
    });
    if (result.ok){
      var pm2=document.getElementById('tgt-progress-msg'); if(pm2) pm2.textContent='✓ Tamamlandı — '+result.inserted.toLocaleString('tr-TR')+' hedef kaydı.';
      var pb2=document.getElementById('tgt-pbar'); if(pb2) pb2.style.width='100%';
      setTimeout(function(){
        _pvOpen={c:{},cu:{}};
        var bd=document.getElementById('tgt-modal-backdrop'); if(bd) bd.style.display='none';
        _state.importStep='idle'; _state.importPreview=null;
        _loadData().then(function(){ _safeRender(); });
      }, 1800);
    } else {
      var pm3=document.getElementById('tgt-progress-msg'); if(pm3) pm3.textContent='✗ Hata: '+result.error;
      confirm.disabled=false; if(cancelBtn) cancelBtn.disabled=false;
    }
  });
}

})();
