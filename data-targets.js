/* NSDATA - data-targets.js */
/* Target management — annual targets per customer, permanent storage */

var TargetManager = (function() {
  'use strict';

  var _targets = [];
  var _saveTimer = null;

  var MONTHS_TR = [
    'Ocak','Subat','Mart','Nisan','Mayis','Haziran',
    'Temmuz','Agustos','Eylul','Ekim','Kasim','Aralik'
  ];

  async function load() {
    _targets = await dbGetTargets();
    return _targets;
  }

  async function upsert(target) {
    if (!target.customer_id || !target.month || !target.year) return false;
    var ok = await dbUpsertTarget(target);
    if (ok) {
      _targets = await dbGetTargets();
      emitDataChange('targets', {});
    }
    return ok;
  }

  function getAll() { return _targets; }

  function getForCustomer(customerId) {
    return _targets.filter(function(t) { return t.customer_id === customerId; });
  }

  function getForMonth(month, year) {
    return _targets.filter(function(t) { return t.month === month && t.year === year; });
  }

  // Build annual target grid HTML for a customer
  function buildAnnualGridHTML(customerId, year) {
    var yearTargets = _targets.filter(function(t) {
      return t.customer_id === customerId && t.year === year;
    });

    var rows = MONTHS_TR.map(function(monthName, idx) {
      var month  = idx + 1;
      var target = yearTargets.find(function(t) { return t.month === month; });
      var targetEur = target ? (target.target_eur || '') : '';
      var targetQty = target ? (target.target_qty || '') : '';
      var targetId  = target ? target.id : '';

      return '<tr>' +
        '<td style="font-weight:600;padding:10px 16px;white-space:nowrap">' + monthName + ' ' + year + '</td>' +
        '<td style="padding:10px 16px">' +
          '<input type="number" min="0" ' +
            'class="target-eur-input" ' +
            'data-customer-id="' + customerId + '" ' +
            'data-month="' + month + '" ' +
            'data-year="' + year + '" ' +
            'data-target-id="' + targetId + '" ' +
            'value="' + targetEur + '" ' +
            'placeholder="EUR hedef" ' +
            'style="width:140px;text-align:right;min-height:48px;font-size:15px;font-weight:700;' +
            'border:1.5px solid #E2E5EF;border-radius:6px;padding:8px 12px" />' +
        '</td>' +
        '<td style="padding:10px 16px">' +
          '<input type="number" min="0" ' +
            'class="target-qty-input" ' +
            'data-customer-id="' + customerId + '" ' +
            'data-month="' + month + '" ' +
            'data-year="' + year + '" ' +
            'data-target-id="' + targetId + '" ' +
            'value="' + targetQty + '" ' +
            'placeholder="Adet hedef" ' +
            'style="width:130px;text-align:right;min-height:48px;font-size:15px;font-weight:700;' +
            'border:1.5px solid #E2E5EF;border-radius:6px;padding:8px 12px" />' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<table style="width:100%;border-collapse:collapse;font-size:15px">' +
      '<thead><tr style="background:#F1F3F9">' +
        '<th style="padding:10px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">Ay</th>' +
        '<th style="padding:10px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">Euro Hedef</th>' +
        '<th style="padding:10px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">Adet Hedef</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  }

  function bindGridEvents(container) {
    if (!container) return;

    function _saveRow(input) {
      var customerId = input.getAttribute('data-customer-id');
      var month      = parseInt(input.getAttribute('data-month'));
      var year       = parseInt(input.getAttribute('data-year'));
      var targetId   = input.getAttribute('data-target-id');

      var row = input.closest('tr');
      if (!row) return;

      var eurInput = row.querySelector('.target-eur-input');
      var qtyInput = row.querySelector('.target-qty-input');

      var payload = {
        customer_id: customerId,
        month:       month,
        year:        year,
        target_eur:  eurInput ? (parseNum(eurInput.value) || null) : null,
        target_qty:  qtyInput ? (parseNum(qtyInput.value) || null) : null
      };
      if (targetId) payload.id = targetId;

      upsert(payload).then(function(ok) {
        if (ok) showToast('Hedef kaydedildi');
      });
    }

    container.querySelectorAll('.target-eur-input, .target-qty-input').forEach(function(input) {
      input.addEventListener('input', function() {
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function() { _saveRow(input); }, 800);
      });
    });
  }

  // Paste handler — detects pasted tabular data and maps to targets
  function handlePaste(pasteText, customerId, year) {
    if (!pasteText || !customerId) return [];

    var lines = pasteText.trim().split('\n');
    var results = [];

    lines.forEach(function(line, idx) {
      var parts = line.split('\t').map(function(p) { return p.trim(); });
      if (parts.length < 1) return;

      var month = idx + 1;
      if (month > 12) return;

      var eurVal = parseNum(parts[0]);
      var qtyVal = parts[1] !== undefined ? parseNum(parts[1]) : null;

      if (eurVal !== null) {
        results.push({
          customer_id: customerId,
          month:       month,
          year:        year,
          target_eur:  eurVal,
          target_qty:  qtyVal
        });
      }
    });

    return results;
  }

  async function applyPastedTargets(rows) {
    var saved = 0;
    for (var i = 0; i < rows.length; i++) {
      var ok = await upsert(rows[i]);
      if (ok) saved++;
    }
    if (saved > 0) showToast(saved + ' hedef kaydedildi');
    return saved;
  }

  return {
    load: load,
    upsert: upsert,
    getAll: getAll,
    getForCustomer: getForCustomer,
    getForMonth: getForMonth,
    buildAnnualGridHTML: buildAnnualGridHTML,
    bindGridEvents: bindGridEvents,
    handlePaste: handlePaste,
    applyPastedTargets: applyPastedTargets,
    MONTHS_TR: MONTHS_TR
  };
})();
