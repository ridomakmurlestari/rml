-- RML Sales Visit v1.8.43
-- FIX: Supervisor (Septino) can save Target + Promo.
-- IMPORTANT: uses existing public.app_users; does NOT create rml_users.
-- No visit/photo/data download is performed by this migration.

-- Target Outlet: owner may be Sales or Supervisor.
drop function if exists public.app_admin_upsert_dashboard_target(text,jsonb);
create function public.app_admin_upsert_dashboard_target(p_token text,p_target jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_role text; v_email text; v_id text; v_target_owner text; v_target_role text;
begin
  select lower(trim(coalesce(p.role::text,''))), lower(trim(coalesce(p.account_key::text,'')))
    into v_role,v_email
  from public.app_get_profile(p_token) p limit 1;

  if v_email is null or v_email='' then raise exception 'Sesi login tidak valid'; end if;
  if v_role not in ('admin','supervisor') then raise exception 'Tidak memiliki izin mengubah target'; end if;

  v_id:=trim(coalesce(p_target->>'id',''));
  if v_id='' then raise exception 'ID target tidak valid'; end if;

  if lower(coalesce(p_target->>'type','sales'))='outlet' then
    v_target_owner:=lower(trim(coalesce(p_target->>'target_sales_email','')));
    if v_target_owner<>'' then
      select lower(trim(coalesce(role::text,''))) into v_target_role
      from public.app_users
      where lower(trim(coalesce(account_key,'')))=v_target_owner
        and coalesce(active,true)<>false limit 1;
      if v_target_role is null then raise exception 'Penanggung jawab outlet tidak ditemukan'; end if;
      if v_target_role not in ('sales','supervisor') then raise exception 'Penanggung jawab outlet harus Sales atau Supervisor'; end if;
    end if;
  end if;

  insert into public.rml_dashboard_targets(
    id,type,start_month,duration_months,owner_id,target_sales_email,description,target,achieved,reward_type,reward_value,updated_date,updated_at
  ) values(
    v_id, coalesce(p_target->>'type','sales'), coalesce(p_target->>'start_month',p_target->>'month'),
    greatest(1,least(12,coalesce(nullif(p_target->>'duration_months','')::integer,1))),
    trim(coalesce(p_target->>'owner_id','')), lower(trim(coalesce(p_target->>'target_sales_email',''))),
    trim(coalesce(p_target->>'description','')), coalesce(nullif(p_target->>'target','')::numeric,0),
    greatest(0,coalesce(nullif(p_target->>'achieved','')::numeric,0)),
    case when coalesce(p_target->>'reward_type','none') in ('none','percent','nominal') then coalesce(p_target->>'reward_type','none') else 'none' end,
    greatest(0,coalesce(nullif(p_target->>'reward_value','')::numeric,0)),
    nullif(p_target->>'updated_date','')::date, coalesce(nullif(p_target->>'updated_at','')::timestamptz,now())
  )
  on conflict(id) do update set
    type=excluded.type,start_month=excluded.start_month,duration_months=excluded.duration_months,
    owner_id=excluded.owner_id,target_sales_email=excluded.target_sales_email,description=excluded.description,
    target=excluded.target,achieved=excluded.achieved,reward_type=excluded.reward_type,reward_value=excluded.reward_value,
    updated_date=excluded.updated_date,updated_at=excluded.updated_at;
  return jsonb_build_object('id',v_id,'saved',true);
end $$;
grant execute on function public.app_admin_upsert_dashboard_target(text,jsonb) to anon,authenticated;

-- Promo: selected owner value is the account_key/email, while UI may display "Septino — Supervisor".
drop function if exists public.app_admin_upsert_monthly_promo(text,text,text,jsonb);
create function public.app_admin_upsert_monthly_promo(p_token text,p_month_key text,p_sales_email text,p_items jsonb)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_role text; v_owner text; v_owner_role text;
begin
  select lower(trim(coalesce(p.role::text,''))) into v_role
  from public.app_get_profile(p_token) p limit 1;
  if v_role not in ('admin','supervisor') then raise exception 'Hanya Admin/Supervisor yang dapat mengatur promo'; end if;

  v_owner:=lower(trim(coalesce(p_sales_email,'')));
  select lower(trim(coalesce(role::text,''))) into v_owner_role
  from public.app_users
  where lower(trim(coalesce(account_key,'')))=v_owner and coalesce(active,true)<>false limit 1;
  if v_owner_role is null then raise exception 'Penanggung jawab tidak ditemukan'; end if;
  if v_owner_role not in ('sales','supervisor') then raise exception 'Penanggung jawab harus Sales atau Supervisor'; end if;

  insert into public.rml_monthly_promos(month_key,sales_email,items,updated_at)
  values(trim(p_month_key),v_owner,coalesce(p_items,'{"categories":[]}'::jsonb),now())
  on conflict(month_key,sales_email) do update set items=excluded.items,updated_at=now();
  return true;
end $$;
grant execute on function public.app_admin_upsert_monthly_promo(text,text,text,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
