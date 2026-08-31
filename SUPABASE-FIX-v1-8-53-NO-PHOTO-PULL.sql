-- RML Sales Visit v1.8.53
-- Photo-free visit pull wrappers.
-- Tujuan: foto check-in tetap wajib di perangkat, tetapi payload foto tidak pernah dikirim
-- dari Supabase ke client saat sinkronisasi kunjungan.
-- Jalankan SEKALI di Supabase SQL Editor. Tidak membuat tabel baru.

create or replace function public.app_pull_visits_nophoto(p_token text, p_limit integer default 5000)
returns setof jsonb
language sql security definer set search_path=public
as $$
  select
    (to_jsonb(x) - 'payload') ||
    jsonb_build_object(
      'payload',
      case
        when jsonb_typeof(to_jsonb(x)->'payload') = 'object'
          then (to_jsonb(x)->'payload') - 'checkInPhoto'
        else coalesce(to_jsonb(x)->'payload', '{}'::jsonb)
      end
    )
  from public.app_pull_visits(p_token, p_limit) x;
$$;

create or replace function public.app_pull_visits_delta_nophoto(
p_token text,
p_since timestamptz default null,
p_limit integer default 500
)
returns setof jsonb
language sql security definer set search_path=public
as $$
  select
    (to_jsonb(x) - 'payload') ||
    jsonb_build_object(
      'payload',
      case
        when jsonb_typeof(to_jsonb(x)->'payload') = 'object'
          then (to_jsonb(x)->'payload') - 'checkInPhoto'
        else coalesce(to_jsonb(x)->'payload', '{}'::jsonb)
      end
    )
  from public.app_pull_visits_delta(p_token, p_since, p_limit) x;
$$;

revoke all on function public.app_pull_visits_nophoto(text,integer) from public;
grant execute on function public.app_pull_visits_nophoto(text,integer) to anon, authenticated;
revoke all on function public.app_pull_visits_delta_nophoto(text,timestamptz,integer) from public;
grant execute on function public.app_pull_visits_delta_nophoto(text,timestamptz,integer) to anon, authenticated;

notify pgrst, 'reload schema';
