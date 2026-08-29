-- RML Sales Visit v1.8.37 - USER/TARGET/PROMO SERVER FIX
-- Perbaikan sinkronisasi akun Sales: response kosong/sebagian tidak menghapus cache lokal.
-- Jalankan SATU KALI di Supabase SQL Editor.

-- 1) Akun Sales/Supervisor: upsert yang aman dan tidak memakai DELETE tanpa WHERE.
create or replace function public.app_admin_upsert_user(p_token text,p_user jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_role text; v_account text; v_target_role text; v_id uuid;
  v_display text; v_login text; v_phone text; v_active boolean; v_free boolean;
begin
  select lower(s.role) into v_role from public._app_session_user(p_token) s;
  if v_role not in ('admin','supervisor') then raise exception 'Tidak memiliki izin mengelola akun'; end if;
  v_account:=lower(trim(coalesce(p_user->>'account_key','')));
  v_target_role:=lower(trim(coalesce(p_user->>'role','sales')));
  v_display:=trim(coalesce(p_user->>'display_name',''));
  v_login:=lower(trim(coalesce(p_user->>'login_name','')));
  v_phone:=regexp_replace(coalesce(p_user->>'phone',''),'[^0-9]','','g');
  v_active:=coalesce((p_user->>'active')::boolean,true);
  v_free:=coalesce((p_user->>'can_switch_area_freely')::boolean,false);
  if v_account='' or v_display='' or v_login='' or v_phone='' then raise exception 'Data akun belum lengkap'; end if;
  if v_target_role not in ('sales','supervisor') then
    if v_role<>'admin' then raise exception 'Supervisor hanya dapat mengelola akun Sales'; end if;
    raise exception 'Peran akun tidak valid';
  end if;
  if v_role='supervisor' and v_target_role<>'sales' then raise exception 'Supervisor hanya dapat mengelola akun Sales'; end if;
  select id into v_id from public.app_users where lower(account_key)=v_account limit 1;
  if v_id is null then
    if exists(select 1 from public.app_users where lower(login_name)=v_login) then raise exception 'Nama login sudah digunakan'; end if;
    if exists(select 1 from public.app_users where phone=v_phone) then raise exception 'Nomor handphone sudah digunakan'; end if;
    insert into public.app_users(account_key,login_name,display_name,phone,password_hash,role,must_change_password,active,can_switch_area_freely)
    values(v_account,v_login,v_display,v_phone,extensions.crypt(v_phone,extensions.gen_salt('bf')),v_target_role,true,v_active,case when v_target_role='sales' then v_free else false end)
    returning id into v_id;
  else
    if exists(select 1 from public.app_users where lower(login_name)=v_login and id<>v_id) then raise exception 'Nama login sudah digunakan'; end if;
    if exists(select 1 from public.app_users where phone=v_phone and id<>v_id) then raise exception 'Nomor handphone sudah digunakan'; end if;
    update public.app_users set login_name=v_login,display_name=v_display,phone=v_phone,role=v_target_role,active=v_active,can_switch_area_freely=case when v_target_role='sales' then v_free else false end,updated_at=now() where id=v_id;
  end if;
  return jsonb_build_object('saved',true,'account_key',v_account);
end $$;
grant execute on function public.app_admin_upsert_user(text,jsonb) to anon,authenticated;

drop function if exists public.app_get_users(text);
create function public.app_get_users(p_token text)
returns table(account_key text,login_name text,display_name text,phone text,role text,active boolean,must_change_password boolean,can_switch_area_freely boolean)
language plpgsql security definer set search_path=public
as $$
declare v_role text; v_uid uuid; v_account text;
begin
 select s.user_id,s.account_key,lower(s.role) into v_uid,v_account,v_role
 from public._app_session_user(p_token) s limit 1;
 if v_uid is null or v_role not in ('admin','supervisor','sales') then raise exception 'Sesi login tidak valid'; end if;
 if v_role='admin' then
   return query select u.account_key,u.login_name,u.display_name,u.phone,u.role,u.active,u.must_change_password,u.can_switch_area_freely from public.app_users u order by u.role,u.display_name;
 elsif v_role='supervisor' then
   return query select u.account_key,u.login_name,u.display_name,u.phone,u.role,u.active,u.must_change_password,u.can_switch_area_freely
   from public.app_users u
   where u.role='sales' or lower(u.account_key)=lower(v_account)
   order by u.role,u.display_name;
 else
   return query select u.account_key,u.login_name,u.display_name,u.phone,u.role,u.active,u.must_change_password,u.can_switch_area_freely
   from public.app_users u where u.id=v_uid;
 end if;
end $$;
grant execute on function public.app_get_users(text) to anon,authenticated;


-- 1b) Supervisor juga boleh reset password akun Sales.
drop function if exists public.app_admin_reset_password(text,text);
create function public.app_admin_reset_password(p_token text,p_account_key text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_role text; v_target_role text; v_uid uuid; v_phone text;
begin
 select lower(s.role) into v_role from public._app_session_user(p_token) s;
 if v_role not in ('admin','supervisor') then raise exception 'Tidak memiliki izin reset password'; end if;
 select id,role,phone into v_uid,v_target_role,v_phone from public.app_users where lower(account_key)=lower(trim(p_account_key));
 if v_uid is null then raise exception 'Akun tidak ditemukan'; end if;
 if v_role='supervisor' and v_target_role<>'sales' then raise exception 'Supervisor hanya dapat reset password Sales'; end if;
 update public.app_users set password_hash=extensions.crypt(v_phone,extensions.gen_salt('bf')),must_change_password=true,updated_at=now() where id=v_uid;
 delete from public.app_sessions where user_id=v_uid;
 return true;
end $$;
grant execute on function public.app_admin_reset_password(text,text) to anon,authenticated;

-- 2) Target: reward columns + Supervisor boleh create/edit/delete.
alter table public.rml_dashboard_targets add column if not exists reward_type text not null default 'none';
alter table public.rml_dashboard_targets add column if not exists reward_value numeric not null default 0;
alter table public.rml_dashboard_targets drop constraint if exists rml_dashboard_targets_duration_months_check;
alter table public.rml_dashboard_targets add constraint rml_dashboard_targets_duration_months_check check (duration_months in (1,3,6,12));

