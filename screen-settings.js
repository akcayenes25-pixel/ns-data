/* NSDATA - screen-settings.js */
(function() {
  'use strict';

  var _state = {
    orders: [],
    customers: [], products: [], targets: [], profiles: [],
    targetMode: 'customer',
    targetImportPreview: null,      // 'customer' | 'country'
    selectedCustomerId: null,
    selectedCountry: null,
    selectedYear: new Date().getFullYear(),
    confirmMode: null
  };

  document.addEventListener('nsdata:appReady', function() { _bindGlobalEvents(); });

  async function _loadAll() {
    var results = await Promise.all([dbGetCustomers(), dbGetProducts(), dbGetTargets(), dbGetProfiles(), dbGetOrders(), dbGetCustomerCountries()]);
    _state.customers = results[0];
    _state.products  = results[1];
    _state.targets   = results[2];
    _state.profiles  = results[3];
    _state.orders    = results[4] || [];
    _state.customerCountries = results[5] || [];
    await TargetManager.load();

    if (!_state.selectedCustomerId && _state.customers.length) {
      _state.selectedCustomerId = _state.customers.filter(function(c){ return c.active !== false; })[0]?.id || _state.customers[0].id;
    }
    // Countries come from targets scope='country'
    var countries = [];
    _state.targets.filter(function(t){ return t.scope === 'country' && t.country; }).forEach(function(t) {
      if (!countries.includes(t.country)) countries.push(t.country);
    });
    countries.sort();
    _state.countries = countries;
    if (!_state.selectedCountry && countries.length) _state.selectedCountry = countries[0];
  }

  function _render() {
    var screen = document.getElementById('screen-settings');
    if (!screen) return;
    screen.innerHTML =
      _buildTargetSection() +
      _buildProductSection() +
      _buildCustomerSection() +
      _buildProfileSection() +
      _buildMonthCloseSection() +
      _buildResetSection();
    _bindScreenEvents();
  }

  /* ============================================================
     TARGET SECTION
     ============================================================ */
  function _buildTargetSection() {
    var years = [];
    var cy = new Date().getFullYear();
    for (var y = cy - 1; y <= cy + 2; y++) {
      years.push('<option value="' + y + '"' + (y === _state.selectedYear ? ' selected' : '') + '>' + y + '</option>');
    }

    // Mode tabs
    var tabs =
      '<div style="display:flex;gap:8px;margin-bottom:16px">' +
        '<button class="btn ' + (_state.targetMode === 'customer' ? 'btn-primary' : 'btn-secondary') + '" id="tgt-mode-customer" style="font-size:14px;height:36px">Müşteri Hedefleri</button>' +
        '<button class="btn ' + (_state.targetMode === 'country'  ? 'btn-primary' : 'btn-secondary') + '" id="tgt-mode-country"   style="font-size:14px;height:36px">Ülke Hedefleri</button>' +
      '</div>';

    var selector = '';
    var grid = '';

    if (_state.targetMode === 'customer') {
      var activeCustomers = _state.customers.filter(function(c){ return c.active !== false; });
      var custOpts = activeCustomers.map(function(c) {
        return '<option value="' + c.id + '"' + (c.id === _state.selectedCustomerId ? ' selected' : '') + '>' +
          _esc(CustomerManager.displayName(c)) + '</option>';
      }).join('');
      selector =
        '<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">' +
          '<select id="settings-customer-select" style="min-height:44px;font-size:15px;flex:1;min-width:200px">' + custOpts + '</select>' +
          '<select id="settings-year-select" style="min-height:44px;font-size:15px;width:100px">' + years.join('') + '</select>' +
        '</div>';
      grid = _state.selectedCustomerId
        ? TargetManager.buildCustomerGridHTML(_state.selectedCustomerId, _state.selectedYear, _state.products)
        : '<div style="color:#4A5068;padding:16px">Müşteri seçin.</div>';
    } else {
      var countryOpts = (_state.countries || []).map(function(c) {
        return '<option value="' + _esc(c) + '"' + (c === _state.selectedCountry ? ' selected' : '') + '>' + _esc(c) + '</option>';
      }).join('');
      selector =
        '<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">' +
          '<select id="settings-country-select" style="min-height:44px;font-size:15px;flex:1;min-width:200px">' + countryOpts + '</select>' +
          '<select id="settings-year-select" style="min-height:44px;font-size:15px;width:100px">' + years.join('') + '</select>' +
        '</div>';
      grid = _state.selectedCountry
        ? TargetManager.buildCountryGridHTML(_state.selectedCountry, _state.selectedYear, _state.products)
        : '<div style="color:#4A5068;padding:16px">Ülke seçin.</div>';
    }

    return '<div class="settings-section">' +
      '<div class="settings-section-header">' +
        '<span class="settings-section-title">🎯 Aylık Hedefler</span>' +
        '<label class="btn btn-secondary" style="cursor:pointer;font-size:13px;height:36px">' +
          'Excel\'den Yükle' +
          '<input type="file" id="settings-target-import-input" accept=".xlsx,.xls" style="display:none" />' +
        '</label>' +
      '</div>' +
      '<div class="settings-section-body">' + tabs + selector +
        '<div id="settings-target-grid">' + grid + '</div>' +
        _buildTargetImportPreview() +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     PRODUCT SECTION
     ============================================================ */

  function _buildTargetImportPreview() {
    if (!_state.targetImportPreview) return '';
    var data = _state.targetImportPreview;
    var rows = (data.rows || []).slice(0, 50);

    var rowsHtml = rows.map(function(row) {
      var custCell = row.scope === 'country'
        ? '<span style="color:#4A5068">' + (row.country || '—') + ' (Ülke)</span>'
        : (row.customer_id
            ? '<span style="color:var(--color-positive)">✓ ' + _esc(_state.customers.find(function(c){ return c.id === row.customer_id; })?.name || row.customer_name) + '</span>'
            : '<select class="settings-new-select tgt-import-cust" data-erp="' + _esc(row.customer_name||'') + '" style="font-size:12px;height:28px;min-height:unset"><option value="">— Eşleştir —</option>' +
              _state.customers.map(function(c){ return '<option value="' + c.id + '">' + _esc(c.name) + '</option>'; }).join('') + '</select>');
      var prodCell = row.product_id
        ? '<span style="color:var(--color-positive)">✓ ' + _esc(_state.products.find(function(p){ return p.id === row.product_id; })?.name || row.product_name) + '</span>'
        : '<select class="settings-new-select tgt-import-prod" data-erp="' + _esc(row.product_name) + '" style="font-size:12px;height:28px;min-height:unset"><option value="">— Eşleştir —</option>' +
          _state.products.map(function(p){ return '<option value="' + p.id + '">' + _esc(p.name) + '</option>'; }).join('') + '</select>';

      return '<tr>' +
        '<td style="padding:6px 10px">' + custCell + '</td>' +
        '<td style="padding:6px 10px">' + prodCell + '</td>' +
        '<td style="padding:6px 10px;text-align:right">' + (row.target_eur !== null ? row.target_eur.toLocaleString('de-DE') + ' €' : '—') + '</td>' +
        '<td style="padding:6px 10px;text-align:right">' + (row.target_qty !== null ? row.target_qty : '—') + '</td>' +
        '<td style="padding:6px 10px">' + (row.month||'?') + '/' + (row.year||'?') + '</td>' +
        '<td style="padding:6px 10px">' + (row.matched ? '<span style="color:var(--color-positive)">✓</span>' : '<span style="color:var(--color-warning)">?</span>') + '</td>' +
      '</tr>';
    }).join('');

    return '<div style="background:var(--color-surface);border:1.5px solid var(--color-border);border-radius:var(--radius-md);margin-top:12px;overflow:hidden">' +
      '<div style="padding:12px 16px;border-bottom:1.5px solid var(--color-border);display:flex;align-items:center;justify-content:space-between">' +
        '<span style="font-size:14px;font-weight:700">Hedef İmport Önizleme — ' + data.rowCount + ' satır (' + data.unmatchedCount + ' eşleşmedi)</span>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-primary" id="settings-target-import-confirm" style="font-size:13px;height:34px">Yükle</button>' +
          '<button class="btn btn-secondary" id="settings-target-import-cancel" style="font-size:13px;height:34px">İptal</button>' +
        '</div>' +
      '</div>' +
      '<div style="max-height:320px;overflow-y:auto">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
          '<thead><tr style="background:#F1F3F9;position:sticky;top:0">' +
            '<th style="padding:8px 10px;text-align:left">Müşteri/Ülke</th>' +
            '<th style="padding:8px 10px;text-align:left">Ürün</th>' +
            '<th style="padding:8px 10px;text-align:right">Hedef EUR</th>' +
            '<th style="padding:8px 10px;text-align:right">Hedef Adet</th>' +
            '<th style="padding:8px 10px">Ay/Yıl</th>' +
            '<th style="padding:8px 10px">Durum</th>' +
          '</tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function _buildProductSection() {
    var tableHTML = ProductManager.buildSettingsHTML(_state.products);
    return '<div class="settings-section">' +
      '<div class="settings-section-header">' +
        '<span class="settings-section-title">📦 Ürünler ve Fiyatlar</span>' +
        '<button class="btn btn-primary" id="settings-add-product-btn">+ Ürün Ekle</button>' +
      '</div>' +
      '<div class="settings-section-body no-pad" id="settings-product-table">' + tableHTML + '</div>' +
      '<div class="settings-section-body" id="settings-add-product-form" style="display:none;border-top:1.5px solid var(--color-border)">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          '<input type="text" id="settings-new-product-name" placeholder="Ürün adı" style="flex:1;min-width:160px;min-height:44px;font-size:15px" />' +
          '<input type="number" id="settings-new-product-price" placeholder="Fiyat (EUR)" min="0.01" step="0.01" style="width:140px;min-height:44px;font-size:15px;text-align:right" />' +
          '<input type="number" id="settings-new-product-ratio" placeholder="Konteyner katsayısı" min="0" style="width:190px;min-height:44px;font-size:15px;text-align:right" />' +
          '<button class="btn btn-primary" id="settings-save-product-btn">Kaydet</button>' +
          '<button class="btn btn-secondary" id="settings-cancel-product-btn">İptal</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     CUSTOMER SECTION
     ============================================================ */
  function _buildCustomerSection() {
    // customer_countries tablosundan oku
    var combos = _state.customerCountries || [];
    var custMap = {};
    (_state.customers||[]).forEach(function(c){ custMap[c.id]=c; });

    // İsim sırasına göre sırala
    var sortedCustomers = (_state.customers||[]).slice().sort(function(a,b){ return a.name.localeCompare(b.name); });

    var rows = sortedCustomers.map(function(c) {
      var custCombos = combos.filter(function(co){ return co.customer_id === c.id; });
      var ulkeHTML = custCombos.length
        ? custCombos.map(function(co) {
            return '<span style="display:inline-flex;align-items:center;gap:4px;background:#F1F5F9;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600;color:#0F1117;margin-right:4px">' +
              _esc(co.country) +
              ' <button class="cc-del-btn" data-del-cust="'+c.id+'" data-del-country="'+_esc(co.country)+'" style="background:none;border:none;color:#DC2626;cursor:pointer;font-size:12px;padding:0;line-height:1">×</button>' +
            '</span>';
          }).join('') + '<button class="cc-add-inline-btn" data-cust-id="'+c.id+'" data-cust-name="'+_esc(c.name)+'" style="background:none;border:1px dashed #9CA3AF;border-radius:4px;padding:2px 8px;font-size:11px;color:#6B7280;cursor:pointer">+ Ülke</button>'
        : '<button class="cc-add-inline-btn" data-cust-id="'+c.id+'" data-cust-name="'+_esc(c.name)+'" style="background:none;border:1px dashed #9CA3AF;border-radius:4px;padding:2px 8px;font-size:11px;color:#6B7280;cursor:pointer">+ Ülke Ekle</button>';

      return '<tr class="settings-cust-row" data-cust-name="' + _esc(c.name.toLowerCase()) + '" style="border-bottom:1px solid var(--color-border);' + (c.active === false ? 'opacity:0.5' : '') + '">' +
        '<td style="font-weight:600;padding:6px 12px;font-size:13px">' + _esc(c.name) + '</td>' +
        '<td style="padding:6px 12px">' +
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;min-height:32px">' +
            '<input type="checkbox" class="customer-active-cb" data-customer-id="' + c.id + '" ' +
              (c.active !== false ? 'checked' : '') + ' style="width:18px;height:18px" />' +
            '<span style="font-size:14px">' + (c.active !== false ? 'Aktif' : 'Pasif') + '</span>' +
          '</label>' +
        '</td>' +
        '<td style="padding:6px 12px">' + ulkeHTML + '</td>' +
        '<td style="padding:4px 8px;text-align:right">' +
          '<button class="customer-delete-btn" data-customer-id="' + c.id + '" style="color:#DC2626;font-size:12px;font-weight:600;padding:3px 8px;border:1px solid #DC2626;border-radius:4px;cursor:pointer;background:transparent">Sil</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<div class="settings-section">' +
      '<div class="settings-section-header">' +
        '<span class="settings-section-title">👥 Müşteriler</span>' +
        '<button class="btn btn-primary" id="settings-add-customer-btn">+ Müşteri Ekle</button>' +
        '<button class="btn btn-secondary" id="settings-import-customers-btn" style="margin-left:8px">📥 Excel\'den Yükle</button>' +
      '</div>' +
      '<div class="settings-section-body no-pad" id="settings-customer-table">' +
        '<div style="padding:8px 12px;border-bottom:1px solid var(--color-border)">' +
          '<input type="text" id="settings-customer-search" placeholder="Müşteri ara..." style="width:100%;height:36px;font-size:13px;padding:0 10px;border:1px solid var(--color-border);border-radius:4px;box-sizing:border-box" />' +
        '</div>' +
        '<div style="max-height:220px;overflow-y:auto">' +
          '<table style="width:100%;border-collapse:collapse" id="settings-customer-tbl">' +
            '<thead><tr style="background:#F1F3F9;position:sticky;top:0;z-index:1">' +
              '<th style="padding:6px 12px;text-align:left;font-size:11px;font-weight:700;color:#4A5068">MÜŞTERİ</th>' +
              '<th style="padding:6px 12px;text-align:left;font-size:11px;font-weight:700;color:#4A5068">DURUM</th>' +
              '<th style="padding:6px 12px;text-align:left;font-size:11px;font-weight:700;color:#4A5068">ÜLKELER</th>' +
              '<th style="padding:6px 12px"></th>' +
            '</tr></thead>' +
            '<tbody id="settings-customer-tbody">' + (rows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#4A5068;font-size:13px">Henüz müşteri yok</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
      '<div class="settings-section-body" id="settings-add-customer-form" style="display:none;border-top:1.5px solid var(--color-border)">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          '<input type="text" id="settings-new-customer-name" placeholder="Müşteri adı" style="flex:1;min-width:200px;min-height:44px;font-size:15px" />' +
          '<button class="btn btn-primary" id="settings-save-customer-btn">Kaydet</button>' +
          '<button class="btn btn-secondary" id="settings-cancel-customer-btn">İptal</button>' +
        '</div>' +
      '</div>' +
      // Inline ülke ekleme formu
      '<div class="settings-section-body" id="settings-add-cc-inline-form" style="display:none;border-top:1.5px solid var(--color-border)">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">' +
          '<span id="settings-cc-inline-cust-name" style="font-weight:600;font-size:14px;min-width:100px"></span>' +
          '<input type="hidden" id="settings-cc-inline-cust-id" />' +
          '<input type="text" id="settings-cc-inline-country" placeholder="Ülke (örn. FAS)" style="height:44px;width:140px;font-size:14px;padding:0 10px;border:1.5px solid var(--color-border);border-radius:4px" />' +
          '<button class="btn btn-primary" id="settings-cc-inline-save">Ekle</button>' +
          '<button class="btn btn-secondary" id="settings-cc-inline-cancel">İptal</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }


  function _esc(str) { if(!str)return''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ============================================================
     PROFILE SECTION
     ============================================================ */
  function _buildProfileSection() {
    var profileRows = _state.profiles.map(function(p) {
      var link = window.location.origin + window.location.pathname + '?profile=' + p.link_token;
      return '<div class="settings-profile-row">' +
        '<span class="settings-profile-name">' + _esc(p.name) + '</span>' +
        '<span class="settings-profile-link" title="Kopyalamak için tıklayın" data-link="' + link + '">' + link + '</span>' +
      '</div>';
    }).join('');

    return '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title">🔗 Profiller ve Linkler</span></div>' +
      '<div class="settings-section-body">' +
        '<div class="settings-profile-list">' +
          (profileRows || '<div style="color:#4A5068;font-size:14px">Henüz profil yok</div>') +
        '</div>' +
        '<div class="settings-add-profile-form">' +
          '<input type="text" id="settings-new-profile-name" placeholder="Profil adı (örnek: Enes - Fas)" style="min-height:44px;font-size:15px" />' +
          '<input type="text" id="settings-new-profile-region" placeholder="Bölge (opsiyonel)" style="width:180px;min-height:44px;font-size:15px" />' +
          '<button class="btn btn-primary" id="settings-add-profile-btn">Profil Oluştur</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     MONTH CLOSE
     ============================================================ */
  function _buildMonthCloseSection() {
    var confirmHTML = '';
    if (_state.confirmMode === 'month') {
      confirmHTML = '<div class="settings-confirm-box visible">' +
        '<div class="settings-confirm-text">Emin misiniz? Onay vermeden önce verileri Excel olarak indirmenizi öneririz.</div>' +
        '<div class="settings-confirm-actions">' +
          '<button class="btn btn-danger" id="settings-month-close-final">Evet, Ayı Kapat ve Temizle</button>' +
          '<button class="btn btn-secondary" id="settings-month-close-cancel">İptal</button>' +
        '</div>' +
      '</div>';
    }
    return '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title" style="color:var(--color-negative)">📅 Ay Kapatma</span></div>' +
      '<div class="settings-section-body">' +
        '<div class="settings-month-close-card">' +
          '<div class="settings-month-close-text">' +
            '<div class="settings-month-close-title">Ayı Kapat</div>' +
            '<div class="settings-month-close-desc">Siparişler, limitler ve ödemeler silinir. Müşteriler, ürünler ve hedefler korunur.</div>' +
          '</div>' +
          '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
            '<button class="btn btn-secondary" id="settings-export-before-close">Önce Excel\'e İndir</button>' +
            '<button class="btn btn-danger" id="settings-month-close-btn">Ayı Kapat</button>' +
          '</div>' +
        '</div>' +
        confirmHTML +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     RESET SECTION
     ============================================================ */
  function _buildResetSection() {
    var confirmHTML = '';
    if (_state.confirmMode === 'soft') {
      confirmHTML = '<div class="settings-confirm-box visible">' +
        '<div class="settings-confirm-text">Siparişler, limitler ve ödemeler silinecek. Müşteriler, ürünler ve hedefler korunacak. Emin misiniz?</div>' +
        '<div class="settings-confirm-actions">' +
          '<button class="btn btn-danger" id="settings-soft-reset-final">Evet, Sil</button>' +
          '<button class="btn btn-secondary" id="settings-soft-reset-cancel">İptal</button>' +
        '</div>' +
      '</div>';
    }
    if (_state.confirmMode === 'hard') {
      confirmHTML = '<div class="settings-confirm-box visible">' +
        '<div class="settings-confirm-text">TÜM VERİLER silinecek. Bu işlem geri alınamaz. Emin misiniz?</div>' +
        '<div class="settings-confirm-actions">' +
          '<button class="btn btn-danger" id="settings-hard-reset-final">Evet, Her Şeyi Sil</button>' +
          '<button class="btn btn-secondary" id="settings-hard-reset-cancel">İptal</button>' +
        '</div>' +
      '</div>';
    }
    return '<div class="settings-section">' +
      '<div class="settings-section-header"><span class="settings-section-title" style="color:var(--color-negative)">⚠ Sıfırla</span></div>' +
      '<div class="settings-section-body" style="display:flex;flex-direction:column;gap:16px">' +
        '<div class="settings-reset-row">' +
          '<div class="settings-reset-desc">Sipariş, limit ve ödeme verilerini sil. Müşteri, ürün ve hedefler kalsın.</div>' +
          '<button class="btn btn-danger" id="settings-soft-reset-btn">Verileri Sıfırla</button>' +
        '</div>' +
        '<div class="settings-reset-row">' +
          '<div class="settings-reset-desc">Her şeyi sil — tamamen temiz başlangıç.</div>' +
          '<button class="btn btn-danger" id="settings-hard-reset-btn">Tamamen Sıfırla</button>' +
        '</div>' +
        confirmHTML +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     BIND EVENTS
     ============================================================ */
  function _bindScreenEvents() {
    // Target import
    var tgtImportInput = document.getElementById('settings-target-import-input');
    if (tgtImportInput) {
      tgtImportInput.addEventListener('change', function() {
        var file = tgtImportInput.files[0];
        if (!file) return;
        if (typeof processTargetImportFile === 'function') {
          processTargetImportFile(file, _state.customers, _state.products, function(preview) {
            _state.targetImportPreview = preview;
            _render();
          });
        }
        tgtImportInput.value = '';
      });
    }

    var tgtImportConfirm = document.getElementById('settings-target-import-confirm');
    if (tgtImportConfirm) {
      tgtImportConfirm.addEventListener('click', async function() {
        var rows = (_state.targetImportPreview && _state.targetImportPreview.rows) || [];
        // Apply manual overrides
        document.querySelectorAll('.tgt-import-cust').forEach(function(sel) {
          if (!sel.value) return;
          var erpName = sel.getAttribute('data-erp');
          var row = rows.find(function(r){ return r.customer_name === erpName && !r.customer_id; });
          if (row) { row.customer_id = sel.value; row.matched = !!row.product_id; }
        });
        document.querySelectorAll('.tgt-import-prod').forEach(function(sel) {
          if (!sel.value) return;
          var erpName = sel.getAttribute('data-erp');
          var row = rows.find(function(r){ return r.product_name === erpName && !r.product_id; });
          if (row) { row.product_id = sel.value; row.matched = !!(row.customer_id || row.scope === 'country') && !!row.product_id; }
        });
        var done = 0;
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!row.product_id || !row.month || !row.year) continue;
          if (row.scope === 'customer' && !row.customer_id) continue;
          var ok = await TargetManager.upsert({
            scope: row.scope,
            customer_id: row.customer_id || null,
            country: row.country || null,
            product_id: row.product_id,
            month: row.month,
            year: row.year,
            target_eur: row.target_eur,
            target_qty: row.target_qty
          });
          if (ok) done++;
        }
        showToast(done + ' hedef kaydedildi');
        _state.targetImportPreview = null;
        _render();
      });
    }

    var tgtImportCancel = document.getElementById('settings-target-import-cancel');
    if (tgtImportCancel) {
      tgtImportCancel.addEventListener('click', function() { _state.targetImportPreview = null; _render(); });
    }

    // Target mode tabs
    var modeCust = document.getElementById('tgt-mode-customer');
    var modeCtry = document.getElementById('tgt-mode-country');
    if (modeCust) modeCust.addEventListener('click', function() { _state.targetMode = 'customer'; _render(); });
    if (modeCtry) modeCtry.addEventListener('click', function() { _state.targetMode = 'country';  _render(); });

    // Customer selector
    var custSel = document.getElementById('settings-customer-select');
    var yearSel = document.getElementById('settings-year-select');
    var ctrySel = document.getElementById('settings-country-select');

    if (custSel) custSel.addEventListener('change', function() {
      _state.selectedCustomerId = custSel.value;
      _refreshGrid();
    });
    if (ctrySel) ctrySel.addEventListener('change', function() {
      _state.selectedCountry = ctrySel.value;
      _refreshGrid();
    });
    if (yearSel) yearSel.addEventListener('change', function() {
      _state.selectedYear = parseInt(yearSel.value);
      _refreshGrid();
    });

    // Bind target grid
    var grid = document.getElementById('settings-target-grid');
    if (grid) TargetManager.bindGridEvents(grid);

    // Products
    var productTable = document.getElementById('settings-product-table');
    if (productTable) ProductManager.bindSettingsEvents(productTable);

    var customerTable = document.getElementById('settings-customer-table');
    if (customerTable) CustomerManager.bindSettingsEvents(customerTable);

    // Add product
    var addProdBtn  = document.getElementById('settings-add-product-btn');
    var addProdForm = document.getElementById('settings-add-product-form');
    if (addProdBtn) addProdBtn.addEventListener('click', function() {
      addProdForm.style.display = 'block';
      document.getElementById('settings-new-product-name').focus();
    });
    var cancelProd = document.getElementById('settings-cancel-product-btn');
    if (cancelProd) cancelProd.addEventListener('click', function() { addProdForm.style.display = 'none'; });
    var saveProd = document.getElementById('settings-save-product-btn');
    if (saveProd) saveProd.addEventListener('click', async function() {
      var name  = (document.getElementById('settings-new-product-name')  || {}).value || '';
      var price = parseNum((document.getElementById('settings-new-product-price') || {}).value);
      var ratio = parseNum((document.getElementById('settings-new-product-ratio') || {}).value);
      if (!name.trim()) { showToast('Ürün adı boş olamaz'); return; }
      if (!price || price < 0.01) { showToast('Geçerli bir fiyat girin'); return; }
      var ok = await ProductManager.upsert({ name: name.trim(), avg_price_eur: price, container_ratio: ratio, active: true });
      if (ok) { showToast('Ürün eklendi'); _state.products = ProductManager.getAll(); _render(); }
    });

    // Excel import button
    var importCustBtn = document.getElementById('settings-import-customers-btn');
    if (importCustBtn) importCustBtn.addEventListener('click', function() { _openImportModal(); });

    // Add customer
    var addCustBtn  = document.getElementById('settings-add-customer-btn');
    var addCustForm = document.getElementById('settings-add-customer-form');
    if (addCustBtn) addCustBtn.addEventListener('click', function() {
      addCustForm.style.display = 'block';
      var nameInp = document.getElementById('settings-new-customer-name');
      if (nameInp) {
        nameInp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function() { nameInp.focus(); }, 300);
      }
    });
    var cancelCust = document.getElementById('settings-cancel-customer-btn');
    if (cancelCust) cancelCust.addEventListener('click', function() { addCustForm.style.display = 'none'; });
    var saveCust = document.getElementById('settings-save-customer-btn');
    if (saveCust) saveCust.addEventListener('click', async function() {
      var name = (document.getElementById('settings-new-customer-name') || {}).value || '';
      if (!name.trim()) { showToast('Müşteri adı boş olamaz'); return; }
      var ok = await CustomerManager.upsert({ name: name.trim(), active: true });
      if (ok) { showToast('Müşteri eklendi'); _state.customers = CustomerManager.getAll(); _render(); }
    });

    // Müşteri arama
    var custSearch = document.getElementById('settings-customer-search');
    if (custSearch) {
      custSearch.addEventListener('input', function() {
        var q = custSearch.value.toLowerCase().trim();
        document.querySelectorAll('#settings-customer-tbody .settings-cust-row').forEach(function(row) {
          var name = row.getAttribute('data-cust-name') || '';
          row.style.display = name.startsWith(q) ? '' : 'none';
        });
      });
    }

    // Inline ülke ekleme butonu
    document.querySelectorAll('.cc-add-inline-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var form = document.getElementById('settings-add-cc-inline-form');
        var nameEl = document.getElementById('settings-cc-inline-cust-name');
        var idEl = document.getElementById('settings-cc-inline-cust-id');
        var countryEl = document.getElementById('settings-cc-inline-country');
        if (nameEl) nameEl.textContent = btn.getAttribute('data-cust-name') + ' — Ülke:';
        if (idEl) idEl.value = btn.getAttribute('data-cust-id');
        if (countryEl) { countryEl.value = ''; }
        if (form) { form.style.display = 'block'; if (countryEl) countryEl.focus(); }
      });
    });
    var cancelCCInline = document.getElementById('settings-cc-inline-cancel');
    if (cancelCCInline) cancelCCInline.addEventListener('click', function() {
      document.getElementById('settings-add-cc-inline-form').style.display = 'none';
    });
    var saveCCInline = document.getElementById('settings-cc-inline-save');
    if (saveCCInline) saveCCInline.addEventListener('click', async function() {
      var custId  = (document.getElementById('settings-cc-inline-cust-id') || {}).value || '';
      var country = ((document.getElementById('settings-cc-inline-country') || {}).value || '').trim().toUpperCase();
      if (!custId || !country) { showToast('Ülke boş olamaz'); return; }
      var exists = (_state.customerCountries || []).some(function(cc){ return cc.customer_id===custId && cc.country===country.toUpperCase().trim(); });
      if (exists) { showToast('Bu ülke zaten tanımlı'); return; }
      var ok = await dbAddCustomerCountry(custId, country);
      if (ok) { showToast('Ülke eklendi'); document.getElementById('settings-add-cc-inline-form').style.display = 'none'; await _loadAll(); _render(); emitDataChange('customer_countries', {}); }
      else showToast('Bu ülke zaten var veya eklenemedi');
    });
    // Ülke sil butonu
    document.querySelectorAll('.cc-del-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var custId  = btn.getAttribute('data-del-cust');
        var country = btn.getAttribute('data-del-country');
        var ok = await dbDeleteCustomerCountry(custId, country);
        if (ok) { showToast('Ülke silindi'); await _loadAll(); _render(); emitDataChange('customer_countries', {}); }
        else showToast('Silinemedi');
      });
    });

    // Profile links copy
    document.querySelectorAll('.settings-profile-link').forEach(function(el) {
      el.addEventListener('click', function() {
        var link = el.getAttribute('data-link');
        if (link && navigator.clipboard) {
          navigator.clipboard.writeText(link).then(function() { showToast('Link kopyalandı'); });
        }
      });
    });

    // Add profile
    var addProfileBtn = document.getElementById('settings-add-profile-btn');
    if (addProfileBtn) addProfileBtn.addEventListener('click', async function() {
      var name   = (document.getElementById('settings-new-profile-name')   || {}).value || '';
      var region = (document.getElementById('settings-new-profile-region') || {}).value || '';
      if (!name.trim()) { showToast('Profil adı boş olamaz'); return; }
      var profile = await dbCreateProfile(name.trim(), region.trim());
      if (profile) { showToast('Profil oluşturuldu'); _state.profiles = await dbGetProfiles(); _render(); }
    });

    // Month close
    var expBtn = document.getElementById('settings-export-before-close');
    if (expBtn) expBtn.addEventListener('click', async function() {
      var orders = await dbGetOrders();
      exportOrdersToExcel(orders, _state.products, _state.customers);
    });
    _bindConfirm('settings-month-close-btn', 'month');
    _bindConfirm('settings-soft-reset-btn',  'soft');
    _bindConfirm('settings-hard-reset-btn',  'hard');

    var monthFinal = document.getElementById('settings-month-close-final');
    if (monthFinal) monthFinal.addEventListener('click', async function() {
      if (await dbSoftReset()) { showToast('Ay kapatıldı.'); _state.confirmMode = null; emitDataChange('orders', {}); _render(); }
    });
    var softFinal = document.getElementById('settings-soft-reset-final');
    if (softFinal) softFinal.addEventListener('click', async function() {
      if (await dbSoftReset()) { showToast('Veriler sıfırlandı'); _state.confirmMode = null; emitDataChange('orders', {}); _render(); }
    });
    var hardFinal = document.getElementById('settings-hard-reset-final');
    if (hardFinal) hardFinal.addEventListener('click', async function() {
      if (await dbHardReset()) { showToast('Her şey sıfırlandı'); _state.confirmMode = null; emitDataChange('orders', {}); _render(); }
    });

    ['settings-month-close-cancel','settings-soft-reset-cancel','settings-hard-reset-cancel'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function() { _state.confirmMode = null; _render(); });
    });
  }

  function _bindConfirm(btnId, mode) {
    var btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', function() { _state.confirmMode = mode; _render(); });
  }

  function _refreshGrid() {
    var grid = document.getElementById('settings-target-grid');
    if (!grid) return;
    var html = '';
    if (_state.targetMode === 'customer' && _state.selectedCustomerId) {
      html = TargetManager.buildCustomerGridHTML(_state.selectedCustomerId, _state.selectedYear, _state.products);
    } else if (_state.targetMode === 'country' && _state.selectedCountry) {
      html = TargetManager.buildCountryGridHTML(_state.selectedCountry, _state.selectedYear, _state.products);
    }
    grid.innerHTML = html;
    TargetManager.bindGridEvents(grid);
  }

  function _bindGlobalEvents() {
    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'settings') _loadAll().then(_render);
    });
    document.addEventListener('nsdata:dataChanged', function(e) {
      var affected = ['products','customers','targets','profiles'];
      if (affected.includes(e.detail.table) && document.getElementById('screen-settings').classList.contains('active')) {
        _loadAll().then(_render);
      }
    });
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ============================================================
     EXCEL MUSTERI IMPORT
     ============================================================ */

  function _openImportModal() {
    var existing = document.getElementById('cust-import-modal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'cust-import-modal';
    modal.innerHTML = '<div id="cust-import-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px"><div style="background:#fff;border-radius:12px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,0.2)"><div style="padding:20px 24px;border-bottom:1px solid #E2E5EF;display:flex;align-items:center;justify-content:space-between"><span style="font-size:17px;font-weight:700">Excelden Musteri Yukle</span><button id="cust-import-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#4A5068">x</button></div><div id="cust-import-body" style="padding:20px 24px"><div id="cust-import-step1"><p style="font-size:13px;color:#4A5068;margin:0 0 12px">Excel dosyanizda musteri adi ve ulke sutunlari olmalidir. Baslik otomatik tespit edilir.</p><div style="border:2px dashed #CBD5E1;border-radius:8px;padding:24px;text-align:center;cursor:pointer" id="cust-import-dropzone"><div style="font-size:32px;margin-bottom:8px">📂</div><div style="font-size:14px;font-weight:600;color:#0F1117">Dosya secin veya surukleyin</div><div style="font-size:12px;color:#4A5068;margin-top:4px">.xlsx veya .xls, max 5MB</div><input type="file" id="cust-import-file" accept=".xlsx,.xls" style="display:none"></div></div><div id="cust-import-step2" style="display:none"><div id="cust-import-sheet-wrap" style="margin-bottom:16px;display:none"><label style="font-size:13px;font-weight:600;color:#0F1117;display:block;margin-bottom:6px">Sheet secin:</label><select id="cust-import-sheet-sel" style="width:100%;height:40px;font-size:14px;padding:0 10px;border:1.5px solid #E2E5EF;border-radius:6px;box-sizing:border-box"></select></div><div id="cust-import-preview-wrap"></div><div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end"><button id="cust-import-back" class="btn btn-secondary">Geri</button><button id="cust-import-confirm" class="btn btn-primary" style="display:none">Onayla ve Yukle</button></div></div><div id="cust-import-step3" style="display:none;text-align:center;padding:20px"><div style="font-size:32px;margin-bottom:12px">⏳</div><div id="cust-import-progress" style="font-size:14px;font-weight:600">Yukleniyor...</div></div><div id="cust-import-step4" style="display:none"><div id="cust-import-result"></div><div style="text-align:right;margin-top:16px"><button id="cust-import-done" class="btn btn-primary">Tamam</button></div></div></div></div></div>';
    document.body.appendChild(modal);
    _bindImportModal();
  }

  function _bindImportModal() {
    var workbook = null;
    var preview = null;

    document.getElementById('cust-import-close').onclick = _closeImportModal;
    document.getElementById('cust-import-overlay').onclick = function(e) {
      if (e.target === document.getElementById('cust-import-overlay')) _closeImportModal();
    };

    var dropzone = document.getElementById('cust-import-dropzone');
    var fileInput = document.getElementById('cust-import-file');
    dropzone.onclick = function() { fileInput.click(); };
    dropzone.ondragover = function(e) { e.preventDefault(); dropzone.style.borderColor = '#4F46E5'; };
    dropzone.ondragleave = function() { dropzone.style.borderColor = '#CBD5E1'; };
    dropzone.ondrop = function(e) {
      e.preventDefault();
      dropzone.style.borderColor = '#CBD5E1';
      var file = e.dataTransfer.files[0];
      if (file) _handleFile(file);
    };
    fileInput.onchange = function() { if (fileInput.files[0]) _handleFile(fileInput.files[0]); };
    document.getElementById('cust-import-back').onclick = function() {
      document.getElementById('cust-import-step2').style.display = 'none';
      document.getElementById('cust-import-step1').style.display = '';
      workbook = null; preview = null;
    };
    document.getElementById('cust-import-sheet-sel').onchange = function() {
      if (workbook) _parseSheet(workbook, this.value);
    };
    document.getElementById('cust-import-confirm').onclick = function() {
      if (preview) _doImport(preview);
    };
    document.getElementById('cust-import-done').onclick = _closeImportModal;

    function _handleFile(file) {
      if (file.size > 5 * 1024 * 1024) { showToast('Dosya 5MB dan buyuk olamaz'); return; }
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var sheets = workbook.SheetNames;
          document.getElementById('cust-import-step1').style.display = 'none';
          document.getElementById('cust-import-step2').style.display = '';
          var sheetWrap = document.getElementById('cust-import-sheet-wrap');
          var sheetSel = document.getElementById('cust-import-sheet-sel');
          if (sheets.length > 1) {
            sheetWrap.style.display = '';
            sheetSel.innerHTML = sheets.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
          } else { sheetWrap.style.display = 'none'; }
          _parseSheet(workbook, sheets[0]);
        } catch(err) { showToast('Dosya okunamadi. Gecerli bir Excel dosyasi secin.'); }
      };
      reader.readAsArrayBuffer(file);
    }

    function _parseSheet(wb, sheetName) {
      var sheet = wb.Sheets[sheetName];
      var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      var custCol = -1, countryCol = -1, dataStart = 0;
      var CUST_KW = ['musteri', 'customer', 'client', 'nom', 'name', 'isim', 'ad'];
      var CTR_KW = ['ulke', 'country', 'pays', 'pais', 'land', 'paese'];
      for (var ri = 0; ri < Math.min(rows.length, 5); ri++) {
        var row = rows[ri];
        if (!row) continue;
        for (var ci = 0; ci < row.length; ci++) {
          var cell = String(row[ci] || '').toLowerCase().trim();
          if (custCol === -1 && CUST_KW.some(function(k){ return cell.includes(k); })) custCol = ci;
          if (countryCol === -1 && CTR_KW.some(function(k){ return cell.includes(k); })) countryCol = ci;
        }
        if (custCol !== -1 && countryCol !== -1) { dataStart = ri + 1; break; }
      }
      if (custCol === -1) custCol = 0;
      if (countryCol === -1) countryCol = 1;

      var VALID_CHARS = /^[A-Za-z\u00c7\u00e7\u011e\u011f\u0130\u0131\u00d6\u00f6\u015e\u015f\u00dc\u00fc\s\-\.\'&]+$/;
      var existingNames = {};
      (_state.customers || []).forEach(function(c) { existingNames[_importNormName(c.name)] = c; });
      var existingCC = {};
      (_state.customerCountries || []).forEach(function(cc) { existingCC[cc.customer_id + '|' + cc.country] = true; });

      var toAdd = [], toSkip = [], warnings = [];
      var seenInFile = {};

      for (var r = dataStart; r < rows.length; r++) {
        var row = rows[r];
        if (!row) continue;
        var rawName = String(row[custCol] || '').trim();
        var rawCountry = String(row[countryCol] || '').trim();
        if (!rawName || rawName === 'null') { toSkip.push({ row: r+1, name: rawName, reason: 'Bos musteri adi' }); continue; }
        if (!rawCountry || rawCountry === 'null') { toSkip.push({ row: r+1, name: rawName, reason: 'Bos ulke' }); continue; }
        if (rawName.length < 3) { toSkip.push({ row: r+1, name: rawName, reason: 'Ad cok kisa (min 3 karakter)' }); continue; }
        if (!VALID_CHARS.test(rawName)) { toSkip.push({ row: r+1, name: rawName, reason: 'Gecersiz karakter' }); continue; }
        var normCountry = (typeof CountryNormalizer !== 'undefined') ? CountryNormalizer.normalize(rawCountry) : null;
        if (!normCountry) { toSkip.push({ row: r+1, name: rawName, reason: 'Bilinmeyen ulke: ' + rawCountry }); warnings.push({ row: r+1, name: rawName, country: rawCountry }); continue; }
        var normName = _importNormName(rawName);
        if (seenInFile[normName + '|' + normCountry]) { toSkip.push({ row: r+1, name: rawName, reason: 'Dosyada tekrar' }); continue; }
        seenInFile[normName + '|' + normCountry] = true;
        var existingCust = existingNames[normName];
        if (existingCust) {
          var ccKey = existingCust.id + '|' + normCountry;
          if (existingCC[ccKey]) { toSkip.push({ row: r+1, name: rawName, reason: 'Zaten mevcut (' + normCountry + ')' }); continue; }
          toAdd.push({ name: existingCust.name, country: normCountry, existingId: existingCust.id, isNewCustomer: false });
          continue;
        }
        var similar = _findSimilar(normName, Object.keys(existingNames));
        if (similar) {
          toSkip.push({ row: r+1, name: rawName, reason: 'Benzer musteri var: ' + existingNames[similar].name });
          warnings.push({ row: r+1, name: rawName, similar: existingNames[similar].name });
          continue;
        }
        toAdd.push({ name: rawName.toUpperCase(), country: normCountry, isNewCustomer: true });
      }

      preview = { toAdd: toAdd, toSkip: toSkip, warnings: warnings };
      _renderPreview(preview);
    }

    function _renderPreview(p) {
      var wrap = document.getElementById('cust-import-preview-wrap');
      var confirmBtn = document.getElementById('cust-import-confirm');
      var newCusts = p.toAdd.filter(function(x){ return x.isNewCustomer; });
      var newCC = p.toAdd.filter(function(x){ return !x.isNewCustomer; });
      var html = '<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:12px 16px;margin-bottom:12px">';
      html += '<div style="font-weight:700;font-size:14px;color:#16A34A;margin-bottom:6px">Eklenecekler (' + p.toAdd.length + ')</div>';
      if (newCusts.length) html += '<div style="font-size:12px;color:#166534;margin-bottom:4px"><b>' + newCusts.length + ' yeni musteri:</b> ' + newCusts.map(function(x){ return x.name + ' (' + x.country + ')'; }).join(', ') + '</div>';
      if (newCC.length) html += '<div style="font-size:12px;color:#166534"><b>' + newCC.length + ' mevcut musteriye yeni ulke:</b> ' + newCC.map(function(x){ return x.name + ' - ' + x.country; }).join(', ') + '</div>';
      if (!p.toAdd.length) html += '<div style="font-size:12px;color:#166534">Eklenecek yeni kayit yok</div>';
      html += '</div>';
      if (p.toSkip.length) {
        html += '<div style="background:#FEF9C3;border:1px solid #FDE047;border-radius:8px;padding:12px 16px;margin-bottom:12px">';
        html += '<div style="font-weight:700;font-size:14px;color:#854D0E;margin-bottom:6px">Atlanacaklar (' + p.toSkip.length + ')</div>';
        html += '<div style="max-height:120px;overflow-y:auto;font-size:12px;color:#713F12">' + p.toSkip.map(function(x){ return 'Satir ' + x.row + ': ' + (x.name||'') + ' — ' + x.reason; }).join('<br>') + '</div></div>';
      }
      if (p.warnings.length) {
        html += '<div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:12px 16px;margin-bottom:12px">';
        html += '<div style="font-weight:700;font-size:14px;color:#DC2626;margin-bottom:6px">Uyarilar (' + p.warnings.length + ')</div>';
        html += '<div style="font-size:12px;color:#991B1B">' + p.warnings.map(function(x){ return x.similar ? ('Benzer: ' + x.name + ' vs ' + x.similar) : ('Bilinmeyen ulke: ' + x.country + ' (' + x.name + ')'); }).join('<br>') + '</div></div>';
      }
      if (p.toAdd.length > 200) {
        p.toAdd = p.toAdd.slice(0, 200);
        html += '<div style="background:#FEE2E2;border:1px solid #FCA5A5;border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:#DC2626">Max 200 kayit: ilk 200 alinacak.</div>';
      }
      wrap.innerHTML = html;
      confirmBtn.style.display = p.toAdd.length ? '' : 'none';
    }

    async function _doImport(p) {
      document.getElementById('cust-import-step2').style.display = 'none';
      document.getElementById('cust-import-step3').style.display = '';
      var prog = document.getElementById('cust-import-progress');
      prog.textContent = 'Musteriler ekleniyor...';
      var newCusts = p.toAdd.filter(function(x){ return x.isNewCustomer; });
      var insertedCustomers = newCusts.length ? await dbBulkAddCustomers(newCusts.map(function(x){ return x.name; })) : [];
      var nameToId = {};
      insertedCustomers.forEach(function(c){ nameToId[_importNormName(c.name)] = c.id; });
      p.toAdd.filter(function(x){ return !x.isNewCustomer; }).forEach(function(x){ nameToId[_importNormName(x.name)] = x.existingId; });
      prog.textContent = 'Ulkeler ekleniyor...';
      var ccPairs = p.toAdd.map(function(x) {
        var id = x.existingId || nameToId[_importNormName(x.name)];
        return id ? { customer_id: id, country: x.country } : null;
      }).filter(Boolean);
      if (ccPairs.length) await dbBulkAddCustomerCountries(ccPairs);
      await dbLog('BULK_CUSTOMER_IMPORT', 'customers,customer_countries', 'settings', 'added=' + insertedCustomers.length + ' countries=' + ccPairs.length);
      prog.textContent = 'Tamamlandi, veriler yukleniyor...';
      await _loadAll(); _render(); emitDataChange('customers', {});
      document.getElementById('cust-import-step3').style.display = 'none';
      document.getElementById('cust-import-step4').style.display = '';
      document.getElementById('cust-import-result').innerHTML =
        '<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:16px">' +
        '<div style="font-size:16px;font-weight:700;color:#16A34A;margin-bottom:8px">Yukleme Tamamlandi</div>' +
        '<div style="font-size:13px;color:#166534">' +
        '<div>Yeni musteri: <b>' + insertedCustomers.length + '</b></div>' +
        '<div>Ulke ataması: <b>' + ccPairs.length + '</b></div>' +
        '<div>Atlanan: <b>' + p.toSkip.length + '</b></div>' +
        '</div></div>';
    }
  }

  function _closeImportModal() {
    var modal = document.getElementById('cust-import-modal');
    if (modal) modal.remove();
  }

  function _importNormName(str) {
    if (!str) return '';
    return String(str).toLowerCase()
      .replace(/\u011f/g,'g').replace(/\u015f/g,'s').replace(/\u0131/g,'i')
      .replace(/\u00f6/g,'o').replace(/\u00fc/g,'u').replace(/\u00e7/g,'c')
      .replace(/\u011e/g,'g').replace(/\u015e/g,'s').replace(/\u0130/g,'i')
      .replace(/\u00d6/g,'o').replace(/\u00dc/g,'u').replace(/\u00c7/g,'c')
      .replace(/\s+/g,' ').trim();
  }

  function _findSimilar(normName, existingNormNames) {
    function _lev(a, b) {
      var m = a.length, n = b.length, dp = [], i, j;
      for (i = 0; i <= m; i++) { dp[i] = [i]; }
      for (j = 0; j <= n; j++) { dp[0][j] = j; }
      for (i = 1; i <= m; i++) {
        for (j = 1; j <= n; j++) {
          dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
        }
      }
      return dp[m][n];
    }
    var threshold = Math.max(2, Math.floor(normName.length * 0.2));
    for (var i = 0; i < existingNormNames.length; i++) {
      if (existingNormNames[i] !== normName && _lev(normName, existingNormNames[i]) <= threshold) return existingNormNames[i];
    }
    return null;
  }

})();
