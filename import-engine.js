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
   DÖNEM TESPİTİ — dosya adı veya içerik
   ============================================================ */
var _TR_MONTH_MAP = {
  'ocak':1,'oca':1,'jan':1,'january':1,
  'subat':2,'şubat':2,'feb':2,'february':2,
  'mart':3,'mar':3,'march':3,
  'nisan':4,'nis':4,'apr':4,'april':4,
  'mayis':5,'mayıs':5,'may':5,
  'haziran':6,'haz':6,'jun':6,'june':6,
  'temmuz':7,'tem':7,'jul':7,'july':7,
  'agustos':8,'ağustos':8,'agu':8,'aug':8,'august':8,
  'eylul':9,'eylül':9,'eyl':9,'sep':9,'september':9,
  'ekim':10,'eki':10,'oct':10,'october':10,
  'kasim':11,'kasım':11,'kas':11,'nov':11,'november':11,
  'aralik':12,'aralık':12,'ara':12,'dec':12,'december':12
};

function detectPeriodFromFilename(filename) {
  if (!filename) return null;
  var s = filename.toLowerCase().replace(/[_\-\s\.]/g, ' ');

  // Try: TR month name + year  e.g. "haziran 2026" or "haz2026"
  var tokens = s.split(/\s+/);
  var month = null, year = null;
  tokens.forEach(function(t) {
    if (_TR_MONTH_MAP[t]) month = _TR_MONTH_MAP[t];
    var y = parseInt(t);
    if (y >= 2020 && y <= 2035) year = y;
    // e.g. "haz2026"
    Object.keys(_TR_MONTH_MAP).forEach(function(key) {
      if (t.startsWith(key) && !month) {
        var rest = parseInt(t.slice(key.length));
        if (rest >= 2020 && rest <= 2035) { month = _TR_MONTH_MAP[key]; year = rest; }
      }
    });
  });

  // Try: mm_yyyy or yyyy_mm patterns
  var mmYYYY = s.match(/\b(0?[1-9]|1[0-2])[_\s\-]?(20[2-3]\d)\b/);
  if (mmYYYY && !month) { month = parseInt(mmYYYY[1]); year = parseInt(mmYYYY[2]); }
  var yyyyMM = s.match(/\b(20[2-3]\d)[_\s\-](0?[1-9]|1[0-2])\b/);
  if (yyyyMM && !month) { month = parseInt(yyyyMM[2]); year = parseInt(yyyyMM[1]); }

  if (month && year) return { month: month, year: year, source: 'dosya adı' };
  return null;
}

/* ============================================================
   ANA GİRİŞ NOKTASI
   ============================================================ */
