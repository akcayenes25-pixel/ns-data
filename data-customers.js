/* NSDATA - data-customers.js */
/* Customer definition management — add, edit, active/passive toggle */

var CustomerManager = (function() {
  'use strict';

  var _customers = [];

  async function load() {
    _customers = await dbGetCustomers();
    return _customers;
  }

  async function upsert(customer) {
    if (!customer.name || !customer.name.trim()) {
      showToast('Musteri adi bos olamaz');
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

  function getActive() {
    return _customers.filter(function(c) { return c.active !== false; });
  }

  function buildSettingsHTML(customers) {
    var rows = customers.map(function(c) {
      return '<tr style="' + (c.active === false ? 'opacity:0.5' : '') + '">' +
        '<td style="font-weight:600;padding:12px 16px">' + _esc(c.name) + '</td>' +
        '<td style="padding:12px 16px;color:#4A5068">' + _esc(c.country || '—') + '</td>' +
        '<td style="padding:12px 16px">' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;min-height:48px">' +
            '<input type="checkbox" class="customer-active-cb" data-customer-id="' + c.id + '" ' +
              (c.active !== false ? 'checked' : '') + ' style="width:20px;height:20px" />' +
            (c.active !== false ? 'Aktif' : 'Pasif') +
          '</label>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<table style="width:100%;border-collapse:collapse;font-size:15px">' +
      '<thead><tr style="background:#F1F3F9">' +
        '<th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">Musteri</th>' +
        '<th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">Ulke</th>' +
        '<th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">Durum</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  }

  function bindSettingsEvents(container) {
    if (!container) return;
    container.querySelectorAll('.customer-active-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = cb.getAttribute('data-customer-id');
        setActive(id, cb.checked);
      });
    });
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load: load, upsert: upsert, setActive: setActive, getAll: getAll, getActive: getActive, buildSettingsHTML: buildSettingsHTML, bindSettingsEvents: bindSettingsEvents };
})();
