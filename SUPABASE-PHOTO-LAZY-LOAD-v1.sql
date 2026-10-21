-- RML v2.0.5: on-demand check-in photos for Admin, Sales and Supervisor.
-- Run ONCE in Supabase SQL Editor BEFORE deploying app-history-photo-lazy-v1.js.
-- Photo bytes are stored separately from the normal visit payload.
-- Regular visit pulls return only a boolean flag; photo bytes are returned only by
-- app_pull_visit_photo when a user explicitly clicks "Lihat Foto Check-in".

create table if not exists public.rml_visit_photos (
  visit_id text primary key,
  sales_email text not null default '',
  photo_data text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rml_visit_photos enable row level security;
revoke all on table public.rml_visit_photos from public, anon, authenticated;

create or replace function public.app_upsert_visit_photo(
  p_token text,
  p_visit_id text,
  p_sales_email text,
  p_photo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_email text;
begin
  select lower(trim(coalesce(p.role::text,''))),
         lower(trim(coalesce(p.account_key::text,'')))
    into v_role, v_email
  from public.app_get_profile(p_token) p
  limit 1;

  if coalesce(v_email,'') = '' then
    raise exception 'Sesi login tidak valid. Silakan login kembali.';
  end if;
  if v_role not in ('admin','sales','supervisor') then
    raise exception 'Tidak memiliki izin menyimpan foto check-in.';
  end if;
  if coalesce(trim(p_visit_id),'') = '' then
    raise exception 'ID kunjungan tidak valid.';
  end if;
  if coalesce(trim(p_sales_email),'') = '' then
    raise exception 'Email pemilik kunjungan tidak valid.';
  end if;
  if v_role <> 'admin' and lower(trim(p_sales_email)) <> v_email then
    raise exception 'Tidak boleh menyimpan foto untuk akun lain.';
  end if;
  if p_photo is null or p_photo !~ '^data:image/(jpeg|jpg|png|webp);base64,' then
    raise exception 'Format foto tidak valid.';
  end if;
  if length(p_photo) > 1500000 then
    raise exception 'Foto terlalu besar. Ambil ulang foto dengan ukuran lebih kecil.';
  end if;

  insert into public.rml_visit_photos(visit_id,sales_email,photo_data,created_at,updated_at)
  values(trim(p_visit_id),lower(trim(p_sales_email)),p_photo,now(),now())
  on conflict(visit_id) do update
    set sales_email=excluded.sales_email,
        photo_data=excluded.photo_data,
        created_at=now(),
        updated_at=now();

  -- Opportunistic retention cleanup: do not keep old image blobs forever.
  delete from public.rml_visit_photos where created_at < now() - interval '45 days';

  return jsonb_build_object('saved',true,'visit_id',trim(p_visit_id));
end;
$$;

revoke all on function public.app_upsert_visit_photo(text,text,text,text) from public;
grant execute on function public.app_upsert_visit_photo(text,text,text,text) to anon, authenticated;

create or replace function public.app_pull_visit_photo(
  p_token text,
  p_visit_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_email text;
  v_owner text;
  v_photo text;
  v_row jsonb;
begin
  select lower(trim(coalesce(p.role::text,''))),
         lower(trim(coalesce(p.account_key::text,'')))
    into v_role, v_email
  from public.app_get_profile(p_token) p
  limit 1;

  if coalesce(v_email,'') = '' then
    raise exception 'Sesi login tidak valid. Silakan login kembali.';
  end if;
  if v_role not in ('admin','sales','supervisor') then
    raise exception 'Tidak memiliki izin melihat foto check-in.';
  end if;

  select sales_email, photo_data into v_owner, v_photo
  from public.rml_visit_photos
  where visit_id=trim(p_visit_id)
  limit 1;

  if v_photo is not null then
    if v_role='sales' and lower(trim(v_owner)) <> v_email then
      raise exception 'Tidak memiliki izin melihat foto kunjungan ini.';
    end if;
    return jsonb_build_object('found',true,'id',trim(p_visit_id),'checkInPhoto',v_photo);
  end if;

  -- Backward compatibility for old visits whose photo was saved inside payload.
  -- This function returns only the requested photo row; the normal history RPCs
  -- below never return any photo bytes.
  select to_jsonb(x) into v_row
  from public.app_pull_visits(p_token,5000) x
  where to_jsonb(x)->>'id'=trim(p_visit_id)
  limit 1;

  if v_row is null then
    return jsonb_build_object('found',false,'id',trim(p_visit_id));
  end if;

  v_owner := lower(trim(coalesce(v_row->>'sales_email', v_row->'payload'->>'salesEmail','')));
  if v_role='sales' and v_owner <> v_email then
    raise exception 'Tidak memiliki izin melihat foto kunjungan ini.';
  end if;

  v_photo := v_row->'payload'->>'checkInPhoto';
  if coalesce(v_photo,'') = '' then
    return jsonb_build_object('found',false,'id',trim(p_visit_id));
  end if;

  -- Migrate this legacy image into the separate table only when it is requested.
  insert into public.rml_visit_photos(visit_id,sales_email,photo_data,created_at,updated_at)
  values(trim(p_visit_id),coalesce(v_owner,v_email),v_photo,now(),now())
  on conflict(visit_id) do nothing;

  return jsonb_build_object('found',true,'id',trim(p_visit_id),'checkInPhoto',v_photo);
end;
$$;

revoke all on function public.app_pull_visit_photo(text,text) from public;
grant execute on function public.app_pull_visit_photo(text,text) to anon, authenticated;

create or replace function public.app_pull_visit_photo_flags(
  p_token text,
  p_visit_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role text;
  v_flags jsonb;
begin
  select lower(trim(coalesce(p.role::text,''))),
         lower(trim(coalesce(p.account_key::text,'')))
    into v_role, v_email
  from public.app_get_profile(p_token) p
  limit 1;

  if coalesce(v_email,'') = '' then
    raise exception 'Sesi login tidak valid. Silakan login kembali.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'hasCheckInPhoto',q.has_photo)),'[]'::jsonb)
    into v_flags
  from (
    select to_jsonb(x)->>'id' as id,
      (
        coalesce(nullif(to_jsonb(x)->'payload'->>'checkInPhoto',''),'') <> ''
        or exists (
          select 1 from public.rml_visit_photos p
          where p.visit_id=to_jsonb(x)->>'id'
        )
      ) as has_photo
    from public.app_pull_visits(p_token,5000) x
    where to_jsonb(x)->>'id'=any(coalesce(p_visit_ids,array[]::text[]))
  ) q;

  return jsonb_build_object('flags',coalesce(v_flags,'[]'::jsonb));
end;
$$;

revoke all on function public.app_pull_visit_photo_flags(text,text[]) from public;
grant execute on function public.app_pull_visit_photo_flags(text,text[]) to anon, authenticated;

-- Make the normal pull wrappers return only hasCheckInPhoto boolean metadata.
create or replace function public.app_pull_visits_nophoto(
  p_token text,
  p_limit integer default 5000
)
returns setof jsonb
language sql
security definer
set search_path=public
as $$
  select
    (to_jsonb(x) - 'payload') ||
    jsonb_build_object(
      'payload',
      case
        when jsonb_typeof(to_jsonb(x)->'payload')='object' then
          (
            (to_jsonb(x)->'payload') - 'checkInPhoto' - 'hasCheckInPhoto'
          ) || jsonb_build_object(
            'hasCheckInPhoto',
            (
              coalesce(nullif(to_jsonb(x)->'payload'->>'checkInPhoto',''),'') <> ''
              or exists (
                select 1 from public.rml_visit_photos p
                where p.visit_id=to_jsonb(x)->>'id'
              )
            )
          )
        else coalesce(to_jsonb(x)->'payload','{}'::jsonb)
      end
    )
  from public.app_pull_visits(p_token,p_limit) x;
$$;

create or replace function public.app_pull_visits_delta_nophoto(
  p_token text,
  p_since timestamptz default null,
  p_limit integer default 500
)
returns setof jsonb
language sql
security definer
set search_path=public
as $$
  select
    (to_jsonb(x) - 'payload') ||
    jsonb_build_object(
      'payload',
      case
        when jsonb_typeof(to_jsonb(x)->'payload')='object' then
          (
            (to_jsonb(x)->'payload') - 'checkInPhoto' - 'hasCheckInPhoto'
          ) || jsonb_build_object(
            'hasCheckInPhoto',
            (
              coalesce(nullif(to_jsonb(x)->'payload'->>'checkInPhoto',''),'') <> ''
              or exists (
                select 1 from public.rml_visit_photos p
                where p.visit_id=to_jsonb(x)->>'id'
              )
            )
          )
        else coalesce(to_jsonb(x)->'payload','{}'::jsonb)
      end
    )
  from public.app_pull_visits_delta(p_token,p_since,p_limit) x;
$$;

revoke all on function public.app_pull_visits_nophoto(text,integer) from public;
grant execute on function public.app_pull_visits_nophoto(text,integer) to anon, authenticated;
revoke all on function public.app_pull_visits_delta_nophoto(text,timestamptz,integer) from public;
grant execute on function public.app_pull_visits_delta_nophoto(text,timestamptz,integer) to anon, authenticated;

create or replace function public.app_admin_delete_visit_photo_v2(
  p_token text,
  p_visit_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_deleted boolean := false;
  v_legacy jsonb;
begin
  select lower(trim(coalesce(p.role::text,''))) into v_role
  from public.app_get_profile(p_token) p
  limit 1;
  if coalesce(v_role,'') <> 'admin' then
    raise exception 'Hanya admin yang dapat menghapus foto check-in.';
  end if;

  delete from public.rml_visit_photos where visit_id=trim(p_visit_id);
  v_deleted := found;

  -- Also clear any old copy embedded in the original visit payload, if that RPC exists.
  begin
    execute 'select public.app_admin_delete_visit_photo($1,$2)' into v_legacy using p_token, trim(p_visit_id);
    if jsonb_typeof(v_legacy)='object' then
      v_deleted := v_deleted or coalesce((v_legacy->>'photo_deleted')::boolean,false);
    else
      v_deleted := v_deleted or (v_legacy is not null);
    end if;
  exception when undefined_function then
    null;
  end;

  return jsonb_build_object('photo_deleted',v_deleted,'visit_id',trim(p_visit_id));
end;
$$;

revoke all on function public.app_admin_delete_visit_photo_v2(text,text) from public;
grant execute on function public.app_admin_delete_visit_photo_v2(text,text) to anon, authenticated;

notify pgrst,'reload schema';
