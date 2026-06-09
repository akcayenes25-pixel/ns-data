/* NSDATA - screen-log.js */
(function() {
  'use strict';

  var _showDebug = false;

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
      } catch(e2) { showToast('Temizlenemedi'); }
    };

    if (el('log-toggle-debug')) el('log-toggle-debug').onclick = function() {
      _showDebug = !_showDebug;
      _load();
    };

    // Expand/collapse JSON detail
    screen.querySelectorAll('.log-detail-toggle').forEach(function(btn) {
      btn.onclick = function() {
        var id = btn.dataset.id;
        var box = document.getElementById('log-detail-' + id);
        if (box) {
          var isHidden = box.style.display === 'none';
          box.style.display = isHidden ? 'block' : 'none';
          btn.textContent = isHidden ? 'Kapat' : 'Detay';
        }
      };
    });
  }

  function _buildHTML(rows) {
    var filtered = _showDebug ? rows : rows.filter(function(r){ return !r.action.startsWith('DEBUG_'); });

    var ACTION_COLOR = {
      'APP_BOOT':           '#4F46E5',
      'SOFT_RESET':         '#D97706',
      'HARD_RESET':         '#DC2626',
      'DELETE_PRODUCT':     '#DC2626',
      'DELETE_CUSTOMER':    '#DC2626',
      'DELETE_ORDER':       '#D97706',
      'DEBUG_LOADALL_START':'#6B7280',
      'DEBUG_LOADALL_DONE': '#059669',
      'DEBUG_FILTORDERS':   '#0284C7',
      'DEBUG_RENDER':       '#7C3AED',
      'DEBUG_MUSTERI_EKLE': '#D97706',
      'DEBUG_MUSTERI_EKLENDI': '#059669',
    };

    var rowsHTML = filtered.length === 0
      ? '<tr><td colspan="6" style="padding:32px;text-align:center;color:#4A5068">Kayit yok</td></tr>'
      : filtered.map(function(r, idx) {
          var color = ACTION_COLOR[r.action] || '#4A5068';
          var dt = r.created_at ? new Date(r.created_at) : null;
          var dtStr = dt ? _fmt(dt) : '—';
          var isDebug = r.action.startsWith('DEBUG_');
          var detailStr = r.detail || '';
          var isJson = detailStr.startsWith('{') || detailStr.startsWith('[');
          var prettyDetail = '';
          if (isJson) {
            try {
              var parsed = JSON.parse(detailStr);
              prettyDetail = _renderJson(parsed);
            } catch(e) {
              prettyDetail = _esc(detailStr);
            }
          } else {
            prettyDetail = _esc(detailStr);
          }

          var rowBg = isDebug ? '#FAFAFA' : '#fff';
          return '<tr style="border-bottom:1px solid #E2E5EF;background:' + rowBg + '">' +
            '<td style="padding:8px 12px;font-size:12px;color:#4A5068;white-space:nowrap;font-family:monospace">' + dtStr + '</td>' +
            '<td style="padding:8px 12px"><span style="font-size:11px;font-weight:700;color:' + color + ';background:' + color + '18;padding:2px 7px;border-radius:4px;white-space:nowrap">' + _esc(r.action) + '</span></td>' +
            '<td style="padding:8px 12px;font-size:12px">' + _esc(r.table_name || '—') + '</td>' +
            '<td style="padding:8px 12px;font-size:12px;color:#4A5068">' + _esc(r.screen || '—') + '</td>' +
            '<td style="padding:8px 12px;font-size:12px;max-width:300px">' +
              (isJson
                ? '<button class="log-detail-toggle" data-id="' + idx + '" style="font-size:11px;background:#F3F4F6;border:1px solid #E2E5EF;border-radius:4px;padding:2px 8px;cursor:pointer;font-family:inherit">Detay</button>' +
                  '<div id="log-detail-' + idx + '" style="display:none;margin-top:6px;background:#F8F9FC;border:1px solid #E2E5EF;border-radius:4px;padding:8px;font-size:11px;font-family:monospace;white-space:pre-wrap;max-height:300px;overflow-y:auto">' + prettyDetail + '</div>'
                : '<span style="font-size:11px;color:#4A5068;word-break:break-all">' + prettyDetail.substring(0,120) + (prettyDetail.length > 120 ? '...' : '') + '</span>'
              ) +
            '</td>' +
          '</tr>';
        }).join('');

    var debugBtnLabel = _showDebug ? 'Debug Gizle' : 'Debug Goster';
    var debugBtnColor = _showDebug ? '#DC2626' : '#4F46E5';

    return '<div style="padding:20px 24px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-size:20px;font-weight:800;color:#0F1117">Aktivite & Debug Logu</div>' +
          '<div style="font-size:13px;color:#4A5068;margin-top:2px">Son 200 kayit — sil, yukle, render, filtre islemleri</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button id="log-toggle-debug" style="height:36px;padding:0 14px;font-size:12px;font-weight:600;color:#fff;background:' + debugBtnColor + ';border:none;border-radius:6px;cursor:pointer;font-family:inherit">' + debugBtnLabel + '</button>' +
          '<button id="log-refresh-btn" style="height:36px;padding:0 14px;font-size:12px;font-weight:600;background:#F3F4F6;border:1px solid #E2E5EF;border-radius:6px;cursor:pointer;font-family:inherit">Yenile</button>' +
          '<button id="log-clear-btn" style="height:36px;padding:0 14px;font-size:12px;font-weight:600;color:#DC2626;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;cursor:pointer;font-family:inherit">Logu Temizle</button>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:#4A5068;margin-bottom:12px">Toplam: ' + rows.length + ' kayit, gosterilen: ' + filtered.length + '</div>' +
      '<div style="background:#fff;border:1.5px solid #E2E5EF;border-radius:8px;overflow:hidden">' +
        '<div style="overflow-x:auto">' +
          '<table style="width:100%;border-collapse:collapse">' +
            '<thead><tr style="background:#F8F9FC">' +
              '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#4A5068;white-space:nowrap">ZAMAN</th>' +
              '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#4A5068">ISLEM</th>' +
              '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#4A5068">TABLO</th>' +
              '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#4A5068">EKRAN</th>' +
              '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#4A5068">DETAY</th>' +
            '</tr></thead>' +
            '<tbody>' + rowsHTML + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _renderJson(obj) {
    return JSON.stringify(obj, null, 2);
  }

  function _fmt(d) {
    var pad = function(n) { return String(n).padStart(2,'0'); };
    return d.getDate() + '.' + pad(d.getMonth()+1) + '.' + d.getFullYear() +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
