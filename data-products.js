/* NSDATA - data-products.js */
/* Product definition management — price and container ratio editing */
/* Injected into settings/admin area, not a full screen */

var ProductManager = (function() {
  'use strict';

  var _products = [];
  var _saveTimer = null;

  async function load() {
    _products = await dbGetProducts();
    return _products;
  }

  async function upsert(product) {
    if (!product.name || !product.name.trim()) return false;
    if (product.avg_price_eur !== undefined) {
      var price = parseNum(product.avg_price_eur);
      if (price === null || price < 0.01) {
        showToast('Fiyat en az 0.01 olmalıdır');
        return false;
      }
      product.avg_price_eur = price;
    }
    var ok = await dbUpsertProduct(product);
    if (ok) {
      _products = await dbGetProducts();
      emitDataChange('products', {});
    }
    return ok;
  }

  async function updatePrice(productId, newPrice) {
    var price = parseNum(newPrice);
    if (price === null || price < 0.01) {
      showToast('Geçersiz fiyat');
      return false;
    }
    var ok = await dbUpdateProductPrice(productId, price);
    if (ok) {
      _products = await dbGetProducts();
      emitDataChange('products', {});
      showToast('Fiyat güncellendi');
    }
    return ok;
  }

  function getAll() {
    return _products;
  }

  function buildSettingsHTML(products) {
    var rows = products.map(function(p) {
      return '<tr>' +
        '<td style="font-weight:600">' + _esc(p.name) + '</td>' +
        '<td>' +
          '<input type="number" min="0.01" step="0.01" ' +
            'class="product-price-input" ' +
            'data-product-id="' + p.id + '" ' +
            'value="' + (p.avg_price_eur || '') + '" ' +
            'style="width:120px;text-align:right;min-height:48px;font-size:15px;font-weight:700;' +
            'border:1.5px solid #E2E5EF;border-radius:6px;padding:8px 12px" />' +
        '</td>' +
        '<td>' +
          '<input type="number" min="0" ' +
            'class="product-ratio-input" ' +
            'data-product-id="' + p.id + '" ' +
            'value="' + (p.container_ratio || '') + '" ' +
            'style="width:100px;text-align:right;min-height:48px;font-size:15px;font-weight:700;' +
            'border:1.5px solid #E2E5EF;border-radius:6px;padding:8px 12px" />' +
        '</td>' +
        '<td>' +
          '<label style="display:flex;align-items:center;gap:8px;min-height:48px;cursor:pointer">' +
            '<input type="checkbox" ' +
              'class="product-active-input" ' +
              'data-product-id="' + p.id + '" ' +
              (p.active !== false ? 'checked' : '') + ' ' +
              'style="width:20px;height:20px" /> ' +
            'Aktif' +
          '</label>' +
        '</td>' +
        '<td style="padding:8px 12px">' +
          '<button class="product-delete-btn" data-product-id="' + p.id + '" style="color:#DC2626;font-size:13px;font-weight:600;padding:4px 10px;border:1.5px solid #DC2626;border-radius:4px;cursor:pointer;background:transparent">Sil</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<table style="width:100%;border-collapse:collapse;font-size:15px">' +
      '<thead><tr style="background:#F1F3F9">' +
        '<th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">Ürün</th>' +
        '<th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">Ort. Fiyat (EUR)</th>' +
        '<th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">Konteyner Katsayısı</th>' +
        '<th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068">DURUM</th>' +
        '<th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#4A5068"></th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  }

  function bindSettingsEvents(container) {
    if (!container) return;

    container.querySelectorAll('.product-price-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var id = input.getAttribute('data-product-id');
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function() {
          var price = parseNum(input.value);
          if (price && price >= 0.01) updatePrice(id, price);
        }, 800);
      });
    });

    container.querySelectorAll('.product-ratio-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var id    = input.getAttribute('data-product-id');
        var ratio = parseNum(input.value);
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function() {
          upsert({ id: id, container_ratio: ratio });
        }, 800);
      });
    });

    _bindDeleteEvents(container);
    container.querySelectorAll('.product-active-input').forEach(function(input) {
      input.addEventListener('change', function() {
        var id = input.getAttribute('data-product-id');
        upsert({ id: id, active: input.checked });
      });
    });
  }


  async function deleteProduct(productId) {
    if (!confirm('Bu ürünü silmek istediğinizden emin misiniz? İlgili tüm siparişler de silinecek.')) return false;
    var ok = await dbDeleteProduct(productId);
    if (ok) {
      _products = await dbGetProducts();
      emitDataChange('products', {});
      showToast('Ürün silindi');
    }
    return ok;
  }

  function _bindDeleteEvents(container) {
    container.querySelectorAll('.product-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        deleteProduct(btn.getAttribute('data-product-id'));
      });
    });
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load: load, upsert: upsert, updatePrice: updatePrice, deleteProduct: deleteProduct, getAll: getAll, buildSettingsHTML: buildSettingsHTML, bindSettingsEvents: bindSettingsEvents };
})();
