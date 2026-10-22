-- RML v2.0.5: Foto check-in riwayat, on-demand untuk Admin/Sales/Supervisor.
-- Jalankan SEKALI di Supabase SQL Editor sebelum deploy versi website ini.
-- Kunjungan biasa tidak mengirim byte foto. Foto diunduh hanya melalui app_pull_visit_photo
-- saat pengguna menekan tombol "Lihat Foto Check-in".

create table if not exists public.rml_visit_photos (
  visit_id text primary key,
  sales_email text not null default '',
  mime_type text not null default 'image/jpeg',
  photo_bytes bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade-safe: CREATE TABLE IF NOT EXISTS does not add columns to an older table.
alter table public.rml_visit_photos add column if not exists sales_email text not null default '';
alter table public.rml_visit_photos add column if not exists mime_type text not null default 'image/jpeg';
alter table public.rml_visit_photos add column if not exists photo_bytes bytea;
alter table public.rml_visit_photos add column if not exists created_at timestamptz not null default now();
alter table public.rml_visit_photos add column if not exists updated_at timestamptz not null default now();
create index if not exists rml_visit_photos_created_at_idx on public.rml_visit_photos(created_at);
alter table public.rml_visit_photos enable row level security;
revoke all on table public.rml_visit_photos from public, anon, authenticated;

create or replace function public.app_upsert_visit_photo(
  p_token text, p_visit_id text, p_sales_email text, p_photo text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_role text; v_email text; v_visit jsonb; v_owner text;
  v_mime text; v_b64 text; v_bytes bytea;
begin
  select lower(trim(coalesce(p.role::text,''))),lower(trim(coalesce(p.account_key::text,'')))
    into v_role,v_email from public.app_get_profile(p_token) p limit 1;
  if coalesce(v_email,'')='' then raise exception 'Sesi login tidak valid. Silakan login kembali.'; end if;
  if v_role not in ('admin','sales','supervisor') then raise exception 'Tidak memiliki izin menyimpan foto check-in.'; end if;
  if coalesce(trim(p_visit_id),'')='' then raise exception 'ID kunjungan tidak valid.'; end if;
  if p_photo is null or p_photo !~ '^data:image/(jpeg|jpg|png|webp);base64,' then raise exception 'Format foto tidak valid.'; end if;
  if length(p_photo)>1500000 then raise exception 'Foto terlalu besar. Ambil ulang foto dengan ukuran lebih kecil.'; end if;

  select to_jsonb(x) into v_visit
  from public.app_pull_visits(p_token,5000) x
  where to_jsonb(x)->>'id'=trim(p_visit_id)
  limit 1;
  if v_visit is null then raise exception 'Kunjungan tidak ditemukan atau tidak dapat diakses akun ini.'; end if;
  v_owner:=lower(trim(coalesce(v_visit->>'sales_email',v_visit->'payload'->>'salesEmail','')));
  if v_role='sales' and v_owner<>v_email then raise exception 'Sales hanya boleh menyimpan foto kunjungannya sendiri.'; end if;
  if lower(trim(coalesce(p_sales_email,'')))<>v_owner and v_role<>'admin' then
    raise exception 'Email pemilik tidak cocok dengan kunjungan.';
  end if;

  v_mime:=substring(p_photo from '^data:(image/(jpeg|jpg|png|webp));base64,');
  v_b64:=substring(p_photo from 'base64,(.*)$');
  v_bytes:=decode(v_b64,'base64');
  insert into public.rml_visit_photos(visit_id,sales_email,mime_type,photo_bytes,created_at,updated_at)
  values(trim(p_visit_id),v_owner,coalesce(v_mime,'image/jpeg'),v_bytes,now(),now())
  on conflict(visit_id) do update set
    sales_email=excluded.sales_email,mime_type=excluded.mime_type,
    photo_bytes=excluded.photo_bytes,created_at=now(),updated_at=now();

  delete from public.rml_visit_photos where created_at < now()-interval '45 days';
  return jsonb_build_object('saved',true,'visit_id',trim(p_visit_id));
end $$;
revoke all on function public.app_upsert_visit_photo(text,text,text,text) from public;
grant execute on function public.app_upsert_visit_photo(text,text,text,text) to anon,authenticated;

create or replace function public.app_pull_visit_photo(
  p_token text, p_visit_id text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_role text; v_email text; v_visit jsonb; v_owner text;
  v_mime text; v_bytes bytea; v_photo text;
begin
  select lower(trim(coalesce(p.role::text,''))),lower(trim(coalesce(p.account_key::text,'')))
    into v_role,v_email from public.app_get_profile(p_token) p limit 1;
  if coalesce(v_email,'')='' then raise exception 'Sesi login tidak valid. Silakan login kembali.'; end if;
  if v_role not in ('admin','sales','supervisor') then raise exception 'Tidak memiliki izin melihat foto check-in.'; end if;

  -- Check whether the authenticated app role can see this visit using existing visit-level ACL.
  select to_jsonb(x) into v_visit
  from public.app_pull_visits(p_token,5000) x
  where to_jsonb(x)->>'id'=trim(p_visit_id)
  limit 1;
  if v_visit is null then raise exception 'Kunjungan tidak ditemukan atau tidak dapat diakses akun ini.'; end if;
  v_owner:=lower(trim(coalesce(v_visit->>'sales_email',v_visit->'payload'->>'salesEmail','')));
  if v_role='sales' and v_owner<>v_email then raise exception 'Sales hanya boleh melihat foto kunjungannya sendiri.'; end if;

  select mime_type,photo_bytes into v_mime,v_bytes
  from public.rml_visit_photos where visit_id=trim(p_visit_id) limit 1;
  if v_bytes is not null then
    v_photo:='data:'||coalesce(v_mime,'image/jpeg')||';base64,'||replace(encode(v_bytes,'base64'),E'\n','');
    return jsonb_build_object('found',true,'id',trim(p_visit_id),'checkInPhoto',v_photo);
  end if;

  -- Legacy compatibility: if an older row still has an embedded photo, migrate only the
  -- requested row; do not return any other photo blobs to the client.
  v_photo:=coalesce(v_visit->'payload'->>'checkInPhoto',v_visit->>'checkInPhoto','');
  if v_photo='' then return jsonb_build_object('found',false,'id',trim(p_visit_id)); end if;
  v_mime:=substring(v_photo from '^data:(image/(jpeg|jpg|png|webp));base64,');
  v_bytes:=decode(substring(v_photo from 'base64,(.*)$'),'base64');
  insert into public.rml_visit_photos(visit_id,sales_email,mime_type,photo_bytes,created_at,updated_at)
  values(trim(p_visit_id),v_owner,coalesce(v_mime,'image/jpeg'),v_bytes,now(),now())
  on conflict(visit_id) do nothing;
  return jsonb_build_object('found',true,'id',trim(p_visit_id),'checkInPhoto',v_photo);
end $$;
revoke all on function public.app_pull_visit_photo(text,text) from public;
grant execute on function public.app_pull_visit_photo(text,text) to anon,authenticated;

create or replace function public.app_pull_visit_photo_flags(
  p_token text, p_visit_ids text[]
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_email text; v_role text; v_flags jsonb;
begin
  select lower(trim(coalesce(p.role::text,''))),lower(trim(coalesce(p.account_key::text,'')))
    into v_role,v_email from public.app_get_profile(p_token) p limit 1;
  if coalesce(v_email,'')='' then raise exception 'Sesi login tidak valid. Silakan login kembali.'; end if;
  if v_role not in ('admin','sales','supervisor') then raise exception 'Tidak memiliki izin melihat riwayat.'; end if;

  -- Use existing role-scoped visit RPC; output only IDs and booleans, never image bytes.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,
    'hasCheckInPhoto',q.has_photo
  )),'[]'::jsonb) into v_flags
  from (
    select to_jsonb(x)->>'id' as id,
      (
        coalesce(nullif(to_jsonb(x)->'payload'->>'checkInPhoto',''),'')<>''
        or exists(select 1 from public.rml_visit_photos p where p.visit_id=to_jsonb(x)->>'id')
      ) as has_photo
    from public.app_pull_visits(p_token,5000) x
    where to_jsonb(x)->>'id'=any(coalesce(p_visit_ids,array[]::text[]))
  ) q;
  return jsonb_build_object('flags',coalesce(v_flags,'[]'::jsonb));
end $$;
revoke all on function public.app_pull_visit_photo_flags(text,text[]) from public;
grant execute on function public.app_pull_visit_photo_flags(text,text[]) to anon,authenticated;

-- Normal visit sync returns only a small hasCheckInPhoto boolean, stripping old embedded photo bytes.
create or replace function public.app_pull_visits_nophoto(p_token text,p_limit integer default 5000)
returns setof jsonb
language sql security definer set search_path=public
as $$
  select (to_jsonb(x)-'payload') || jsonb_build_object(
    'payload',
    case when jsonb_typeof(to_jsonb(x)->'payload')='object' then
      ((to_jsonb(x)->'payload')-'checkInPhoto'-'hasCheckInPhoto') ||
      jsonb_build_object('hasCheckInPhoto',
        (coalesce(nullif(to_jsonb(x)->'payload'->>'checkInPhoto',''),'')<>'' or
         exists(select 1 from public.rml_visit_photos p where p.visit_id=to_jsonb(x)->>'id')))
    else coalesce(to_jsonb(x)->'payload','{}'::jsonb) end
  )
  from public.app_pull_visits(p_token,p_limit) x;
$$;

create or replace function public.app_pull_visits_delta_nophoto(p_token text,p_since timestamptz default null,p_limit integer default 500)
returns setof jsonb
language sql security definer set search_path=public
as $$
  select (to_jsonb(x)-'payload') || jsonb_build_object(
    'payload',
    case when jsonb_typeof(to_jsonb(x)->'payload')='object' then
      ((to_jsonb(x)->'payload')-'checkInPhoto'-'hasCheckInPhoto') ||
      jsonb_build_object('hasCheckInPhoto',
        (coalesce(nullif(to_jsonb(x)->'payload'->>'checkInPhoto',''),'')<>'' or
         exists(select 1 from public.rml_visit_photos p where p.visit_id=to_jsonb(x)->>'id')))
    else coalesce(to_jsonb(x)->'payload','{}'::jsonb) end
  )
  from public.app_pull_visits_delta(p_token,p_since,p_limit) x;
$$;
revoke all on function public.app_pull_visits_nophoto(text,integer) from public;
grant execute on function public.app_pull_visits_nophoto(text,integer) to anon,authenticated;
revoke all on function public.app_pull_visits_delta_nophoto(text,timestamptz,integer) from public;
grant execute on function public.app_pull_visits_delta_nophoto(text,timestamptz,integer) to anon,authenticated;

create or replace function public.app_admin_delete_visit_photo_v2(p_token text,p_visit_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_role text; v_deleted boolean:=false; v_legacy jsonb;
begin
  select lower(trim(coalesce(p.role::text,''))) into v_role
  from public.app_get_profile(p_token) p limit 1;
  if coalesce(v_role,'')<>'admin' then raise exception 'Hanya admin yang dapat menghapus foto check-in.'; end if;
  delete from public.rml_visit_photos where visit_id=trim(p_visit_id);
  v_deleted:=found;
  begin
    execute 'select to_jsonb(public.app_admin_delete_visit_photo($1,$2))' into v_legacy using p_token,trim(p_visit_id);
    if jsonb_typeof(v_legacy)='object' then
      v_deleted:=v_deleted or coalesce((v_legacy->>'photo_deleted')::boolean,false);
    else v_deleted:=v_deleted or (v_legacy is not null); end if;
  exception when undefined_function then null;
  end;
  return jsonb_build_object('photo_deleted',v_deleted,'visit_id',trim(p_visit_id));
end $$;
revoke all on function public.app_admin_delete_visit_photo_v2(text,text) from public;
grant execute on function public.app_admin_delete_visit_photo_v2(text,text) to anon,authenticated;
notify pgrst,'reload schema';
