-- RML Sales Visit v0.10.4
-- Perbaikan error: column reference "expires_at" is ambiguous

create or replace function public.app_login(p_login_name text,p_password text)
returns table(session_token text,account_key text,display_name text,phone text,role text,must_change_password boolean,expires_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare v_user public.app_users%rowtype; v_token text; v_exp timestamptz;
begin
  select * into v_user from public.app_users u
  where lower(trim(u.login_name))=lower(trim(p_login_name)) and u.active=true limit 1;
  if v_user.id is null or v_user.password_hash <> extensions.crypt(p_password,v_user.password_hash) then
    raise exception 'Nama atau password salah';
  end if;
  delete from public.app_sessions s where s.expires_at<=now();
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_exp:=now()+interval '30 days';
  insert into public.app_sessions(user_id,token_hash,expires_at)
  values(v_user.id,encode(extensions.digest(v_token,'sha256'),'hex'),v_exp);
  return query select v_token,v_user.account_key,v_user.display_name,v_user.phone,v_user.role,v_user.must_change_password,v_exp;
end $$;

grant execute on function public.app_login(text,text) to anon, authenticated;

-- Verifikasi fungsi tersedia
select routine_name from information_schema.routines
where routine_schema='public' and routine_name='app_login';
