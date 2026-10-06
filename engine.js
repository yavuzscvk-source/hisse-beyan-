/* Yurt disi hisse vergi motoru — IBKR Activity Statement (CSV)
 * Tarayicida window.Engine, Node'da module.exports olarak calisir.
 * Hesap: FIFO eslestirme, TCMB doviz alis kuru ile TL'ye cevirme,
 * Yi-UFE endekslemesi (GVK muk. 81), ayni yil zarar mahsubu.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;

  var VARSAYILAN = {
    kurGunu: 'ayni',          // 'ayni' = islem gunu kuru, 'onceki' = bir onceki is gunu kuru
    komisyonDahil: true,      // alis komisyonu maliyete eklenir, satis komisyonu hasilattan dusulur
    endeksleme: true,         // Yi-UFE artisi %10 ve uzeriyse maliyet endekslenir
    endeksZararDogurur: false // endeksleme tek basina zarar olusturamaz
  };

  // Ucret disi gelirler icin gelir vergisi tarifesi (yil = gelirin elde edildigi yil)
  var TARIFE = {
    2024: [[110000, 0.15], [230000, 0.20], [580000, 0.27], [3000000, 0.35], [Infinity, 0.40]],
    2025: [[158000, 0.15], [330000, 0.20], [800000, 0.27], [4300000, 0.35], [Infinity, 0.40]],
    2026: [[190000, 0.15], [400000, 0.20], [1000000, 0.27], [5300000, 0.35], [Infinity, 0.40]]
  };

  // Yurt disi kar payi (temettu) beyan siniri, GVK 86/1-d
  var TEMETTU_SINIRI = { 2023: 8400, 2024: 13000, 2025: 18000, 2026: 22000 };

  function r2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  function r6(x) { return Math.round(x * 1e6) / 1e6; }

  // ---------- CSV ----------
  function csvSatir(line) {
    var out = [], cur = '', q = false, i, c;
    for (i = 0; i < line.length; i++) {
      c = line[i];
      if (q) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function sayi(s) {
    if (s === undefined || s === null) return NaN;
    s = String(s).trim().replace(/,/g, '');
    if (s === '' || s === '--') return NaN;
    return Number(s);
  }

  function tarihSaat(s) {
    s = String(s || '').trim();
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[,; T]+(\d{2}):?(\d{2}):?(\d{2}))?/);
    if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})(?:[,; T]+(\d{2}):?(\d{2}):?(\d{2}))?/);
    if (!m) return null;
    var d = m[1] + '-' + m[2] + '-' + m[3];
    var t = m[4] ? (m[4] + ':' + m[5] + ':' + m[6]) : '';
    return { tarih: d, saat: t };
  }

  function semboldenAyikla(aciklama) {
    var m = String(aciklama || '').match(/^\s*([A-Za-z0-9.\- ]+?)\s*\(/);
    return m ? m[1].trim() : '';
  }

  // ---------- IBKR ayristirma ----------
  function parseIBKR(text, dosyaAdi) {
    var sonuc = {
      dosya: dosyaAdi || '',
      donem: '',
      islemler: [],
      temettuler: [],
      stopajlar: [],
      kurumsal: [],
      atlanan: {},       // hisse disi varlik siniflari: ad -> adet
      transferVar: false,
      uyarilar: []
    };
    if (!text) { sonuc.uyarilar.push({ kod: 'BOS', mesaj: 'Dosya boş.' }); return sonuc; }
    text = String(text).replace(/^﻿/, '');
    var satirlar = text.split(/\r\n|\n|\r/);
    var basliklar = {}; // bolum -> kolon adi -> index
    var bolumGoruldu = {};

    function al(row, map, ad) {
      var i = map[ad];
      return i === undefined ? undefined : row[i];
    }

    for (var n = 0; n < satirlar.length; n++) {
      var ham = satirlar[n];
      if (!ham) continue;
      var row = csvSatir(ham);
      if (row.length < 3) continue;
      var bolum = row[0].trim(), tur = row[1].trim();

      if (tur === 'Header') {
        var map = {};
        for (var k = 2; k < row.length; k++) map[row[k].trim()] = k;
        basliklar[bolum] = map;
        bolumGoruldu[bolum] = true;
        continue;
      }
      if (tur !== 'Data') continue;
      var h = basliklar[bolum];
      if (!h) continue;

      if (bolum === 'Statement') {
        if ((al(row, h, 'Field Name') || '').trim() === 'Period') sonuc.donem = (al(row, h, 'Field Value') || '').trim();
        continue;
      }

      if (bolum === 'Trades') {
        var ayrim = (al(row, h, 'DataDiscriminator') || '').trim();
        if (ayrim && ayrim !== 'Order' && ayrim !== 'Trade') continue; // ClosedLot vb. satirlar
        var sinif = (al(row, h, 'Asset Category') || '').trim();
        if (sinif !== 'Stocks') {
          if (sinif && sinif !== 'Forex') sonuc.atlanan[sinif] = (sonuc.atlanan[sinif] || 0) + 1;
          continue;
        }
        var ts = tarihSaat(al(row, h, 'Date/Time'));
        var adet = sayi(al(row, h, 'Quantity'));
        var fiyat = sayi(al(row, h, 'T. Price'));
        var hasilat = sayi(al(row, h, 'Proceeds'));
        var kom = sayi(al(row, h, 'Comm/Fee'));
        if (isNaN(kom)) kom = sayi(al(row, h, 'Comm in USD'));
        var sembol = (al(row, h, 'Symbol') || '').trim();
        var pb = (al(row, h, 'Currency') || '').trim().toUpperCase();
        if (!ts || !sembol || !pb || isNaN(adet) || Math.abs(adet) < EPS) {
          sonuc.uyarilar.push({ kod: 'SATIR', mesaj: 'Okunamayan işlem satırı atlandı (satır ' + (n + 1) + ').' });
          continue;
        }
        var tutar = !isNaN(hasilat) && Math.abs(hasilat) > EPS ? Math.abs(hasilat) : Math.abs(adet * fiyat);
        if (isNaN(tutar)) {
          sonuc.uyarilar.push({ kod: 'SATIR', mesaj: 'Tutarı okunamayan işlem atlandı (satır ' + (n + 1) + ').' });
          continue;
        }
        sonuc.islemler.push({
          tip: adet > 0 ? 'AL' : 'SAT',
          sembol: sembol, pb: pb,
          tarih: ts.tarih, saat: ts.saat,
          adet: Math.abs(adet),
          tutar: tutar,                       // islem para biriminde, komisyon haric
          komisyon: isNaN(kom) ? 0 : Math.abs(kom)
        });
        continue;
      }

      if (bolum === 'Dividends' || bolum === 'Payment In Lieu Of Dividends' || bolum === 'Withholding Tax') {
        var pb2 = (al(row, h, 'Currency') || '').trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(pb2)) continue; // Total satirlari
        var ts2 = tarihSaat(al(row, h, 'Date'));
        var mik = sayi(al(row, h, 'Amount'));
        var acik = (al(row, h, 'Description') || '').trim();
        if (!ts2 || isNaN(mik)) continue;
        var kayit = { tarih: ts2.tarih, pb: pb2, tutar: mik, aciklama: acik, sembol: semboldenAyikla(acik) };
        if (bolum === 'Withholding Tax') sonuc.stopajlar.push(kayit);
        else sonuc.temettuler.push(kayit);
        continue;
      }

      if (bolum === 'Corporate Actions') {
        var sinif3 = (al(row, h, 'Asset Category') || '').trim();
        if (!sinif3 || /^Total/i.test(sinif3)) continue;
        var acik3 = (al(row, h, 'Description') || '').trim();
        var ts3 = tarihSaat(al(row, h, 'Date/Time')) || tarihSaat(al(row, h, 'Report Date'));
        if (!ts3 || !acik3) continue;
        var bol = acik3.match(/Split\s+(\d+(?:\.\d+)?)\s+for\s+(\d+(?:\.\d+)?)/i);
        sonuc.kurumsal.push({
          tarih: ts3.tarih, saat: ts3.saat,
          sembol: semboldenAyikla(acik3),
          pb: (al(row, h, 'Currency') || '').trim().toUpperCase(),
          aciklama: acik3,
          oran: bol && sinif3 === 'Stocks' ? Number(bol[1]) / Number(bol[2]) : null
        });
        continue;
      }

      if (bolum === 'Transfers') {
        var sinif4 = (al(row, h, 'Asset Category') || '').trim();
        if (sinif4 === 'Stocks') sonuc.transferVar = true;
        continue;
      }
    }

    if (!bolumGoruldu['Trades'] && !bolumGoruldu['Dividends']) {
      sonuc.uyarilar.push({
        kod: 'FORMAT',
        mesaj: 'Bu dosyada "Trades" bölümü bulunamadı. IBKR\'den İngilizce dilinde, CSV biçiminde "Activity Statement" indirdiğinizden emin olun.'
      });
    }
    return sonuc;
  }

  // Ayni kayit birden fazla dosyada varsa bir kez sayilir (dosya ici tekrarlar korunur)
  function tekillestir(listeler, anahtarFn) {
    var enCok = new Map(), ornek = new Map(), tekrar = 0;
    listeler.forEach(function (liste) {
      var say = new Map();
      liste.forEach(function (x) {
        var a = anahtarFn(x);
        say.set(a, (say.get(a) || 0) + 1);
        if (!ornek.has(a)) ornek.set(a, x);
      });
      say.forEach(function (v, a) {
        var onceki = enCok.get(a) || 0;
        if (onceki > 0) tekrar += Math.min(onceki, v);
        if (v > onceki) enCok.set(a, v);
      });
    });
    var out = [];
    enCok.forEach(function (v, a) { for (var i = 0; i < v; i++) out.push(ornek.get(a)); });
    return { liste: out, tekrar: tekrar };
  }

  function birlestir(dosyalar) {
    var u = [];
    dosyalar.forEach(function (d) {
      d.uyarilar.forEach(function (w) { u.push({ kod: w.kod, mesaj: (d.dosya ? d.dosya + ': ' : '') + w.mesaj }); });
    });
    var isl = tekillestir(dosyalar.map(function (d) { return d.islemler; }), function (t) {
      return [t.tip, t.sembol, t.pb, t.tarih, t.saat, t.adet, t.tutar, t.komisyon].join('|');
    });
    var tem = tekillestir(dosyalar.map(function (d) { return d.temettuler; }), function (t) {
      return [t.tarih, t.pb, t.tutar, t.aciklama].join('|');
    });
    var sto = tekillestir(dosyalar.map(function (d) { return d.stopajlar; }), function (t) {
      return [t.tarih, t.pb, t.tutar, t.aciklama].join('|');
    });
    var kur = tekillestir(dosyalar.map(function (d) { return d.kurumsal; }), function (t) {
      return [t.tarih, t.saat, t.aciklama].join('|');
    });
    var tekrar = isl.tekrar + tem.tekrar + sto.tekrar;
    if (tekrar > 0) {
      u.push({ kod: 'TEKRAR', mesaj: tekrar + ' kayıt birden fazla dosyada bulundu ve bir kez sayıldı (dosyaların dönemleri çakışıyor).' });
    }
    var atlanan = {};
    var transferVar = false;
    dosyalar.forEach(function (d) {
      Object.keys(d.atlanan).forEach(function (k) { atlanan[k] = (atlanan[k] || 0) + d.atlanan[k]; });
      if (d.transferVar) transferVar = true;
    });
    Object.keys(atlanan).forEach(function (k) {
      u.push({ kod: 'VARLIK', mesaj: atlanan[k] + ' adet "' + k + '" işlemi hesaba katılmadı. Bu araç yalnızca hisse senedi ve ETF işlemlerini hesaplar.' });
    });
    if (transferVar) {
      u.push({ kod: 'TRANSFER', mesaj: 'Hesaba hisse transferi görünüyor. Transferle gelen hisselerin alış tarihi ve maliyeti dosyada yoktur; bu hisselerin satışları eksik hesaplanır.' });
    }
    return { islemler: isl.liste, temettuler: tem.liste, stopajlar: sto.liste, kurumsal: kur.liste, uyarilar: u };
  }

  // ---------- Kur ----------
  function kurArama(ratesJson) {
    var kaynak = (ratesJson && ratesJson.rates) || {};
    var sirali = {};
    return function (pb, tarih, mod) {
      if (pb === 'TRY') return { kur: 1, tarih: tarih };
      var tablo = kaynak[pb];
      if (!tablo) return null;
      var gunler = sirali[pb] || (sirali[pb] = Object.keys(tablo).sort());
      // tarihten kucuk-esit (ayni) ya da kesin kucuk (onceki) son gun
      var lo = 0, hi = gunler.length - 1, bul = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        var uygun = mod === 'onceki' ? gunler[mid] < tarih : gunler[mid] <= tarih;
        if (uygun) { bul = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (bul < 0) return null;
      var g = gunler[bul];
      // 10 gunden eski kur guvenilir degil (veri eksik demektir)
      var fark = (Date.parse(tarih + 'T00:00:00Z') - Date.parse(g + 'T00:00:00Z')) / 86400000;
      if (fark > 10) return null;
      return { kur: tablo[g], tarih: g };
    };
  }

  // ---------- Yi-UFE ----------
  function oncekiAy(tarih) {
    var y = Number(tarih.slice(0, 4)), m = Number(tarih.slice(5, 7));
    m -= 1; if (m === 0) { m = 12; y -= 1; }
    return y + '-' + (m < 10 ? '0' + m : '' + m);
  }

  function endeksOrani(yufeJson, alisTarihi, satisTarihi) {
    var idx = (yufeJson && yufeJson.index) || {};
    var a = oncekiAy(alisTarihi), s = oncekiAy(satisTarihi);
    var ia = idx[a], is = idx[s];
    if (ia === undefined || is === undefined) return { oran: null, alisAyi: a, satisAyi: s, eksik: ia === undefined ? a : s };
    return { oran: is / ia, alisAyi: a, satisAyi: s, alisEndeks: ia, satisEndeks: is, eksik: null };
  }

  // ---------- Hesap ----------
  function hesapla(veri, ratesJson, yufeJson, ayar) {
    var o = {};
    Object.keys(VARSAYILAN).forEach(function (k) { o[k] = ayar && ayar[k] !== undefined ? ayar[k] : VARSAYILAN[k]; });
    var kurBul = kurArama(ratesJson);
    var uyarilar = veri.uyarilar.slice();
    var kurEksik = {}, endeksEksik = {};

    function kur(pb, tarih) {
      var k = kurBul(pb, tarih, o.kurGunu);
      if (!k) kurEksik[pb + ' ' + tarih] = true;
      return k;
    }

    // Olay akisi: bolunmeler + islemler, zaman sirasiyla
    var olaylar = [];
    veri.kurumsal.forEach(function (c) {
      if (c.oran) olaylar.push({ sira: 0, tarih: c.tarih, saat: c.saat, c: c });
      else uyarilar.push({ kod: 'KURUMSAL', mesaj: c.tarih + ' tarihli kurumsal işlem otomatik işlenmedi, elle kontrol edin: ' + c.aciklama });
    });
    veri.islemler.forEach(function (t, i) {
      olaylar.push({ sira: t.tip === 'AL' ? 1 : 2, tarih: t.tarih, saat: t.saat, t: t, i: i });
    });
    olaylar.sort(function (a, b) {
      if (a.tarih !== b.tarih) return a.tarih < b.tarih ? -1 : 1;
      if (a.saat && b.saat && a.saat !== b.saat) return a.saat < b.saat ? -1 : 1;
      if (a.sira !== b.sira) return a.sira - b.sira;
      return (a.i || 0) - (b.i || 0);
    });

    var envanter = {}; // sembol|pb -> lot listesi
    var eslesmeler = [];
    var eksikSatis = [];

    olaylar.forEach(function (e) {
      if (e.c) {
        Object.keys(envanter).forEach(function (anahtar) {
          if (anahtar.split('|')[0] !== e.c.sembol) return;
          envanter[anahtar].forEach(function (lot) { lot.kalan *= e.c.oran; lot.adet *= e.c.oran; lot.bolundu = true; });
        });
        uyarilar.push({ kod: 'BOLUNME', mesaj: e.c.tarih + ': ' + e.c.sembol + ' hisse bölünmesi (' + e.c.oran + ' kat) eldeki lotlara uygulandı.' });
        return;
      }
      var t = e.t, anahtar = t.sembol + '|' + t.pb;
      var lotlar = envanter[anahtar] || (envanter[anahtar] = []);
      if (t.tip === 'AL') {
        lotlar.push({ tarih: t.tarih, adet: t.adet, kalan: t.adet, tutar: t.tutar, komisyon: t.komisyon });
        return;
      }
      // SATIS
      var kalanSatis = t.adet;
      var satisKur = kur(t.pb, t.tarih);
      while (kalanSatis > EPS && lotlar.length) {
        var lot = lotlar[0];
        var q = Math.min(lot.kalan, kalanSatis);
        var alisKur = kur(t.pb, lot.tarih);
        var payAlis = q / lot.adet, paySatis = q / t.adet;
        var alisTutar = lot.tutar * payAlis, alisKom = lot.komisyon * payAlis;
        var satisTutar = t.tutar * paySatis, satisKom = t.komisyon * paySatis;

        var m = {
          sembol: t.sembol, pb: t.pb, adet: r6(q),
          alisTarihi: lot.tarih, satisTarihi: t.tarih,
          alisTutar: alisTutar, satisTutar: satisTutar,
          alisKomisyon: alisKom, satisKomisyon: satisKom,
          alisKur: alisKur ? alisKur.kur : null, alisKurTarihi: alisKur ? alisKur.tarih : null,
          satisKur: satisKur ? satisKur.kur : null, satisKurTarihi: satisKur ? satisKur.tarih : null,
          hesaplandi: false
        };

        if (alisKur && satisKur) {
          var maliyet = r2((alisTutar + (o.komisyonDahil ? alisKom : 0)) * alisKur.kur);
          var hasilat = r2((satisTutar - (o.komisyonDahil ? satisKom : 0)) * satisKur.kur);
          var nominal = r2(hasilat - maliyet);
          var eo = endeksOrani(yufeJson, lot.tarih, t.tarih);
          var uygulandi = false, endeksliMaliyet = maliyet, kazanc = nominal;
          if (eo.eksik) endeksEksik[eo.eksik] = true;
          if (o.endeksleme && eo.oran !== null && eo.oran >= 1.10 - 1e-12) {
            var em = r2(maliyet * eo.oran);
            var ek = r2(hasilat - em);
            if (o.endeksZararDogurur) { uygulandi = true; endeksliMaliyet = em; kazanc = ek; }
            else if (nominal > 0) {
              uygulandi = true;
              if (ek >= 0) { endeksliMaliyet = em; kazanc = ek; }
              else { endeksliMaliyet = hasilat; kazanc = 0; } // endeksleme zarar dogurmaz
            }
          }
          m.maliyetTL = maliyet; m.hasilatTL = hasilat; m.nominalKazancTL = nominal;
          m.endeksOrani = eo.oran; m.endeksAlisAyi = eo.alisAyi; m.endeksSatisAyi = eo.satisAyi;
          m.endekslendi = uygulandi; m.endeksliMaliyetTL = endeksliMaliyet; m.kazancTL = kazanc;
          m.hesaplandi = true;
        }
        eslesmeler.push(m);

        lot.kalan -= q; kalanSatis -= q;
        if (lot.kalan <= EPS) lotlar.shift();
      }
      if (kalanSatis > EPS) {
        eksikSatis.push({ sembol: t.sembol, pb: t.pb, tarih: t.tarih, adet: r6(kalanSatis) });
      }
    });

    eksikSatis.forEach(function (x) {
      uyarilar.push({
        kod: 'ENVANTER',
        mesaj: x.tarih + ' tarihli ' + x.sembol + ' satışının ' + x.adet + ' adedi için alış kaydı bulunamadı. Bu kısım hesaba katılmadı. Alışın yapıldığı yılların dosyalarını da ekleyin.'
      });
    });

    // Yil ozetleri
    var yillar = {};
    function yil(y) {
      return yillar[y] || (yillar[y] = {
        yil: Number(y), satisAdedi: 0, hasilatTL: 0, maliyetTL: 0, endeksliMaliyetTL: 0,
        karTL: 0, zararTL: 0, netTL: 0, matrahTL: 0, hesaplanamayan: 0,
        temettuTL: 0, stopajTL: 0, temettuSiniri: null, temettuBeyan: null
      });
    }
    eslesmeler.forEach(function (m) {
      var y = yil(m.satisTarihi.slice(0, 4));
      if (!m.hesaplandi) { y.hesaplanamayan++; return; }
      y.satisAdedi++;
      y.hasilatTL += m.hasilatTL; y.maliyetTL += m.maliyetTL; y.endeksliMaliyetTL += m.endeksliMaliyetTL;
      if (m.kazancTL >= 0) y.karTL += m.kazancTL; else y.zararTL += -m.kazancTL;
    });
    eksikSatis.forEach(function (x) { yil(x.tarih.slice(0, 4)).hesaplanamayan++; });

    // Temettu ve stopaj
    var temettuSatir = [];
    function nakit(liste, tur) {
      liste.forEach(function (d) {
        var k = kur(d.pb, d.tarih);
        var s = { tur: tur, tarih: d.tarih, sembol: d.sembol, pb: d.pb, tutar: d.tutar, aciklama: d.aciklama,
                  kur: k ? k.kur : null, kurTarihi: k ? k.tarih : null, tutarTL: k ? r2(d.tutar * k.kur) : null };
        temettuSatir.push(s);
        if (!k) return;
        var y = yil(d.tarih.slice(0, 4));
        if (tur === 'TEMETTU') y.temettuTL += s.tutarTL; else y.stopajTL += -s.tutarTL;
      });
    }
    nakit(veri.temettuler, 'TEMETTU');
    nakit(veri.stopajlar, 'STOPAJ');
    temettuSatir.sort(function (a, b) { return a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0; });

    Object.keys(yillar).forEach(function (k) {
      var y = yillar[k];
      ['hasilatTL', 'maliyetTL', 'endeksliMaliyetTL', 'karTL', 'zararTL', 'temettuTL', 'stopajTL'].forEach(function (f) { y[f] = r2(y[f]); });
      y.netTL = r2(y.karTL - y.zararTL);
      y.matrahTL = Math.max(0, y.netTL);
      var sinir = TEMETTU_SINIRI[y.yil];
      y.temettuSiniri = sinir === undefined ? null : sinir;
      y.temettuBeyan = sinir === undefined ? null : y.temettuTL > sinir;
    });

    var ke = Object.keys(kurEksik);
    if (ke.length) {
      uyarilar.push({ kod: 'KUR', mesaj: ke.length + ' tarih için TCMB kuru bulunamadı, ilgili satırlar hesaplanamadı (ör. ' + ke.slice(0, 3).join(', ') + ').' });
    }
    var ee = Object.keys(endeksEksik);
    if (ee.length) {
      uyarilar.push({ kod: 'ENDEKS', mesaj: 'Yİ-ÜFE verisi olmayan aylar var (' + ee.slice(0, 4).join(', ') + '). Bu satırlarda endeksleme uygulanmadı.' });
    }

    var acik = [];
    Object.keys(envanter).forEach(function (a) {
      envanter[a].forEach(function (lot) {
        if (lot.kalan > EPS) acik.push({ sembol: a.split('|')[0], pb: a.split('|')[1], tarih: lot.tarih, adet: r6(lot.kalan) });
      });
    });

    return { ayar: o, eslesmeler: eslesmeler, yillar: yillar, nakit: temettuSatir, acikLotlar: acik, uyarilar: uyarilar };
  }

  // ---------- Tahmini vergi ----------
  function tarifeVergisi(yil, matrah) {
    var t = TARIFE[yil];
    if (!t || !(matrah > 0)) return t ? 0 : null;
    var vergi = 0, alt = 0;
    for (var i = 0; i < t.length; i++) {
      var ust = t[i][0];
      if (matrah > alt) vergi += (Math.min(matrah, ust) - alt) * t[i][1];
      alt = ust;
    }
    return r2(vergi);
  }

  // Bu kazancin ek vergisi: (diger gelir + kazanc) vergisi - (diger gelir) vergisi
  function ekVergi(yil, kazanc, digerGelir) {
    if (!TARIFE[yil]) return null;
    digerGelir = digerGelir > 0 ? digerGelir : 0;
    return r2(tarifeVergisi(yil, digerGelir + kazanc) - tarifeVergisi(yil, digerGelir));
  }

  // ---------- Disa aktarim ----------
  function csvHucre(v) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csvDokum(sonuc, yil) {
    var bas = ['Sembol', 'Para birimi', 'Adet', 'Alış tarihi', 'Satış tarihi', 'Alış tutarı (döviz)', 'Alış komisyonu (döviz)',
      'Satış tutarı (döviz)', 'Satış komisyonu (döviz)', 'Alış kuru', 'Alış kur tarihi', 'Satış kuru', 'Satış kur tarihi',
      'Maliyet (TL)', 'Hasılat (TL)', 'Endeks oranı', 'Endekslendi', 'Endeksli maliyet (TL)', 'Kazanç/Zarar (TL)'];
    var satirlar = [bas.join(';')];
    sonuc.eslesmeler.forEach(function (m) {
      if (yil && m.satisTarihi.slice(0, 4) !== String(yil)) return;
      satirlar.push([m.sembol, m.pb, m.adet, m.alisTarihi, m.satisTarihi, r2(m.alisTutar), r2(m.alisKomisyon),
        r2(m.satisTutar), r2(m.satisKomisyon), m.alisKur, m.alisKurTarihi, m.satisKur, m.satisKurTarihi,
        m.maliyetTL, m.hasilatTL, m.endeksOrani === null || m.endeksOrani === undefined ? '' : Math.round(m.endeksOrani * 10000) / 10000,
        m.hesaplandi ? (m.endekslendi ? 'Evet' : 'Hayır') : 'Hesaplanamadı', m.endeksliMaliyetTL, m.kazancTL].map(csvHucre).join(';'));
    });
    return '﻿' + satirlar.join('\r\n');
  }

  return {
    VARSAYILAN: VARSAYILAN, TARIFE: TARIFE, TEMETTU_SINIRI: TEMETTU_SINIRI,
    csvSatir: csvSatir, parseIBKR: parseIBKR, birlestir: birlestir, kurArama: kurArama,
    endeksOrani: endeksOrani, hesapla: hesapla, tarifeVergisi: tarifeVergisi, ekVergi: ekVergi, csvDokum: csvDokum
  };
});
