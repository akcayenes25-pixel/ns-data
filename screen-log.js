/* NSDATA - screen-log.js */
(function() {
  'use strict';

  var _allRows = [];
  var _filterFrom = null;
  var _filterTo = null;
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
    _allRows = await dbGetActivityLog();
    _render();
  }

  function _render() {
    var screen = document.getElementById('screen-log');
    if (!screen) return;
    screen.innerHTML = _buildHTML(_allRows);
    _bindEvents();
  }

  function _bindEvents() {
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

    if (el('log-toggle-debug')) el('log-toggle-debug').onclick = function() {
      _showDebug = !_showDebug;
      _render();
    };

    if (el('log-filter-btn')) el('log-filter-btn').onclick = function() {
      var fromVal = el('log-from') ? el('log-from').value : '';
      var toVal = el('log-to') ? el('log-to').value : '';
      _filterFrom = fromVal ? new Date(fromVal) : null;
      _filterTo = toVal ? new Date(toVal) : null;
      _render();
    };

    if (el('log-filter-clear-btn')) el('log-filter-clear-btn').onclick = function() {
      _filterFrom = null;
      _filterTo = null;
      if (el('log-from')) el('log-from').value = '';
      if (el('log-to')) el('log-to').value = '';
      _render();
    };

    if (el('log-copy-all-btn')) el('log-copy-all-btn').onclick = function() {
      var filtered = _getFiltered();
      var text = filtered.map(function(r) {
        var dt = r.created_at ? new Date(r.created_at) : null;
        var dtStr = dt ? _fmt(dt) : '?';
        var detail = r.detail || '';
        try { detail = JSON.stringify(JSON.parse(detail), null, 2); } catch(e) {}
        return '[' + dtStr + '] ' + r.action + ' | ' + (r.screen || '') + '\n' + detail;
      }).join('\n\n---\n\n');
      navigator.clipboard.writeText(text).then(function(){ showToast('Kopyalandi (' + filtered.length + ' kayit)'); });
    };

    document.getElementById('screen-log').querySelectorAll('.log-row-arrow').forEach(function(btn) {
      btn.onclick = function() {
        var idx = btn.dataset.idx;
        var detail = document.getElementById('log-detail-' + idx);
        if (!detail) return;
        var open = detail.style.display !== 'none';
        detail.style.display = open ? 'none' : 'block';
        btn.textContent = open ? '▶' : '▼';
      };
    });

    document.getElementById('screen-log').querySelectorAll('.log-row-copy').forEach(function(btn) {
      btn.onclick = function() {
        var idx = parseInt(btn.dataset.idx);
        var filtered = _getFiltered();
        var row = filtered[idx];
        if (!row) return;
        var dt = row.created_at ? new Date(row.created_at) : null;
        var dtStr = dt ? _fmt(dt) : '?';
        var detail = row.detail || '';
        try { detail = JSON.stringify(JSON.parse(detail), null, 2); } catch(e) {}
        var text = '[' + dtStr + '] ' + row.action + ' | ' + (row.screen || '') + '\n' + detail;
        navigator.clipboard.writeText(text).then(function(){ showToast('Kopyalandi'); });
      };
    });
  }

  function _getFiltered() {
    return _allRows.filter(function(r) {
      if (!_showDebug && r.action.startsWith('DEBUG_')) return false;
      if (_filterFrom || _filterTo) {
        var dt = r.created_at ? new Date(r.created_at) : null;
        if (!dt) return false;
        if (_filterFrom && dt < _filterFrom) return false;
        if (_filterTo && dt > _filterTo) return false;
      }
      return true;
    });
  }

  function _buildHTML(rows) {
    var filtered = _getFiltered();

    var ACTION_COLOR = {
      'APP_BOOT':                    '#4F46E5',
      'SOFT_RESET':                  '#D97706',
      'HARD_RESET':                  '#DC2626',
      'DELETE_PRODUCT':              '#DC2626',
      'DELETE_CUSTOMER':             '#DC2626',
      'DEBUG_LOADALL_START':         '#9CA3AF',
      'DEBUG_LOADALL_DONE':          '#059669',
      'DEBUG_FILTORDERS':            '#0284C7',
      'DEBUG_RENDER':                '#7C3AED',
      'DEBUG_MUSTERI_EKLE':          '#D97706',
      'DEBUG_MUSTERI_EKLENDI':       '#059669',
      'DEBUG_ROW_X_CLICK':          '#DC2626',
      'DEBUG_ROW_X_CLICK_SKIP':     '#9CA3AF',
      'DEBUG_CHIP_X_CLICK':         '#D97706',
      'DEBUG_DATA_CHANGED':         '#0EA5E9',
      'DEBUG_SCREEN_ACTIVATED':     '#6366F1',
      'DEBUG_FILTER_CLEARED':       '#EF4444',
      'DEBUG_SESSION_HIDDEN_ROWS_RESTORED': '#F59E0B',
      'DEBUG_BUILD_COL_LEAVES':     '#8B5CF6',
      'DEBUG_RENDERDATA_START':      '#0284C7',
      'DEBUG_RENDERDATA_EARLY_RETURN': '#DC2626',
      'DEBUG_BUILDROWS_BASEVAL':     '#7C3AED',
      'DEBUG_OPT_CLICK':             '#D97706',
      'DEBUG_FILTER_CHECKBOX':       '#0284C7',
      'DEBUG_FILTER_RESET':          '#DC2626',
      'DEBUG_FILTER_SELECT_ALL':     '#059669',
      'DEBUG_POOL_ALL_CLICK':        '#6366F1',
      'DEBUG_CLEAR_DATA_START':      '#DC2626',
      'DEBUG_CLEAR_DATA_DONE':       '#059669',
    };

    var debugBtnLabel = _showDebug ? 'Debug Gizle' : 'Debug Goster';
    var debugBtnColor = _showDebug ? '#DC2626' : '#4F46E5';
    var hasFilter = _filterFrom || _filterTo;

    var linesHTML = filtered.length === 0
      ? '<div style="padding:32px;text-align:center;color:#9CA3AF;font-size:13px">Kayit yok</div>'
      : filtered.map(function(r, idx) {
          var color = ACTION_COLOR[r.action] || '#4A5068';
          var dt = r.created_at ? new Date(r.created_at) : null;
          var dtStr = dt ? _fmt(dt) : '?';
          var detail = r.detail || '';
          var isJson = detail.startsWith('{') || detail.startsWith('[');
          var prettyDetail = detail;
          if (isJson) { try { prettyDetail = JSON.stringify(JSON.parse(detail), null, 2); } catch(e) {} }

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
              if (parsed.hiddenRows !== undefined) parts.push('hidden=[' + parsed.hiddenRows.length + ']');
              if (parsed.result !== undefined) parts.push('result=' + parsed.result);
              if (parsed.name !== undefined) parts.push('musteri=' + parsed.name);
              if (parsed.rowKey !== undefined) parts.push('rowKey=' + parsed.rowKey.substring(0,16) + '...');
              if (parsed.table !== undefined) parts.push('table=' + parsed.table);
              if (parsed.leafCount !== undefined) parts.push('leaves=' + parsed.leafCount);
              if (parsed.customersCount !== undefined) parts.push('customers=' + parsed.customersCount);
              if (parsed.productsCount !== undefined) parts.push('products=' + parsed.productsCount);
              if (parsed.valName !== undefined) parts.push('musteri=' + parsed.valName);
              summary = parts.join(' | ');
            } catch(e2) { summary = detail.substring(0, 100); }
          } else {
            summary = detail.substring(0, 100);
          }

          var isDebug = r.action.startsWith('DEBUG_');
          var rowBg = isDebug ? '#FAFAFA' : '#fff';

          return '<div style="border-bottom:1px solid #F3F4F6;background:' + rowBg + '">' +
            '<div style="display:flex;align-items:center;gap:6px;padding:4px 10px;font-size:12px;font-family:monospace">' +
              (isJson ? '<button class="log-row-arrow" data-idx="' + idx + '" style="background:none;border:none;cursor:pointer;font-size:10px;color:#9CA3AF;padding:0;width:12px;flex-shrink:0">▶</button>' : '<span style="width:12px;flex-shrink:0"></span>') +
              '<span style="color:#9CA3AF;white-space:nowrap;flex-shrink:0;font-size:11px">' + dtStr + '</span>' +
              '<span style="font-weight:700;color:' + color + ';white-space:nowrap;flex-shrink:0;font-size:10px;padding:1px 5px;background:' + color + '15;border-radius:3px">' + _esc(r.action.replace('DEBUG_','')) + '</span>' +
              '<span style="color:#6B7280;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">' + _esc(summary) + '</span>' +
              '<button class="log-row-copy" data-idx="' + idx + '" style="background:none;border:1px solid #E5E7EB;border-radius:3px;cursor:pointer;font-size:10px;color:#9CA3AF;padding:1px 5px;flex-shrink:0;font-family:inherit">kopyala</button>' +
            '</div>' +
            (isJson ? '<div id="log-detail-' + idx + '" style="display:none;padding:4px 10px 8px 26px"><pre style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:4px;padding:8px;font-size:11px;overflow-x:auto;white-space:pre-wrap;margin:0;color:#1E293B;max-height:400px;overflow-y:auto">' + _esc(prettyDetail) + '</pre></div>' : '') +
          '</div>';
        }).join('');

    var fromVal = _filterFrom ? _filterFrom.toISOString().slice(0,16) : '';
    var toVal = _filterTo ? _filterTo.toISOString().slice(0,16) : '';

    return '<div style="padding:14px 18px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
        '<div style="font-size:17px;font-weight:800;color:#0F1117">Debug Log</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button id="log-copy-all-btn" style="height:30px;padding:0 10px;font-size:11px;font-weight:600;background:#4F46E5;color:#fff;border:none;border-radius:5px;cursor:pointer;font-family:inherit">Tumunu Kopyala (' + filtered.length + ')</button>' +
          '<button id="log-toggle-debug" style="height:30px;padding:0 10px;font-size:11px;font-weight:600;color:#fff;background:' + debugBtnColor + ';border:none;border-radius:5px;cursor:pointer;font-family:inherit">' + debugBtnLabel + '</button>' +
          '<button id="log-refresh-btn" style="height:30px;padding:0 10px;font-size:11px;font-weight:600;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:5px;cursor:pointer;font-family:inherit">Yenile</button>' +
          '<button id="log-clear-btn" style="height:30px;padding:0 10px;font-size:11px;font-weight:600;color:#DC2626;background:#FEF2F2;border:1px solid #FECACA;border-radius:5px;cursor:pointer;font-family:inherit">Temizle</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
        '<span style="font-size:11px;color:#6B7280;font-weight:600">ZAMAN FİLTRE:</span>' +
        '<input id="log-from" type="datetime-local" value="' + fromVal + '" style="height:28px;font-size:11px;border:1px solid #E5E7EB;border-radius:4px;padding:0 6px;font-family:inherit"/>' +
        '<span style="font-size:11px;color:#9CA3AF">—</span>' +
        '<input id="log-to" type="datetime-local" value="' + toVal + '" style="height:28px;font-size:11px;border:1px solid #E5E7EB;border-radius:4px;padding:0 6px;font-family:inherit"/>' +
        '<button id="log-filter-btn" style="height:28px;padding:0 10px;font-size:11px;font-weight:600;background:#0F1117;color:#fff;border:none;border-radius:4px;cursor:pointer;font-family:inherit">Uygula</button>' +
        (hasFilter ? '<button id="log-filter-clear-btn" style="height:28px;padding:0 10px;font-size:11px;font-weight:600;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:4px;cursor:pointer;font-family:inherit">Temizle</button>' : '') +
        '<span style="font-size:11px;color:#9CA3AF">' + filtered.length + ' / ' + rows.length + ' kayit</span>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:6px;overflow:hidden">' +
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
