/* NSDATA - screen-settings.js */
/* Settings screen — targets, products, customers, month close, profiles */

(function() {
  'use strict';

  var _state = {
    customers: [],
    products: [],
    targets: [],
    profiles: [],
    selectedCustomerId: null,
    selectedYear: new Date().getFullYear(),
    confirmMode: null  // 'soft' | 'hard' | 'month'
  };

  /* ============================================================
     INIT
     ============================================================ */

  document.addEventListener('nsdata:appReady', function() {
    _bindGlobalEvents();
  });

  async function _loadAll() {
    var results = await Promise.all([
      dbGetCustomers(),
      dbGetProducts(),
      dbGetTargets(),
      dbGetProfiles()
    ]);
    _state.customers = results[0];
    _state.products  = results[1];
    _state.targets   = results[2];
    _state.profiles  = results[3];

    if (!_state.selectedCustomerId && _state.customers.length) {
      _state.selectedCustomerId = _state.customers[0].id;
    }
  }

  /* ============================================================
     RENDER
     ============================================================ */

  function _render() {
    var screen = document.getElementById('screen-settings');
    if (!screen) return;
    screen.innerHTML = _buildHTML();
    _bindScreenEvents();
  }

  function _buildHTML() {
    return _buildTargetSection() +
           _buildProductSection() +
           _buildCustomerSection() +
           _buildProfileSection() +
           _buildMonthCloseSection() +
           _buildResetSection();
  }

  /* ============================================================
     TARGET SECTION
     ============================================================ */

  function _buildTargetSection() {
    var customerOptions = _state.customers.map(function(c) {
      var sel = c.id === _state.selectedCustomerId ? 'selected' : '';
      return '<option value="' + c.id + '" ' + sel + '>' + _esc(c.name) + '</option>';
    }).join('');

    var years = [];
    var currentYear = new Date().getFullYear();
    for (var y = currentYear - 1; y <= currentYear + 2; y++) {
      years.push('<option value="' + y + '" ' + (y === _state.selectedYear ? 'selected' : '') + '>' + y + '</option>');
    }

    var gridHTML = '';
    if (_state.selectedCustomerId) {
      var filtered = _state.targets.filter(function(t) {
        return t.customer_id === _state.selectedCustomerId;
      });
      gridHTML = TargetManager.buildAnnualGridHTML(_state.selectedCustomerId, _state.selectedYear);
    }

    return '<div class="settings-section">' +
      '<div class="settings-section-header">' +
        '<span class="settings-section-title">&#x1F3AF; Ayl&#x131;k Hedefler</span>' +
      '</div>' +
      '<div class="settings-section-body">' +
        '<div class="settings-target-select">' +
          '<select id="settings-customer-select" aria-label="M&#xFC;&#x15F;teri sec">' + customerOptions + '</select>' +
          '<select id="settings-year-select" class="settings-year-select" aria-label="Yil sec">' + years.join('') + '</select>' +
        '</div>' +
        '<div class="settings-paste-hint">' +
          '<span>&#x1F4CB;</span>' +
          '&#x130;pucu: Excel\'den kopyaladig&#x131;n&#x131;z verileri (Euro, Adet sutunlar&#x131;) dogrudan tabloya yap&#x131;&#x15F;t&#x131;rabilirsiniz.' +
        '</div>' +
        '<div class="settings-target-grid" id="settings-target-grid">' +
          gridHTML +
        '</div>' +
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
        '<span class="settings-section-title">&#x1F4E6; &#xDC;r&#xFC;nler ve Fiyatlar</span>' +
        '<button class="btn btn-primary" id="settings-add-product-btn">+ &#xDC;r&#xFC;n Ekle</button>' +
      '</div>' +
      '<div class="settings-section-body no-pad" id="settings-product-table">' +
        tableHTML +
      '</div>' +
      '<div class="settings-section-body" id="settings-add-product-form" style="display:none;border-top:1.5px solid var(--color-border)">' +
        '<div style="display:flex;gap:var(--space-3);flex-wrap:wrap">' +
          '<input type="text" id="settings-new-product-name" placeholder="&#xDC;r&#xFC;n adi" style="flex:1;min-width:160px;min-height:48px;font-size:15px" />' +
          '<input type="number" id="settings-new-product-price" placeholder="Fiyat (EUR)" min="0.01" step="0.01" style="width:140px;min-height:48px;font-size:15px;text-align:right" />' +
          '<input type="number" id="settings-new-product-ratio" placeholder="Konteyner katsay&#x131;s&#x131;" min="0" style="width:180px;min-height:48px;font-size:15px;text-align:right" />' +
          '<button class="btn btn-primary" id="settings-save-product-btn">Kaydet</button>' +
          '<button class="btn btn-secondary" id="settings-cancel-product-btn">&#x130;ptal</button>' +
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
        '<span class="settings-section-title">&#x1F465; M&#xFC;&#x15F;teriler</span>' +
        '<button class="btn btn-primary" id="settings-add-customer-btn">+ M&#xFC;&#x15F;teri Ekle</button>' +
      '</div>' +
      '<div class="settings-section-body no-pad" id="settings-customer-table">' +
        tableHTML +
      '</div>' +
      '<div class="settings-section-body" id="settings-add-customer-form" style="display:none;border-top:1.5px solid var(--color-border)">' +
        '<div style="display:flex;gap:var(--space-3);flex-wrap:wrap">' +
          '<input type="text" id="settings-new-customer-name" placeholder="M&#xFC;&#x15F;teri adi" style="flex:1;min-width:200px;min-height:48px;font-size:15px" />' +
          '<input type="text" id="settings-new-customer-country" placeholder="&#xDC;lke" style="width:160px;min-height:48px;font-size:15px" />' +
          '<button class="btn btn-primary" id="settings-save-customer-btn">Kaydet</button>' +
          '<button class="btn btn-secondary" id="settings-cancel-customer-btn">&#x130;ptal</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     PROFILE SECTION
     ============================================================ */

  function _buildProfileSection() {
    var profileRows = _state.profiles.map(function(p) {
      var link = window.location.origin + '/?profile=' + p.link_token;
      return '<div class="settings-profile-row">' +
        '<span class="settings-profile-name">' + _esc(p.name) + '</span>' +
        '<span class="settings-profile-link" title="Kopyalamak icin tiklayin" data-link="' + link + '">' + link + '</span>' +
      '</div>';
    }).join('');

    return '<div class="settings-section">' +
      '<div class="settings-section-header">' +
        '<span class="settings-section-title">&#x1F517; Profiller ve Linkler</span>' +
      '</div>' +
      '<div class="settings-section-body">' +
        '<div class="settings-profile-list">' +
          (profileRows || '<div style="color:var(--color-text-secondary);font-size:14px">Hen&#xFC;z profil yok</div>') +
        '</div>' +
        '<div class="settings-add-profile-form">' +
          '<input type="text" id="settings-new-profile-name" placeholder="Profil adi (ornek: Enes - Fas)" style="min-height:48px;font-size:15px" />' +
          '<input type="text" id="settings-new-profile-region" placeholder="B&#xF6;lge (opsiyonel)" style="width:160px;min-height:48px;font-size:15px" />' +
          '<button class="btn btn-primary" id="settings-add-profile-btn">Profil Olu&#x15F;tur</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     MONTH CLOSE SECTION
     ============================================================ */

  function _buildMonthCloseSection() {
    var confirmHTML = '';
    if (_state.confirmMode === 'month') {
      confirmHTML = '<div class="settings-confirm-box visible">' +
        '<div class="settings-confirm-text">Emin misiniz? Onay vermeden once verileri Excel olarak indirmenizi oneririz.</div>' +
        '<div class="settings-confirm-actions">' +
          '<button class="btn btn-danger" id="settings-month-close-final">Evet, Ay&#x131; Kapat ve Temizle</button>' +
          '<button class="btn btn-secondary" id="settings-month-close-cancel">&#x130;ptal</button>' +
        '</div>' +
      '</div>';
    }

    return '<div class="settings-section">' +
      '<div class="settings-section-header">' +
        '<span class="settings-section-title" style="color:var(--color-negative)">&#x1F4C5; Ay Kapatma</span>' +
      '</div>' +
      '<div class="settings-section-body">' +
        '<div class="settings-month-close-card">' +
          '<div class="settings-month-close-text">' +
            '<div class="settings-month-close-title">Ay&#x131; Kapat</div>' +
            '<div class="settings-month-close-desc">Sipari&#x15F;ler, limitler ve odemeler silinir. M&#xFC;&#x15F;teriler, &#xFC;r&#xFC;nler ve hedefler korunur.</div>' +
          '</div>' +
          '<div style="display:flex;gap:var(--space-3);flex-wrap:wrap">' +
            '<button class="btn btn-secondary" id="settings-export-before-close">&#xD6;nce Excel\'e Indir</button>' +
            '<button class="btn btn-danger" id="settings-month-close-btn">Ay&#x131; Kapat</button>' +
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
        '<div class="settings-confirm-text">Sipari&#x15F;ler, limitler ve odemeler silinecek. M&#xFC;&#x15F;teriler, &#xFC;r&#xFC;nler ve hedefler korunacak. Emin misiniz?</div>' +
        '<div class="settings-confirm-actions">' +
          '<button class="btn btn-danger" id="settings-soft-reset-final">Evet, Sil</button>' +
          '<button class="btn btn-secondary" id="settings-soft-reset-cancel">&#x130;ptal</button>' +
        '</div>' +
      '</div>';
    }
    if (_state.confirmMode === 'hard') {
      confirmHTML = '<div class="settings-confirm-box visible">' +
        '<div class="settings-confirm-text">TUM VERILER silinecek. Bu islem geri alinamaz. Emin misiniz?</div>' +
        '<div class="settings-confirm-actions">' +
          '<button class="btn btn-danger" id="settings-hard-reset-final">Evet, Her &#x15F;eyi sil</button>' +
          '<button class="btn btn-secondary" id="settings-hard-reset-cancel">&#x130;ptal</button>' +
        '</div>' +
      '</div>';
    }

    return '<div class="settings-section">' +
      '<div class="settings-section-header">' +
        '<span class="settings-section-title" style="color:var(--color-negative)">&#x26A0; Sifirla</span>' +
      '</div>' +
      '<div class="settings-section-body" style="display:flex;flex-direction:column;gap:var(--space-4)">' +
        '<div class="settings-reset-row">' +
          '<div class="settings-reset-desc">Siparis, limit ve odeme verilerini sil. M&#xFC;&#x15F;teri, &#xFC;r&#xFC;n ve hedefler kalsin.</div>' +
          '<button class="btn btn-danger" id="settings-soft-reset-btn">Verileri S&#x131;f&#x131;rla</button>' +
        '</div>' +
        '<div class="settings-reset-row">' +
          '<div class="settings-reset-desc">Her &#x15F;eyi sil — tamamen temiz baslangic.</div>' +
          '<button class="btn btn-danger" id="settings-hard-reset-btn">Tamamen S&#x131;f&#x131;rla</button>' +
        '</div>' +
        confirmHTML +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     BIND SCREEN EVENTS
     ============================================================ */

  function _bindScreenEvents() {
    // Target customer/year selector
    var custSelect = document.getElementById('settings-customer-select');
    var yearSelect = document.getElementById('settings-year-select');

    if (custSelect) {
      custSelect.addEventListener('change', function() {
        _state.selectedCustomerId = custSelect.value;
        var grid = document.getElementById('settings-target-grid');
        if (grid) grid.innerHTML = TargetManager.buildAnnualGridHTML(_state.selectedCustomerId, _state.selectedYear);
        TargetManager.bindGridEvents(grid);
      });
    }

    if (yearSelect) {
      yearSelect.addEventListener('change', function() {
        _state.selectedYear = parseInt(yearSelect.value);
        var grid = document.getElementById('settings-target-grid');
        if (grid) grid.innerHTML = TargetManager.buildAnnualGridHTML(_state.selectedCustomerId, _state.selectedYear);
        TargetManager.bindGridEvents(grid);
      });
    }

    // Target grid events
    var targetGrid = document.getElementById('settings-target-grid');
    if (targetGrid) TargetManager.bindGridEvents(targetGrid);

    // Product table events
    var productTable = document.getElementById('settings-product-table');
    if (productTable) ProductManager.bindSettingsEvents(productTable);

    // Customer table events
    var customerTable = document.getElementById('settings-customer-table');
    if (customerTable) CustomerManager.bindSettingsEvents(customerTable);

    // Add product
    var addProductBtn    = document.getElementById('settings-add-product-btn');
    var addProductForm   = document.getElementById('settings-add-product-form');
    var saveProductBtn   = document.getElementById('settings-save-product-btn');
    var cancelProductBtn = document.getElementById('settings-cancel-product-btn');

    if (addProductBtn && addProductForm) {
      addProductBtn.addEventListener('click', function() {
        addProductForm.style.display = 'block';
        var nameInput = document.getElementById('settings-new-product-name');
        if (nameInput) nameInput.focus();
      });
    }

    if (cancelProductBtn && addProductForm) {
      cancelProductBtn.addEventListener('click', function() { addProductForm.style.display = 'none'; });
    }

    if (saveProductBtn) {
      saveProductBtn.addEventListener('click', async function() {
        var name  = (document.getElementById('settings-new-product-name')  || {}).value || '';
        var price = parseNum((document.getElementById('settings-new-product-price') || {}).value);
        var ratio = parseNum((document.getElementById('settings-new-product-ratio') || {}).value);

        if (!name.trim()) { showToast('&#xDC;r&#xFC;n adi bos olamaz'); return; }
        if (!price || price < 0.01) { showToast('Ge&#xE7;erli bir fiyat girin'); return; }

        var ok = await ProductManager.upsert({ name: name.trim(), avg_price_eur: price, container_ratio: ratio, active: true });
        if (ok) {
          showToast('&#xDC;r&#xFC;n eklendi');
          _state.products = ProductManager.getAll();
          _render();
        }
      });
    }

    // Add customer
    var addCustomerBtn    = document.getElementById('settings-add-customer-btn');
    var addCustomerForm   = document.getElementById('settings-add-customer-form');
    var saveCustomerBtn   = document.getElementById('settings-save-customer-btn');
    var cancelCustomerBtn = document.getElementById('settings-cancel-customer-btn');

    if (addCustomerBtn && addCustomerForm) {
      addCustomerBtn.addEventListener('click', function() {
        addCustomerForm.style.display = 'block';
        var nameInput = document.getElementById('settings-new-customer-name');
        if (nameInput) nameInput.focus();
      });
    }

    if (cancelCustomerBtn && addCustomerForm) {
      cancelCustomerBtn.addEventListener('click', function() { addCustomerForm.style.display = 'none'; });
    }

    if (saveCustomerBtn) {
      saveCustomerBtn.addEventListener('click', async function() {
        var name    = (document.getElementById('settings-new-customer-name')    || {}).value || '';
        var country = (document.getElementById('settings-new-customer-country') || {}).value || '';

        if (!name.trim()) { showToast('M&#xFC;&#x15F;teri adi bos olamaz'); return; }

        var ok = await CustomerManager.upsert({ name: name.trim(), country: country.trim(), active: true });
        if (ok) {
          showToast('M&#xFC;&#x15F;teri eklendi');
          _state.customers = CustomerManager.getAll();
          _render();
        }
      });
    }

    // Profile copy links
    document.querySelectorAll('.settings-profile-link').forEach(function(el) {
      el.addEventListener('click', function() {
        var link = el.getAttribute('data-link');
        if (link && navigator.clipboard) {
          navigator.clipboard.writeText(link).then(function() { showToast('Link kopyaland&#x131;'); });
        }
      });
    });

    // Add profile
    var addProfileBtn = document.getElementById('settings-add-profile-btn');
    if (addProfileBtn) {
      addProfileBtn.addEventListener('click', async function() {
        var name   = (document.getElementById('settings-new-profile-name')   || {}).value || '';
        var region = (document.getElementById('settings-new-profile-region') || {}).value || '';
        if (!name.trim()) { showToast('Profil ad&#x131; bo&#x15F; olamaz'); return; }
        var profile = await dbCreateProfile(name.trim(), region.trim());
        if (profile) {
          showToast('Profil olu&#x15F;turuldu');
          _state.profiles = await dbGetProfiles();
          _render();
        }
      });
    }

    // Month close
    var exportBeforeClose = document.getElementById('settings-export-before-close');
    var monthCloseBtn     = document.getElementById('settings-month-close-btn');
    var monthCloseFinal   = document.getElementById('settings-month-close-final');
    var monthCloseCancel  = document.getElementById('settings-month-close-cancel');

    if (exportBeforeClose) {
      exportBeforeClose.addEventListener('click', async function() {
        var orders    = await dbGetOrders();
        var products  = _state.products;
        var customers = _state.customers;
        exportOrdersToExcel(orders, products, customers);
      });
    }

    if (monthCloseBtn) {
      monthCloseBtn.addEventListener('click', function() {
        _state.confirmMode = 'month';
        _render();
      });
    }

    if (monthCloseFinal) {
      monthCloseFinal.addEventListener('click', async function() {
        var ok = await dbSoftReset();
        if (ok) {
          showToast('Ay kapat&#x131;ld&#x131;. Veriler temizlendi.');
          _state.confirmMode = null;
          emitDataChange('orders', {});
          _render();
        }
      });
    }

    if (monthCloseCancel) {
      monthCloseCancel.addEventListener('click', function() {
        _state.confirmMode = null;
        _render();
      });
    }

    // Soft reset
    var softResetBtn    = document.getElementById('settings-soft-reset-btn');
    var softResetFinal  = document.getElementById('settings-soft-reset-final');
    var softResetCancel = document.getElementById('settings-soft-reset-cancel');

    if (softResetBtn) {
      softResetBtn.addEventListener('click', function() {
        _state.confirmMode = 'soft';
        _render();
      });
    }

    if (softResetFinal) {
      softResetFinal.addEventListener('click', async function() {
        var ok = await dbSoftReset();
        if (ok) {
          showToast('Veriler s&#x131;f&#x131;rland&#x131;');
          _state.confirmMode = null;
          emitDataChange('orders', {});
          _render();
        }
      });
    }

    if (softResetCancel) {
      softResetCancel.addEventListener('click', function() {
        _state.confirmMode = null;
        _render();
      });
    }

    // Hard reset
    var hardResetBtn    = document.getElementById('settings-hard-reset-btn');
    var hardResetFinal  = document.getElementById('settings-hard-reset-final');
    var hardResetCancel = document.getElementById('settings-hard-reset-cancel');

    if (hardResetBtn) {
      hardResetBtn.addEventListener('click', function() {
        _state.confirmMode = 'hard';
        _render();
      });
    }

    if (hardResetFinal) {
      hardResetFinal.addEventListener('click', async function() {
        var ok = await dbHardReset();
        if (ok) {
          showToast('Her &#x15F;ey s&#x131;f&#x131;rland&#x131;');
          _state.confirmMode = null;
          emitDataChange('orders', {});
          _render();
        }
      });
    }

    if (hardResetCancel) {
      hardResetCancel.addEventListener('click', function() {
        _state.confirmMode = null;
        _render();
      });
    }
  }

  /* ============================================================
     GLOBAL EVENTS
     ============================================================ */

  function _bindGlobalEvents() {
    document.addEventListener('nsdata:screenActivated', function(e) {
      if (e.detail.screen === 'settings') {
        _loadAll().then(_render);
      }
    });

    document.addEventListener('nsdata:dataChanged', function(e) {
      var affected = ['products', 'customers', 'targets', 'profiles'];
      if (affected.includes(e.detail.table)) {
        if (document.getElementById('screen-settings').classList.contains('active')) {
          _loadAll().then(_render);
        }
      }
    });
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
