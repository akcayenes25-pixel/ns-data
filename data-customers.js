/* NSDATA - data-customers.js */
/* Customer management — sub_market desteği ile */

var CustomerManager = (function() {
  'use strict';

  var _customers = [];

  async function load() {
    _customers = await dbGetCustomers();
    return _customers;
  }

  async function upsert(customer) {
    if (!customer.name || !customer.name.trim()) {
      showToast('Müşteri adı boş olamaz');
      return false;
    }
    var ok = await dbUpsertCustomer(customer);
    if (ok) {
      _customers = await dbGetCustomers();
      emitDataChange('customers', {});
    }
    return ok;
  }

  async function setActive(customerId, active) {
    var ok = await dbSetCustomerActive(customerId, active);
    if (ok) {
      _customers = await dbGetCustomers();
      emitDataChange('customers', {});
    }
    return ok;
  }

  function getAll() { return _customers; }
  function getActive() { return _customers.filter(function(c) { return c.active !== false; }); }

  function displayName(customer) {
    if (!customer) return '';
    return customer.name;
  }

  function buildSettingsHTML(customers) {
    if (!customers.length) {
      return '<div style="padding:24px;color:#4A5068;font-size:14px">Henüz müşteri yok.</div>';
    }

    var rows = customers.map(function(c) {
      var nameDisplay = _esc(displayName(c));
      return '<tr style="' + (c.active === false ? 'opacity:0.5' : '') + '">' +
        '<td style="font-weight:600;padding:10px 16px;font-size:15px">' + nameDisplay + '</td>' +

        '<td style="padding:10px 16px">' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;min-height:44px">' +
            '<input type="checkbox" class="customer-active-cb" data-customer-id="' + c.id + '" ' +
              (c.active !== false ? 'checked' : '') + ' style="width:18px;height:18px" />' +
            '<span style="font-size:14px">' + (c.active !== false ? 'Aktif' : 'Pasif') + '</span>' +
          '</label>' +
        '</td>' +
        '<td style="padding:8px 12px">' +
          '<button class="customer-delete-btn" data-customer-id="' + c.id + '" style="color:#DC2626;font-size:13px;font-weight:600;padding:4px 10px;border:1.5px solid #DC2626;border-radius:4px;cursor:pointer;background:transparent">Sil</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<table style="width:100%;border-collapse:collapse;font-size:15px">' +
      '<thead><tr style="background:#F1F3F9">' +
        '<th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:700;color:#4A5068;letter-spacing:0.4px">MÜŞTERİ</th>' +
        '<th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:700;color:#4A5068;letter-spacing:0.4px">DURUM</th>' +
        '<th style="padding:10px 16px"></th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  }

  function bindSettingsEvents(container) {
    if (!container) return;
    container.querySelectorAll('.customer-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { deleteCustomer(btn.getAttribute('data-customer-id')); });
    });
    container.querySelectorAll('.customer-active-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        setActive(cb.getAttribute('data-customer-id'), cb.checked);
      });
    });
  }


  async function deleteCustomer(customerId) {
    if (!confirm('Bu müşteriyi silmek istediğinizden emin misiniz? İlgili tüm sipariş ve limitler de silinecek.')) return false;
    var ok = await dbDeleteCustomer(customerId);
    if (ok) {
      _customers = await dbGetCustomers();
      emitDataChange('customers', {});
      showToast('Müşteri silindi');
    }
    return ok;
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load, upsert, setActive, deleteCustomer, getAll, getActive, displayName, buildSettingsHTML, bindSettingsEvents };
})();
