/* NSDATA - export-engine.js */
/* Excel and PDF export */

/* ============================================================
   EXCEL EXPORT — orders
   ============================================================ */

function exportOrdersToExcel(orders, products, customers) {
  if (typeof XLSX === 'undefined') { showToast('Excel yukleniyor...'); return; }

  var productMap  = buildProductMap(products);
  var customerMap = buildCustomerMap(customers);

  var wsData = [[
    'Musteri', 'Ulke', 'Urun',
    'Cikan Adet', 'Cikan Euro',
    'Cikacak Adet', 'Cikacak Euro',
    'Toplam Euro', 'Not', 'Son Guncelleme'
  ]];

  orders.forEach(function(order) {
    var customer = customerMap[order.customer_id];
    var product  = productMap[order.product_id];
    if (!customer || !product) return;

    var price   = parseNum(product.avg_price_eur) || 0;
    var shipped = parseNum(order.shipped_qty)  || 0;
    var planned = parseNum(order.planned_qty)  || 0;

    wsData.push([
      customer.name,
      customer.country || '',
      product.name,
      shipped,
      Math.round(shipped * price),
      planned,
      Math.round(planned * price),
      Math.round((shipped + planned) * price),
      order.note || '',
      order.updated_at ? new Date(order.updated_at).toLocaleString('tr-TR') : ''
    ]);
  });

  var ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 30 }, { wch: 15 }, { wch: 20 },
    { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 20 }
  ];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Siparisler');

  var now     = new Date();
  var dateStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  XLSX.writeFile(wb, 'NSDATA-Siparisler-' + dateStr + '.xlsx');
  showToast('Excel indirildi');
}

/* ============================================================
   EXCEL EXPORT — limits
   ============================================================ */

function exportLimitsToExcel(limits, customers, payments, orders, products, currentMonth, currentYear) {
  if (typeof XLSX === 'undefined') return;

  var productMap  = buildProductMap(products);
  var customerMap = buildCustomerMap(customers);

  var wsData = [[
    'Musteri', 'Ulke', 'Toplam Limit', 'Acik Bakiye', 'Planlanan Cikis',
    'Su An Kullanilabilir', 'Odeme Gelince Kullanilabilir', 'Bu Ayki Odemeler'
  ]];

  customers.forEach(function(c) {
    var lim = limits.find(function(l) { return l.customer_id === c.id; }) || {};
    var custPayments = payments.filter(function(p) { return p.customer_id === c.id; });
    var plannedEuro  = calcCustomerPlannedEuro(orders, c.id, productMap);
    var conservative = calcConservativeLimit(lim.total_limit_eur, lim.open_balance_eur, plannedEuro);
    var optimistic   = calcOptimisticLimit(lim.total_limit_eur, lim.open_balance_eur, plannedEuro, custPayments, currentMonth, currentYear);

    var sameMonthPayments = custPayments
      .filter(function(p) { return isSameMonth(p.payment_date, currentMonth, currentYear); })
      .reduce(function(s, p) { return s + (parseNum(p.amount_eur) || 0); }, 0);

    wsData.push([
      c.name,
      c.country || '',
      parseNum(lim.total_limit_eur)  || 0,
      parseNum(lim.open_balance_eur) || 0,
      Math.round(plannedEuro),
      conservative !== null ? Math.round(conservative) : '',
      optimistic   !== null ? Math.round(optimistic)   : '',
      Math.round(sameMonthPayments)
    ]);
  });

  var ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    { wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 20 }
  ];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Limitler');

  var now     = new Date();
  var dateStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  XLSX.writeFile(wb, 'NSDATA-Limitler-' + dateStr + '.xlsx');
  showToast('Excel indirildi');
}

/* ============================================================
   PDF EXPORT — analysis snapshot
   ============================================================ */

function exportAnalysisPdf() {
  var styleEl = document.createElement('style');
  styleEl.id  = 'nsdata-print-style';
  styleEl.innerHTML =
    'body { font-family: Inter, sans-serif; color: #0F1117; background: #F8F9FC; }' +
    '.main-nav, .app-footer, .analysis-toolbar, .analysis-detail-toggle, button { display: none !important; }' +
    '#screen-analysis { display: flex !important; padding: 20px; }' +
    '.analysis-chart-card { break-inside: avoid; margin-bottom: 16px; }' +
    '@page { size: A4 landscape; margin: 16mm; }';
  document.head.appendChild(styleEl);

  window.print();

  setTimeout(function() {
    var el = document.getElementById('nsdata-print-style');
    if (el) el.remove();
  }, 1000);

  showToast('PDF hazirlanadi');
}

/* ============================================================
   SVG / CHART DOWNLOAD
   ============================================================ */

