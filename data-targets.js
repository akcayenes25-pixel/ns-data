/* NSDATA - data-targets.js */
/* Target management — customer×product + country×product scope */

var TargetManager = (function() {
  'use strict';

  var _targets = [];
  var _saveTimer = null;

  var MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

  async function load() {
    _targets = await dbGetTargets();
    return _targets;
  }

  async function upsert(target) {
    var ok = await dbUpsertTargetByKey(target);
    if (ok) {
      _targets = await dbGetTargets();
      emitDataChange('targets', {});
    }
    return ok;
  }

  function getAll() { return _targets; }

  function getForCustomerProduct(customerId, productId, month, year) {
    return _targets.find(function(t) {
      return t.scope === 'customer' &&
             t.customer_id === customerId &&
             t.product_id  === productId &&
             t.month === month && t.year === year;
    }) || null;
  }

  function getForCountryProduct(country, productId, month, year) {
    return _targets.find(function(t) {
      return t.scope === 'country' &&
             t.country === country &&
             t.product_id === productId &&
             t.month === month && t.year === year;
    }) || null;
  }

  // Get all customer targets for a specific month/year, keyed by customer_id+product_id
  function getCustomerTargetMap(month, year) {
    var map = {};
    _targets.filter(function(t) {
      return t.scope === 'customer' && t.month === month && t.year === year;
    }).forEach(function(t) {
      var key = t.customer_id + '__' + t.product_id;
      map[key] = t;
    });
    return map;
  }

  // Get all country targets for a specific month/year, keyed by country+product_id
  function getCountryTargetMap(month, year) {
    var map = {};
    _targets.filter(function(t) {
      return t.scope === 'country' && t.month === month && t.year === year;
    }).forEach(function(t) {
      var key = (t.country || '') + '__' + t.product_id;
      map[key] = t;
    });
    return map;
  }

  /* ============================================================
     SETTINGS UI — Müşteri × Ürün hedef grid
     ============================================================ */
  function buildCustomerGridHTML(customerId, year, products) {
    if (!customerId || !products.length) return '<div style="color:#4A5068;padding:16px">Ürün bulunamadı.</div>';

    var yearTargets = _targets.filter(function(t) {
      return t.scope === 'customer' && t.customer_id === customerId && t.year === year;
    });

    // Header: ay kolonları
    var productCols = products.map(function(p) {
      return '<th colspan="2" style="padding:10px 16px;text-align:center;font-size:12px;font-weight:700;color:#4A5068;border-left:2px solid #E2E5EF;min-width:220px">' +
        _esc(p.name) + '</th>';
    }).join('');

    var subCols = products.map(function() {
      return '<th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:#4A5068;border-left:2px solid #E2E5EF">Euro</th>' +
             '<th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:#4A5068">Adet</th>';
    }).join('');

    var rows = MONTHS_TR.map(function(monthName, idx) {
      var month = idx + 1;
      var cells = products.map(function(p) {
        var t = yearTargets.find(function(x) { return x.product_id === p.id && x.month === month; });
        var eurVal = t ? (t.target_eur || '') : '';
        var qtyVal = t ? (t.target_qty || '') : '';
        var tid    = t ? t.id : '';
        return '<td style="padding:4px 6px;border-left:2px solid #E2E5EF">' +
          '<input type="number" min="0" class="tgt-eur" ' +
            'data-scope="customer" data-customer-id="' + customerId + '" ' +
            'data-product-id="' + p.id + '" data-month="' + month + '" data-year="' + year + '" ' +
            'data-tid="' + tid + '" value="' + eurVal + '" placeholder="—" ' +
            'style="width:110px;text-align:right;font-size:14px;font-weight:600;min-height:36px;' +
            'border:1.5px solid #E2E5EF;border-radius:4px;padding:4px 8px" />' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="number" min="0" class="tgt-qty" ' +
            'data-scope="customer" data-customer-id="' + customerId + '" ' +
            'data-product-id="' + p.id + '" data-month="' + month + '" data-year="' + year + '" ' +
            'data-tid="' + tid + '" value="' + qtyVal + '" placeholder="—" ' +
            'style="width:100px;text-align:right;font-size:14px;font-weight:600;min-height:36px;' +
            'border:1.5px solid #E2E5EF;border-radius:4px;padding:4px 8px" />' +
        '</td>';
      }).join('');

      return '<tr style="border-bottom:1px solid #E2E5EF">' +
        '<td style="padding:6px 12px;font-weight:600;font-size:14px;white-space:nowrap;min-width:100px">' + monthName + ' ' + year + '</td>' +
        cells +
      '</tr>';
    }).join('');

    return '<div style="overflow-x:auto">' +
      '<table style="border-collapse:collapse;font-size:14px;min-width:100%">' +
        '<thead>' +
          '<tr style="background:#F1F3F9"><th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:700;color:#4A5068">AY</th>' + productCols + '</tr>' +
          '<tr style="background:#F8F9FC"><th></th>' + subCols + '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  /* ============================================================
     SETTINGS UI — Ülke × Ürün hedef grid
     ============================================================ */
  function buildCountryGridHTML(country, year, products) {
    if (!country || !products.length) return '';

    var yearTargets = _targets.filter(function(t) {
      return t.scope === 'country' && t.country === country && t.year === year;
    });

    var productCols = products.map(function(p) {
      return '<th colspan="2" style="padding:10px 16px;text-align:center;font-size:12px;font-weight:700;color:#4A5068;border-left:2px solid #E2E5EF;min-width:220px">' +
        _esc(p.name) + '</th>';
    }).join('');

    var subCols = products.map(function() {
      return '<th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:#4A5068;border-left:2px solid #E2E5EF">Euro</th>' +
             '<th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:#4A5068">Adet</th>';
    }).join('');

    var rows = MONTHS_TR.map(function(monthName, idx) {
      var month = idx + 1;
      var cells = products.map(function(p) {
        var t = yearTargets.find(function(x) { return x.product_id === p.id && x.month === month; });
        var eurVal = t ? (t.target_eur || '') : '';
        var qtyVal = t ? (t.target_qty || '') : '';
        var tid    = t ? t.id : '';
        return '<td style="padding:4px 6px;border-left:2px solid #E2E5EF">' +
          '<input type="number" min="0" class="tgt-eur" ' +
            'data-scope="country" data-country="' + _esc(country) + '" ' +
            'data-product-id="' + p.id + '" data-month="' + month + '" data-year="' + year + '" ' +
            'data-tid="' + tid + '" value="' + eurVal + '" placeholder="—" ' +
            'style="width:110px;text-align:right;font-size:14px;font-weight:600;min-height:36px;' +
            'border:1.5px solid #E2E5EF;border-radius:4px;padding:4px 8px" />' +
        '</td>' +
        '<td style="padding:4px 6px">' +
          '<input type="number" min="0" class="tgt-qty" ' +
            'data-scope="country" data-country="' + _esc(country) + '" ' +
            'data-product-id="' + p.id + '" data-month="' + month + '" data-year="' + year + '" ' +
            'data-tid="' + tid + '" value="' + qtyVal + '" placeholder="—" ' +
            'style="width:100px;text-align:right;font-size:14px;font-weight:600;min-height:36px;' +
            'border:1.5px solid #E2E5EF;border-radius:4px;padding:4px 8px" />' +
        '</td>';
      }).join('');

      return '<tr style="border-bottom:1px solid #E2E5EF">' +
        '<td style="padding:6px 12px;font-weight:600;font-size:14px;white-space:nowrap;min-width:100px">' + monthName + ' ' + year + '</td>' +
        cells +
      '</tr>';
    }).join('');

    return '<div style="overflow-x:auto">' +
      '<table style="border-collapse:collapse;font-size:14px;min-width:100%">' +
        '<thead>' +
          '<tr style="background:#F1F3F9"><th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:700;color:#4A5068">AY</th>' + productCols + '</tr>' +
          '<tr style="background:#F8F9FC"><th></th>' + subCols + '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  function bindGridEvents(container) {
    if (!container) return;

    function _saveInput(input) {
      var scope = input.getAttribute('data-scope');
      var productId = input.getAttribute('data-product-id');
      var month = parseInt(input.getAttribute('data-month'));
      var year  = parseInt(input.getAttribute('data-year'));
      var tid   = input.getAttribute('data-tid');

      var row = input.closest('tr');
      if (!row) return;
      var eurInput = row.querySelector('.tgt-eur[data-product-id="' + productId + '"]');
      var qtyInput = row.querySelector('.tgt-qty[data-product-id="' + productId + '"]');

      var payload = {
        scope: scope,
        product_id: productId,
        month: month,
        year:  year,
        target_eur: eurInput ? (parseNum(eurInput.value) || null) : null,
        target_qty: qtyInput ? (parseNum(qtyInput.value) || null) : null
      };
      if (tid) payload.id = tid;

      if (scope === 'customer') {
        payload.customer_id = input.getAttribute('data-customer-id');
      } else {
        payload.country = input.getAttribute('data-country');
      }

      upsert(payload).then(function(ok) {
        if (ok) showToast('Hedef kaydedildi');
      });
    }

    container.querySelectorAll('.tgt-eur, .tgt-qty').forEach(function(input) {
      input.addEventListener('change', function() {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function() { _saveInput(input); }, 600);
      });
    });
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    load, upsert, getAll,
    getForCustomerProduct, getForCountryProduct,
    getCustomerTargetMap, getCountryTargetMap,
    buildCustomerGridHTML, buildCountryGridHTML,
    bindGridEvents,
    MONTHS_TR
  };
})();
