/* NSDATA - import-engine.js */
/* Excel import processing — reads xlsx, matches customers/products, builds preview */

function processImportFile(file, customers, products, callback) {
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data     = new Uint8Array(e.target.result);
      var workbook = XLSX.read(data, { type: 'array' });
      var sheet    = workbook.Sheets[workbook.SheetNames[0]];
      var rows     = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      var preview  = _buildPreview(rows, customers, products);
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

function _buildPreview(rows, customers, products) {
  var customerNames = customers.map(function(c) { return c.name; });
  var productNames  = products.map(function(p)  { return p.name; });

  var processedRows  = [];
  var customerSet    = {};
  var productSet     = {};
  var unmatchedCount = 0;

  rows.forEach(function(row) {
    // Normalize: try all likely column names from Turkish ERP exports
    // Keys come from XLSX as raw unicode strings, never as HTML entities
    var rawCustomer = _col(row, ['CARI', 'Cari', 'cari', 'MUSTERI', 'Musteri', 'musteri',
                                  'M\u00FCshteri', 'M\u00FC\u015Fteri', 'CUSTOMER', 'Customer']);
    var rawProduct  = _col(row, ['URUN', 'Urun', 'urun', '\u00DCR\u00DCN', '\u00DCr\u00FCn', '\u00FCr\u00FCn',
                                  'PRODUCT', 'Product', 'URN']);
    var rawQty      = _col(row, ['ADET', 'Adet', 'adet', 'QTY', 'Qty', 'qty', 'MIKTAR', 'Miktar']) || 0;
    var rawEuro     = _col(row, ['EURO', 'Euro', 'euro', 'EUR', 'Eur', 'TUTAR', 'Tutar', 'tutar']) || 0;

    if (!rawCustomer || !rawProduct) return;

    var customerMatch   = _matchName(rawCustomer, customerNames);
    var matchedCustomer = customerMatch
      ? customers.find(function(c) { return c.name === customerMatch.match; })
      : null;

    var productMatch   = _matchName(rawProduct, productNames);
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

// Get first matching column value from a row
function _col(row, keys) {
  for (var i = 0; i < keys.length; i++) {
    var val = row[keys[i]];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  // Fallback: case-insensitive search across all keys
  var rowKeys = Object.keys(row);
  for (var j = 0; j < keys.length; j++) {
    var needle = keys[j].toUpperCase();
    for (var k = 0; k < rowKeys.length; k++) {
      if (rowKeys[k].toUpperCase() === needle) {
        var v = row[rowKeys[k]];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          return String(v).trim();
        }
      }
    }
  }
  return '';
}

function _matchName(needle, haystack) {
  if (!needle || !haystack.length) return null;
  return bestMatch(needle, haystack, 0.40);
}
