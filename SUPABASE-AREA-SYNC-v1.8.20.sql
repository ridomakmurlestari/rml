-- RML Sales Visit v1.8.20
-- FIX: Supervisor area assignment persistence.
-- Jangan mengakses tabel user tertentu karena struktur tabel akun tiap project dapat berbeda.
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

-- Hapus signature RPC area-save yang pernah dibuat oleh versi sebelumnya.
drop function if exists public.app_admin_set_user_area_assignments(jsonb, text, text);
drop function if exists public.app_admin_set_user_area_assignments(text, text, jsonb);
drop function if exists public.app_admin_set_user_area_assignments(text, jsonb, text);

create or replace function public.app_admin_set_user_area_assignments(
  p_token text,
  p_sales_email text,
  p_areas jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_email text;
  v_count integer := 0;
begin
  -- Ambil role langsung dari hasil app_get_profile(), sama seperti aplikasi
  -- mengambil p.role dan p.account_key saat login.
  select lower(trim(coalesce(p.role::text, ''))),
         lower(trim(coalesce(p.account_key::text, '')))
    into v_role, v_email
  from public.app_get_profile(p_token) p
  limit 1;

  if v_email is null or v_email = '' then
    raise exception 'Sesi login tidak valid';
  end if;

  if v_role not in ('admin', 'supervisor') then
    raise exception 'Tidak memiliki izin mengubah penugasan area';
  end if;

  if nullif(trim(coalesce(p_sales_email, '')), '') is null then
    raise exception 'Email pengguna tidak valid';
  end if;

  -- Hanya mengganti assignment user yang sedang diedit.
  -- Assignment Rini/Lisna/user lain tidak disentuh.
  delete from public.rml_area_assignments
  where lower(trim(sales_email)) = lower(trim(p_sales_email));

  insert into public.rml_area_assignments (sales_email, area, updated_at)
  select distinct
    lower(trim(p_sales_email)),
    trim(value),
    now()
  from jsonb_array_elements_text(coalesce(p_areas, '[]'::jsonb))
  where nullif(trim(value), '') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.app_admin_set_user_area_assignments(text, text, jsonb) to anon, authenticated;

-- Ambil assignment user yang sedang login.
create or replace function public.app_get_my_area_assignments(p_token text)
returns table(area text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role text;
begin
  select lower(trim(coalesce(p.role::text, ''))),
         lower(trim(coalesce(p.account_key::text, '')))
    into v_role, v_email
  from public.app_get_profile(p_token) p
  limit 1;

  if v_email is null or v_email = '' then
    raise exception 'Sesi login tidak valid';
  end if;

  if v_role not in ('sales', 'supervisor') then
    return;
  end if;

  return query
    select a.area
    from public.rml_area_assignments a
    where lower(trim(a.sales_email)) = v_email
    order by a.area;
end;
$$;

grant execute on function public.app_get_my_area_assignments(text) to anon, authenticated;

notify pgrst, 'reload schema';
