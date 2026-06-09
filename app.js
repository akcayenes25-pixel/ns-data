/* NSDATA - app.js */
/* Bootstrap, navigation, clock, network status, toast, changelog */
/* No business logic here — only app shell management */

const APP_VERSION = 'v2.0.36';

/* =============================================================
   CHANGELOG KURALLARI — bu yorum konuşma silinse bile koddan okunabilsin
   -------------------------------------------------------------
   Versiyon numarası:
     patch  (x.x.+1) = hata düzeltme veya görsel iyileştirme
     minor  (x.+1.0) = yeni özellik veya ekran
     major  (+1.0.0) = mimari değişiklik veya veri modeli değişikliği
   Her versiyon için:
     - Maksimum 3 madde
     - Türkçe, kullanıcı dilinde, teknik kelime yok
     - Etiket: [Eklendi] yeni özellik | [Düzeltildi] hata | [İyileştirildi] iyileştirme
     - date: deploy anındaki gerçek ay/yıl, Türkçe (örn. "Haziran 2026")
     - Dinamik tarih kullanılmaz, elle yazılır
   ============================================================= */
const CHANGELOG = {
  'v2.0.36': {
    date: 'Haziran 2026',
    items: [
      '[Eklendi] Müşteri arama satırı — tablonun üstünde, yazarak müşteri eklenebiliyor.',
      '[Düzeltildi] Sütun hizalama sorunu giderildi.',
      '[İyileştirildi] Tüm ürün satırları müşteri seçilince geliyor, sipariş olmasa bile.',
    ]
  },
  'v2.0.26': {
    date: 'Haziran 2026',
    items: [
      'Aktivite logu eklendi — her uygulama açılışı ve tüm silme işlemleri kayıt altına alınıyor.',
      'Log ekranı: navbar\'da kırmızı Log butonu, son 200 kayıt görüntüleniyor.',
      'Alt toplam ve genel toplam butonları düzeltildi — listener birikmesi engellendi.',
      'Görünümler menüsü: açılışta Supabase\'den taze yükleniyor, kompakt tasarım, kaydırmalı liste.',
    ]
  },
  'v2.0.11': {
    date: 'Haziran 2026',
    items: [
      'Görünümler menüsü fixed pozisyon sorunu düzeltildi.',
      'Türkçe placeholder düzeltildi.',
    ]
  },
  'v2.0.10': {
    date: 'Haziran 2026',
    items: [
      'Görünümler menüsü buton tıklama sorunu düzeltildi.',
    ]
  },
  'v2.0.9': {
    date: 'Haziran 2026',
    items: [
      'Kaydedilmiş görünümler — mevcut pivot konfigürasyonu isimle kaydedilip Supabase ile senkronize ediliyor.',
      'Görünümler menüsü: Siparişsiz butonunun yanında dropdown, max 10 görünüm, anında uygulama ve silme.',
    ]
  },
  'v2.0.8': {
    date: 'Haziran 2026',
    items: [
      'Hücre girişi iyileştirildi: optimistik güncelleme ile değer anında ekranda görünüyor, re-render yok.',
      'Enter tuşu ile kaydet ve alt hücreye geç.',
      'Input hücrelerinde text cursor ve formatlı görünüm (blur/focus).',
      'Uygulama versiyonu v1.6.0 → v2.0.7 güncellendi, version bump kuralı 4 dosyaya genişletildi.',
    ]
  },
  'v2.0.7': {
    date: 'Haziran 2026',
    items: [
      'Euro ve konteyner hesabı düzeltildi: 1 konteyner = ratio x fiyat doğru hesaplanıyor.',
      'Knt, Adet, Euro sütunları doğru değerleri gösteriyor (m.cnt, m.qty, m.eur ayrımı).',
      'Ürün kayıt sorunu düzeltildi: Ayarlar ekranından eklenen ürünler Supabase de kalıcı.',
      'Service worker cache sorunu çözüldü: network-first strateji, eski cache otomatik temizleniyor.',
    ]
  },
  'v1.6.0': {
    date: 'Haziran 2026',
    items: [
      'destination_country mimarisi tamamlandı — ülke bilgisi artık sipariş satırında.',
      'Dashboard: ülke kolonu orders.destination_country üzerinden geliyor.',
      'Müşteri detay: sipariş ülkeleri dinamik gösteriliyor.',
      'Ülke detay ekranı destination_country üzerinden çalışıyor.',
      'Euro format denetimi tamamlandı.',
    ]
  },
  'v1.5.0': {
    date: 'Haziran 2026',
    items: [
      'Hedef import — Excel ile müşteri ve ülke bazlı hedef yükleme.',
      'Yüksek DPI / Retina ekran desteği eklendi.',
      'Tüm dosyalarda Türkçe karakter ve entity final temizliği.',
    ]
  },
  'v1.4.0': {
    date: 'Haziran 2026',
    items: [
      'Siparişler: çıkan/çıkacak ayrı kolon grupları, her grup 3 girdi (adet/euro/konteyner) three-way.',
      'Siparişler: destination_country — her sipariş satırına ülke girilebilir.',
      'Siparişler: import onay ekranı — eşleşmeyen satırlar için manual dropdown + güven skoru.',
      'Limitler: Limit-1 (tablo + expand) ve Limit-2 (inline) görünümleri.',
      'Ayarlar: müşteri ve ürün silme butonu eklendi.',
      'Türkçe metin ve entity sorunları giderildi.',
    ]
  },
  'v1.3.0': {
    date: 'Haziran 2026',
    items: [
      'Tüm ekranlarda HTML entity Türkçe karakter sorunu giderildi.',
      'Siparişler ve Dashboard tablo header sticky sorunu düzeltildi.',
      'Akıllı ERP import motoru — çok formatlı, öğrenen eşleştirme sistemi.',
      'Import: hafıza sistemi, token overlap, bigram benzerlik, kısaltma tespiti.',
    ]
  },
  'v1.2.0': {
    date: 'Haziran 2026',
    items: [
      'Siparişler ekranı — TradingView filtre bar, chip sistemi, kolon sort, kolon göster/gizle, grup collapse.',
      'Limitler ekranı — filtre bar, ülke filtresi, sort, sub_market desteği.',
      'Hedef sistemi yeniden tasarlandı — ürün × müşteri ve ürün × ülke bazlı hedefler.',
      'Müşteri alt pazar (sub_market) desteği eklendi.',
      'Ayarlar ekranında hedef sekmeleri: Müşteri Hedefleri / Ülke Hedefleri.',
      'Müşteri ekleme formuna alt pazar alanı eklendi.',
    ]
  },
  'v1.1.0': {
    date: 'Haziran 2026',
    items: [
      'Excel import motoru yeniden yazıldı — kolon eşleşme hatası giderildi.',
      'Excel export Türkçe karakter sorunu düzeltildi.',
      'Tüm ekranlarda Türkçe metin düzeltmeleri uygulandı.',
      'Dashboard tablosunda yatay kaydırma sorunu giderildi.',
      'Profil linki artık doğru ekrana yönlendiriyor.',
    ]
  },
  'v1.0.1': {
    date: 'Haziran 2026',
    items: [
      'Navbar\'a tarih ve aya kalan iş günü sayacı eklendi.',
      'Siparişler ekranına manuel satır ekleme özelliği getirildi.',
      'Analiz ekranında Türkçe metin ve taşma sorunları düzeltildi.',
      'Limitler ekranında pasif müşteriler artık gizleniyor.',
    ]
  },
  'v1.0.0': {
    date: 'Haziran 2026',
    items: [
      'Uygulama ilk sürümü yayınlandı.',
      'Dashboard, Siparişler, Limitler, Analiz ekranları aktif.',
      'Cari, Ülke ve Ürün detay panelleri eklendi.',
      'Supabase gerçek zamanlı veri senkronizasyonu.',
      'Excel import ve export desteği.',
      'PDF rapor alma özelliği.',
    ]
  }
};

