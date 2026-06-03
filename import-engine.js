/* NSDATA - import-engine.js v1.3.0 */
/* Akıllı ERP import motoru — çok formatlı, öğrenen eşleştirme */

/* ============================================================
   MAPPING HAFIZASI — localStorage
   ============================================================ */
var MAPPING_KEY = 'nsdata_import_mappings';

function _loadMappings() {
  try {
    return JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}');
  } catch(e) { return {}; }
}

function _saveMappings(mappings) {
  try { localStorage.setItem(MAPPING_KEY, JSON.stringify(mappings)); } catch(e) {}
}

function _recordMapping(type, erpName, nsName, confidence) {
  var mappings = _loadMappings();
  if (!mappings[type]) mappings[type] = {};
  var existing = mappings[type][erpName];
  // Ağırlıklı ortalama — önceki eşleştirmeler birikir
  if (existing) {
    var newConf = existing.confidence * 0.6 + confidence * 0.4;
    mappings[type][erpName] = { name: nsName, confidence: Math.min(newConf, 1.0), count: (existing.count || 1) + 1 };
  } else {
    mappings[type][erpName] = { name: nsName, confidence: confidence, count: 1 };
  }
  _saveMappings(mappings);
}

/* ============================================================
   ANA GİRİŞ NOKTASI
   ============================================================ */
function processImportFile(file, customers, products, callback) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data     = new Uint8Array(e.target.result);
      var workbook = XLSX.read(data, { type: 'array' });
      var sheet    = workbook.Sheets[workbook.SheetNames[0]];
      var rawRows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      var preview  = _processSheet(rawRows, customers, products);
      callback(preview);
    } catch(err) {
      console.error('Import parse error:', err);
      showToast('Dosya okunamadı. Lütfen geçerli bir xlsx dosyası seçin.');
    }
  };
  reader.onerror = function() { showToast('Dosya okunamadı.'); };
  reader.readAsArrayBuffer(file);
}

/* ============================================================
   SHEET İŞLEME
   ============================================================ */
function _processSheet(rawRows, customers, products) {
  // 1. Header satırını bul
  var headerInfo = _detectHeader(rawRows);
  if (!headerInfo) {
    return { rows: [], rowCount: 0, customerCount: 0, productCount: 0, unmatchedCount: 0,
             error: 'Header satırı tespit edilemedi.' };
  }

  var { headerIdx, colMap } = headerInfo;
  var dataRows = rawRows.slice(headerIdx + 1).filter(function(row) {
    return row && row.some(function(cell) { return cell !== null && cell !== ''; });
  });

  // 2. Her satırı işle
  var mappings     = _loadMappings();
  var processedRows = [];
  var customerSet  = {};
  var productSet   = {};
  var unmatchedCount = 0;

  dataRows.forEach(function(row) {
    var rawCustomer = _getCell(row, colMap.customer);
    var rawProduct  = _getCell(row, colMap.product);
    var rawQty      = _getCell(row, colMap.qty);
    var rawEuro     = _getCell(row, colMap.euro);
    var rawMonth    = _getCell(row, colMap.month);
    var rawYear     = _getCell(row, colMap.year);
    var rawCountry  = _getCell(row, colMap.country);

    if (!rawCustomer && !rawProduct) return;
    rawCustomer = String(rawCustomer || '').trim();
    rawProduct  = String(rawProduct  || '').trim();
    if (!rawCustomer || !rawProduct) return;

    // Ay normalizasyonu
    var month = _parseMonth(rawMonth);
    var year  = rawYear ? parseInt(rawYear) : null;

    // Müşteri eşleştirme
    var customerResult = _matchEntity('customer', rawCustomer, customers.map(function(c){ return c.name; }), mappings, rawCountry);
    var matchedCustomer = customerResult.match
      ? customers.find(function(c){ return c.name === customerResult.match; })
      : null;

    // Ürün eşleştirme
    var productResult = _matchEntity('product', rawProduct, products.map(function(p){ return p.name; }), mappings, null);
    var matchedProduct = productResult.match
      ? products.find(function(p){ return p.name === productResult.match; })
      : null;

    var matched = !!(matchedCustomer && matchedProduct);
    if (!matched) unmatchedCount++;

    if (matchedCustomer) customerSet[matchedCustomer.id] = true;
    if (matchedProduct)  productSet[matchedProduct.id]   = true;

    processedRows.push({
      customer_name:    rawCustomer,
      product_name:     rawProduct,
      qty:              _parseNumber(rawQty)  || 0,
      euro:             _parseNumber(rawEuro) || 0,
      month:            month,
      year:             year,
      country:          rawCountry ? String(rawCountry).trim() : null,
      matched:          matched,
      customer_id:      matchedCustomer ? matchedCustomer.id   : null,
      product_id:       matchedProduct  ? matchedProduct.id    : null,
      customer_score:   customerResult.score,
      product_score:    productResult.score,
      customer_alts:    customerResult.alternatives,
      product_alts:     productResult.alternatives,
    });
  });

  return {
    rows:          processedRows,
    rowCount:      processedRows.length,
    customerCount: Object.keys(customerSet).length,
    productCount:  Object.keys(productSet).length,
    unmatchedCount: unmatchedCount,
    colMap:        colMap
  };
}

