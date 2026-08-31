RML Sales Visit v1.8.48 - FIX SALES SYNC

Perbaikan:
- Saat online, daftar akun mengikuti data remote agar Sales yang sudah dinonaktifkan tidak tertahan di cache perangkat lain.
- Cache lokal tidak lagi mempertahankan akun Sales yang tidak dikembalikan oleh server.
- Daftar Data Akun, penanggung jawab outlet, dan filter riwayat hanya menampilkan Sales aktif.
- Tidak ada perubahan tabel atau SQL migration baru.
- Tidak menambah query baru; tetap memakai RPC app_get_users yang sudah dipakai saat login.
