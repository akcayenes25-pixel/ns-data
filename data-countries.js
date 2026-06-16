/* NSDATA - data-countries.js
   Dunya ulkeleri normalizasyon mapping.
   Her ulke icin EN/FR/TR/AR/ES/DE/IT/PT varyasyonlari → sistem kodu (BUYUK HARF TURKCE)
   Sistem kodlari: customer_countries.country alanindaki degerler.
   Yeni ulke eklenince bu dosyaya da eklenmeli.
*/

var CountryNormalizer = (function() {
  'use strict';

  // Mapping: normalize edilmis string → sistem kodu
  // Sistem kodu = Turkce buyuk harf tam isim (FAS, TUNUS, CEZAYIR gibi)
  var _map = {
    // FAS / Maroc / Morocco
    'fas': 'FAS', 'maroc': 'FAS', 'morocco': 'FAS', 'marruecos': 'FAS',
    'maroko': 'FAS', 'royaume du maroc': 'FAS', 'kingdom of morocco': 'FAS',
    'al maghrib': 'FAS', 'المغرب': 'FAS', 'marokko': 'FAS', 'marocco': 'FAS',
    'marrocos': 'FAS', 'ma': 'FAS', 'mar': 'FAS',

    // TUNUS / Tunisie / Tunisia
    'tunus': 'TUNUS', 'tunisie': 'TUNUS', 'tunisia': 'TUNUS', 'tunesia': 'TUNUS',
    'tunez': 'TUNUS', 'تونس': 'TUNUS', 'republic of tunisia': 'TUNUS',
    'republique tunisienne': 'TUNUS', 'tunusia': 'TUNUS', 'tn': 'TUNUS',
    'tun': 'TUNUS',

    // CEZAYİR / Algérie / Algeria
    'cezayir': 'CEZAYİR', 'algerie': 'CEZAYİR', 'algérie': 'CEZAYİR',
    'algeria': 'CEZAYİR', 'الجزائر': 'CEZAYİR', 'cezair': 'CEZAYİR',
    'cezayr': 'CEZAYİR', 'republic of algeria': 'CEZAYİR',
    'republique algerienne': 'CEZAYİR', 'algeriya': 'CEZAYİR',
    'dz': 'CEZAYİR', 'alg': 'CEZAYİR', 'cez': 'CEZAYİR',

    // LİBYA
    'libya': 'LİBYA', 'libia': 'LİBYA', 'libiya': 'LİBYA', 'libye': 'LİBYA',
    'libyen': 'LİBYA', 'ليبيا': 'LİBYA', 'libyan arab jamahiriya': 'LİBYA',
    'ly': 'LİBYA', 'lib': 'LİBYA',

    // MISIR / Égypte / Egypt
    'misir': 'MISIR', 'mısır': 'MISIR', 'egypt': 'MISIR', 'egypte': 'MISIR',
    'égypte': 'MISIR', 'egitto': 'MISIR', 'egipto': 'MISIR', 'مصر': 'MISIR',
    'arab republic of egypt': 'MISIR', 'eg': 'MISIR', 'mis': 'MISIR',

    // SENEGAL
    'senegal': 'SENEGAL', 'sénégal': 'SENEGAL', 'senégal': 'SENEGAL',
    'سنغال': 'SENEGAL', 'sn': 'SENEGAL', 'sen': 'SENEGAL',

    // MAURİTANYA
    'mauritanya': 'MAURİTANYA', 'mauritanie': 'MAURİTANYA', 'mauritania': 'MAURİTANYA',
    'موريتانيا': 'MAURİTANYA', 'mr': 'MAURİTANYA',

    // MALİ
    'mali': 'MALİ', 'مالي': 'MALİ', 'republic of mali': 'MALİ', 'ml': 'MALİ',

    // NİJER
    'nijer': 'NİJER', 'niger': 'NİJER', 'نيجر': 'NİJER', 'ne': 'NİJER',

    // NİJERYA
    'nijerya': 'NİJERYA', 'nigeria': 'NİJERYA', 'نيجيريا': 'NİJERYA', 'ng': 'NİJERYA',

    // KOTE DİVUAR / Ivory Coast / Fildişi Kıyısı
    'kote divuar': 'KOTE DİVUAR', "cote d'ivoire": 'KOTE DİVUAR',
    'ivory coast': 'KOTE DİVUAR', 'ci': 'KOTE DİVUAR',
    'fildisi kiyisi': 'KOTE DİVUAR', 'fildişi kıyısı': 'KOTE DİVUAR',
    'cote divoire': 'KOTE DİVUAR', 'côte d\'ivoire': 'KOTE DİVUAR',

    // GANA
    'gana': 'GANA', 'ghana': 'GANA', 'gh': 'GANA',

    // KAMERUN
    'kamerun': 'KAMERUN', 'kamerin': 'KAMERUN', 'cameroun': 'KAMERUN', 'cameroon': 'KAMERUN',
    'cm': 'KAMERUN',

    // GABİYA
    'gambiya': 'GAMBİYA', 'gambia': 'GAMBİYA', 'gm': 'GAMBİYA',

    // GİNE
    'gine': 'GİNE', 'guinee': 'GİNE', 'guinea': 'GİNE', 'gn': 'GİNE',

    // BURKINA FASO
    'burkina faso': 'BURKINA FASO', 'bf': 'BURKINA FASO',

    // TOGO
    'togo': 'TOGO', 'tg': 'TOGO',

    // BENİN
    'benin': 'BENİN', 'bénin': 'BENİN', 'bj': 'BENİN',

    // KONGO
    'kongo': 'KONGO', 'congo': 'KONGO', 'cg': 'KONGO',

    // DEMOKRATIK KONGO
    'demokratik kongo': 'DEMOKRATİK KONGO', 'dr congo': 'DEMOKRATİK KONGO',
    'democratic republic of the congo': 'DEMOKRATİK KONGO', 'cd': 'DEMOKRATİK KONGO',
    'rdc': 'DEMOKRATİK KONGO', 'drc': 'DEMOKRATİK KONGO',

    // ANGOlA
    'angola': 'ANGOLA', 'ao': 'ANGOLA',

    // MOZAMBİK
    'mozambik': 'MOZAMBİK', 'mozambique': 'MOZAMBİK', 'mz': 'MOZAMBİK',

    // TANZANYA
    'tanzanya': 'TANZANYA', 'tanzania': 'TANZANYA', 'tz': 'TANZANYA',

    // KENYA
    'kenya': 'KENYA', 'ke': 'KENYA',

    // ETİYOPYA
    'etiyopya': 'ETİYOPYA', 'ethiopia': 'ETİYOPYA', 'et': 'ETİYOPYA',

    // SOMALI
    'somali': 'SOMALİ', 'somalia': 'SOMALİ', 'so': 'SOMALİ',

    // SUDAN
    'sudan': 'SUDAN', 'sd': 'SUDAN',

    // GÜNEY SUDAN
    'guney sudan': 'GÜNEY SUDAN', 'south sudan': 'GÜNEY SUDAN', 'ss': 'GÜNEY SUDAN',

    // ERİTRE
    'eritre': 'ERİTRE', 'eritrea': 'ERİTRE', 'er': 'ERİTRE',

    // CİBUTİ
    'cibuti': 'CİBUTİ', 'djibouti': 'CİBUTİ', 'dj': 'CİBUTİ',

    // RWANDA
    'rwanda': 'RWANDA', 'rw': 'RWANDA',

    // BURUNDİ
    'burundi': 'BURUNDİ', 'bi': 'BURUNDİ',

    // UGANDA
    'uganda': 'UGANDA', 'ug': 'UGANDA',

    // ZAMBİYA
    'zambiya': 'ZAMBİYA', 'zambia': 'ZAMBİYA', 'zm': 'ZAMBİYA',

    // ZİMBABWE
    'zimbabwe': 'ZİMBABWE', 'zw': 'ZİMBABWE',

    // MADAGASKAr
    'madagaskar': 'MADAGASKAR', 'madagascar': 'MADAGASKAR', 'mg': 'MADAGASKAR',

    // GÜNEY AFRİKA
    'guney afrika': 'GÜNEY AFRİKA', 'south africa': 'GÜNEY AFRİKA',
    'afrique du sud': 'GÜNEY AFRİKA', 'za': 'GÜNEY AFRİKA',

    // BOTSVANA
    'botsvana': 'BOTSVANA', 'botswana': 'BOTSVANA', 'bw': 'BOTSVANA',

    // NAMİBYA
    'namibya': 'NAMİBYA', 'namibia': 'NAMİBYA', 'na': 'NAMİBYA',

    // TÜRKİYE
    'turkiye': 'TÜRKİYE', 'turkey': 'TÜRKİYE', 'turquie': 'TÜRKİYE',
    'türkiye': 'TÜRKİYE', 'turkei': 'TÜRKİYE', 'tr': 'TÜRKİYE',

    // ALMANYA
    'almanya': 'ALMANYA', 'germany': 'ALMANYA', 'allemagne': 'ALMANYA',
    'deutschland': 'ALMANYA', 'de': 'ALMANYA',

    // FRANSA
    'fransa': 'FRANSA', 'france': 'FRANSA', 'fr': 'FRANSA',

    // İTALYA
    'italya': 'İTALYA', 'italy': 'İTALYA', 'italie': 'İTALYA',
    'italia': 'İTALYA', 'it': 'İTALYA',

    // İSPANYA
    'ispanya': 'İSPANYA', 'spain': 'İSPANYA', 'espagne': 'İSPANYA',
    'espana': 'İSPANYA', 'españa': 'İSPANYA', 'es': 'İSPANYA',

    // PORTEKİZ
    'portekiz': 'PORTEKİZ', 'portugal': 'PORTEKİZ', 'pt': 'PORTEKİZ',

    // BİRLEŞİK KRALLIK
    'birlesik krallik': 'BİRLEŞİK KRALLIK', 'uk': 'BİRLEŞİK KRALLIK',
    'united kingdom': 'BİRLEŞİK KRALLIK', 'great britain': 'BİRLEŞİK KRALLIK',
    'gb': 'BİRLEŞİK KRALLIK', 'england': 'BİRLEŞİK KRALLIK',

    // HOLLANDA
    'hollanda': 'HOLLANDA', 'netherlands': 'HOLLANDA', 'pays-bas': 'HOLLANDA',
    'nederland': 'HOLLANDA', 'nl': 'HOLLANDA',

    // BELÇİKA
    'belcika': 'BELÇİKA', 'belgium': 'BELÇİKA', 'belgique': 'BELÇİKA',
    'belgie': 'BELÇİKA', 'be': 'BELÇİKA',

    // İSVİÇRE
    'isvicre': 'İSVİÇRE', 'switzerland': 'İSVİÇRE', 'suisse': 'İSVİÇRE',
    'schweiz': 'İSVİÇRE', 'ch': 'İSVİÇRE',

    // AVUSTURYA
    'avusturya': 'AVUSTURYA', 'austria': 'AVUSTURYA', 'autriche': 'AVUSTURYA',
    'osterreich': 'AVUSTURYA', 'österreich': 'AVUSTURYA', 'at': 'AVUSTURYA',

    // POLONYA
    'polonya': 'POLONYA', 'poland': 'POLONYA', 'pologne': 'POLONYA',
    'polska': 'POLONYA', 'pl': 'POLONYA',

    // RUSYA
    'rusya': 'RUSYA', 'russia': 'RUSYA', 'russie': 'RUSYA',
    'rossiya': 'RUSYA', 'ru': 'RUSYA',

    // UKRAYNA
    'ukrayna': 'UKRAYNA', 'ukraine': 'UKRAYNA', 'ua': 'UKRAYNA',

    // YUNANİSTAN
    'yunanistan': 'YUNANİSTAN', 'greece': 'YUNANİSTAN', 'grece': 'YUNANİSTAN',
    'grèce': 'YUNANİSTAN', 'gr': 'YUNANİSTAN',

    // ROMANYA
    'romanya': 'ROMANYA', 'romania': 'ROMANYA', 'roumanie': 'ROMANYA',
    'ro': 'ROMANYA',

    // BULGARİSTAN
    'bulgaristan': 'BULGARİSTAN', 'bulgaria': 'BULGARİSTAN', 'bulgarie': 'BULGARİSTAN',
    'bg': 'BULGARİSTAN',

    // SURİYE
    'suriye': 'SURİYE', 'syria': 'SURİYE', 'syrie': 'SURİYE',
    'سوريا': 'SURİYE', 'sy': 'SURİYE',

    // IRAK
    'irak': 'IRAK', 'iraq': 'IRAK', 'العراق': 'IRAK', 'iq': 'IRAK',

    // İRAN
    'iran': 'İRAN', 'persia': 'İRAN', 'ir': 'İRAN',

    // SUUDİ ARABİSTAN
    'suudi arabistan': 'SUUDİ ARABİSTAN', 'saudi arabia': 'SUUDİ ARABİSTAN',
    'arabie saoudite': 'SUUDİ ARABİSTAN', 'sa': 'SUUDİ ARABİSTAN',

    // BİRLEŞİK ARAP EMİRLİKLERİ
    'bae': 'BAE', 'uae': 'BAE', 'united arab emirates': 'BAE',
    'emirats arabes unis': 'BAE', 'ae': 'BAE',

    // KATAR
    'katar': 'KATAR', 'qatar': 'KATAR', 'qa': 'KATAR',

    // KUVEYT
    'kuveyt': 'KUVEYT', 'kuwait': 'KUVEYT', 'kw': 'KUVEYT',

    // ÜRDÜN
    'urdun': 'ÜRDÜN', 'jordan': 'ÜRDÜN', 'jordanie': 'ÜRDÜN',
    'الأردن': 'ÜRDÜN', 'jo': 'ÜRDÜN',

    // LİBANON
    'libanos': 'LİBNAN', 'libnan': 'LİBNAN', 'lebanon': 'LİBNAN',
    'liban': 'LİBNAN', 'lb': 'LİBNAN',

    // PAKİSTAN
    'pakistan': 'PAKİSTAN', 'pk': 'PAKİSTAN',

    // HİNDİSTAN
    'hindistan': 'HİNDİSTAN', 'india': 'HİNDİSTAN', 'inde': 'HİNDİSTAN',
    'in': 'HİNDİSTAN',

    // ÇİN
    'cin': 'ÇİN', 'china': 'ÇİN', 'chine': 'ÇİN', 'cn': 'ÇİN',

    // JAPONYA
    'japonya': 'JAPONYA', 'japan': 'JAPONYA', 'japon': 'JAPONYA',
    'jp': 'JAPONYA',

    // GÜNEY KORE
    'guney kore': 'GÜNEY KORE', 'south korea': 'GÜNEY KORE',
    'coree du sud': 'GÜNEY KORE', 'kr': 'GÜNEY KORE',

    // ENDONEZYA
    'endonezya': 'ENDONEZYA', 'indonesia': 'ENDONEZYA', 'id': 'ENDONEZYA',

    // MALEZYA
    'malezya': 'MALEZYA', 'malaysia': 'MALEZYA', 'my': 'MALEZYA',

    // TAİLAND
    'tailand': 'TAİLAND', 'thailand': 'TAİLAND', 'th': 'TAİLAND',

    // VİETNAM
    'vietnam': 'VİETNAM', 'viet nam': 'VİETNAM', 'vn': 'VİETNAM',

    // FİLİPİNLER
    'filipinler': 'FİLİPİNLER', 'philippines': 'FİLİPİNLER', 'ph': 'FİLİPİNLER',

    // BANGALDEŞ
    'banglades': 'BANGLADEŞ', 'bangladesh': 'BANGLADEŞ', 'bd': 'BANGLADEŞ',

    // SRİ LANKA
    'sri lanka': 'SRİ LANKA', 'lk': 'SRİ LANKA',

    // AMERİKA BİRLEŞİK DEVLETLERİ
    'abd': 'ABD', 'usa': 'ABD', 'us': 'ABD',
    'united states': 'ABD', 'etats-unis': 'ABD', 'america': 'ABD',

    // KANADA
    'kanada': 'KANADA', 'canada': 'KANADA', 'ca': 'KANADA',

    // MEKSİKA
    'meksika': 'MEKSİKA', 'mexico': 'MEKSİKA', 'mexique': 'MEKSİKA',
    'mx': 'MEKSİKA',

    // BREZİLYA
    'brezilya': 'BREZİLYA', 'brazil': 'BREZİLYA', 'bresil': 'BREZİLYA',
    'brasil': 'BREZİLYA', 'br': 'BREZİLYA',

    // ARJANTİN
    'arjantin': 'ARJANTİN', 'argentina': 'ARJANTİN', 'ar': 'ARJANTİN',

    // ŞİLİ
    'sili': 'ŞİLİ', 'chile': 'ŞİLİ', 'cl': 'ŞİLİ',

    // AVUSTRALYA
    'avustralya': 'AVUSTRALYA', 'australia': 'AVUSTRALYA', 'au': 'AVUSTRALYA',

    // YENİ ZELANDA
    'yeni zelanda': 'YENİ ZELANDA', 'new zealand': 'YENİ ZELANDA', 'nz': 'YENİ ZELANDA',
  };

  // Turkce normalize: kucuk harf + bazi ozel karakterleri temizle
  function _norm(str) {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .replace(/\u00e9/g, 'e').replace(/\u00e8/g, 'e').replace(/\u00ea/g, 'e').replace(/\u00eb/g, 'e')
      .replace(/\u00e0/g, 'a').replace(/\u00e2/g, 'a').replace(/\u00e4/g, 'a')
      .replace(/\u00f4/g, 'o').replace(/\u00f3/g, 'o').replace(/\u00f6/g, 'o')
      .replace(/\u00fa/g, 'u').replace(/\u00fc/g, 'u').replace(/\u00f9/g, 'u').replace(/\u00fb/g, 'u')
      .replace(/\u00ee/g, 'i').replace(/\u00ef/g, 'i')
      .replace(/\u00f1/g, 'n').replace(/\u00e7/g, 'c')
      .replace(/\u015f/g, 's').replace(/\u011f/g, 'g').replace(/\u0131/g, 'i')
      .replace(/\u0130/g, 'i')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalize(str) {
    var key = _norm(str);
    return _map[key] || null; // null = bilinmiyor
  }

  function isKnown(str) {
    return _map[_norm(str)] !== undefined;
  }

  return { normalize: normalize, isKnown: isKnown };
})();
