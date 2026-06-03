/* NSDATA - import-engine.js */
/* Excel import processing — reads xlsx, matches customers/products, builds preview */
/* Never touches DOM directly — calls callback with preview data */

/* ============================================================
   MAIN ENTRY POINT
   Called from screen-orders.js
   ============================================================ */

function processImportFile(file, customers, products, callback) {
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data    = new Uint8Array(e.target.result);
      var workbook = XLSX.read(data, { type: 'array' });
      var sheet   = workbook.Sheets[workbook.SheetNames[0]];
      var rows    = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      var preview = _buildPreview(rows, customers, products);
      callback(preview);
    } catch (err) {
      console.error('Import parse error:', err);
      showToast('Dosya okunamadi. Lutfen gecerli bir xlsx dosyasi secin.');
    }
  };
  reader.onerror = function() {
    showToast('Dosya okunamadi.');
  };
  reader.readAsArrayBuffer(file);
}

/* ============================================================
   BUILD PREVIEW
   ============================================================ */

function _buildPreview(rows, customers, products) {
  var customerNames = customers.map(function(c) { return c.name; });
  var productNames  = products.map(function(p) { return p.name; });

  var processedRows  = [];
  var customerSet    = {};
  var productSet     = {};
  var unmatchedCount = 0;

  rows.forEach(function(row) {
    // Normalize column names — handle Turkish ERP export
    var rawCustomer = String(row['CAR&#x130;'] || row['CARI'] || row['Cari'] || row['musteri'] || '').trim();
    var rawProduct  = String(row['&#xDC;R&#xDC;N'] || row['URUN'] || row['urun'] || row['Urun'] || '').trim();
    var rawQty      = row['ADET'] || row['adet'] || row['Adet'] || 0;
    var rawEuro     = row['EURO'] || row['euro'] || row['Euro'] || 0;
    var rawMonth    = String(row['AY'] || row['ay'] || '').trim();
    var rawYear     = row['YIL'] || row['yil'] || 0;

    if (!rawCustomer || !rawProduct) return;

    // Match customer
    var customerMatch = _matchName(rawCustomer, customerNames);
    var matchedCustomer = customerMatch
      ? customers.find(function(c) { return c.name === customerMatch.match; })
      : null;

    // Match product
    var productMatch = _matchName(rawProduct, productNames);
    var matchedProduct = productMatch
      ? products.find(function(p) { return p.name === productMatch.match; })
      : null;

    var matched = !!(matchedCustomer && matchedProduct);
    if (!matched) unmatchedCount++;

    if (matchedCustomer) customerSet[matchedCustomer.id] = true;
    if (matchedProduct)  productSet[matchedProduct.id]   = true;

    processedRows.push({
      customer_name: rawCustomer,
      product_name:  rawProduct,
      qty:           parseNum(rawQty)  || 0,
      euro:          parseNum(rawEuro) || 0,
      month:         rawMonth,
      year:          parseNum(rawYear) || 0,
      matched:       matched,
      customer_id:   matchedCustomer ? matchedCustomer.id : null,
      product_id:    matchedProduct  ? matchedProduct.id  : null
    });
  });

  return {
    rows:           processedRows,
    rowCount:       processedRows.length,
    customerCount:  Object.keys(customerSet).length,
    productCount:   Object.keys(productSet).length,
    unmatchedCount: unmatchedCount
  };
}

/* ============================================================
   NAME MATCHING — similarity based
   ============================================================ */

function _matchName(needle, haystack) {
  if (!needle || !haystack.length) return null;
  return bestMatch(needle, haystack, 0.45);
}