/* ============================================================
   HEADER TESPİTİ — semantik analiz
   ============================================================ */
function _detectHeader(rows) {
  // Her satır için header skoru hesapla
  var COL_PATTERNS = {
    customer: /^(cari|müşteri|musteri|customer|client|firm)/i,
    product:  /^(ürün|urun|product|ürn|mal|item)/i,
    qty:      /^(adet|miktar|qty|quantity|satiş\s?adt|satis\s?adt|units)/i,
    euro:     /^(euro|eur|tutar|satiş\s?eur|satis\s?eur|amount|fiyat)/i,
    month:    /^(ay|month|mon)/i,
    year:     /^(yil|yıl|year|yr)/i,
    country:  /^(ülke|ulke|country|market)/i,
  };

  for (var i = 0; i < Math.min(rows.length, 10); i++) {
    var row = rows[i];
    if (!row || !row.length) continue;

    var colMap = {};
    var score  = 0;

    row.forEach(function(cell, idx) {
      if (!cell) return;
      var s = String(cell).trim();
      Object.keys(COL_PATTERNS).forEach(function(key) {
        if (COL_PATTERNS[key].test(s) && colMap[key] === undefined) {
          colMap[key] = idx;
          score++;
        }
      });
    });

    // Müşteri + ürün + (adet veya euro) → header
    if (colMap.customer !== undefined && colMap.product !== undefined &&
        (colMap.qty !== undefined || colMap.euro !== undefined)) {
      return { headerIdx: i, colMap: colMap };
    }
  }

  // Fallback: içerik analizi — kolon tipini veriden çıkar
  return _detectHeaderByContent(rows);
}

