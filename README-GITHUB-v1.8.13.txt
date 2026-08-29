RML Sales Visit v1.8.13 – AREA ASSIGNMENT SYNC FIX

1. Jalankan SUPABASE-AREA-SYNC-v1.8.12.sql sekali jika belum pernah.
2. Upload seluruh isi ZIP ke root GitHub.
3. Admin/Supervisor buka Pengaturan > Penugasan Area lalu Simpan.
4. Logout/login Sales untuk mengambil assignment terbaru.

FIX v1.8.13:
- Sales selalu melihat hanya area yang ditugaskan.
- Opsi “Bebas ganti area” tidak lagi membuat semua area muncul.
- Sinkronisasi tabel rml_area_assignments tetap dijalankan walaupun penyimpanan pengaturan lama gagal.
