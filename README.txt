JURAGAN CHICKEN — PHASE 8
CUSTOMER ORDER DASHBOARD + STATUS NOTIFICATION

TUJUAN
Menambahkan dashboard customer di atas modul tracking Phase 7 tanpa mengubah alur order/payment.

FITUR
- order-dashboard.html sebagai dashboard customer.
- Verifikasi invoice + nomor WhatsApp tetap memakai aturan Phase 7.
- Ringkasan customer, outlet, tipe order, total dan item.
- Timeline status dari OrderTracking.
- Refresh manual.
- Auto-refresh 30 detik saat dashboard terbuka.
- Browser notification jika status berubah dan izin browser diberikan.
- Endpoint GET/POST action=orderDashboard.

INSTALASI
1. Ganti Code.gs Phase 7 dengan Code.gs Phase 8.
2. Deploy ulang Apps Script sebagai Execute as Me.
3. Upload order-dashboard.html ke Vercel.
4. Isi CONFIG.apiUrl pada order-dashboard.html dengan URL /exec Apps Script.
5. Pertahankan index.html, admin.html dan track-order.html Phase 7.

TEST
A. Invoice + WhatsApp benar: dashboard tampil.
B. Ubah status order dari admin lalu Refresh / tunggu 30 detik.
C. Timeline bertambah/berubah.
D. Invoice/WhatsApp salah ditolak.
E. Uji mobile.

CATATAN
Browser notification bukan push server. Push WhatsApp/email belum ditambahkan pada Phase 8. Live API/Midtrans tetap harus diuji pada deployment nyata.