function _detectHeaderByContent(rows) {
  // İlk gerçek veri satırını bul (boş olmayan, filtre metni olmayan)
  var dataStart = 0;
  for (var i = 0; i < Math.min(rows.length, 5); i++) {
    var row = rows[i];
    if (!row || !row.length) continue;
    var nonNull = row.filter(function(c){ return c !== null && c !== ''; });
    if (nonNull.length >= 3) { dataStart = i; break; }
  }

  // Kolon tiplerini içerikten tahmin et
  var sampleRows = rows.slice(dataStart, dataStart + 5);
  var colCount   = Math.max.apply(null, rows.slice(0, 10).map(function(r){ return r ? r.length : 0; }));
  var colMap     = {};

  for (var col = 0; col < colCount; col++) {
    var values = sampleRows.map(function(r){ return r ? r[col] : null; }).filter(function(v){ return v !== null; });
    if (!values.length) continue;

    var numCount  = values.filter(function(v){ return typeof v === 'number'; }).length;
    var textCount = values.filter(function(v){ return typeof v === 'string' && v.trim().length > 2; }).length;
    var isSmallNum = values.every(function(v){ return typeof v === 'number' && v >= 1 && v <= 12; });
    var isBigNum   = values.some(function(v){ return typeof v === 'number' && v > 1000; });
    var isYear     = values.every(function(v){ return typeof v === 'number' && v >= 2020 && v <= 2035; });

    if (isYear && colMap.year === undefined) colMap.year = col;
    else if (isSmallNum && !isYear && colMap.month === undefined) colMap.month = col;
    else if (isBigNum && numCount > textCount && colMap.euro === undefined) colMap.euro = col;
    else if (numCount > textCount && colMap.qty === undefined) colMap.qty = col;
    else if (textCount > 0 && colMap.customer === undefined) colMap.customer = col;
    else if (textCount > 0 && colMap.product === undefined) colMap.product = col;
  }

  if (colMap.customer !== undefined && colMap.product !== undefined) {
    return { headerIdx: dataStart - 1, colMap: colMap };
  }

  return null;
}

/* ============================================================
   ÇOKLU KATMANLı EŞLEŞTİRME
   ============================================================ */
function _matchEntity(type, erpName, nsNames, mappings, contextHint) {
  if (!erpName || !nsNames.length) return { match: null, score: 0, alternatives: [] };

  var scores = nsNames.map(function(nsName) {
    var score = _calcMatchScore(type, erpName, nsName, mappings, contextHint);
    return { name: nsName, score: score };
  });

  scores.sort(function(a, b) { return b.score - a.score; });

  var best  = scores[0];
  var alts  = scores.slice(1, 4).filter(function(s){ return s.score > 0.3; });

  // Eşik: 0.45 üzeri otomatik kabul
  return {
    match:        best.score >= 0.45 ? best.name : null,
    score:        best.score,
    alternatives: alts
  };
}

function _calcMatchScore(type, erpName, nsName, mappings, contextHint) {
  var score = 0;

  // 1. Hafıza skoru — önceki eşleştirmeler (en yüksek ağırlık)
  if (mappings[type] && mappings[type][erpName]) {
    var mem = mappings[type][erpName];
    if (mem.name === nsName) {
      // Kullanıcı onaylamış, güven oranı × 0.7 ağırlık
      score += mem.confidence * 0.7;
    }
  }

  // 2. String benzerliği
  var simScore = _similarity(erpName, nsName);
  score += simScore * 0.5;

  // 3. Token overlap — kelime bazlı
  var tokenScore = _tokenOverlap(erpName, nsName);
  score += tokenScore * 0.3;

  // 4. Kısaltma/prefix eşleşmesi
  var erpUpper = erpName.toUpperCase().replace(/[^A-ZÜŞİĞÇÖ0-9]/g, '');
  var nsUpper  = nsName.toUpperCase().replace(/[^A-ZÜŞİĞÇÖ0-9]/g, '');
  if (erpUpper.startsWith(nsUpper) || nsUpper.startsWith(erpUpper)) {
    score += 0.25;
  }

  // 5. İçerik kısaltması — "COMPTOIR TUNISIEN DE BATIMENT COTUB" → "COTUB"
  var words = erpName.toUpperCase().split(/\s+/);
  var initials = words.map(function(w){ return w[0]; }).join('');
  if (initials.includes(nsUpper) || nsUpper.includes(initials)) {
    score += 0.15;
  }

  // 6. Bağlam ipucu (ülke) — ileride kullanılabilir
  // contextHint ile ülke bazlı boost eklenebilir

  return Math.min(score, 1.0);
}

/* ============================================================
   STRING BENZERLIK
   ============================================================ */
