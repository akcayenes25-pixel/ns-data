/* NSDATA - screen-log.js */
(function() {
  'use strict';

  document.addEventListener('nsdata:appReady', function() {
    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'log') _load();
    });
  });

  async function _load() {
    var screen = document.getElementById('screen-log');
    if (!screen) return;
    screen.innerHTML = '<div style="padding:32px;color:#4A5068;font-size:15px">Yükleniyor...</div>';

    var rows = await dbGetActivityLog();
    screen.innerHTML = _buildHTML(rows);

    var refreshBtn = document.getElementById('log-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', _load);

    var clearBtn = document.getElementById('log-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', async function() {
      if (!confirm('Tüm log kayıtları silinsin mi?')) return;
      try {
        var dummy = '00000000-0000-0000-0000-000000000000';
        await window._supabaseClient.from('activity_log').delete().neq('id', dummy);
        showToast('Log temizlendi');
        _load();
      } catch(e) { showToast('Temizlenemedi'); }
    });
  }

  function _buildHTML(rows) {
    var ACTION_COLOR = {
      'APP_BOOT':        '#4F46E5',
      'SOFT_RESET':      '#D97706',
      'HARD_RESET':      '#DC2626',
      'DELETE_PRODUCT':  '#DC2626',
      'DELETE_CUSTOMER': '#DC2626',
      'DELETE_ORDER':    '#D97706'
    };

    var rowsHTML = rows.length === 0
      ? '<tr><td colspan="5" style="padding:32px;text-align:center;color:#4A5068">Henüz kayıt yok</td></tr>'
      : rows.map(function(r) {
          var color = ACTION_COLOR[r.action] || '#4A5068';
          var dt = r.created_at ? new Date(r.created_at) : null;
          var dtStr = dt ? _fmt(dt) : '—';
          return '<tr style="border-bottom:1px solid #E2E5EF">' +
            '<td style="padding:10px 14px;font-size:13px;color:#4A5068;white-space:nowrap">' + dtStr + '</td>' +
            '<td style="padding:10px 14px"><span style="font-size:12px;font-weight:700;color:' + color + ';background:' + color + '18;padding:3px 8px;border-radius:4px">' + _esc(r.action) + '</span></td>' +
            '<td style="padding:10px 14px;font-size:13px">' + _esc(r.table_name || '—') + '</td>' +
            '<td style="padding:10px 14px;font-size:13px;color:#4A5068">' + _esc(r.screen || '—') + '</td>' +
            '<td style="padding:10px 14px;font-size:13px;color:#4A5068">' + _esc(r.detail || '') + '</td>' +
          '</tr>';
        }).join('');

    return '<div style="padding:20px 24px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-size:20px;font-weight:800;color:#0F1117">Aktivite Logu</div>' +
          '<div style="font-size:13px;color:#4A5068;margin-top:2px">Son 200 kayıt — her uygulama açılışı ve tüm silme işlemleri</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-secondary" id="log-refresh-btn" style="height:36px;font-size:13px">Yenile</button>' +
          '<button class="btn btn-danger" id="log-clear-btn" style="height:36px;font-size:13px">Logu Temizle</button>' +
        '</div>' +
      '</div>' +
      '<div style="background:#fff;border:1.5px solid #E2E5EF;border-radius:8px;overflow:hidden">' +
        '<div style="overflow-x:auto">' +
          '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
            '<thead><tr style="background:#F8F9FC">' +
              '<th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#4A5068;white-space:nowrap">ZAMAN</th>' +
              '<th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#4A5068">İŞLEM</th>' +
              '<th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#4A5068">TABLO</th>' +
              '<th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#4A5068">EKRAN</th>' +
              '<th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;color:#4A5068">DETAY</th>' +
            '</tr></thead>' +
            '<tbody>' + rowsHTML + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
    '</div>';
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
