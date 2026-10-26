-- RML v2.0.5 PHOTO ADMIN ONLY + SYNC FIX
-- Run once in Supabase SQL Editor. Does not download photos or bulk-sync visit data.
create table if not exists public.rml_visit_photos (
  visit_id text primary key,
  sales_email text not null default '',
  mime_type text not null default 'image/jpeg',
  photo_bytes bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rml_visit_photos add column if not exists sales_email text not null default '';
alter table public.rml_visit_photos add column if not exists mime_type text not null default 'image/jpeg';
alter table public.rml_visit_photos add column if not exists photo_bytes bytea;
alter table public.rml_visit_photos add column if not exists created_at timestamptz not null default now();
alter table public.rml_visit_photos add column if not exists updated_at timestamptz not null default now();
alter table public.rml_visit_photos enable row level security;
revoke all on table public.rml_visit_photos from public, anon, authenticated;

create or replace function public.app_upsert_visit_photo(p_token text,p_visit_id text,p_sales_email text,p_photo text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_role text; v_email text; v_visit jsonb; v_owner text; v_mime text; v_b64 text; v_bytes bytea; v_row jsonb;
begin
 select lower(trim(coalesce(p.role::text,''))),lower(trim(coalesce(p.account_key::text,'')))
 into v_role,v_email from public.app_get_profile(p_token) p limit 1;
 if coalesce(v_email,'')='' then raise exception 'Sesi login tidak valid. Silakan login kembali.'; end if;
 if v_role not in ('admin','sales','supervisor') then raise exception 'Tidak memiliki izin menyimpan foto check-in.'; end if;
 if coalesce(trim(p_visit_id),'')='' then raise exception 'ID kunjungan tidak valid.'; end if;
 if p_photo is null or p_photo !~ '^data:image/(jpeg|jpg|png|webp);base64,' then raise exception 'Format foto tidak valid.'; end if;
 if length(p_photo)>4000000 then raise exception 'Foto terlalu besar (maksimal sekitar 3 MB). Ambil ulang foto.'; end if;

 -- Resolve only the requested visit; tolerate either table-shaped or JSON-shaped RPC rows.
 for v_row in select to_jsonb(x) from public.app_pull_visits(p_token,5000) x loop
   if v_row ? 'app_pull_visits' then v_row:=v_row->'app_pull_visits'; end if;
   if v_row ? 'value' and jsonb_typeof(v_row->'value')='object' then v_row:=v_row->'value'; end if;
   if coalesce(v_row->>'id','')=trim(p_visit_id) then v_visit:=v_row; exit; end if;
 end loop;
 if v_visit is null then raise exception 'Kunjungan belum tersedia untuk akun ini. Coba sinkronkan ulang foto saja.'; end if;
 v_owner:=lower(trim(coalesce(v_visit->>'sales_email',v_visit->'payload'->>'salesEmail','')));
 if v_role='sales' and v_owner<>v_email then raise exception 'Sales hanya boleh menyimpan foto kunjungannya sendiri.'; end if;
 if v_role<>'admin' and lower(trim(coalesce(p_sales_email,'')))<>v_owner then raise exception 'Email pemilik tidak cocok dengan kunjungan.'; end if;
 v_mime:=substring(p_photo from '^data:(image/(jpeg|jpg|png|webp));base64,');
 v_b64:=substring(p_photo from 'base64,(.*)$');
 if coalesce(v_b64,'')='' then raise exception 'Data foto kosong atau rusak.'; end if;
 v_bytes:=decode(v_b64,'base64');
 if octet_length(v_bytes)=0 then raise exception 'Data foto kosong setelah diproses.'; end if;
 insert into public.rml_visit_photos(visit_id,sales_email,mime_type,photo_bytes,created_at,updated_at)
 values(trim(p_visit_id),v_owner,coalesce(v_mime,'image/jpeg'),v_bytes,now(),now())
 on conflict(visit_id) do update set sales_email=excluded.sales_email,mime_type=excluded.mime_type,photo_bytes=excluded.photo_bytes,updated_at=now();
 delete from public.rml_visit_photos where created_at < now()-interval '45 days';
 return jsonb_build_object('saved',true,'visit_id',trim(p_visit_id),'bytes',octet_length(v_bytes));
end $$;
revoke all on function public.app_upsert_visit_photo(text,text,text,text) from public;
grant execute on function public.app_upsert_visit_photo(text,text,text,text) to anon,authenticated;

create or replace function public.app_pull_visit_photo(p_token text,p_visit_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_role text; v_visit jsonb; v_mime text; v_bytes bytea; v_photo text; v_row jsonb;
begin
 select lower(trim(coalesce(p.role::text,''))) into v_role from public.app_get_profile(p_token) p limit 1;
 if coalesce(v_role,'')='' then raise exception 'Sesi login tidak valid. Silakan login kembali.'; end if;
 if v_role<>'admin' then raise exception 'Hanya admin yang bisa lihat foto check-in'; end if;
 for v_row in select to_jsonb(x) from public.app_pull_visits(p_token,5000) x loop
   if v_row ? 'app_pull_visits' then v_row:=v_row->'app_pull_visits'; end if;
   if v_row ? 'value' and jsonb_typeof(v_row->'value')='object' then v_row:=v_row->'value'; end if;
   if coalesce(v_row->>'id','')=trim(p_visit_id) then v_visit:=v_row; exit; end if;
 end loop;
 if v_visit is null then raise exception 'Kunjungan tidak ditemukan atau tidak dapat diakses akun ini.'; end if;
 select mime_type,photo_bytes into v_mime,v_bytes from public.rml_visit_photos where visit_id=trim(p_visit_id) limit 1;
 if v_bytes is not null then
   v_photo:='data:'||coalesce(v_mime,'image/jpeg')||';base64,'||replace(encode(v_bytes,'base64'),E'\n','');
   return jsonb_build_object('found',true,'id',trim(p_visit_id),'checkInPhoto',v_photo);
 end if;
 v_photo:=coalesce(v_visit->'payload'->>'checkInPhoto',v_visit->>'checkInPhoto','');
 if v_photo='' then return jsonb_build_object('found',false,'id',trim(p_visit_id)); end if;
 v_mime:=substring(v_photo from '^data:(image/(jpeg|jpg|png|webp));base64,');
 v_bytes:=decode(substring(v_photo from 'base64,(.*)$'),'base64');
 insert into public.rml_visit_photos(visit_id,sales_email,mime_type,photo_bytes,created_at,updated_at)
 values(trim(p_visit_id),lower(trim(coalesce(v_visit->>'sales_email',v_visit->'payload'->>'salesEmail',''))),coalesce(v_mime,'image/jpeg'),v_bytes,now(),now())
 on conflict(visit_id) do nothing;
 return jsonb_build_object('found',true,'id',trim(p_visit_id),'checkInPhoto',v_photo);
end $$;
revoke all on function public.app_pull_visit_photo(text,text) from public;
grant execute on function public.app_pull_visit_photo(text,text) to anon,authenticated;
notify pgrst,'reload schema';