function _similarity(a, b) {
  if (!a || !b) return 0;
  var sa = _normalize(a);
  var sb = _normalize(b);
  if (sa === sb) return 1.0;
  if (sa.includes(sb) || sb.includes(sa)) return 0.85;

  var bg = _bigrams(sa);
  var bgb = _bigrams(sb);
  if (!bg.length || !bgb.length) return 0;
  var intersection = 0;
  var bSet = bgb.slice();
  bg.forEach(function(g) {
    var idx = bSet.indexOf(g);
    if (idx !== -1) { intersection++; bSet.splice(idx, 1); }
  });
  return (2 * intersection) / (bg.length + bgb.length);
}

function _tokenOverlap(a, b) {
  var ta = _normalize(a).split(/\s+/).filter(function(t){ return t.length > 2; });
  var tb = _normalize(b).split(/\s+/).filter(function(t){ return t.length > 2; });
  if (!ta.length || !tb.length) return 0;
  var matched = ta.filter(function(t) { return tb.some(function(u){ return u.includes(t) || t.includes(u); }); });
  return matched.length / Math.max(ta.length, tb.length);
}

function _normalize(str) {
  return String(str).toLowerCase()
    .replace(/[İI]/g, 'i').replace(/[Şş]/g, 's').replace(/[Çç]/g, 'c')
    .replace(/[Ğğ]/g, 'g').replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function _bigrams(str) {
  var r = [];
  for (var i = 0; i < str.length - 1; i++) r.push(str.slice(i, i+2));
  return r;
}

/* ============================================================
   YARDIMCI FONKSİYONLAR
   ============================================================ */
function _getCell(row, colIdx) {
  if (colIdx === undefined || colIdx === null || !row) return null;
  return row[colIdx] !== undefined ? row[colIdx] : null;
}

function _parseMonth(val) {
  if (!val) return null;
  if (typeof val === 'number') return (val >= 1 && val <= 12) ? val : null;
  var TR_MONTHS = { 'ocak':1,'şubat':2,'subat':2,'mart':3,'nisan':4,'mayıs':5,'mayis':5,
    'haziran':6,'temmuz':7,'ağustos':8,'agustos':8,'eylül':9,'eylul':9,'ekim':10,'kasım':11,'kasim':11,'aralık':12,'aralik':12 };
  var s = String(val).toLowerCase().trim();
  return TR_MONTHS[s] || parseInt(s) || null;
}

function _parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  var n = parseFloat(String(val).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

/* ============================================================
   MAPPING KAYIT (ekranlardan çağrılır)
   ============================================================ */
function recordImportMapping(type, erpName, nsName, userConfirmed) {
  _recordMapping(type, erpName, nsName, userConfirmed ? 0.95 : 0.6);
}

function getImportMappings() { return _loadMappings(); }
function clearImportMappings() { localStorage.removeItem(MAPPING_KEY); }

/* ============================================================
   HEDEF IMPORT — Excel'den hedef girişi
   Beklenen format: ÜRÜN | CARİ/ÜLKE | ADET | EURO | AY | YIL
   veya:           MÜŞTERİ | ÜRÜN | HEDEF EUR | HEDEF ADT | AY | YIL
   ============================================================ */
function processTargetImportFile(file, customers, products, callback) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data     = new Uint8Array(e.target.result);
      var workbook = XLSX.read(data, { type: 'array' });
      var sheet    = workbook.Sheets[workbook.SheetNames[0]];
      var rawRows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      var preview  = _processTargetSheet(rawRows, customers, products);
      callback(preview);
    } catch(err) {
      console.error('Target import error:', err);
      showToast('Dosya okunamadı.');
    }
  };
  reader.onerror = function() { showToast('Dosya okunamadı.'); };
  reader.readAsArrayBuffer(file);
}

