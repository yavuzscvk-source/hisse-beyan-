#!/usr/bin/env python3
"""TCMB gunluk doviz alis kurlarini indirir ve rates.json dosyasina yazar.

Her calistiginda dosyadaki son gunden bugune kadar olan eksik gunleri ekler.
Ilk calistirmada BASLANGIC tarihinden itibaren hepsini indirir (10-15 dakika surer).
Ek kutuphane gerekmez.
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

BASLANGIC = dt.date(2015, 1, 1)
PARA_BIRIMLERI = ["USD", "EUR", "GBP", "CHF", "CAD", "JPY", "AUD", "SEK", "NOK", "DKK"]
DOSYA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rates.json")
ADRES = "https://www.tcmb.gov.tr/kurlar/{ym}/{dmy}.xml"


def xml_coz(icerik):
    """XML metninden (tarih, {para birimi: 1 birimin TL karsiligi}) dondurur."""
    kok = ET.fromstring(icerik)
    gun, ay, yil = kok.attrib["Tarih"].split(".")
    tarih = "%s-%s-%s" % (yil, ay, gun)
    kurlar = {}
    for c in kok.findall("Currency"):
        kod = c.attrib.get("Kod") or c.attrib.get("CurrencyCode")
        if kod not in PARA_BIRIMLERI:
            continue
        alis = (c.findtext("ForexBuying") or "").strip()
        birim = (c.findtext("Unit") or "1").strip()
        if not alis:
            continue
        kurlar[kod] = round(float(alis) / float(birim), 6)
    return tarih, kurlar


def indir(gun):
    """Bir gunun dosyasini indirir. Tatil gunlerinde (dosya yok) None dondurur."""
    url = ADRES.format(ym=gun.strftime("%Y%m"), dmy=gun.strftime("%d%m%Y"))
    istek = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (kur-arsivi)"})
    son_hata = None
    for deneme in range(4):
        try:
            with urllib.request.urlopen(istek, timeout=30) as yanit:
                return yanit.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            son_hata = e
        except Exception as e:  # ag hatasi
            son_hata = e
        time.sleep(2 * (deneme + 1))
    raise RuntimeError("%s indirilemedi: %s" % (url, son_hata))


def yukle():
    if os.path.exists(DOSYA):
        with open(DOSYA, encoding="utf-8") as f:
            return json.load(f)
    return {"_meta": {}, "rates": {}}


def kaydet(veri):
    gunler = sorted({g for tablo in veri["rates"].values() for g in tablo})
    veri["_meta"] = {
        "kaynak": "TCMB gosterge niteligindeki doviz alis kuru (ForexBuying), 1 birim yabanci para = TL",
        "ilk_gun": gunler[0] if gunler else None,
        "son_gun": gunler[-1] if gunler else None,
        "gun_sayisi": len(gunler),
    }
    for kod in list(veri["rates"]):
        veri["rates"][kod] = dict(sorted(veri["rates"][kod].items()))
    with open(DOSYA, "w", encoding="utf-8") as f:
        json.dump(veri, f, ensure_ascii=False, separators=(",", ":"))


def main():
    veri = yukle()
    son = veri.get("_meta", {}).get("son_gun")
    gun = dt.date.fromisoformat(son) + dt.timedelta(days=1) if son else BASLANGIC
    bugun = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date()  # Turkiye saati
    eklenen = 0
    try:
        while gun <= bugun:
            if gun.weekday() < 5:
                icerik = indir(gun)
                if icerik:
                    tarih, kurlar = xml_coz(icerik)
                    if tarih == gun.isoformat():
                        for kod, deger in kurlar.items():
                            veri["rates"].setdefault(kod, {})[tarih] = deger
                        eklenen += 1
                        if eklenen % 100 == 0:
                            print("...", tarih, flush=True)
                time.sleep(0.1)
            gun += dt.timedelta(days=1)
    finally:
        if eklenen:
            kaydet(veri)
    print("Eklenen gun: %d, son gun: %s" % (eklenen, veri.get("_meta", {}).get("son_gun")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
