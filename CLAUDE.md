# Yurt dışı hisse vergisi sitesi (hisse-beyan-)

Yurt dışı hisse/temettü kazançlarının Türkiye'de beyanı için statik site ve hesaplayıcı. Vercel'de yayında (`vercel.json`: cleanUrls).

## Yapı
- `index.html` + konu sayfaları (`ibkr-vergi-beyani.html`, `yurt-disi-hisse-vergisi.html`, `yurt-disi-temettu-beyani.html`, `yi-ufe-endeksleme.html`, `yurt-disi-hisse-zarar-mahsubu.html`, `yurt-disi-hisse-vergi-istisnasi.html`, `yurt-disi-hisse-vergi-ornegi.html`).
- `engine.js`: hesaplama motoru. `rates.json`: TCMB kurları. `yufe.json`: Yİ-ÜFE endeksleri.
- `rates.py` + `.github/workflows/rates.yml`: hafta içi 16:30 TR'de kurları çekip "Kurlar guncellendi" commit'i atar (kur-botu).
- Yeni sayfa eklenince `sitemap.xml` güncellenmeli.
- `CLAUDE.md`, `.vercelignore` ile yayından hariç tutulur.

## Durum (son güncelleme: 13 Ekim 2026)
- 7 Ekim: sayfa adlarındaki " 2.html" ekleri düzeltildi, sitemap güncellendi.
- Kur güncellemesi otomatik çalışıyor.
- Not: kökte gereksiz bir `github/workflows` kopyası var (etkin olan `.github/workflows`); silinebilir.

## Kullanıcı ve çalışma şekli
- Kullanıcıyla Türkçe konuş. Saat dilimi: Europe/Istanbul (UTC+3).
- Çoğunlukla telefondan (iOS) çalışıyor. Komutları kısa, tek satırlık parçalar halinde ve sırayla ver; uzun tırnaklı çok satırlı komutlar yarıda kalabiliyor.
- Değişiklikler doğrudan `main` dalına commit'leniyor.
- Kullanıcının diğer depoları: `-ibkr-trading-bot-` (katalizör/haber botu, aktif), `hisse-beyan-` (yurt dışı hisse vergisi sitesi), `freelancer-vergi` (freelancer vergi hesaplayıcıları), `Borsa` (eski bot), `Portfolyo` (demo siteler).
