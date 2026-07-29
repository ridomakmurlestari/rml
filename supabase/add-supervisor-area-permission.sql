-- RML Sales Visit v0.10.9
-- Jalankan sebagai QUERY BARU setelah setup.sql dan add-edit-user-account.sql.

alter table public.app_users
  add column if not exists can_switch_area_freely boolean not null default false;

update public.app_users
set can_switch_area_freely = true,
    updated_at = now()
where account_key = 'septino@rml.app';

create or replace function public.app_get_permissions(p_token text)
returns table(can_switch_area_freely boolean)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_uid uuid;
begin
  select s.user_id into v_uid from public._app_session_user(p_token) s;
  if v_uid is null then raise exception 'Sesi tidak valid'; end if;
  return query
  select coalesce(u.can_switch_area_freely,false)
  from public.app_users u
  where u.id=v_uid;
end $$;

grant execute on function public.app_get_permissions(text) to anon, authenticated;

drop function if exists public.app_admin_update_user(text,text,text,text,text,boolean);
create function public.app_admin_update_user(
  p_token text,
  p_account_key text,
  p_display_name text,
  p_login_name text,
  p_phone text,
  p_active boolean default true,
  p_can_switch_area_freely boolean default false
)
returns table(account_key text, login_name text, display_name text, phone text, role text, active boolean, can_switch_area_freely boolean)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_role text;
  v_name text := trim(coalesce(p_display_name,''));
  v_login text := lower(trim(coalesce(p_login_name,'')));
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  select s.role into v_role from public._app_session_user(p_token) s;
  if v_role is distinct from 'admin' then raise exception 'Hanya admin yang dapat mengubah akun'; end if;
  if v_name = '' then raise exception 'Nama tampilan wajib diisi'; end if;
  if v_login !~ '^[a-z0-9._-]{3,40}$' then raise exception 'Nama login tidak valid'; end if;
  if length(v_phone) < 8 then raise exception 'Nomor handphone tidak valid'; end if;
  if exists(select 1 from public.app_users u where lower(u.login_name)=v_login and u.account_key<>p_account_key) then raise exception 'Nama login sudah digunakan'; end if;
  if exists(select 1 from public.app_users u where u.phone=v_phone and u.account_key<>p_account_key) then raise exception 'Nomor handphone sudah digunakan'; end if;

  update public.app_users u
  set display_name=v_name,
      login_name=v_login,
      phone=v_phone,
      active=coalesce(p_active,true),
      can_switch_area_freely=case when u.role='sales' then coalesce(p_can_switch_area_freely,false) else false end,
      updated_at=now()
  where u.account_key=p_account_key;

  if not found then raise exception 'Akun tidak ditemukan'; end if;

  return query
  select u.account_key,u.login_name,u.display_name,u.phone,u.role,u.active,u.can_switch_area_freely
  from public.app_users u where u.account_key=p_account_key;
end $$;

grant execute on function public.app_admin_update_user(text,text,text,text,text,boolean,boolean) to anon, authenticated;

create or replace function public.app_admin_save_settings(p_token text,p_users jsonb,p_assignments jsonb)
returns boolean language plpgsql security definer set search_path=public,extensions
as $$
declare v_role text; r record;
begin
 select s.role into v_role from public._app_session_user(p_token) s;
 if v_role is distinct from 'admin' then raise exception 'Hanya admin yang dapat mengubah pengaturan'; end if;
 for r in select * from jsonb_to_recordset(coalesce(p_users,'[]'::jsonb))
   as x(account_key text,display_name text,login_name text,phone text,role text,active boolean,can_switch_area_freely boolean)
 loop
  update public.app_users u
  set display_name=trim(r.display_name),
      login_name=lower(trim(coalesce(r.login_name,r.display_name))),
      phone=regexp_replace(coalesce(r.phone,''),'[^0-9]','','g'),
      active=coalesce(r.active,true),
      can_switch_area_freely=case when u.role='sales' then coalesce(r.can_switch_area_freely,false) else false end,
      updated_at=now()
  where u.account_key=r.account_key;
 end loop;
 delete from public.area_assignments;
 insert into public.area_assignments(sales_email,area)
 select x.sales_email,x.area from jsonb_to_recordset(coalesce(p_assignments,'[]'::jsonb)) as x(sales_email text,area text)
 on conflict do nothing;
 return true;
end $$;

grant execute on function public.app_admin_save_settings(text,jsonb,jsonb) to anon, authenticated;

select account_key,display_name,role,can_switch_area_freely
from public.app_users
order by role,display_name;
