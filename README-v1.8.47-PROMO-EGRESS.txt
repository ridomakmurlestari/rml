RML Sales Visit v1.8.47 - Promo Egress Optimization

Perubahan hanya pada mekanisme pembacaan Promo Bulan Ini.
- Promo dashboard memakai cache lokal selama 15 menit.
- Tidak melakukan RPC promo berulang saat DOMContentLoaded/openApp/refreshDashboard.
- Data promo tetap diperbarui paksa saat halaman pengaturan promo dibuka dan setelah simpan/hapus.
- Tidak ada perubahan tabel atau SQL Supabase.
- Tidak mengubah target, kunjungan, pelanggan, login, kamera, atau delete sales.

Tujuan: mengurangi request PostgREST promo yang berulang dan menahan egress.
