-- RML Sales Visit v1.8.22
-- Remote target storage so Admin/Supervisor targets appear on each Sales dashboard.
-- Run once in Supabase SQL Editor.

create table if not exists public.rml_dashboard_targets (
  id text primary key,
  type text not null check (type in ('sales','outlet')),
  start_month text not null,
  duration_months integer not null default 1 check (duration_months in (1,3,6)),
  owner_id text not null,
  target_sales_email text not null default '',
  description text not null default '',
  target numeric not null default 0,
  achieved numeric not null default 0,
  updated_date date,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_rml_dashboard_targets_owner on public.rml_dashboard_targets(lower(owner_id));
create index if not exists idx_rml_dashboard_targets_sales on public.rml_dashboard_targets(lower(target_sales_email));
create index if not exists idx_rml_dashboard_targets_start on public.rml_dashboard_targets(start_month);
alter table public.rml_dashboard_targets enable row level security;

drop function if exists public.app_get_dashboard_targets(text);
drop function if exists public.app_admin_upsert_dashboard_target(text,jsonb);
drop function if exists public.app_admin_delete_dashboard_target(text,text);

create or replace function public.app_get_dashboard_targets(p_token text)
returns table(
 id text,
 type text,
 start_month text,
 duration_months integer,
 owner_id text,
 target_sales_email text,
 description text,
 target numeric,
 achieved numeric,
 updated_date date,
 updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
 v_role text;
 v_email text;
begin
 select lower(trim(coalesce(p.role::text,''))), lower(trim(coalesce(p.account_key::text,'')))
 into v_role,v_email
 from public.app_get_profile(p_token) p limit 1;
 if v_email is null or v_email='' then raise exception 'Sesi login tidak valid'; end if;
 if v_role not in ('admin','supervisor','sales') then return; end if;
 return query
 select t.id,t.type,t.start_month,t.duration_months,t.owner_id,t.target_sales_email,t.description,t.target,t.achieved,t.updated_date,t.updated_at
 from public.rml_dashboard_targets t
 where v_role in ('admin','supervisor')
    or (v_role='sales' and (lower(trim(t.owner_id))=v_email or lower(trim(t.target_sales_email))=v_email))
 order by t.start_month desc,t.updated_at desc,t.id;
end;
$$;

grant execute on function public.app_get_dashboard_targets(text) to anon, authenticated;

create or replace function public.app_admin_upsert_dashboard_target(p_token text,p_target jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
 v_role text;
 v_email text;
 v_id text;
begin
 select lower(trim(coalesce(p.role::text,''))), lower(trim(coalesce(p.account_key::text,'')))
 into v_role,v_email
 from public.app_get_profile(p_token) p limit 1;
 if v_email is null or v_email='' then raise exception 'Sesi login tidak valid'; end if;
 if v_role not in ('admin','supervisor') then raise exception 'Tidak memiliki izin mengubah target'; end if;
 v_id=trim(coalesce(p_target->>'id',''));
 if v_id='' then raise exception 'ID target tidak valid'; end if;
 insert into public.rml_dashboard_targets(id,type,start_month,duration_months,owner_id,target_sales_email,description,target,achieved,updated_date,updated_at)
 values(v_id,coalesce(p_target->>'type','sales'),coalesce(p_target->>'start_month',p_target->>'month'),greatest(1,least(6,coalesce((p_target->>'duration_months')::integer,1))),trim(coalesce(p_target->>'owner_id','')),trim(coalesce(p_target->>'target_sales_email','')),trim(coalesce(p_target->>'description','')),coalesce((p_target->>'target')::numeric,0),greatest(0,coalesce((p_target->>'achieved')::numeric,0)),nullif(p_target->>'updated_date','')::date,coalesce(nullif(p_target->>'updated_at','')::timestamptz,now()))
 on conflict(id) do update set type=excluded.type,start_month=excluded.start_month,duration_months=excluded.duration_months,owner_id=excluded.owner_id,target_sales_email=excluded.target_sales_email,description=excluded.description,target=excluded.target,achieved=excluded.achieved,updated_date=excluded.updated_date,updated_at=excluded.updated_at;
 return jsonb_build_object('id',v_id,'saved',true);
end;
$$;

grant execute on function public.app_admin_upsert_dashboard_target(text,jsonb) to anon, authenticated;

create or replace function public.app_admin_delete_dashboard_target(p_token text,p_target_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; v_email text;
begin
 select lower(trim(coalesce(p.role::text,''))), lower(trim(coalesce(p.account_key::text,''))) into v_role,v_email from public.app_get_profile(p_token) p limit 1;
 if v_email is null or v_email='' then raise exception 'Sesi login tidak valid'; end if;
 if v_role not in ('admin','supervisor') then raise exception 'Tidak memiliki izin menghapus target'; end if;
 delete from public.rml_dashboard_targets where id=trim(p_target_id);
 return true;
end;
$$;

grant execute on function public.app_admin_delete_dashboard_target(text,text) to anon, authenticated;

notify pgrst,'reload schema';
