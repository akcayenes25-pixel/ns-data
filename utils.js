/* NSDATA - utils.js */
/* Shared utility functions — no business logic, no DOM manipulation */

/* ============================================================
   NUMBER PARSING
   ============================================================ */

function parseNum(val) {
  if (val === null || val === undefined || val === '') return null;
  var n = parseFloat(String(val).replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? null : n;
}

function clampMin(val, min) {
  if (val === null) return null;
  return val < min ? min : val;
}

/* ============================================================
   NUMBER FORMATTING
   ============================================================ */

// 257.284 € (no cents, dot thousands, euro right)
function fmtEuro(value, compact) {
  if (value === null || value === undefined || isNaN(value)) return '\u2014';
  var num = parseFloat(value);

  if (compact) {
    if (Math.abs(num) >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M \u20AC';
    }
    if (Math.abs(num) >= 1000) {
      return Math.round(num / 1000) + 'K \u20AC';
    }
  }

  return num.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }) + ' \u20AC';
}

// 12.500,25 (qty with 2 decimals max)
function fmtQty(value) {
  if (value === null || value === undefined || isNaN(value)) return '\u2014';
  var num = parseFloat(value);
  return num.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

// 87.4%
function fmtPct(value) {
  if (value === null || value === undefined || isNaN(value)) return '\u2014';
  return parseFloat(value).toFixed(1) + '%';
}

/* ============================================================
   DATE / TIME
   ============================================================ */

function fmtTime(date) {
  if (!date) return '';
  var d = date instanceof Date ? date : new Date(date);
  var h = String(d.getHours()).padStart(2, '0');
  var m = String(d.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

function fmtDateTime(date) {
  if (!date) return '';
  var d = date instanceof Date ? date : new Date(date);
  var days = ['Paz', 'Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt'];
  var day = days[d.getDay()];
  var dd = String(d.getDate()).padStart(2, '0');
  var mo = String(d.getMonth() + 1).padStart(2, '0');
  var h  = String(d.getHours()).padStart(2, '0');
  var mi = String(d.getMinutes()).padStart(2, '0');
  return day + ' ' + dd + '.' + mo + ' ' + h + ':' + mi;
}

function dataAgeLabel(timestamp) {
  if (!timestamp) return '';
  var now  = new Date();
  var then = new Date(timestamp);
  var diffMs   = now - then;
  var diffMins = Math.floor(diffMs / 60000);
  var diffHrs  = Math.floor(diffMs / 3600000);
  var diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 2)  return 'Az once guncellendi';
  if (diffHrs  < 1)  return diffMins + ' dakika once';
  if (diffDays === 0) return diffHrs + ' saat once guncellendi';
  if (diffDays === 1) return 'Dun guncellendi';
  return diffDays + ' gun once guncellendi';
}

// Returns current month as { month: 1-12, year: YYYY }
function currentMonthYear() {
  var now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

// Check if a date string/object is in the same month+year as reference
function isSameMonth(dateVal, month, year) {
  if (!dateVal) return false;
  var d = new Date(dateVal);
  return d.getMonth() + 1 === month && d.getFullYear() === year;
}

/* ============================================================
   STRING
   ============================================================ */

// Similarity score between two strings (0-1), for customer name matching
function similarityScore(a, b) {
  if (!a || !b) return 0;
  var sa = a.trim().toUpperCase();
  var sb = b.trim().toUpperCase();
  if (sa === sb) return 1;
  if (sa.includes(sb) || sb.includes(sa)) return 0.85;

  // Bigram similarity
  var bigramsA = bigrams(sa);
  var bigramsB = bigrams(sb);
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  var intersection = 0;
  var bSet = bigramsB.slice();
  bigramsA.forEach(function(bg) {
    var idx = bSet.indexOf(bg);
    if (idx !== -1) {
      intersection++;
      bSet.splice(idx, 1);
    }
  });

  return (2 * intersection) / (bigramsA.length + bigramsB.length);
}

function bigrams(str) {
  var result = [];
  for (var i = 0; i < str.length - 1; i++) {
    result.push(str.slice(i, i + 2));
  }
  return result;
}

// Find best matching customer name from a list
function bestMatch(needle, haystack, threshold) {
  threshold = threshold || 0.5;
  var best = null;
  var bestScore = 0;
  haystack.forEach(function(item) {
    var score = similarityScore(needle, item);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });
  return bestScore >= threshold ? { match: best, score: bestScore } : null;
}

/* ============================================================
   DOM HELPERS
   ============================================================ */

function el(id) {
  return document.getElementById(id);
}

function qs(selector, parent) {
  return (parent || document).querySelector(selector);
}

function qsa(selector, parent) {
  return Array.from((parent || document).querySelectorAll(selector));
}

function setHtml(id, html) {
  var node = el(id);
  if (node) node.innerHTML = html;
}

function setText(id, text) {
  var node = el(id);
  if (node) node.textContent = text;
}

function show(id) {
  var node = el(id);
  if (node) node.classList.remove('hidden');
}

function hide(id) {
  var node = el(id);
  if (node) node.classList.add('hidden');
}

/* ============================================================
   UNIQUE ID
   ============================================================ */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ============================================================
   DEBOUNCE
   ============================================================ */

function debounce(fn, ms) {
  var timer = null;
  return function() {
    var args = arguments;
    var ctx  = this;
    clearTimeout(timer);
    timer = setTimeout(function() {
      fn.apply(ctx, args);
    }, ms);
  };
}

/* ============================================================
   PROGRESS COLOR
   ============================================================ */

// Returns CSS class based on percentage
function pctColorClass(pct) {
  if (pct === null || pct === undefined) return 'neutral';
  if (pct >= 100) return 'positive';
  if (pct >= 70)  return 'warning';
  return 'negative';
}

// Returns hex color based on percentage (for canvas/svg)
function pctColor(pct) {
  if (pct === null || pct === undefined) return '#E2E5EF';
  if (pct >= 100) return '#16A34A';
  if (pct >= 70)  return '#D97706';
  return '#DC2626';
}

/* ============================================================
   LIMIT STATUS
   ============================================================ */

// Returns true if limit is critical (conservative <= 0 or within 10% of zero)
function isLimitCritical(conservativeLimit, totalLimit) {
  if (conservativeLimit === null || totalLimit === null) return false;
  if (totalLimit <= 0) return false;
  return conservativeLimit <= (totalLimit * 0.10);
}
