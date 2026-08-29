-- RML Sales Visit v1.8.19
-- FIX: role Supervisor Septino + penyimpanan assignment area per-user.
-- Jalankan SEKALI di Supabase SQL Editor.

-- 1) Pastikan Septino benar-benar Supervisor di database.
update public.rml_users
set role = 'supervisor'
where lower(trim(coalesce(account_key,''))) = 'septino@rml.app';

-- 2) Pastikan tabel assignment tersedia.
create table if not exists public.rml_area_assignments (
  sales_email text not null,
  area text not null,
  updated_at timestamptz not null default now(),
  primary key (sales_email, area)
);
create index if not exists idx_rml_area_assignments_sales_email
  on public.rml_area_assignments (sales_email);
alter table public.rml_area_assignments enable row level security;

-- 3) Simpan assignment satu user tanpa menghapus user lain.
drop function if exists public.app_admin_set_user_area_assignments(jsonb, text, text);
drop function if exists public.app_admin_set_user_area_assignments(text, text, jsonb);
create or replace function public.app_admin_set_user_area_assignments(
  p_areas jsonb,
  p_sales_email text,
  p_token text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile jsonb;
  v_role text;
  v_email text;
  v_count integer := 0;
begin
  select to_jsonb(p) into profile
  from public.app_get_profile(p_token) p
  limit 1;
  if profile is null then raise exception 'Sesi login tidak valid'; end if;

  v_role := lower(trim(coalesce(profile->>'role','')));
  if v_role not in ('admin','supervisor') then
    raise exception 'Tidak memiliki izin mengubah penugasan area';
  end if;

  v_email := lower(trim(coalesce(p_sales_email,'')));
  if v_email = '' then raise exception 'Email pengguna tidak valid'; end if;

  if not exists (
    select 1 from public.rml_users u
    where lower(trim(coalesce(u.account_key,''))) = v_email
      and lower(trim(coalesce(u.role,''))) in ('sales','supervisor')
  ) then
    raise exception 'Pengguna Sales/Supervisor tidak ditemukan';
  end if;

  delete from public.rml_area_assignments
  where lower(trim(sales_email)) = v_email;

  insert into public.rml_area_assignments (sales_email, area, updated_at)
  select distinct v_email, trim(value), now()
  from jsonb_array_elements_text(coalesce(p_areas,'[]'::jsonb))
  where nullif(trim(value),'') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.app_admin_set_user_area_assignments(jsonb,text,text) to anon, authenticated;

-- 4) Ambil assignment user yang sedang login.
create or replace function public.app_get_my_area_assignments(p_token text)
returns table(area text)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile jsonb;
  v_email text;
  v_role text;
begin
  select to_jsonb(p) into profile
  from public.app_get_profile(p_token) p
  limit 1;
  if profile is null then raise exception 'Sesi login tidak valid'; end if;
  v_email := lower(trim(coalesce(profile->>'account_key','')));
  v_role := lower(trim(coalesce(profile->>'role','')));
  if v_role not in ('sales','supervisor') then return; end if;
  return query
    select a.area
    from public.rml_area_assignments a
    where lower(trim(a.sales_email)) = v_email
    order by a.area;
end;
$$;

grant execute on function public.app_get_my_area_assignments(text) to anon, authenticated;

notify pgrst, 'reload schema';
