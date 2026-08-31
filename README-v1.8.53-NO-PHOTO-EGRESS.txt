RML Sales Visit v1.8.53 - Photo-free visit sync

PERUBAHAN
- Sales tetap wajib mengambil foto saat Check-In.
- Foto tetap tersedia di perangkat selama proses kunjungan aktif.
- Saat sinkronisasi ke Supabase, foto tidak dikirim.
- Saat menarik kunjungan dari Supabase, RPC baru menghapus checkInPhoto DI SERVER sebelum response dikirim ke perangkat.
- Ini mencegah foto lama ikut ter-download dan mengurangi egress.
- Tidak ada tabel baru.
- Tidak mengubah Target, Promo, Sales, Area, atau aturan Check-In.

PENTING
1. Deploy WEB v1.8.53.
2. Jalankan SUPABASE-FIX-v1-8-53-NO-PHOTO-PULL.sql SEKALI di Supabase SQL Editor.
3. Setelah SQL berhasil, logout/login pada perangkat untuk memakai RPC baru.
4. Foto lama yang sudah tersimpan di database TIDAK otomatis dihapus oleh patch ini.
