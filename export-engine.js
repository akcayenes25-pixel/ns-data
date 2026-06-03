/* NSDATA - export-engine.js */
/* Excel and PDF export — no DOM reads except for PDF snapshot */

/* ============================================================
   EXCEL EXPORT — orders
   ============================================================ */

function exportOrdersToExcel(orders, products, customers) {
  if (typeof XLSX === 'undefined') {
    showToast('Excel export haz&#x131;rlan&#x131;yor...');
    return;
  }

  var productMap  = buildProductMap(products);
  var customerMap = buildCustomerMap(customers);

  var wsData = [
    ['Musteri', 'Ulke', 'Urun', 'Cikan Adet', 'Cikan Euro', 'Cikacak Adet', 'Cikacak Euro', 'Toplam Euro', 'Not', 'Son Guncelleme']
  ];

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

  // Column widths
  ws['!cols'] = [
    { wch: 30 }, { wch: 15 }, { wch: 20 },
    { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 20 }
  ];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Siparisler');

  var now      = new Date();
  var dateStr  = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  var fileName = 'NSDATA-Siparisler-' + dateStr + '.xlsx';

  XLSX.writeFile(wb, fileName);
  showToast('Excel indirildi');
}

/* ============================================================
   EXCEL EXPORT — limits
   ============================================================ */

function exportLimitsToExcel(limits, customers, payments, orders, products, currentMonth, currentYear) {
  if (typeof XLSX === 'undefined') return;

  var productMap  = buildProductMap(products);
  var customerMap = buildCustomerMap(customers);

  var wsData = [
    ['Musteri', 'Ulke', 'Toplam Limit', 'Acik Bakiye', 'Planlanan Cikis',
     'Su An Kullanilabilir', 'Odeme Gelince Kullanilabilir', 'Bu Ayki Odemeler']
  ];

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
   Uses browser print API with print-optimized styles
   ============================================================ */

function exportAnalysisPdf() {
  var printStyles = '<style>' +
    'body { font-family: Inter, sans-serif; color: #0F1117; background: #F8F9FC; }' +
    '.main-nav, .app-footer, .analysis-toolbar, .analysis-detail-toggle, button { display: none !important; }' +
    '#screen-analysis { display: flex !important; padding: 20px; }' +
    '.analysis-chart-card { break-inside: avoid; margin-bottom: 16px; }' +
    '@page { size: A4 landscape; margin: 16mm; }' +
  '</style>';

  var head = document.querySelector('head');
  var styleEl = document.createElement('style');
  styleEl.id  = 'nsdata-print-style';
  styleEl.innerHTML = printStyles.replace('<style>', '').replace('</style>', '');
  head.appendChild(styleEl);

  window.print();

  setTimeout(function() {
    var el = document.getElementById('nsdata-print-style');
    if (el) el.remove();
  }, 1000);

  showToast('PDF haz&#x131;rland&#x131;');
}

/* ============================================================
   SVG / CHART DOWNLOAD — individual chart as PNG
   ============================================================ */

function downloadChartAsPng(svgElement, filename) {
  if (!svgElement) return;

  var svgData   = new XMLSerializer().serializeToString(svgElement);
  var svgBlob   = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  var svgUrl    = URL.createObjectURL(svgBlob);
  var img       = new Image();
  var scale     = window.devicePixelRatio || 2;

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

    var a    = document.createElement('a');
    a.href   = canvas.toDataURL('image/png');
    a.download = (filename || 'chart') + '.png';
    a.click();
    showToast('Grafik indirildi');
  };

  img.src = svgUrl;
}
