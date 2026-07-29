-- Jalankan sebagai QUERY BARU pada project Supabase yang sudah terpasang.
-- Mengubah nama login dan nama tampilan Administrator menjadi Admin.
-- Password, role, session, riwayat, dan account_key tetap sama.

update public.app_users
set
  login_name = 'admin',
  display_name = 'Admin',
  updated_at = now()
where account_key = 'admin@rml.app';

select account_key, login_name, display_name, phone, role, must_change_password
from public.app_users
where account_key = 'admin@rml.app';
