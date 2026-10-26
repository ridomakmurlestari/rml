RML v2.0.5 — FOTO CHECK-IN UNTUK ADMIN SAJA

Perubahan:
1. Admin dapat membuka foto check-in melalui tombol di Riwayat Kunjungan.
2. Sales dan Supervisor tetap melihat tombol, tetapi ketika diklik hanya muncul pesan: "Hanya admin yang bisa lihat foto check-in". Tidak ada RPC untuk mengambil foto dan gambar lokal juga tidak ditampilkan untuk mereka.
3. Sinkronisasi kunjungan baru tetap mengunggah foto secara terpisah setelah kunjungan tersimpan. Riwayat normal tidak menarik byte foto; foto hanya dimuat saat Admin menekan tombol.
4. Fungsi Supabase app_pull_visit_photo juga diubah agar menolak role selain admin (perlindungan server-side).

PENTING:
- Jalankan ulang file SUPABASE-PHOTO-HISTORY-LAZY-LOAD-v1.sql dari paket ini di Supabase SQL Editor untuk menerapkan pembatasan admin di server. Script ini menggunakan CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS agar dapat dijalankan ulang.
- Ganti file website dengan isi folder RML-Sales-Visit-v2.00 dari ZIP ini dan deploy.
- Foto check-in baru akan tersedia setelah sinkronisasi sukses. Jika sinkronisasi foto gagal, periksa status/log browser; foto tidak otomatis tersedia sampai upload berhasil.
- Tidak ada pengunduhan foto massal. Setiap gambar diambil satu per satu hanya saat Admin membuka foto.
