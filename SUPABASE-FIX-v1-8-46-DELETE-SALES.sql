-- RML v1.8.46 - FIX HAPUS SALES
-- Hanya membuat/memperbaiki RPC yang dipanggil tombol "Hapus Sales".
-- Tidak membuat tabel baru dan tidak membaca/download data besar.

drop function if exists public.app_admin_delete_user(text,text);

create function public.app_admin_delete_user(p_token text,p_account_key text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_id uuid;
  v_target_role text;
begin
  select lower(trim(s.role::text))
    into v_role
  from public._app_session_user(p_token) s
  limit 1;

  if v_role not in ('admin','supervisor') then
    raise exception 'Tidak memiliki izin menghapus Sales';
  end if;

  select id, lower(trim(role::text))
    into v_id, v_target_role
  from public.app_users
  where lower(trim(account_key))=lower(trim(p_account_key))
  limit 1;

  if v_id is null then
    raise exception 'Akun Sales tidak ditemukan';
  end if;

  if v_target_role <> 'sales' then
    raise exception 'Yang dapat dihapus hanya akun Sales';
  end if;

  -- Soft delete: akun dinonaktifkan agar riwayat kunjungan tetap aman.
  update public.app_users
  set active=false, updated_at=now()
  where id=v_id;

  -- Hentikan sesi login Sales yang dihapus.
  delete from public.app_sessions
  where user_id=v_id;

  -- Hapus pembagian area aktifnya; riwayat kunjungan tidak disentuh.
  delete from public.area_assignments
  where lower(trim(sales_email))=lower(trim(p_account_key));

  return true;
end $$;

grant execute on function public.app_admin_delete_user(text,text) to anon,authenticated;

notify pgrst,'reload schema';