function _processTargetSheet(rawRows, customers, products) {
  var headerInfo = _detectTargetHeader(rawRows);
  if (!headerInfo) {
    return { rows: [], rowCount: 0, error: 'Header tespit edilemedi.' };
  }

  var { headerIdx, colMap } = headerInfo;
  var dataRows = rawRows.slice(headerIdx + 1).filter(function(row) {
    return row && row.some(function(c){ return c !== null && c !== ''; });
  });

  var mappings = _loadMappings();
  var processedRows = [];
  var unmatchedCount = 0;

  dataRows.forEach(function(row) {
    var rawCustomer = _getCell(row, colMap.customer);
    var rawCountry  = _getCell(row, colMap.country);
    var rawProduct  = _getCell(row, colMap.product);
    var rawEur      = _getCell(row, colMap.target_eur);
    var rawQty      = _getCell(row, colMap.target_qty);
    var rawMonth    = _getCell(row, colMap.month);
    var rawYear     = _getCell(row, colMap.year);

    if ((!rawCustomer && !rawCountry) || !rawProduct) return;

    var month = _parseMonth(rawMonth);
    var year  = rawYear ? parseInt(rawYear) : null;
    var scope = rawCountry && !rawCustomer ? 'country' : 'customer';

    var matchedCustomer = null;
    var matchedProduct  = null;

    if (scope === 'customer' && rawCustomer) {
      rawCustomer = String(rawCustomer).trim();
      var cm = _matchEntity('customer', rawCustomer, customers.map(function(c){ return c.name; }), mappings, rawCountry);
      matchedCustomer = cm.match ? customers.find(function(c){ return c.name === cm.match; }) : null;
    }

    rawProduct = String(rawProduct).trim();
    var pm = _matchEntity('product', rawProduct, products.map(function(p){ return p.name; }), mappings, null);
    matchedProduct = pm.match ? products.find(function(p){ return p.name === pm.match; }) : null;

    var matched = scope === 'country'
      ? !!matchedProduct
      : !!(matchedCustomer && matchedProduct);

    if (!matched) unmatchedCount++;

    processedRows.push({
      scope:        scope,
      customer_name: rawCustomer ? String(rawCustomer).trim() : null,
      country:      rawCountry  ? String(rawCountry).trim()  : null,
      product_name: rawProduct,
      target_eur:   _parseNumber(rawEur),
      target_qty:   _parseNumber(rawQty),
      month:        month,
      year:         year,
      matched:      matched,
      customer_id:  matchedCustomer ? matchedCustomer.id : null,
      product_id:   matchedProduct  ? matchedProduct.id  : null,
      customer_score: matchedCustomer ? 0.9 : 0,
      product_score:  matchedProduct  ? 0.9 : 0,
    });
  });

  return {
    rows:          processedRows,
    rowCount:      processedRows.length,
    unmatchedCount: unmatchedCount
  };
}

function _detectTargetHeader(rows) {
  var TARGET_PATTERNS = {
    customer:   /^(cari|müşteri|musteri|customer)/i,
    country:    /^(ülke|ulke|country|market)/i,
    product:    /^(ürün|urun|product)/i,
    target_eur: /^(hedef.*eur|eur.*hedef|target.*eur|euro.*hedef|satiş.*eur|satis.*eur|euro|eur)/i,
    target_qty: /^(hedef.*adet|adet.*hedef|target.*qty|qty|adet|miktar)/i,
    month:      /^(ay|month)/i,
    year:       /^(yil|yıl|year)/i,
  };

  for (var i = 0; i < Math.min(rows.length, 10); i++) {
    var row = rows[i]; if (!row || !row.length) continue;
    var colMap = {}; var score = 0;
    row.forEach(function(cell, idx) {
      if (!cell) return;
      var s = String(cell).trim();
      Object.keys(TARGET_PATTERNS).forEach(function(key) {
        if (TARGET_PATTERNS[key].test(s) && colMap[key] === undefined) { colMap[key] = idx; score++; }
      });
    });
    if (colMap.product !== undefined && (colMap.target_eur !== undefined || colMap.target_qty !== undefined)) {
      return { headerIdx: i, colMap: colMap };
    }
  }
  return null;
}
