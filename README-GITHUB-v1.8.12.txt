RML Sales Visit v1.8.13
- Sinkronisasi penugasan area antar perangkat melalui Supabase.
- Admin/Supervisor menyimpan assignment area ke server.
- Sales mengambil assignment area terbaru saat login dan saat aplikasi kembali online/fokus.
- Jika area dinonaktifkan untuk Sales, area tersebut tidak muncul lagi di HP Sales.
- Jalankan SUPABASE-AREA-SYNC-v1.8.13.sql sekali di Supabase SQL Editor.


v1.8.13 FIX: penugasan area Sales selalu mengikuti assignment Supabase; sales dengan fitur bebas ganti area tidak otomatis melihat semua area. Sinkronisasi tabel assignment tetap berjalan walau RPC pengaturan lama gagal.
