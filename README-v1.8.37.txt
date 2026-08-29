RML Sales Visit v1.8.37 - SALES DATA SAFETY FIX

Perbaikan utama:
- app_get_users tidak lagi mengosongkan USERS lokal ketika response server kosong/sebagian.
- Data akun remote di-merge ke cache lokal; akun lokal yang tidak ikut response tetap dipertahankan.
- SQL app_get_users menggunakan session user yang diambil sekali dan mendukung admin/supervisor/sales.
- Android build version dinaikkan ke 1.8.37.
- Fitur camera/check-in, target/reward, promo per Sales dari v1.8.36 tetap dibawa.

Jalankan SUPABASE-FIX-v1-8-36.sql (isinya sudah diperbarui untuk v1.8.37) di Supabase SQL Editor sebelum pengujian server.
