-- RML v1.8.39: promo dapat dimiliki Sales maupun Supervisor.
drop function if exists public.app_admin_upsert_monthly_promo(text,text,text,jsonb);
create function public.app_admin_upsert_monthly_promo(p_token text,p_month_key text,p_sales_email text,p_items jsonb)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_role text;v_email text;v_owner text;
begin
 select lower(trim(p.role::text)),lower(trim(p.account_key::text)) into v_role,v_email from public.app_get_profile(p_token) p limit 1;
 if v_role not in ('admin','supervisor') then raise exception 'Hanya Admin/Supervisor yang dapat mengatur promo'; end if;
 v_owner:=lower(trim(p_sales_email));
 if not exists(select 1 from public.app_users u where lower(u.account_key)=v_owner and u.role in ('sales','supervisor') and coalesce(u.active,true)) then raise exception 'Penanggung jawab tidak ditemukan'; end if;
 insert into public.rml_monthly_promos(month_key,sales_email,items,updated_at) values(trim(p_month_key),v_owner,coalesce(p_items,'[]'::jsonb),now())
 on conflict(month_key,sales_email) do update set items=excluded.items,updated_at=now();
 return true;
end $$;
grant execute on function public.app_admin_upsert_monthly_promo(text,text,text,jsonb) to anon,authenticated;
