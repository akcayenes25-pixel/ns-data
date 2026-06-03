/* NSDATA - screen-settings.js */
(function() {
  'use strict';

  var _state = {
    customers: [], products: [], targets: [], profiles: [],
    targetMode: 'customer',      // 'customer' | 'country'
    selectedCustomerId: null,
    selectedCountry: null,
    selectedYear: new Date().getFullYear(),
    confirmMode: null
  };

  document.addEventListener('nsdata:appReady', function() { _bindGlobalEvents(); });

  async function _loadAll() {
    var results = await Promise.all([dbGetCustomers(), dbGetProducts(), dbGetTargets(), dbGetProfiles()]);
    _state.customers = results[0];
    _state.products  = results[1];
    TargetManager.load();
    _state.profiles  = results[3];

    if (!_state.selectedCustomerId && _state.customers.length) {
      _state.selectedCustomerId = _state.customers.filter(function(c){ return c.active !== false; })[0]?.id || _state.customers[0].id;
    }
    // Collect unique countries
    var countries = [];
    _state.customers.forEach(function(c) {
      if (c.country && !countries.includes(c.country)) countries.push(c.country);
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
      '<div class="settings-section-header"><span class="settings-section-title">🎯 Aylık Hedefler</span></div>' +
      '<div class="settings-section-body">' + tabs + selector +
        '<div id="settings-target-grid">' + grid + '</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     PRODUCT SECTION
     ============================================================ */
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
    var tableHTML = CustomerManager.buildSettingsHTML(_state.customers);
    return '<div class="settings-section">' +
      '<div class="settings-section-header">' +
        '<span class="settings-section-title">👥 Müşteriler</span>' +
        '<button class="btn btn-primary" id="settings-add-customer-btn">+ Müşteri Ekle</button>' +
      '</div>' +
      '<div class="settings-section-body no-pad" id="settings-customer-table">' + tableHTML + '</div>' +
      '<div class="settings-section-body" id="settings-add-customer-form" style="display:none;border-top:1.5px solid var(--color-border)">' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          '<input type="text" id="settings-new-customer-name" placeholder="Müşteri adı" style="flex:1;min-width:200px;min-height:44px;font-size:15px" />' +
          '<input type="text" id="settings-new-customer-country" placeholder="Ülke" style="width:150px;min-height:44px;font-size:15px" />' +
          '<input type="text" id="settings-new-customer-submarket" placeholder="Alt pazar (opsiyonel)" style="width:190px;min-height:44px;font-size:15px" />' +
          '<button class="btn btn-primary" id="settings-save-customer-btn">Kaydet</button>' +
          '<button class="btn btn-secondary" id="settings-cancel-customer-btn">İptal</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

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

    // Add customer
    var addCustBtn  = document.getElementById('settings-add-customer-btn');
    var addCustForm = document.getElementById('settings-add-customer-form');
    if (addCustBtn) addCustBtn.addEventListener('click', function() {
      addCustForm.style.display = 'block';
      document.getElementById('settings-new-customer-name').focus();
    });
    var cancelCust = document.getElementById('settings-cancel-customer-btn');
    if (cancelCust) cancelCust.addEventListener('click', function() { addCustForm.style.display = 'none'; });
    var saveCust = document.getElementById('settings-save-customer-btn');
    if (saveCust) saveCust.addEventListener('click', async function() {
      var name       = (document.getElementById('settings-new-customer-name')       || {}).value || '';
      var country    = (document.getElementById('settings-new-customer-country')    || {}).value || '';
      var submarket  = (document.getElementById('settings-new-customer-submarket')  || {}).value || '';
      if (!name.trim()) { showToast('Müşteri adı boş olamaz'); return; }
      var ok = await CustomerManager.upsert({ name: name.trim(), country: country.trim(), sub_market: submarket.trim() || null, active: true });
      if (ok) { showToast('Müşteri eklendi'); _state.customers = CustomerManager.getAll(); _render(); }
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
})();
