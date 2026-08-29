-- RML Sales Visit v1.0.2
-- Jalankan satu kali di Supabase SQL Editor.

create or replace function public.app_admin_delete_visits(p_token text,p_visit_ids jsonb)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_deleted integer := 0;
begin
  select s.role into v_role
  from public._app_session_user(p_token) s;

  if v_role is distinct from 'admin' then
    raise exception 'Hanya admin yang dapat menghapus riwayat kunjungan';
  end if;

  if jsonb_typeof(coalesce(p_visit_ids,'[]'::jsonb)) <> 'array' then
    raise exception 'Daftar ID riwayat tidak valid';
  end if;

  delete from public.visits v
  where v.id in (
    select value
    from jsonb_array_elements_text(coalesce(p_visit_ids,'[]'::jsonb))
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

grant execute on function public.app_admin_delete_visits(text,jsonb) to anon, authenticated;