/* ============================================================
   NAVIGATION
   ============================================================ */
const SCREENS = ['dashboard', 'orders', 'limits', 'analysis', 'settings', 'log', 'customer', 'country', 'product'];
const DETAIL_SCREENS = ['customer', 'country', 'product'];

let activeScreen = 'dashboard';

function navigateTo(screenId, params) {
  if (!SCREENS.includes(screenId)) return;

  // Update URL state
  const url = new URL(window.location.href);
  url.searchParams.set('screen', screenId);
  if (params) {
    Object.keys(params).forEach(function(key) {
      url.searchParams.set(key, params[key]);
    });
  } else {
    // Clear detail params when navigating to main screens
    url.searchParams.delete('id');
  }
  window.history.pushState({ screen: screenId, params: params || {} }, '', url.toString());

  _activateScreen(screenId);
}

function _activateScreen(screenId) {
  activeScreen = screenId;

  // Update screen visibility
  SCREENS.forEach(function(id) {
    var el = document.getElementById('screen-' + id);
    if (el) {
      el.classList.toggle('active', id === screenId);
    }
  });

  // Update nav buttons (only for main screens)
  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    var target = btn.getAttribute('data-screen');
    btn.classList.toggle('active', target === screenId);
    btn.setAttribute('aria-selected', target === screenId ? 'true' : 'false');
  });

  // Notify screen module
  var event = new CustomEvent('nsdata:screenActivated', { detail: { screen: screenId } });
  document.dispatchEvent(event);
}

