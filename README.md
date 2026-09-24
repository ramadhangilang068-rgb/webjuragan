# JURAGAN CHICKEN — V4

## Isi
- `index.html` — website utama
- `franchise.html` — halaman franchise/kemitraan
- `admin.html` — dashboard admin frontend (demo + koneksi API)
- `google-apps-script/Code.gs` — API Google Apps Script
- `assets/logo-juragan-chicken.svg` — logo
- `robots.txt`, `sitemap.xml`, `vercel.json`

## Target arsitektur
Vercel (frontend) → Google Apps Script (API) → Google Sheets (database)

## Setup Google Sheets
Buat 4 sheet:
1. Products
2. Outlets
3. Orders
4. FranchiseLeads

Header:
Products:
`id | name | cat | price | img | desc`

Outlets:
`id | name | city | wa | maps`

Orders:
`timestamp | name | phone | outlet | product | qty | price | notes | status`

FranchiseLeads:
`timestamp | name | phone | city | locationStatus | area | targetDate | notes | status`

## Setup Apps Script
1. Buat Google Sheet.
2. Extensions → Apps Script.
3. Tempel `google-apps-script/Code.gs`.
4. Isi `SPREADSHEET_ID`.
5. Deploy → New deployment → Web app.
6. Execute as: Me.
7. Access: Anyone (sesuaikan kebijakan keamanan organisasi).
8. Salin URL `/exec`.
9. Isi `CONFIG.apiUrl` di `index.html`.
10. Isi URL yang sama pada `admin.html`.

## Setup Vercel
Upload folder ini ke GitHub, lalu import repository ke Vercel.

Sebelum publikasi:
- Ganti `DOMAIN-ANDA.vercel.app` di canonical/robots/sitemap.
- Ganti nomor WhatsApp.
- Ganti alamat dan jam operasional.
- Ganti outlet contoh.
- Ganti foto demo dengan foto milik sendiri/berlisensi.
- Pasang domain sendiri.
- Daftarkan Google Search Console.
- Tambahkan Google Analytics bila diperlukan.

## Catatan keamanan
`admin.html` adalah dashboard frontend dan password demo. Ini BUKAN autentikasi produksi yang aman. Jangan membuka fungsi admin sensitif ke publik tanpa autentikasi server-side. Google Apps Script pada contoh ini cocok sebagai tahap awal database; untuk skala besar, pindahkan backend ke database/auth yang proper.

## Foto
Semua foto di HTML menggunakan `img src`. Untuk foto lokal:
`<img src="assets/products/chicken-crispy.jpg" alt="Chicken Crispy">`

## Order
Website saat ini mengirim order ke WhatsApp. Google Apps Script juga menyediakan endpoint `createOrder` bila nanti ingin menyimpan setiap order ke Sheet sebelum/bersamaan dengan WhatsApp.
