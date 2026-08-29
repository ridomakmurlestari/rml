RML Sales Visit v1.8.42 - Egress Fix

Perbaikan utama:
- Rekonsiliasi tidak lagi mengambil payload/jsonb kunjungan atau foto.
- RPC baru app_pull_visit_ids hanya mengirim id + updated_at.
- Auto remote reconciliation 30 detik dihapus.
- Delta sync tetap berjalan untuk sinkronisasi data normal.
- VISIT_FULL_SYNC_VERSION tetap v2 agar perangkat existing tidak dipaksa full download ulang.

Supabase:
Jalankan SUPABASE-FIX-v1-8-42.sql satu kali di SQL Editor.

Deploy web:
Upload isi folder web ke GitHub/Vercel seperti biasa.