function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var target = btn.getAttribute('data-screen');
      if (target) navigateTo(target);
    });
  });

  // Browser back/forward
  window.addEventListener('popstate', function(e) {
    var screen = (e.state && e.state.screen) ? e.state.screen : 'dashboard';
    _activateScreen(screen);
  });

  // Restore from URL on load
  var urlParams = new URLSearchParams(window.location.search);
  var screen = urlParams.get('screen');
  if (screen && SCREENS.includes(screen)) {
    _activateScreen(screen);
  }

  // Profile link: ?profile=TOKEN → navigate to dashboard, store token for display
  var profileToken = urlParams.get('profile');
  if (profileToken) {
    _activateScreen('dashboard');
    // Store for use by screens
    window._nsProfileToken = profileToken;
  }
}

/* ============================================================
   CLOCK
   ============================================================ */
function initClock() {
  var clockEl = document.getElementById('nav-clock');
  if (!clockEl) return;

  var TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

  function calcWorkdaysLeft(from) {
    // Count remaining weekdays from tomorrow up to last weekday of this month (inclusive)
    var year  = from.getFullYear();
    var month = from.getMonth();
    // Find last weekday of month
    var lastDay = new Date(year, month + 1, 0); // last calendar day
    while (lastDay.getDay() === 0 || lastDay.getDay() === 6) {
      lastDay.setDate(lastDay.getDate() - 1);
    }
    // Count Mon-Fri from day after 'from' up to lastDay
    var count = 0;
    var d = new Date(from);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    var end = new Date(lastDay);
    end.setHours(0, 0, 0, 0);
    while (d <= end) {
      var dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function tick() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');

    var dateStr = now.getDate() + ' ' + TR_MONTHS[now.getMonth()] + ' ' + now.getFullYear();
    var wdLeft  = calcWorkdaysLeft(now);
    var wdLabel = wdLeft === 0 ? 'Son iş günü' : ('Aya ' + wdLeft + ' iş günü kaldı');

    clockEl.innerHTML =
      '<span style="font-weight:500;color:var(--color-text-secondary)">' + dateStr + '</span>' +
      '<span style="margin:0 6px;color:var(--color-border)">|</span>' +
      '<span style="font-weight:500;color:var(--color-accent)">' + wdLabel + '</span>' +
      '<span style="margin:0 6px;color:var(--color-border)">|</span>' +
      '<span style="font-feature-settings:\'tnum\'">' + h + ':' + m + ':' + s + '</span>';
  }

  tick();
  setInterval(tick, 1000);
}

/* ============================================================
   NETWORK STATUS
   ============================================================ */
var _lastOnlineTime = null;

function initNetworkStatus() {
  var banner = document.getElementById('network-banner');
  var bannerText = document.getElementById('network-banner-text');
  if (!banner || !bannerText) return;

  function updateBanner() {
    if (navigator.onLine) {
      _lastOnlineTime = new Date();
      banner.classList.add('hidden');
    } else {
      var timeStr = _lastOnlineTime ? formatTime(_lastOnlineTime) : 'bilinmiyor';
      bannerText.textContent = 'İnternet bağlantısı yok — son güncelleme: ' + timeStr;
      banner.classList.remove('hidden');
    }
  }

  window.addEventListener('online', updateBanner);
  window.addEventListener('offline', updateBanner);
  updateBanner();
}

/* ============================================================
   DATA AGE DISPLAY
   ============================================================ */
function updateDataAge(timestamp) {
  var el = document.getElementById('nav-data-age');
  var footerEl = document.getElementById('footer-last-update');
  if (!timestamp) return;

  var now = new Date();
  var then = new Date(timestamp);
  var diffMs = now - then;
  var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  var diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  var label = '';
  if (diffDays === 0) {
    if (diffHours === 0) {
      label = 'Az önce güncellendi';
    } else {
      label = diffHours + ' saat önce güncellendi';
    }
  } else if (diffDays === 1) {
    label = 'Dun güncellendi';
  } else {
    label = diffDays + ' gün önce güncellendi';
  }

  if (el) el.textContent = label;
  if (footerEl) footerEl.textContent = 'Son güncelleme: ' + formatDateTime(then);
}

/* ============================================================
   FILTER BANNER
   ============================================================ */
var _activeFilter = null;

function showFilterBanner(label) {
  var banner = document.getElementById('filter-banner');
  var text = document.getElementById('filter-banner-text');
  if (!banner || !text) return;
  _activeFilter = label;
  text.textContent = 'Filtre aktif: ' + label;
  banner.classList.remove('hidden');
}

function hideFilterBanner() {
  var banner = document.getElementById('filter-banner');
  if (!banner) return;
  _activeFilter = null;
  banner.classList.add('hidden');
  var event = new CustomEvent('nsdata:filterCleared');
  document.dispatchEvent(event);
}

function initFilterBanner() {
  var clearBtn = document.getElementById('filter-banner-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', hideFilterBanner);
  }
}

