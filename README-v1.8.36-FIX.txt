RML v1.8.36 FIX

PENTING: Jalankan SUPABASE-FIX-v1-8-36.sql SATU KALI di Supabase SQL Editor sebelum memakai fitur berikut:
- Tambah/Edit Sales oleh Admin/Supervisor
- Tambah/Edit Target oleh Supervisor
- Reward Target
- Promo per Sales

Perbaikan:
1. Menghindari RPC app_admin_save_settings lama yang dapat gagal dengan DELETE requires a WHERE clause.
2. Supervisor boleh mengelola akun Sales. Admin boleh mengelola Sales/Supervisor.
3. Target Supervisor tersimpan di server, termasuk reward_type/reward_value.
4. Promo tersimpan per Sales per bulan di Supabase.
5. Dashboard Sales: Promo kiri, Target kanan, Daftar Harga di bawah.
