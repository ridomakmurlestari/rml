RML v1.8.43 - FIX SUPERVISOR TARGET + PROMO

Penyebab v1.8.42:
- Function Supabase salah mengacu ke public.rml_users.
- Database RML yang sudah berjalan menggunakan public.app_users.

Perbaikan:
- Target Outlet menerima Sales atau Supervisor.
- Promo menerima Sales atau Supervisor.
- Dropdown tetap boleh menampilkan "Septino — Supervisor", tetapi value yang dikirim adalah account_key/email Septino.
- Tidak membuat tabel rml_users.
- Tidak melakukan download seluruh visits/photos sehingga migration ini tidak menaikkan egress secara mendadak.

Jalankan SEKALI:
SUPABASE-FIX-v1-8-43.sql
