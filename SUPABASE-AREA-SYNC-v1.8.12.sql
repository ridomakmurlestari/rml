-- RML Sales Visit v1.8.12
-- Jalankan SEKALI di Supabase SQL Editor.

create table if not exists public.rml_area_assignments (
  sales_email text not null,
  area text not null,
  updated_at timestamptz not null default now(),
  primary key (sales_email, area)
);

create index if not exists idx_rml_area_assignments_sales_email
  on public.rml_area_assignments (sales_email);

alter table public.rml_area_assignments enable row level security;

create or replace function public.app_admin_set_area_assignments(
  p_token text,
  p_assignments jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile jsonb;
  v_role text;
  v_count integer := 0;
begin
  select to_jsonb(p) into profile
  from public.app_get_profile(p_token) p
  limit 1;
  if profile is null then raise exception 'Sesi login tidak valid'; end if;
  v_role := lower(coalesce(profile->>'role',''));
  if v_role not in ('admin','supervisor') then raise exception 'Tidak memiliki izin mengubah penugasan area'; end if;

  delete from public.rml_area_assignments;
  insert into public.rml_area_assignments (sales_email, area, updated_at)
  select distinct lower(trim(x.sales_email)), trim(x.area), now()
  from jsonb_to_recordset(coalesce(p_assignments,'[]'::jsonb)) as x(sales_email text, area text)
  where nullif(trim(x.sales_email),'') is not null
    and nullif(trim(x.area),'') is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
  v_role := lower(coalesce(profile->>'role',''));
  if v_role <> 'sales' then return; end if;
  return query
    select a.area
    from public.rml_area_assignments a
    where lower(a.sales_email)=v_email
    order by a.area;
end;
$$;

grant execute on function public.app_admin_set_area_assignments(text, jsonb) to anon, authenticated;
grant execute on function public.app_get_my_area_assignments(text) to anon, authenticated;

-- Setelah SQL dijalankan:
-- 1. Login Admin/Supervisor sekali.
-- 2. Buka Pengaturan -> Penugasan Area.
-- 3. Simpan/ubah penugasan minimal sekali agar assignment lama masuk ke tabel sinkronisasi.
-- 4. Sales logout lalu login kembali.
