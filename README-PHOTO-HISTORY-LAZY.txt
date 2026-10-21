RML v2.0.5 — FOTO CHECK-IN DI RIWAYAT (LAZY LOAD)

Isi patch:
- app-history-photo-lazy-v1.js
- SUPABASE-PHOTO-LAZY-LOAD-v1.sql
- PATCH-INSTRUCTIONS.txt

TUJUAN DAN EGRESS
- Foto tidak ikut response riwayat biasa.
- Riwayat menerima flag kecil hasCheckInPhoto saja.
- Byte foto diambil hanya saat pengguna menekan "Lihat Foto Check-in".
- Foto disimpan dalam tabel terpisah rml_visit_photos; bukan pada payload kunjungan biasa.
- Foto di-cache dalam memori browser hanya selama halaman aktif; tidak ditulis kembali ke IndexedDB.
- Batch metadata untuk riwayat lama hanya meminta ID yang sedang tampil + boolean, bukan isi foto.

INSTALASI
1. Jalankan SUPABASE-PHOTO-LAZY-LOAD-v1.sql SATU KALI di Supabase SQL Editor.
2. Tambahkan app-history-photo-lazy-v1.js ke root folder web RML yang sama dengan index.html.
3. Di index.html yang sedang aktif, tambahkan baris berikut sebelum </body>, sesudah script admin photo yang sudah ada:
   <script src="app-history-photo-lazy-v1.js?v=2.0.5-photo-lazy1"></script>
4. Commit kedua file + perubahan index.html ke GitHub, tunggu deploy, lalu lakukan Ctrl+F5.
5. Test dengan satu kunjungan baru: Check In foto > Check Out > tunggu status sinkron.
   Lalu buka riwayat di perangkat/akun lain dan klik "Lihat Foto Check-in".

CATATAN
- Paket ini adalah PATCH tambahan/overlay, bukan pengganti seluruh project, agar file Promo/UI RML terbaru Anda tidak tertimpa.
- Tidak ada tabel baru pada tabel kunjungan; migration membuat tabel terpisah untuk foto.
- Foto baru diunggah saat sinkronisasi kunjungan. Bila upload foto gagal, kunjungan tetap ditandai gagal sinkron agar bisa dicoba ulang, dan foto lokal tidak dihapus.
- Foto lama yang masih tersimpan pada payload lama dapat dimuat saat diklik dan dimigrasikan ke tabel foto terpisah.
- Foto hanya dapat diakses melalui RPC dengan token aplikasi; Sales dibatasi pada kunjungannya sendiri, Supervisor dapat melihat riwayat yang memang tersedia di aplikasi, dan Admin dapat melihat/menghapus.
- Kode tidak mengirim foto saat pull normal; foto dikirim dari perangkat ke Supabase sebagai upload (ingress), dan hanya dikirim kembali saat pengguna meminta untuk melihatnya.