function processImportFile(file, customers, products, filename, callback) {
  if (!file) return;
  // Support old 4-arg signature without filename
  if (typeof filename === 'function') { callback = filename; filename = ''; }
  var filenamePeriod = detectPeriodFromFilename(filename || (file.name || ''));
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data     = new Uint8Array(e.target.result);
      var workbook = XLSX.read(data, { type: 'array' });
      var sheet    = workbook.Sheets[workbook.SheetNames[0]];
      var rawRows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      var preview  = _processSheet(rawRows, customers, products, filenamePeriod);
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
function _processSheet(rawRows, customers, products, filenamePeriod) {
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

    var month = _parseMonth(rawMonth);
    var year  = rawYear ? parseInt(rawYear) : null;

    // Detect per-row period; fallback to filenamePeriod
    var detectedMonth = month || (filenamePeriod ? filenamePeriod.month : null);
    var detectedYear  = year  || (filenamePeriod ? filenamePeriod.year  : null);

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
      detectedMonth:    detectedMonth,
      detectedYear:     detectedYear,
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

  // Detect overall period info
  var uniquePeriods = {};
  processedRows.forEach(function(r) {
    if (r.detectedMonth && r.detectedYear) uniquePeriods[r.detectedMonth + '-' + r.detectedYear] = true;
  });
  var periodKeys = Object.keys(uniquePeriods);
  var detectedPeriod = null;
  if (filenamePeriod) {
    detectedPeriod = { month: filenamePeriod.month, year: filenamePeriod.year, source: 'dosya adı' };
  } else if (periodKeys.length === 1) {
    var parts = periodKeys[0].split('-');
    detectedPeriod = { month: parseInt(parts[0]), year: parseInt(parts[1]), source: 'dosya içeriği' };
  }

  return {
    rows:          processedRows,
    rowCount:      processedRows.length,
    customerCount: Object.keys(customerSet).length,
    productCount:  Object.keys(productSet).length,
    unmatchedCount: unmatchedCount,
    colMap:        colMap,
    detectedPeriod: detectedPeriod,
    multiPeriod:   periodKeys.length > 1,
  };
}

/* ============================================================
   HEADER TESPİTİ — semantik analiz
   ============================================================ */
function _detectHeader(rows) {
  // Bug 9 fix: two-pass euro detection.
  // Pass 1 (strong): tutar/ciro/eur/euro/amount — real revenue totals.
  // Pass 2 (weak):   fiyat — only fills euro if pass 1 found nothing.
  // Prevents "Birim Fiyat" (unit price) from stealing the euro column
  // when a "Satış Tutarı" column appears later in the same header row.
  var COL_STRONG = {
    customer: /(cari|müşteri|musteri|customer|client|firm)/i,
    product:  /(ürün|urun|product|ürn|item|mal adı|mal adi)/i,
    qty:      /(adet|miktar|qty|quantity|\badt\b|adt\/|satiş\s?adt|satis\s?adt|units|m2\b|satis\s?miktari|satış\s?miktarı)/i,
    euro:     /(euro|eur|tutar|ciro|satiş\s?eur|satis\s?eur|amount)/i,
    month:    /(ay\b|month|monthname|mon\b)/i,
    year:     /(yil|yıl|\byear\b|\byr\b)/i,
    country:  /(ülke|ulke|country|market)/i,
  };
  var _WEAK_EURO = /fiyat/i;

  for (var i = 0; i < Math.min(rows.length, 10); i++) {
    var row = rows[i];
    if (!row || !row.length) continue;

    var colMap = {};
    var score  = 0;

    // Pass 1: strong patterns
    row.forEach(function(cell, idx) {
      if (!cell) return;
      var s = String(cell).trim();
      Object.keys(COL_STRONG).forEach(function(key) {
        if (COL_STRONG[key].test(s) && colMap[key] === undefined) {
          colMap[key] = idx;
          score++;
        }
      });
    });

    // Pass 2: fiyat fallback — only if euro not yet found by strong pass
    if (colMap.euro === undefined) {
      row.forEach(function(cell, idx) {
        if (!cell) return;
        if (_WEAK_EURO.test(String(cell).trim()) && colMap.euro === undefined) {
          colMap.euro = idx;
        }
      });
    }

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

  // 1. Exact match (trim + case-insensitive)
  var erpTrimmed = erpName.trim();
  var exactMatch = nsNames.find(function(n) {
    return n.trim().toLowerCase() === erpTrimmed.toLowerCase();
  });
  if (exactMatch) return { match: exactMatch, score: 1.0, alternatives: [] };

  // 2. Normalized exact match
  var erpNorm = _normalize(erpTrimmed);
  var normMatch = nsNames.find(function(n) { return _normalize(n) === erpNorm; });
  if (normMatch) return { match: normMatch, score: 0.98, alternatives: [] };

  var scores = nsNames.map(function(nsName) {
    var score = _calcMatchScore(type, erpName, nsName, mappings, contextHint);
    return { name: nsName, score: score };
  });

  scores.sort(function(a, b) { return b.score - a.score; });

  var best = scores[0];
  var alts = scores.slice(1, 4).filter(function(s){ return s.score > 0.3; });

  // Bug 8 fix: tie-guard.
  // If top two candidates are within TIE_MARGIN of each other, refuse to auto-accept
  // even if the winner is above the 0.45 threshold. Forces manual selection in preview.
  var TIE_MARGIN = 0.08;
  var second = scores[1];
  var isTie = second && best.score >= 0.45 && (best.score - second.score) < TIE_MARGIN;

  return {
    match:        (!isTie && best.score >= 0.45) ? best.name : null,
    score:        best.score,
    ambiguous:    isTie,   // caller can use this to show a warning in preview
    alternatives: alts
  };
}

function _calcMatchScore(type, erpName, nsName, mappings, contextHint) {
  var score = 0;

  // 1. Hafıza skoru — önceki eşleştirmeler (en yüksek ağırlık)
  if (mappings[type] && mappings[type][erpName]) {
    var mem = mappings[type][erpName];
    if (mem.name === nsName) {
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

  // 6. Bug 13 fix: country context boost.
  // If the ERP row has a country code and nsName contains that country's name,
  // boost its score to disambiguate customers who trade under the same name
  // in different countries (e.g. "SOCOREG MAROC" vs "SOCOREG ALGERIE").
  if (contextHint && type === 'customer') {
    var COUNTRY_FRAGS = {
      'MA': ['maroc','morocco','marocco'],
      'DZ': ['algerie','algerian','algeria','alger'],
      'TN': ['tunisie','tunisia','tunis'],
      'LY': ['libye','libya'],
      'EG': ['egypt','egypte'],
      'MR': ['mauritanie','mauritania'],
      'SN': ['senegal'],
    };
    var frags = COUNTRY_FRAGS[String(contextHint).trim().toUpperCase()] || [];
    var nsNormLow = _normalize(nsName);
    if (frags.some(function(f){ return nsNormLow.includes(f); })) {
      score += 0.25;
    }
  }

  return Math.min(score, 1.5); // allow >1.0 so country boost can separate ties
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
  var ALL_MONTHS = {
    'ocak':1,'oca':1,'jan':1,'january':1,
    'şubat':2,'subat':2,'feb':2,'february':2,
    'mart':3,'mar':3,'march':3,
    'nisan':4,'nis':4,'apr':4,'april':4,
    'mayıs':5,'mayis':5,'may':5,
    'haziran':6,'haz':6,'jun':6,'june':6,
    'temmuz':7,'tem':7,'jul':7,'july':7,
    'ağustos':8,'agustos':8,'agu':8,'aug':8,'august':8,
    'eylül':9,'eylul':9,'eyl':9,'sep':9,'september':9,
    'ekim':10,'eki':10,'oct':10,'october':10,
    'kasım':11,'kasim':11,'kas':11,'nov':11,'november':11,
    'aralık':12,'aralik':12,'ara':12,'dec':12,'december':12
  };
  var s = String(val).toLowerCase().trim();
  return ALL_MONTHS[s] || parseInt(s) || null;
}

function _parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  // Strip currency symbols and whitespace, keep digits . , -
  var s = String(val).trim().replace(/[^\d.,\-]/g, '');
  if (!s || s === '-') return null;
  var lastDot   = s.lastIndexOf('.');
  var lastComma = s.lastIndexOf(',');
  if (lastComma > lastDot) {
    // EU format "1.234,56" — dots=thousands, comma=decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    if (lastComma !== -1) {
      // US format "1,234.56" — commas=thousands
      s = s.replace(/,/g, '');
    } else {
      // Only dots: multiple dots = EU thousands ("1.234.567")
      var dotCount = (s.match(/\./g) || []).length;
      if (dotCount > 1) {
        s = s.replace(/\./g, '');
      } else {
        // Single dot — if exactly 3 digits after dot = thousands ("12.500" -> 12500)
        var afterDot = s.slice(lastDot + 1);
        if (afterDot.length === 3) { s = s.replace('.', ''); }
        // else decimal: "1234.56", "1.2" — keep as-is
      }
    }
  }
  var n = parseFloat(s);
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

/* ============================================================
   BÜTÇE IMPORT — "2026 Genel Satış Bütçesi" sheet parser
   Full wipe + rebuild. Mevcut tüm data silinir.
   ============================================================ */

var _BUDGET_SHEET = '2026 Genel Satış Bütçesi';
var _BC = { BOLGE:1, COUNTRY:2, CUST_NAME:4, PROD_NAME:7, YEAR:8, DURUM:9, M0:10 };

function _normBudgetCountry(n) {
  if (!n) return '';
  return String(n).trim().replace(/HIrvatistan/g, 'Hırvatistan');
}

function _extractBolgeNum(s) {
  if (!s) return null;
  var m = String(s).match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function processBudgetImportFile(file, callback) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = new Uint8Array(e.target.result);
      var wb   = XLSX.read(data, { type: 'array', raw: true });

      if (!wb.SheetNames.includes(_BUDGET_SHEET)) {
        return callback({ error: '"' + _BUDGET_SHEET + '" bulunamadı. Mevcut: ' + wb.SheetNames.join(', ') });
      }

      var rows     = XLSX.utils.sheet_to_json(wb.Sheets[_BUDGET_SHEET], { header:1, raw:true, defval:null });
      var dataRows = rows.slice(1).filter(function(r) { return r && r[4]; });

      var groups   = {};
      var warnings = [];

      dataRows.forEach(function(r) {
        var country  = _normBudgetCountry(r[_BC.COUNTRY]);
        var custName = String(r[_BC.CUST_NAME] || '').trim();
        var prodName = String(r[_BC.PROD_NAME] || '').trim();
        var year     = r[_BC.YEAR];
        var durum    = String(r[_BC.DURUM]     || '').trim();
        var bolge    = _extractBolgeNum(r[_BC.BOLGE]);
        if (!country || !custName || !prodName || !year || !durum) return;

        var key = country + '|||' + custName + '|||' + prodName + '|||' + year;
        if (!groups[key]) groups[key] = { country:country, custName:custName, prodName:prodName, year:year, bolge:bolge, rows:{}, dupTypes:[] };
        if (groups[key].rows[durum]) groups[key].dupTypes.push(durum);
        groups[key].rows[durum] = r;
      });

      var productsMap  = {};
      var customersMap = {};
      var rawCombos    = [];
      var dupWarnings  = [];

      Object.values(groups).forEach(function(g) {
        productsMap[g.prodName] = true;

        if (!customersMap[g.custName]) customersMap[g.custName] = { bolge:g.bolge, countries:[] };
        if (customersMap[g.custName].countries.indexOf(g.country) === -1) {
          customersMap[g.custName].countries.push(g.country);
        }

        if (g.dupTypes.length > 0) {
          dupWarnings.push(g.country + ' / ' + g.custName + ' / ' + g.prodName);
        }

        var mR = g.rows['Miktar'];
        var eR = g.rows['Ciro EUR'];
        var uR = g.rows['Ciro USD'];
        var months = [];
        for (var m = 0; m < 12; m++) {
          months.push({
            month:      m + 1,
            target_qty: mR ? _parseNumber(mR[_BC.M0 + m]) : null,
            target_eur: eR ? _parseNumber(eR[_BC.M0 + m]) : null,
            target_usd: uR ? _parseNumber(uR[_BC.M0 + m]) : null
          });
        }
        rawCombos.push({ country:g.country, custName:g.custName, prodName:g.prodName, year:g.year, bolge:g.bolge, months:months });
      });

      if (dupWarnings.length > 0) {
        warnings.push({ type:'duplicate', msg: dupWarnings.length + ' duplicate combo tespit edildi — import sonrası kontrol edin: ' + dupWarnings.slice(0,3).join('; ') + (dupWarnings.length > 3 ? '...' : '') });
      }

      var yeniCount = Object.keys(customersMap).filter(function(n) {
        var l = n.toLowerCase();
        return l.includes('yeni m') && l.includes('teri');
      }).length;
      if (yeniCount > 0) warnings.push({ type:'info', msg: yeniCount + ' "Yeni müşteri" placeholder — aktif müşteri olarak eklenecek' });

      var productList  = Object.keys(productsMap).sort();
      var customerList = Object.keys(customersMap).sort().map(function(name) {
        return { name:name, bolge:customersMap[name].bolge, countries:customersMap[name].countries.sort() };
      });
      var allCountries = [];
      customerList.forEach(function(c) { c.countries.forEach(function(ct) { if (allCountries.indexOf(ct) === -1) allCountries.push(ct); }); });

      callback({
        ok:          true,
        productList: productList,
        customerList:customerList,
        rawCombos:   rawCombos,
        warnings:    warnings,
        stats: {
          products:   productList.length,
          customers:  customerList.length,
          countries:  allCountries.length,
          combos:     rawCombos.length,
          targetRows: rawCombos.length * 12
        }
      });

    } catch(err) {
      console.error('processBudgetImportFile error:', err);
      callback({ error: 'Parse hatası: ' + err.message });
    }
  };
  reader.onerror = function() { callback({ error: 'Dosya okunamadı.' }); };
  reader.readAsArrayBuffer(file);
}

async function confirmBudgetImport(preview, onProgress) {
  try {
    onProgress && onProgress('Realtime durduruluyor...');
    dbPauseRealtime();

    onProgress && onProgress('Mevcut data siliniyor...');
    var wiped = await dbFullWipe();
    if (!wiped) throw new Error('dbFullWipe başarısız oldu');

    // 1. Products (price=1, ratio=1)
    onProgress && onProgress('Ürünler oluşturuluyor (' + preview.productList.length + ')...');
    var productRows = preview.productList.map(function(name) {
      return { name:name, avg_price_eur:1, container_ratio:1, active:true };
    });
    var createdProducts = await dbBulkInsertProducts(productRows);
    var productIdMap = {};
    createdProducts.forEach(function(p) { productIdMap[p.name] = p.id; });

    // 2. Customers
    onProgress && onProgress('Müşteriler oluşturuluyor (' + preview.customerList.length + ')...');
    var customerNames   = preview.customerList.map(function(c) { return c.name; });
    var createdCustomers = await dbBulkAddCustomers(customerNames);
    var customerIdMap   = {};
    createdCustomers.forEach(function(c) { customerIdMap[c.name] = c.id; });

    // 3. Customer countries
    onProgress && onProgress('Müşteri ülkeleri bağlanıyor...');
    var ccPairs = [];
    preview.customerList.forEach(function(c) {
      var custId = customerIdMap[c.name];
      if (!custId) return;
      c.countries.forEach(function(country) {
        ccPairs.push({ customer_id:custId, country:country });
      });
    });
    await dbBulkAddCustomerCountries(ccPairs);

    // 4. Target rows
    onProgress && onProgress('Hedefler oluşturuluyor (' + (preview.rawCombos.length * 12) + ' kayıt)...');
    var targetRows = [];
    preview.rawCombos.forEach(function(combo) {
      var custId = customerIdMap[combo.custName];
      var prodId = productIdMap[combo.prodName];
      if (!custId || !prodId) return;
      combo.months.forEach(function(m) {
        targetRows.push({
          scope:       'customer',
          customer_id: custId,
          country:     combo.country,
          product_id:  prodId,
          month:       m.month,
          year:        combo.year,
          bolge:       combo.bolge,
          target_qty:  m.target_qty,
          target_eur:  m.target_eur,
          target_usd:  m.target_usd
        });
      });
    });

    var inserted = await dbBulkInsertTargets(targetRows, function(done, total) {
      onProgress && onProgress('Hedefler yükleniyor...', done, total);
    });

    var expected = targetRows.length;
    if (inserted < expected) {
      throw new Error(inserted + ' / ' + expected + ' kayıt eklenebildi. Kısmi import — lütfen tekrar deneyin.');
    }

    onProgress && onProgress('Tamamlandı.', inserted, inserted);
    dbResumeRealtime();
    await dbLog('BUDGET_IMPORT', 'targets', 'import',
      preview.stats.customers + ' müşteri, ' + preview.stats.products + ' ürün, ' + inserted + ' hedef');
    emitDataChange('targets', {});

    return { ok:true, inserted:inserted };

  } catch(err) {
    console.error('confirmBudgetImport error:', err);
    dbResumeRealtime();
    return { ok:false, error:err.message };
  }
}
