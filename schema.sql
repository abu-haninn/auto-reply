-- =====================================================================
--  الرد على رسائل الصفحة والتعليقات — قاعدة البيانات
--  انسخ الملف ده كله والصقه في Supabase ← SQL Editor ← Run (مرة واحدة)
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- الإعدادات (صف واحد بس)
create table if not exists settings (
  id               int primary key default 1 check (id = 1),
  page_id          text,
  page_name        text,
  page_picture     text,
  page_token       text,
  page_followers   int,
  pending_pages    jsonb default '[]'::jsonb,
  oauth_state      text,
  return_to        text,
  dm_auto_enabled  boolean default false,
  dm_auto_text     text default 'أهلاً بيك {first_name} 👋 وصلتنا رسالتك وهنرد عليك في أقرب وقت.',
  dm_cooldown_hours int default 24,
  cron_url         text,
  last_poll        timestamptz,
  last_webhook     timestamptz
);
insert into settings (id) values (1) on conflict do nothing;

-- الطلبات (كل طلب = منشور/فيديو + كلمات + ردود)
create table if not exists campaigns (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  name          text not null default 'طلب جديد',
  active        boolean default true,
  all_posts     boolean default false,
  posts         jsonb default '[]'::jsonb,
  keywords      text[] default '{}',
  match_all     boolean default false,
  reply_enabled boolean default true,
  replies       text[] default '{}',
  dm_enabled    boolean default true,
  dm_messages   text[] default '{}',
  button_title  text,
  button_url    text,
  like_comment  boolean default true,
  one_per_user  boolean default true,
  since         timestamptz default now(),
  matched  int default 0,
  replied  int default 0,
  messaged int default 0,
  liked    int default 0,
  errors   int default 0
);

-- التعليقات اللي اتعالجت (عشان مفيش تعليق ياخد رد مرتين)
create table if not exists processed (
  comment_id  text primary key,
  campaign_id uuid,
  user_id     text,
  at          timestamptz default now()
);
create index if not exists processed_user_idx on processed (campaign_id, user_id);

-- ردود الماسنجر بالكلمات
create table if not exists dm_rules (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  active     boolean default true,
  keywords   text[] default '{}',
  reply      text not null default '',
  sent       int default 0
);

create table if not exists dm_sent (
  psid text primary key,
  at   timestamptz default now()
);

create table if not exists logs (
  id   bigserial primary key,
  at   timestamptz default now(),
  type text,
  text text
);
create index if not exists logs_at_idx on logs (at desc);

-- الصفحات المربوطة (أكتر من صفحة)
create table if not exists pages (
  id           text primary key,
  name         text,
  picture      text,
  token        text,
  followers    int,
  connected_at timestamptz default now()
);
alter table pages enable row level security;
alter table campaigns add column if not exists page_id text;
alter table campaigns add column if not exists follow_button boolean default true;
alter table campaigns add column if not exists smart_reply boolean default true;
alter table settings  add column if not exists dm_follow_button boolean default true;

-- رد واحد لكل شخص في كل طلب (قفل في قاعدة البيانات نفسها)
create table if not exists user_hits (
  campaign_id uuid not null,
  user_id     text not null,
  at          timestamptz default now(),
  primary key (campaign_id, user_id)
);
alter table user_hits enable row level security;

-- الناس اللي كلمونا على الماسنجر (للرد الذكي والرسايل الجماعية)
create table if not exists contacts (
  psid       text primary key,
  page_id    text,
  name       text,
  last_in    timestamptz,
  last_human timestamptz
);
alter table contacts enable row level security;
alter table settings add column if not exists dm_ai_enabled boolean default false;
alter table settings add column if not exists ai_about text;
alter table settings add column if not exists ai_cooldown jsonb default '{}'::jsonb;
alter table settings add column if not exists webhook_url text default '';

-- طابور الرسالة الجماعية (بتتبعت واحدة واحدة بالراحة)
create table if not exists outbox (
  id         bigserial primary key,
  page_id    text,
  psid       text,
  text       text,
  created_at timestamptz default now(),
  claimed_at timestamptz,
  sent_at    timestamptz,
  error      text,
  reported   boolean default false
);
create index if not exists outbox_pending_idx on outbox (id) where claimed_at is null;
alter table outbox enable row level security;

