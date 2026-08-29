RML Sales Visit v1.8.19

FIX SUPERVISOR AREA SAVE
1. Jalankan SQL SUPABASE-AREA-SYNC-v1.8.19.sql sekali di Supabase SQL Editor.
2. Upload seluruh isi ZIP ke root GitHub.
3. Refresh / reinstall PWA jika perlu.

Perubahan:
- Septino dikembalikan sebagai Supervisor di database.
- Assignment area Supervisor disimpan per-user melalui RPC.
- Login Supervisor tidak lagi menjalankan full settings sync yang dapat menimpa assignment.