/* ============================================================
   TOAST
   ============================================================ */
var _toastTimer = null;

function showToast(message, duration) {
  duration = duration || 2500;
  var toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove('hidden');

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() {
    toast.classList.add('hidden');
  }, duration);
}

/* ============================================================
   CHANGELOG MODAL
   ============================================================ */
var CHANGELOG_SEEN_KEY = 'nsdata_changelog_seen_' + APP_VERSION;

function initChangelog() {
  var modal = document.getElementById('changelog-modal');
  var closeBtn = document.getElementById('changelog-close');
  var backdrop = document.getElementById('changelog-backdrop');
  var badge = document.getElementById('footer-version-badge');
  var navVersion = document.getElementById('nav-version');

  if (navVersion) navVersion.textContent = APP_VERSION;
  if (badge) badge.textContent = APP_VERSION;

  // Populate changelog content
  _renderChangelog();

  // Open on badge click
  if (badge) {
    badge.addEventListener('click', function() {
      openChangelog();
    });
  }

  // Close handlers
  if (closeBtn) closeBtn.addEventListener('click', closeChangelog);
  if (backdrop) backdrop.addEventListener('click', closeChangelog);

  // Keyboard close
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeChangelog();
  });

  // Auto-show on first visit for this version
  var seen = localStorage.getItem(CHANGELOG_SEEN_KEY);
  if (!seen) {
    setTimeout(openChangelog, 800);
  }
}

function _renderChangelog() {
  var body = document.getElementById('changelog-body');
  if (!body) return;

  var html = '';
  Object.keys(CHANGELOG).forEach(function(version) {
    var entry = CHANGELOG[version];
    html += '<div style="margin-bottom: 20px;">';
    html += '<div style="font-weight: 700; font-size: 16px; color: #4F46E5; margin-bottom: 4px;">' + version + '</div>';
    html += '<div style="font-size: 13px; color: #4A5068; margin-bottom: 10px;">' + entry.date + '</div>';
    html += '<ul style="list-style: none; display: flex; flex-direction: column; gap: 6px;">';
    entry.items.forEach(function(item) {
      html += '<li style="display: flex; gap: 8px; align-items: flex-start;">';
      html += '<span style="color: #16A34A; flex-shrink: 0; margin-top: 2px;">✓</span>';
      html += '<span>' + item + '</span>';
      html += '</li>';
    });
    html += '</ul></div>';
  });

  body.innerHTML = html;
}

function openChangelog() {
  var modal = document.getElementById('changelog-modal');
  if (modal) {
    modal.classList.remove('hidden');
    localStorage.setItem(CHANGELOG_SEEN_KEY, '1');
  }
}

function closeChangelog() {
  var modal = document.getElementById('changelog-modal');
  if (modal) modal.classList.add('hidden');
}

/* ============================================================
   FORMAT HELPERS (shared across screens)
   ============================================================ */
function formatEuro(value, compact) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  var num = parseFloat(value);

  if (compact) {
    if (Math.abs(num) >= 1000000) {
      return (num / 1000000).toFixed(1).replace('.', ',') + 'M \u20AC';
    }
    if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(0) + 'K \u20AC';
    }
  }

  return num.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }) + ' \u20AC';
}

function formatQty(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return parseFloat(value).toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return parseFloat(value).toFixed(1) + '%';
}

function formatTime(date) {
  if (!date) return '';
  var h = String(date.getHours()).padStart(2, '0');
  var m = String(date.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

function formatDateTime(date) {
  if (!date) return '';
  var days = ['Paz', 'Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt'];
  var day = days[date.getDay()];
  var d = String(date.getDate()).padStart(2, '0');
  var mo = String(date.getMonth() + 1).padStart(2, '0');
  var h = String(date.getHours()).padStart(2, '0');
  var mi = String(date.getMinutes()).padStart(2, '0');
  return day + ' ' + d + '.' + mo + ' ' + h + ':' + mi;
}

/* ============================================================
   REALTIME EVENT BUS
   ============================================================ */
function emitDataChange(table, payload) {
  var event = new CustomEvent('nsdata:dataChanged', {
    detail: { table: table, payload: payload }
  });
  document.dispatchEvent(event);
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
  // Supabase must init before anything else
  dbInit();

  // Log boot snapshot — records customer/product counts at startup
  setTimeout(dbLogSnapshot, 2000);

  // Pre-load managers so orders screen filter lists are ready
  Promise.all([CustomerManager.load(), ProductManager.load()]).catch(function(e){ console.warn('Manager preload:', e); });

  initNavigation();
  initClock();
  initNetworkStatus();
  initFilterBanner();
  initChangelog();

  // Init screen modules (each screen registers itself)
  var event = new CustomEvent('nsdata:appReady');
  document.dispatchEvent(event);
});