-- حماية: محدش يقدر يقرا الجداول من بره (السيرفر بس)
alter table settings  enable row level security;
alter table campaigns enable row level security;
alter table processed enable row level security;
alter table dm_rules  enable row level security;
alter table dm_sent   enable row level security;
alter table logs      enable row level security;


-- عدد التعليقات/الردود/الرسايل لكل يوم (بتوقيت القاهرة) من سجل النشاط
create or replace function stats_daily(days int default 7)
returns table(day date, kind text, n bigint)
language sql security definer set search_path = public as $$
  select (at at time zone 'Africa/Cairo')::date as day,
         case when type = 'dm' and text like '🤖%' then 'ai'
              when type = 'dm' and text like '📩%' then 'dm'
              else type end as kind,
         count(*) as n
  from logs
  where at > now() - make_interval(days => days)
    and (type in ('comment', 'reply') or (type = 'dm' and (text like '🤖%' or text like '📩%')))
  group by 1, 2
  order by 1;
$$;
revoke all on function stats_daily(int) from public, anon, authenticated;
grant execute on function stats_daily(int) to service_role;

alter table campaigns add column if not exists reactivated_at timestamptz;

create or replace function auto_close_campaigns()
returns int language plpgsql security definer set search_path = public as $$
declare n int; names text;
begin
  with closed as (
    update campaigns set active = false
    where active and greatest(created_at, coalesce(reactivated_at, created_at)) < now() - interval '10 days'
    returning name
  )
  select count(*), string_agg(left(name, 50), '، ') into n, names from closed;
  if n > 0 then
    insert into logs (type, text) values ('system', left(format('⏸️ اتقفل تلقائيًا %s طلب (عدّى عليهم 10 أيام): %s', n, names), 500));
  end if;
  return n;
end $$;
revoke all on function auto_close_campaigns() from public, anon, authenticated;
grant execute on function auto_close_campaigns() to service_role;

-- كل ساعة
select cron.unschedule(jobid) from cron.job where jobname = 'bot-auto-close';
select cron.schedule('bot-auto-close', '7 * * * *', 'select public.auto_close_campaigns()');

-- زيادة العدادات بشكل آمن
create or replace function bump(cid uuid, col text, n int default 1)
returns void language plpgsql security definer set search_path = public as $$
begin
  if col not in ('matched','replied','messaged','liked','errors') then
    raise exception 'bad column';
  end if;
  execute format('update campaigns set %I = %I + $1 where id = $2', col, col) using n, cid;
end $$;

create or replace function bump_rule(rid uuid)
returns void language sql security definer set search_path = public as $$
  update dm_rules set sent = sent + 1 where id = rid;
$$;

-- تشغيل الفحص التلقائي كل 30 ثانية (السيرفر بيناديها لوحده أول مرة)
create or replace function setup_cron(fn_url text)
returns void language plpgsql security definer set search_path = public, cron as $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('fb-bot-poll', 'fb-bot-cleanup');
  perform cron.schedule('fb-bot-poll', '30 seconds', format(
    $f$select net.http_post(url := %L, headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 5000)$f$,
    fn_url));
  perform cron.schedule('fb-bot-cleanup', '0 3 * * *', $c$
    delete from processed where at < now() - interval '30 days';
    delete from logs where at < now() - interval '14 days';
    delete from dm_sent where at < now() - interval '30 days';
    delete from outbox where created_at < now() - interval '7 days';
    delete from net._http_response where created < now() - interval '1 day';
  $c$);
end $$;

revoke all on function bump(uuid, text, int) from public, anon, authenticated;
revoke all on function bump_rule(uuid)        from public, anon, authenticated;
revoke all on function setup_cron(text)       from public, anon, authenticated;
grant execute on function bump(uuid, text, int) to service_role;
grant execute on function bump_rule(uuid)        to service_role;
grant execute on function setup_cron(text)       to service_role;
