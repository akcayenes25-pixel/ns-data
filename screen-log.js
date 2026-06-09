/* NSDATA - screen-log.js */
(function() {
  'use strict';

  var _showDebug = true;

  document.addEventListener('nsdata:appReady', function() {
    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'log') _load();
    });
  });

  async function _load() {
    var screen = document.getElementById('screen-log');
    if (!screen) return;
    screen.innerHTML = '<div style="padding:32px;color:#4A5068;font-size:15px">Yukleniyor...</div>';
    var rows = await dbGetActivityLog();
    screen.innerHTML = _buildHTML(rows);

    var el = function(id) { return document.getElementById(id); };
    if (el('log-refresh-btn')) el('log-refresh-btn').onclick = _load;
    if (el('log-clear-btn')) el('log-clear-btn').onclick = async function() {
      if (!confirm('Tum log kayitlari silinsin mi?')) return;
      try {
        var dummy = '00000000-0000-0000-0000-000000000000';
        await window._supabaseClient.from('activity_log').delete().neq('id', dummy);
        showToast('Log temizlendi');
        _load();
      } catch(e) { showToast('Temizlenemedi'); }
    };
    if (el('log-copy-all-btn')) el('log-copy-all-btn').onclick = function() {
      var allText = rows.map(function(r) {
        var dt = r.created_at ? new Date(r.created_at) : null;
        var dtStr = dt ? _fmt(dt) : '?';
        var detail = r.detail || '';
        try { detail = JSON.stringify(JSON.parse(detail), null, 2); } catch(e) {}
        return '[' + dtStr + '] ' + r.action + ' | ' + (r.screen || '') + '\n' + detail;
      }).join('\n\n---\n\n');
      navigator.clipboard.writeText(allText).then(function(){ showToast('Kopyalandi'); });
    };

    // Arrow toggles
    screen.querySelectorAll('.log-row-arrow').forEach(function(btn) {
      btn.onclick = function() {
        var idx = btn.dataset.idx;
        var detail = document.getElementById('log-detail-' + idx);
        if (!detail) return;
        var open = detail.style.display !== 'none';
        detail.style.display = open ? 'none' : 'block';
        btn.textContent = open ? '▶' : '▼';
      };
    });

    // Row copy buttons
    screen.querySelectorAll('.log-row-copy').forEach(function(btn) {
      btn.onclick = function() {
        var idx = btn.dataset.idx;
        var row = rows[idx];
        if (!row) return;
        var dt = row.created_at ? new Date(row.created_at) : null;
        var dtStr = dt ? _fmt(dt) : '?';
        var detail = row.detail || '';
        try { detail = JSON.stringify(JSON.parse(detail), null, 2); } catch(e) {}
        var text = '[' + dtStr + '] ' + row.action + ' | ' + (row.screen || '') + '\n' + detail;
        navigator.clipboard.writeText(text).then(function(){ showToast('Satirr kopyalandi'); });
      };
    });
  }

  function _buildHTML(rows) {
    var filtered = _showDebug ? rows : rows.filter(function(r){ return !r.action.startsWith('DEBUG_'); });

    var ACTION_COLOR = {
      'APP_BOOT':             '#4F46E5',
      'SOFT_RESET':           '#D97706',
      'HARD_RESET':           '#DC2626',
      'DELETE_PRODUCT':       '#DC2626',
      'DELETE_CUSTOMER':      '#DC2626',
      'DEBUG_LOADALL_START':  '#9CA3AF',
      'DEBUG_LOADALL_DONE':   '#059669',
      'DEBUG_FILTORDERS':     '#0284C7',
      'DEBUG_RENDER':         '#7C3AED',
      'DEBUG_MUSTERI_EKLE':   '#D97706',
      'DEBUG_MUSTERI_EKLENDI':'#059669',
    };

    var linesHTML = filtered.map(function(r, idx) {
      var color = ACTION_COLOR[r.action] || '#4A5068';
      var dt = r.created_at ? new Date(r.created_at) : null;
      var dtStr = dt ? _fmt(dt) : '?';
      var detail = r.detail || '';
      var isJson = detail.startsWith('{') || detail.startsWith('[');
      var prettyDetail = '';
      if (isJson) {
        try { prettyDetail = JSON.stringify(JSON.parse(detail), null, 2); } catch(e) { prettyDetail = detail; }
      } else {
        prettyDetail = detail;
      }

      // Single line summary
      var summary = '';
      if (isJson) {
        try {
          var parsed = JSON.parse(detail);
          var parts = [];
          if (parsed.call !== undefined) parts.push('#' + parsed.call);
          if (parsed.ordersCount !== undefined) parts.push('orders=' + parsed.ordersCount);
          if (parsed.matchedOrders !== undefined) parts.push('matched=' + parsed.matchedOrders);
          if (parsed.stateOrdersTotal !== undefined) parts.push('stateTotal=' + parsed.stateOrdersTotal);
          if (parsed.filtersMusteri !== undefined) parts.push('filtre=[' + parsed.filtersMusteri.length + ']');
          if (parsed.result !== undefined) parts.push('result=' + parsed.result);
          if (parsed.name !== undefined) parts.push('musteri=' + parsed.name);
          if (parsed.customersCount !== undefined) parts.push('customers=' + parsed.customersCount);
          if (parsed.productsCount !== undefined) parts.push('products=' + parsed.productsCount);
          summary = parts.join(' | ');
        } catch(e) { summary = detail.substring(0, 80); }
      } else {
        summary = detail.substring(0, 100);
      }

      return '<div style="border-bottom:1px solid #E2E5EF;padding:0">' +
        '<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;font-size:12px;font-family:monospace">' +
          '<button class="log-row-arrow" data-idx="' + idx + '" style="background:none;border:none;cursor:pointer;font-size:11px;color:#6B7280;padding:0;width:14px;flex-shrink:0;font-family:inherit">▶</button>' +
          '<span style="color:#9CA3AF;white-space:nowrap;flex-shrink:0">' + dtStr + '</span>' +
          '<span style="font-weight:700;color:' + color + ';white-space:nowrap;flex-shrink:0;font-size:11px">' + _esc(r.action) + '</span>' +
          '<span style="color:#6B7280;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(summary) + '</span>' +
          '<button class="log-row-copy" data-idx="' + idx + '" style="background:none;border:1px solid #E2E5EF;border-radius:3px;cursor:pointer;font-size:10px;color:#6B7280;padding:1px 5px;flex-shrink:0;font-family:inherit">kopyala</button>' +
        '</div>' +
        '<div id="log-detail-' + idx + '" style="display:none;padding:6px 10px 10px 30px">' +
          '<pre style="background:#F8F9FC;border:1px solid #E2E5EF;border-radius:4px;padding:8px;font-size:11px;overflow-x:auto;white-space:pre-wrap;margin:0;color:#1F2937">' + _esc(prettyDetail) + '</pre>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div style="padding:16px 20px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
        '<div style="font-size:18px;font-weight:800;color:#0F1117">Debug Log</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button id="log-copy-all-btn" style="height:32px;padding:0 12px;font-size:12px;font-weight:600;background:#4F46E5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit">Tumunu Kopyala</button>' +
          '<button id="log-refresh-btn" style="height:32px;padding:0 12px;font-size:12px;font-weight:600;background:#F3F4F6;border:1px solid #E2E5EF;border-radius:6px;cursor:pointer;font-family:inherit">Yenile</button>' +
          '<button id="log-clear-btn" style="height:32px;padding:0 12px;font-size:12px;font-weight:600;color:#DC2626;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;cursor:pointer;font-family:inherit">Temizle</button>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:#9CA3AF;margin-bottom:8px">' + filtered.length + ' kayit</div>' +
      '<div style="background:#fff;border:1px solid #E2E5EF;border-radius:8px;overflow:hidden">' +
        linesHTML +
      '</div>' +
    '</div>';
  }

  function _fmt(d) {
    var pad = function(n) { return String(n).padStart(2,'0'); };
    return d.getDate() + '.' + pad(d.getMonth()+1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
