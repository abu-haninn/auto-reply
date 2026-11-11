-- توفير الاستهلاك: نسخة خفيفة من الطلبات الشغالة (من غير صور المنشورات وروابطها والعدادات)
create or replace function bot_campaigns()
returns setof jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(c) - 'posts' - 'matched' - 'replied' - 'messaged' - 'liked' - 'errors'
         || jsonb_build_object('posts', coalesce((
              select jsonb_agg(jsonb_build_object('id', p->>'id', 'alt', coalesce(p->'alt', '[]'::jsonb), 'text', left(coalesce(p->>'text', ''), 120)))
              from jsonb_array_elements(coalesce(c.posts, '[]'::jsonb)) p), '[]'::jsonb))
  from campaigns c
  where c.active
  order by c.created_at desc;
$$;
revoke all on function bot_campaigns() from public, anon, authenticated;
grant execute on function bot_campaigns() to service_role;