function downloadChartAsPng(svgElement, filename) {
  if (!svgElement) return;

  var svgData = new XMLSerializer().serializeToString(svgElement);
  var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  var svgUrl  = URL.createObjectURL(svgBlob);
  var img     = new Image();
  var scale   = window.devicePixelRatio || 2;

  img.onload = function() {
    var canvas  = document.createElement('canvas');
    canvas.width  = svgElement.clientWidth  * scale;
    canvas.height = svgElement.clientHeight * scale;
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(svgUrl);

    var a      = document.createElement('a');
    a.href     = canvas.toDataURL('image/png');
    a.download = (filename || 'grafik') + '.png';
    a.click();
    showToast('Grafik indirildi');
  };

  img.src = svgUrl;
}

/* ============================================================
   FLAT EXPORT — filtered orders, one row per order
   ============================================================ */

function exportOrdersFlat(orders, products, customers) {
  if (typeof XLSX === 'undefined') { showToast('Excel yukleniyor...'); return; }

  var productMap  = buildProductMap(products);
  var customerMap = buildCustomerMap(customers);

  var wsData = [[
    'Musteri', 'Ulke', 'Urun',
    'Cikan Adet', 'Cikan Euro',
    'Cikacak Adet', 'Cikacak Euro',
    'Toplam Euro', 'Not'
  ]];

  orders.forEach(function(order) {
    var customer = customerMap[order.musteri || order.customer_id];
    var product  = productMap[order.urun || order.product_id];
    if (!customer || !product) return;

    var price   = parseNum(product.avg_price_eur || product.price) || 0;
    var shipped = parseNum(order.cikan || order.shipped_qty) || 0;
    var planned = parseNum(order.cikacak || order.planned_qty) || 0;

    wsData.push([
      customer.name,
      order.ulke || '',
      product.name,
      shipped,
      Math.round(shipped * price),
      planned,
      Math.round(planned * price),
      Math.round((shipped + planned) * price),
      order.note || ''
    ]);
  });

  // Auto column widths
  var colWidths = wsData[0].map(function(_, ci) {
    return Math.min(50, Math.max.apply(null, wsData.map(function(row) {
      return String(row[ci] || '').length;
    })) + 2);
  });

  var ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = colWidths.map(function(w) { return { wch: w }; });

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Siparisler');

  var now     = new Date();
  var dateStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  XLSX.writeFile(wb, 'NSDATA-Duz-' + dateStr + '.xlsx');
  showToast('Excel indirildi');
}

/* ============================================================
   PIVOT EXPORT — what you see on screen, colors + merges
   ============================================================ */

