-- قفل تلقائي: أي طلب يعدّي عليه 10 أيام (من يوم ما اتعمل أو من آخر مرة اتشغّل فيها) بيتقفل لوحده
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