drop function if exists public.app_get_dashboard_targets(text);
create function public.app_get_dashboard_targets(p_token text)
returns table(id text,type text,start_month text,duration_months integer,owner_id text,target_sales_email text,description text,target numeric,achieved numeric,reward_type text,reward_value numeric,updated_date date,updated_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare v_role text; v_email text;
begin
 select lower(trim(p.role::text)),lower(trim(p.account_key::text)) into v_role,v_email from public.app_get_profile(p_token) p limit 1;
 if v_email is null or v_email='' then raise exception 'Sesi login tidak valid'; end if;
 if v_role not in ('admin','supervisor','sales') then return; end if;
 return query select t.id,t.type,t.start_month,t.duration_months,t.owner_id,t.target_sales_email,t.description,t.target,t.achieved,t.reward_type,t.reward_value,t.updated_date,t.updated_at from public.rml_dashboard_targets t where v_role in ('admin','supervisor') or (v_role='sales' and (lower(trim(t.owner_id))=v_email or lower(trim(t.target_sales_email))=v_email)) order by t.start_month desc,t.updated_at desc,t.id;
end $$;
grant execute on function public.app_get_dashboard_targets(text) to anon,authenticated;

drop function if exists public.app_admin_upsert_dashboard_target(text,jsonb);
create function public.app_admin_upsert_dashboard_target(p_token text,p_target jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_role text;v_email text;v_id text;
begin
 select lower(trim(p.role::text)),lower(trim(p.account_key::text)) into v_role,v_email from public.app_get_profile(p_token) p limit 1;
 if v_email is null or v_email='' then raise exception 'Sesi login tidak valid'; end if;
 if v_role not in ('admin','supervisor') then raise exception 'Tidak memiliki izin mengubah target'; end if;
 v_id:=trim(coalesce(p_target->>'id','')); if v_id='' then raise exception 'ID target tidak valid'; end if;
 insert into public.rml_dashboard_targets(id,type,start_month,duration_months,owner_id,target_sales_email,description,target,achieved,reward_type,reward_value,updated_date,updated_at)
 values(v_id,coalesce(p_target->>'type','sales'),coalesce(p_target->>'start_month',p_target->>'month'),greatest(1,least(12,coalesce((p_target->>'duration_months')::integer,1))),trim(coalesce(p_target->>'owner_id','')),trim(coalesce(p_target->>'target_sales_email','')),trim(coalesce(p_target->>'description','')),coalesce((p_target->>'target')::numeric,0),greatest(0,coalesce((p_target->>'achieved')::numeric,0)),case when coalesce(p_target->>'reward_type','none') in ('none','percent','nominal') then coalesce(p_target->>'reward_type','none') else 'none' end,greatest(0,coalesce((p_target->>'reward_value')::numeric,0)),nullif(p_target->>'updated_date','')::date,coalesce(nullif(p_target->>'updated_at','')::timestamptz,now()))
 on conflict(id) do update set type=excluded.type,start_month=excluded.start_month,duration_months=excluded.duration_months,owner_id=excluded.owner_id,target_sales_email=excluded.target_sales_email,description=excluded.description,target=excluded.target,achieved=excluded.achieved,reward_type=excluded.reward_type,reward_value=excluded.reward_value,updated_date=excluded.updated_date,updated_at=excluded.updated_at;
 return jsonb_build_object('id',v_id,'saved',true);
end $$;
grant execute on function public.app_admin_upsert_dashboard_target(text,jsonb) to anon,authenticated;

-- 3) Promo per Sales per bulan.
create table if not exists public.rml_monthly_promos(
 month_key text not null,
 sales_email text not null,
 items jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 primary key(month_key,sales_email)
);
alter table public.rml_monthly_promos enable row level security;
revoke all on public.rml_monthly_promos from anon,authenticated;

drop function if exists public.app_get_monthly_promos(text,text);
create function public.app_get_monthly_promos(p_token text,p_month_key text)
returns table(month_key text,sales_email text,items jsonb,updated_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare v_role text;v_email text;
begin
 select lower(trim(p.role::text)),lower(trim(p.account_key::text)) into v_role,v_email from public.app_get_profile(p_token) p limit 1;
 if v_email is null or v_email='' then raise exception 'Sesi login tidak valid'; end if;
 if v_role in ('admin','supervisor') then return query select m.month_key,m.sales_email,m.items,m.updated_at from public.rml_monthly_promos m where m.month_key=p_month_key order by m.sales_email;
 elsif v_role='sales' then return query select m.month_key,m.sales_email,m.items,m.updated_at from public.rml_monthly_promos m where m.month_key=p_month_key and lower(m.sales_email)=v_email;
 end if;
end $$;
grant execute on function public.app_get_monthly_promos(text,text) to anon,authenticated;

drop function if exists public.app_admin_upsert_monthly_promo(text,text,text,jsonb);
create function public.app_admin_upsert_monthly_promo(p_token text,p_month_key text,p_sales_email text,p_items jsonb)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_role text;v_email text;v_sales text;
begin
 select lower(trim(p.role::text)),lower(trim(p.account_key::text)) into v_role,v_email from public.app_get_profile(p_token) p limit 1;
 if v_role not in ('admin','supervisor') then raise exception 'Hanya Admin/Supervisor yang dapat mengatur promo'; end if;
 v_sales:=lower(trim(p_sales_email));
 if not exists(select 1 from public.app_users u where lower(u.account_key)=v_sales and u.role='sales') then raise exception 'Sales tidak ditemukan'; end if;
 insert into public.rml_monthly_promos(month_key,sales_email,items,updated_at) values(trim(p_month_key),v_sales,coalesce(p_items,'[]'::jsonb),now()) on conflict(month_key,sales_email) do update set items=excluded.items,updated_at=now();
 return true;
end $$;
grant execute on function public.app_admin_upsert_monthly_promo(text,text,text,jsonb) to anon,authenticated;

-- 4) Hapus Sales secara aman: akun dinonaktifkan agar riwayat kunjungan tidak ikut terhapus.
drop function if exists public.app_admin_delete_user(text,text);
create function public.app_admin_delete_user(p_token text,p_account_key text)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare v_role text; v_id uuid; v_target_role text;
begin
 select lower(s.role) into v_role from public._app_session_user(p_token) s;
 if v_role not in ('admin','supervisor') then raise exception 'Tidak memiliki izin menghapus Sales'; end if;
 select id,role into v_id,v_target_role from public.app_users where lower(account_key)=lower(trim(p_account_key)) limit 1;
 if v_id is null then raise exception 'Akun Sales tidak ditemukan'; end if;
 if v_target_role<>'sales' then raise exception 'Yang dapat dihapus hanya akun Sales'; end if;
 update public.app_users set active=false,updated_at=now() where id=v_id;
 delete from public.app_sessions where user_id=v_id;
 delete from public.area_assignments where lower(sales_email)=lower(trim(p_account_key));
 return true;
end $$;
grant execute on function public.app_admin_delete_user(text,text) to anon,authenticated;

notify pgrst,'reload schema';