function exportOrdersPivot() {
  if (typeof ExcelJS === 'undefined') { showToast('ExcelJS yukleniyor...'); return; }

  var ht = document.getElementById('o-ht');
  var dt = document.getElementById('o-dt');
  if (!ht || !dt) { showToast('Tablo bulunamadi'); return; }

  var hRows = ht.querySelectorAll('tr');
  var firstDataRow = dt.querySelector('tbody tr');
  var totalCols = firstDataRow ? firstDataRow.children.length - 1 : 0;
  if (totalCols === 0) { showToast('Tablo bos'); return; }

  function rgbToArgb(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
    var m = rgb.match(/\d+/g);
    if (!m) return null;
    var r = parseInt(m[0]), g = parseInt(m[1]), b = parseInt(m[2]);
    if (r === 0 && g === 0 && b === 0) return null;
    return 'FF' + ('0'+r.toString(16)).slice(-2) + ('0'+g.toString(16)).slice(-2) + ('0'+b.toString(16)).slice(-2);
  }

  function cleanText(t) {
    return (t || '').replace(/^[\u2191\u2193\u2B06\u2B07\u25B2\u25BC]\s*/, '').replace(/\s*[\u2191\u2193\u2B06\u2B07\u25B2\u25BC]$/, '').trim();
  }

  function isEuroCol(matrix, ci) {
    for (var ri = 0; ri < matrix.length; ri++) {
      var cell = matrix[ri][ci];
      if (cell && cell.text && cell.text.toLowerCase().includes('euro')) return true;
    }
    return false;
  }

  function parseVal(str) {
    if (!str || str.trim() === '' || str.trim() === '\u2014' || str.trim() === '-') return null;
    var cleaned = str.replace(/[\u20AC\s]/g, '').replace(/\./g, '').replace(',', '.');
    var n = parseFloat(cleaned);
    return isNaN(n) ? str : n;
  }

  // Header matrix
  var matrix = [];
  var merges = [];
  for (var r = 0; r < hRows.length; r++) matrix.push(new Array(totalCols).fill(null));

  Array.from(hRows).forEach(function(tr, ri) {
    var ci = 0;
    Array.from(tr.children).forEach(function(th) {
      var isXCol = th.rowSpan >= hRows.length && th.innerText.trim() === '';
      if (isXCol) return;
      while (ci < totalCols && matrix[ri][ci] !== null) ci++;
      if (ci >= totalCols) return;

      var style = window.getComputedStyle(th);
      var bgArgb = rgbToArgb(style.backgroundColor);
      var fgArgb = 'FF' + style.color.match(/\d+/g).slice(0,3).map(function(x){ return ('0'+parseInt(x).toString(16)).slice(-2); }).join('');

      var cell = { text: cleanText(th.innerText), bgArgb: bgArgb, fgArgb: fgArgb, colspan: th.colSpan, rowspan: th.rowSpan };
      matrix[ri][ci] = cell;

      for (var dr = 0; dr < th.rowSpan; dr++) {
        for (var dc = 0; dc < th.colSpan; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (ri + dr < matrix.length) matrix[ri + dr][ci + dc] = { text: '', bgArgb: bgArgb, fgArgb: fgArgb, colspan: 1, rowspan: 1 };
        }
      }
      if (th.colSpan > 1 || th.rowSpan > 1) {
        merges.push({ r: ri, c: ci, r2: ri + th.rowSpan - 1, c2: ci + th.colSpan - 1 });
      }
      ci += th.colSpan;
    });
  });

  // Euro cols
  var euroCols = [];
  for (var ci2 = 0; ci2 < totalCols; ci2++) {
    if (isEuroCol(matrix, ci2)) euroCols.push(ci2);
  }

  // Data rows
  var dataRows = [];
  Array.from(dt.querySelectorAll('tbody tr')).forEach(function(tr) {
    if (tr.children.length < 2) return;
    var row = [];
    Array.from(tr.children).forEach(function(td, i) {
      if (i === 0) return;
      var style = window.getComputedStyle(td);
      var bgArgb = rgbToArgb(style.backgroundColor);
      var inp = td.querySelector('input.o-ci');
      var val;
      if (inp) {
        var raw = parseFloat(inp.dataset.raw || inp.value);
        val = isNaN(raw) ? null : raw;
      } else {
        val = parseVal(td.innerText.trim());
      }
      row.push({ val: val, bgArgb: bgArgb });
    });
    dataRows.push(row);
  });

  // Write with ExcelJS
  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet('Siparisler');
  var thinBorder = { style: 'thin', color: { argb: 'FFB0B0B0' } };

  // Header rows
  matrix.forEach(function(row, ri) {
    var exRow = ws.getRow(ri + 1);
    row.forEach(function(cell, ci) {
      if (!cell) return;
      var exCell = exRow.getCell(ci + 1);
      exCell.value = cell.text || null;
      exCell.font = { bold: true, color: { argb: cell.fgArgb || 'FF000000' }, size: 10 };
      if (cell.bgArgb) exCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cell.bgArgb } };
      exCell.alignment = { horizontal: 'center', vertical: 'middle' };
      exCell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    });
    exRow.height = 22;
  });

  // Merges
  merges.forEach(function(m) {
    try { ws.mergeCells(m.r + 1, m.c + 1, m.r2 + 1, m.c2 + 1); } catch(e) {}
  });

  // Data rows
  dataRows.forEach(function(row, ri) {
    var exRow = ws.getRow(matrix.length + ri + 1);
    row.forEach(function(cell, ci) {
      var exCell = exRow.getCell(ci + 1);
      var isEuro = euroCols.indexOf(ci) !== -1;
      var isNum = typeof cell.val === 'number';

      if (isEuro && isNum) {
        exCell.value = cell.val;
        exCell.numFmt = '#,##0.00';
      } else if (isNum) {
        exCell.value = Math.round(cell.val);
        exCell.numFmt = '0';
      } else {
        exCell.value = cell.val || null;
      }

      exCell.font = { color: { argb: 'FF0F1117' }, size: 10 };
      if (cell.bgArgb) exCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cell.bgArgb } };
      exCell.alignment = { horizontal: isNum ? 'right' : 'left', vertical: 'middle' };
      exCell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    });
    exRow.height = 18;
  });

  // Column widths
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 16;
  for (var c = 4; c <= totalCols; c++) ws.getColumn(c).width = 14;

  var now = new Date();
  var dateStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  wb.xlsx.writeBuffer().then(function(buffer) {
    var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'NSDATA-Tablo-' + dateStr + '.xlsx'; a.click();
    URL.revokeObjectURL(url);
    showToast('Excel indirildi');
  });
}
