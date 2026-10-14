// =====================================================================
//  الرد على رسائل الصفحة والتعليقات — السيرفر (Supabase Edge Function)
//  بيشتغل 24 ساعة على Supabase حتى لو جهازك مقفول
//
//  المسارات:
//    /bot/webhook      ← فيسبوك بيبعت التعليقات والرسائل هنا لحظيًا
//    /bot/cron         ← Supabase بيناديه كل 30 ثانية يفحص التعليقات
//    /bot/fb/callback  ← رجوع تسجيل الدخول بفيسبوك
//    /bot/api/...      ← لوحة التحكم (محتاج كلمة السر)
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const env = (k: string) => Deno.env.get(k) ?? '';
const GRAPH = `https://graph.facebook.com/${env('GRAPH_VERSION') || 'v23.0'}`;
const FN_URL = `${env('SUPABASE_URL')}/functions/v1/bot`;
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-admin-password, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tail = (id: string) => String(id || '').split('_').pop() as string;
// قص النص من غير ما يقطع إيموجي من النص (الإيموجي المقطوع بيبوظ قاعدة البيانات)
const cut = (s: unknown, n: number) =>
  Array.from(String(s ?? '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')).slice(0, n).join('');
const background = (p: Promise<unknown>) => {
  const safe = p.catch((e) => console.error(e));
  try { EdgeRuntime.waitUntil(safe); } catch { /* محلي */ }
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// كلمة تحقق الويب هوك: من الأسرار لو موجودة، وإلا بتتولد تلقائيًا
let verifyTokenCache = '';
async function verifyToken() {
  if (!verifyTokenCache) verifyTokenCache = env('FB_VERIFY_TOKEN') || 'vt_' + (await sha256('verify:' + env('SUPABASE_SERVICE_ROLE_KEY'))).slice(0, 24);
  return verifyTokenCache;
}

// =====================================================================
//  النصوص
// =====================================================================
function normalize(s: string) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/(.)\1{2,}/g, '$1')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}
function matchKeyword(text: string, keywords: string[]) {
  const t = normalize(text);
  if (!t) return null;
  for (const k of keywords || []) {
    const n = normalize(k);
    if (n && t.includes(n)) return k;
  }
  return null;
}
function pick(list: string[]) {
  const l = (list || []).map((x) => String(x || '').trim()).filter(Boolean);
  return l.length ? l[Math.floor(Math.random() * l.length)] : '';
}
// {أهلا|مرحبا} ← يختار واحدة · {first_name} {name} {page}
function fill(tpl: string, v: { name?: string; page?: string }) {
  const name = (v.name || '').trim();
  const first = name.split(/\s+/)[0] || '';
  let out = String(tpl || '');
  for (let i = 0; i < 5; i++) out = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, g) => { const p = g.split('|'); return p[Math.floor(Math.random() * p.length)]; });
  return out.replace(/\{name\}/g, name || 'صديقنا').replace(/\{first_name\}/g, first || 'صديقنا').replace(/\{page\}/g, v.page || '').trim();
}

// =====================================================================
//  فيسبوك
// =====================================================================
class FbError extends Error {
  code?: number; subcode?: number;
  constructor(e: any) { super(e?.error_user_msg || e?.message || 'Facebook error'); this.code = e?.code; this.subcode = e?.error_subcode; }
}
async function fb(method: string, path: string, params: Record<string, unknown> = {}, token?: string) {
  const url = new URL(path.startsWith('http') ? path : GRAPH + path);
  if (token) url.searchParams.set('access_token', token);
  const init: RequestInit = { method };
  if (method === 'GET' || method === 'DELETE') {
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  } else {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(params);
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new FbError(data.error || { message: `HTTP ${res.status}` });
  return data;
}
function explain(e: any) {
  const c = e?.code;
  if (c === 190) return 'التوكن انتهى — اربط الصفحة من جديد';
  if (c === 10 || c === 200 || c === 3) return 'صلاحية ناقصة — لازم التطبيق يكون Live (شوف الدليل)';
  if (c === 368) return 'فيسبوك وقف الإجراء مؤقتًا (سبام) — نوّع الردود';
  if (c === 551 || e?.subcode === 1545041) return 'الشخص ده قافل الرسائل';
  if (c === 4 || c === 17 || c === 32 || c === 613) return 'ضغط كبير على فيسبوك — هيتحاول تاني';
  if (/only be replied|already been replied/i.test(e?.message || '')) return 'اتبعتله رسالة خاصة قبل كده';
  return e?.message || 'خطأ غير معروف';
}
type Btn = { title: string; url: string };
// الروابط اللي جوه رسالة الأزرار مش بتبقى قابلة للضغط في ماسنجر — فبنحولها لأزرار
const URL_RE = /https?:\/\/[^\s<>"'،]+/g;
function linkTitle(u: string, n: number, total: number) {
  const video = /youtu\.?be|youtube\.com|facebook\.com\/.*(videos|reel|watch)|fb\.watch|tiktok\.com|instagram\.com\/reel/i.test(u);
  const base = video ? '▶️ شاهد الفيديو' : '🔗 افتح الرابط';
  return total > 1 ? `${base} ${n}` : base;
}
// زرار المتابعة بيفتح صفحة صغيرة على موقعك بتفتح صفحتك جوه تطبيق فيسبوك (مش المتصفح)
function followUrl(pageId: string, site?: string | null) {
  const base = String(site || '').split('#')[0].split('?')[0];
  return /^https:\/\//.test(base) ? `${base.replace(/[^/]*$/, '')}open.html?id=${pageId}` : `https://www.facebook.com/${pageId}`;
}
function dmParts(text: string, pageId: string, btnTitle?: string | null, btnUrl?: string | null, follow = true, site?: string | null) {
  const links = [...new Set((text.match(URL_RE) || []).map((u) => u.replace(/[).,!؟?]+$/, '')))];
  const buttons: Btn[] = [];
  if (btnTitle && btnUrl) buttons.push({ title: btnTitle, url: btnUrl });
  const room = 3 - buttons.length - (follow ? 1 : 0);
  const asButtons = links.filter((u) => !buttons.some((b) => b.url === u)).slice(0, Math.max(0, room));
  asButtons.forEach((u, i) => buttons.push({ title: linkTitle(u, i + 1, asButtons.length), url: u }));
  if (follow) buttons.push({ title: '👍 تابع الصفحة', url: followUrl(pageId, site) });
  let body = text;
  for (const u of asButtons) body = body.split(u).join('👇');
  body = body.replace(/(👇\s*)+/g, '👇 ').replace(/\n{3,}/g, '\n\n').trim();
  return { text: body || '👇', buttons };
}
function buildMessage(text: string, buttons: Btn[] = []) {
  if (buttons.length) {
    return { attachment: { type: 'template', payload: { template_type: 'button', text: cut(text, 640), buttons: buttons.slice(0, 3).map((b) => ({ type: 'web_url', url: b.url, title: cut(b.title, 20) })) } } };
  }
  return { text: cut(text, 2000) };
}
// لو الأزرار اترفضت لأي سبب نبعت نص عادي فيه الروابط
const plainWithLinks = (text: string, buttons: Btn[]) => ({ text: cut([text, ...buttons.map((b) => `${b.title}: ${b.url}`)].join('\n'), 2000) });
// original = النص الأصلي بالروابط (لو الأزرار اترفضت بنبعته نص عادي والروابط فيه بتبقى قابلة للضغط)
async function sendPrivateReply(pageId: string, commentId: string, text: string, token: string, buttons: Btn[] = [], original = text) {
  try {
    return await fb('POST', `/${pageId}/messages`, { recipient: { comment_id: commentId }, message: buildMessage(text, buttons) }, token);
  } catch (e) {
    if (!buttons.length) throw e;
    return fb('POST', `/${pageId}/messages`, { recipient: { comment_id: commentId }, message: plainWithLinks(original, buttons.filter((b) => !original.includes(b.url))) }, token);
  }
}
async function recentPosts(pageId: string, token: string, limit = 24) {
  const [posts, videos] = await Promise.allSettled([
    fb('GET', `/${pageId}/posts`, { fields: 'id,message,full_picture,permalink_url,created_time,status_type', limit }, token),
    fb('GET', `/${pageId}/videos`, { fields: 'id,description,title,picture,permalink_url,created_time', limit: 12 }, token),
  ]);
  const seen = new Set<string>();
  const out: any[] = [];
  const add = (o: any) => { const t = tail(o.id); if (!seen.has(t)) { seen.add(t); out.push(o); } };
  if (posts.status === 'fulfilled') for (const p of posts.value.data || []) add({
    id: p.id, video: String(p.status_type || '').includes('video'), text: p.message || '', image: p.full_picture || '', link: p.permalink_url || '', created: p.created_time,
  });
  if (videos.status === 'fulfilled') for (const v of videos.value.data || []) add({
    id: `${pageId}_${v.id}`, video: true, text: v.title || v.description || '', image: v.picture || '',
    link: v.permalink_url ? (String(v.permalink_url).startsWith('http') ? v.permalink_url : 'https://www.facebook.com' + v.permalink_url) : '', created: v.created_time,
  });
  if (posts.status === 'rejected' && videos.status === 'rejected') throw posts.reason;
  return out.sort((a, b) => +new Date(b.created) - +new Date(a.created));
}
function parseLink(input: string): { id?: string; error?: string } {
  const s = String(input || '').trim();
  if (/^\d+(_\d+)?$/.test(s)) return { id: s };
  let u: URL;
  try { u = new URL(s.startsWith('http') ? s : 'https://' + s); } catch { return { error: 'الرابط مش صحيح' }; }
  const q = u.searchParams; let m;
  if ((m = u.pathname.match(/\/(?:videos|reel|reels)\/(?:[^/]+\/)?(\d+)/))) return { id: m[1] };
  if (/^\d+$/.test(q.get('v') || '')) return { id: q.get('v')! };
  if (/^\d+$/.test(q.get('story_fbid') || '')) return { id: (q.get('id') ? q.get('id') + '_' : '') + q.get('story_fbid') };
  if (/^\d+$/.test(q.get('fbid') || '')) return { id: q.get('fbid')! };
  if ((m = u.pathname.match(/\/(?:posts|permalink|photos)\/(?:[^/]+\/)*?(\d{6,})/))) return { id: m[1] };
  if (/pfbid/.test(s)) return { error: 'الرابط ده نوعه pfbid — اختار المنشور من الصور اللي فوق بدل الرابط' };
  if ((m = s.match(/(\d{10,})/))) return { id: m[1] };
  return { error: 'مش قادر أقرا الرابط — اختار المنشور من الصور اللي فوق' };
}

// =====================================================================
//  قاعدة البيانات
// =====================================================================
async function getSettings() {
  const { data, error } = await db.from('settings').select('*').eq('id', 1).single();
  if (error) throw new Error('قاعدة البيانات مش متجهزة — شغّل ملف schema.sql في Supabase: ' + error.message);
  return data;
}
async function setSettings(patch: Record<string, unknown>) {
  const { error } = await db.from('settings').update(patch).eq('id', 1);
  if (error) throw new Error(error.message);
}
// الصفحات المربوطة (تقدر تربط أكتر من صفحة)
async function getPages(): Promise<any[]> {
  const { data } = await db.from('pages').select('*').order('connected_at');
  return data || [];
}
// لكل صفحة بنعمل "سياق" فيه بياناتها + الإعدادات العامة
const ctxFor = (s: any, p: any) => ({ ...s, page_id: p.id, page_name: p.name, page_token: p.token });
// الطلبات القديمة اللي مالهاش صفحة بتتبع أول صفحة اتربطت
const campaignsFor = (all: any[], pageId: string, firstId: string) => all.filter((c) => (c.page_id || firstId) === pageId);
const safePageRow = (p: any) => ({ id: p.id, name: p.name, picture: p.picture, followers: p.followers });

function log(type: string, text: string) {
  return db.from('logs').insert({ type, text: cut(text, 500) }).then(() => {}, () => {});
}
const bump = (cid: string, col: string) => db.rpc('bump', { cid, col, n: 1 }).then(() => {}, () => {});
// "حجز" التعليق: لو اتعالج قبل كده بيرجع false (ده اللي بيمنع الرد مرتين)
async function claim(commentId: string, campaignId: string, userId?: string) {
  const { error } = await db.from('processed').insert({ comment_id: commentId, campaign_id: campaignId, user_id: userId || null });
  return !error;
}

// =====================================================================
//  المحرك
// =====================================================================
type Comment = { commentId: string; postId: string; message: string; fromId?: string; fromName?: string; created?: number };

function findCampaign(campaigns: any[], postId: string, message: string) {
  const t = tail(postId);
  for (const c of campaigns) {
    if (!c.active) continue;
    const targeted = c.all_posts || (c.posts || []).some((p: any) => tail(p.id) === t || (p.alt || []).some((a: string) => tail(a) === t));
    if (!targeted) continue;
    if (c.match_all) return c;
    if (matchKeyword(message, c.keywords)) return c;
  }
  return null;
}

// =====================================================================
//  الرد الذكي (Google Gemini — فيه حصة مجانية): رد مناسب لكلام كل شخص
// =====================================================================
const FALLBACK_REPLY = 'عينيا ليك ❤️ بعتلك التفاصيل على الخاص 📩';
async function smartReply(comment: string, name: string, pageName: string, topic: string, dmSent: boolean): Promise<string> {
  try { return await generateSmart(comment, name, pageName, topic, dmSent); }
  catch (e) { await log('error', `⚠️ الرد الذكي: ${(e as Error).message} — اتبعت رد عادي بداله`); return ''; }
}
async function generateSmart(comment: string, name: string, pageName: string, topic: string, dmSent: boolean): Promise<string> {
  const key = env('GEMINI_API_KEY');
  if (!key) throw new Error('مفتاح GEMINI_API_KEY مش موجود');
  if (!comment.trim()) return '';
  void name; // الاسم مش بيتبعت للذكاء الاصطناعي ومش بيتكتب في الرد
  const system = [
    `إنت صاحب صفحة فيسبوك "${pageName}" وبترد بنفسك على تعليقات المتابعين، كأنك بتدردش معاهم.`,
    'رد على كلام الشخص بالظبط زي ما شات جي بي تي بيرد على أي رسالة: لو سلّم رد السلام ("وعليكم السلام، منور/نورت")، لو سأل جاوب، لو شكرك اشكره، لو كتب "تم" أو حاجة قصيرة رد رد قصير لطيف.',
    'باللهجة المصرية العامية، من جملة لتلات جمل بالكتير، طبيعي ودافي زي إنسان مش بوت، ومختلف كل مرة.',
    'متكتبش اسم الشخص خالص ومتناديهوش باسمه. استخدم كلام ينفع للراجل والست.',
    dmSent
      ? 'لو الشخص مهتم أو طالب الرابط/الشرح/التفاصيل/التفعيل قوله إنك هتبعتهوله على الخاص (مثلًا: "عينيا ليك، هبعتلك الرابط على الخاص"). لو كلامه سلام أو شكر أو سؤال عادي رد عليه وبس من غير ما تفرض موضوع الخاص.'
      : 'متقولش إنك هتبعت حاجة على الخاص.',
    'ممنوع: روابط، هاشتاجات، أكتر من إيموجي واحد، وعود بحاجات مش مذكورة في موضوع المنشور، أو إنك تقول إنك ذكاء اصطناعي أو بوت.',
    'لو التعليق فيه إساءة رد بأدب وهدوء من غير جدال.',
    'اكتب الرد نفسه بس من غير أي مقدمة أو علامات تنصيص.',
  ].join('\n');
  const user = `موضوع المنشور: ${cut(topic, 200) || 'غير معروف'}\nالتعليق: ${cut(comment, 400)}`;
  // جوجل بتوقف موديلات قديمة من وقت للتاني — بنجرب أكتر من موديل بالترتيب ونفتكر اللي اشتغل
  const list = [...new Set([geminiModelOk, env('GEMINI_MODEL'), 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))] as string[];
  // لو كله مشغول بنستنى شوية ونجرب تاني (الرد أصلًا بيتأخر دقيقة فعندنا وقت)
  const models = [...list, '__wait__', ...list, '__wait__', ...list];
  let lastErr = '';
  for (const model of models) {
    if (model === '__wait__') { await sleep(4000); continue; }
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 1, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastErr = data?.error?.message || `HTTP ${res.status}`;
      // الموديل مش موجود/اتوقف/عليه ضغط/خلصت حصته ← جرب اللي بعده؛ مشكلة في المفتاح نفسه ← نوقف
      if ([404, 429, 500, 503].includes(res.status) || /no longer available|not found|not supported|deprecated|high demand|overloaded|unavailable|quota/i.test(lastErr)) continue;
      throw new Error(lastErr);
    }
    geminiModelOk = model;
    let text = (data.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || '').join('').trim();
    text = text.replace(/^["'«“]+|["'»”]+$/g, '').replace(/https?:\/\/\S+/g, '').replace(/#\S+/g, '').trim();
    return text.length >= 3 ? cut(text, 300) : '';
  }
  throw new Error(lastErr || 'مفيش موديل Gemini متاح');
}
let geminiModelOk = '';

// مواعيد بشرية محسوبة من وقت كتابة التعليق (عشان فيسبوك ميعتبرهاش سبام)
// مواعيد شبه الإنسان: مش فوري (بيبان بوت) ومش متأخر قوي (الشخص بيمشي).
// كله بيخلص في أقل من دقيقتين عشان حدود السيرفر المجاني (150 ثانية).
const TIMING = {
  like:  [15_000, 35_000], // اللايك بعد 15-35 ثانية
  reply: [45_000, 75_000], // الرد على التعليق بعد 45-75 ثانية (حوالي دقيقة)
  dm:    [10_000, 25_000], // رسالة الماسنجر بعد الرد بـ 10-25 ثانية
};
const rand = ([a, b]: number[]) => a + Math.random() * (b - a);
// "طلب" وهمي بنستخدمه عشان نقفل رسالة الماسنجر لكل شخص على مستوى الصفحة كلها
const DM_LOCK = '00000000-0000-0000-0000-000000000000';
const waitUntil = (t: number) => sleep(Math.max(0, Math.min(t - Date.now(), 90_000)));

async function handleComment(cm: Comment, s: any, campaigns: any[]) {
  if (!s.page_id || !s.page_token || !cm.commentId) return;
  if (cm.fromId && cm.fromId === s.page_id) return; // تعليقات الصفحة نفسها
  const c = findCampaign(campaigns, cm.postId, cm.message);
  if (!c) return;
  if (cm.created && cm.created < new Date(c.since).getTime() - 60_000) return; // تعليق قديم قبل تشغيل الطلب

  // لو فيسبوك مبعتش صاحب التعليق نجيبه (عشان نقدر نمنع تكرار الرد لنفس الشخص)
  if (!cm.fromId) {
    try { const r = await fb('GET', `/${cm.commentId}`, { fields: 'from{id,name}' }, s.page_token); cm.fromId = r.from?.id; cm.fromName ||= r.from?.name; } catch { /* */ }
  }  const who = cm.fromName || 'متابع';
  if (!(await claim(cm.commentId, c.id, cm.fromId))) return; // التعليق ده اتعالج بالفعل
  if (cm.fromId && cm.fromId === s.page_id) return;
  // رد واحد بس لكل شخص: "حجز" الشخص في قاعدة البيانات نفسها — لو كتب 15 تعليق في نفس اللحظة واحد بس اللي بيعدي
  if (c.one_per_user) {
    if (cm.fromId) {
      const { error } = await db.from('user_hits').insert({ campaign_id: c.id, user_id: cm.fromId });
      if (error) { await log('skip', `${who} علّق تاني — اتجاهل عشان أخد رد قبل كده`); return; }
    } else {
      // فيسبوك مخبي صاحب التعليق (التطبيق لسه في وضع التجربة): حماية من السبام —
      // رد واحد بس كل 45 ثانية لكل طلب على التعليقات المجهولة
      const slot = `anon-${Math.floor(Date.now() / 45_000)}`;
      const { error } = await db.from('user_hits').insert({ campaign_id: c.id, user_id: slot });
      if (error) { await log('skip', 'تعليق مجهول الصاحب اتجاهل (حماية من التكرار — رد واحد كل 45 ثانية)'); return; }
    }
  }

  await bump(c.id, 'matched');
  await log('comment', `💬 ${who}: "${cut(cm.message, 80)}" ← ${c.name}`);
  // كل المواعيد محسوبة من لحظة كتابة التعليق؛ لو التعليق اتلقط متأخر بنكمل بفواصل صغيرة
  const base = Math.min(cm.created || Date.now(), Date.now());
  const likeAt = base + rand(TIMING.like);
  const replyAt = Math.max(base + rand(TIMING.reply), likeAt + 3_000);

  const vars = { name: cm.fromName, page: s.page_name };
  const fail = async (what: string, e: unknown) => { await bump(c.id, 'errors'); await log('error', `❌ ${what} (${who}): ${explain(e)}`); };

  // الرد الذكي بيتكتب في الخلفية وإحنا مستنيين ميعاد الرد (عشان ميأخرش حاجة)
  const dmWillSend = !!(c.dm_enabled && (c.dm_messages || []).length);
  const topic = [c.name, ...(c.posts || []).map((p: any) => p.text)].filter(Boolean).join(' — ');
  const smart = c.reply_enabled && c.smart_reply !== false
    ? smartReply(cm.message, cm.fromName || '', s.page_name || '', topic, dmWillSend)
    : Promise.resolve('');

  if (c.like_comment) {
    await waitUntil(likeAt);
    try { await fb('POST', `/${cm.commentId}/likes`, {}, s.page_token); await bump(c.id, 'liked'); }
    catch (e) { await fail('اللايك', e); }
  }
  if (c.reply_enabled) {
    const text = (await smart) || fill(pick(c.replies) || FALLBACK_REPLY, vars);
    if (text) {
      await waitUntil(replyAt);
      try { await fb('POST', `/${cm.commentId}/comments`, { message: text }, s.page_token); await bump(c.id, 'replied'); await log('reply', `✅ رد على ${who}: "${cut(text, 70)}"`); }
      catch (e) { await fail('الرد على التعليق', e); }
    }
  }
  if (c.dm_enabled) {
    const text = fill(pick(c.dm_messages), vars);
    // رسالة ماسنجر واحدة بس لكل شخص على الصفحة كلها (حتى لو علّق على أكتر من فيديو/طلب)
    let dmAllowed = true;
    if (cm.fromId) {
      const { error } = await db.from('user_hits').insert({ campaign_id: DM_LOCK, user_id: `dm:${s.page_id}:${cm.fromId}` });
      if (error) { dmAllowed = false; await log('skip', `${who} أخد رسالة ماسنجر قبل كده — مش هتتبعتله تاني`); }
    }
    if (text && dmAllowed) {
      await waitUntil(Math.max(replyAt, Date.now()) + rand(TIMING.dm));
      try {
        const parts = dmParts(text, s.page_id, c.button_title, c.button_url, c.follow_button !== false, s.return_to);
        const r = await sendPrivateReply(s.page_id, cm.commentId, parts.text, s.page_token, parts.buttons, text);
        await bump(c.id, 'messaged');
        if (r?.recipient_id) await db.from('dm_sent').upsert({ psid: r.recipient_id, at: new Date().toISOString() });
        await log('dm', `📩 رسالة ماسنجر اتبعتت لـ ${who}`);
      } catch (e) { await fail('رسالة الماسنجر', e); }
    }
  }
}

async function handleMessage(psid: string, text: string, s: any) {
  if (!s.page_id || !s.page_token || psid === s.page_id) return;
  const nameOf = async () => { try { const r = await fb('GET', `/${psid}`, { fields: 'name,first_name' }, s.page_token); return r.name || r.first_name || ''; } catch { return ''; } };
  const send = (msg: string) => {
    const p = dmParts(msg, s.page_id, null, null, s.dm_follow_button !== false, s.return_to);
    return fb('POST', `/${s.page_id}/messages`, { recipient: { id: psid }, messaging_type: 'RESPONSE', message: buildMessage(p.text, p.buttons) }, s.page_token)
      .catch(() => fb('POST', `/${s.page_id}/messages`, { recipient: { id: psid }, messaging_type: 'RESPONSE', message: plainWithLinks(msg, p.buttons.filter((b) => !msg.includes(b.url))) }, s.page_token));
  };

  const { data: rules } = await db.from('dm_rules').select('*').eq('active', true).order('created_at');
  for (const r of rules || []) {
    if (!matchKeyword(text, r.keywords)) continue;
    const name = await nameOf();
    try { await send(fill(r.reply, { name, page: s.page_name })); await db.rpc('bump_rule', { rid: r.id }); await db.from('dm_sent').upsert({ psid, at: new Date().toISOString() }); await log('dm', `📨 رد ماسنجر تلقائي على ${name || 'متابع'}`); }
    catch (e) { await log('error', `❌ رد الماسنجر: ${explain(e)}`); }
    return;
  }
  if (!s.dm_auto_enabled || !s.dm_auto_text) return;
  const { data: last } = await db.from('dm_sent').select('at').eq('psid', psid).maybeSingle();
  if (last && Date.now() - new Date(last.at).getTime() < (s.dm_cooldown_hours || 24) * 3600_000) return;
  const name = await nameOf();
  try { await send(fill(s.dm_auto_text, { name, page: s.page_name })); await db.from('dm_sent').upsert({ psid, at: new Date().toISOString() }); await log('dm', `📨 رد ترحيبي على ${name || 'متابع'}`); }
  catch (e) { await log('error', `❌ الرد الترحيبي: ${explain(e)}`); }
}

async function activeCampaigns() {
  const { data } = await db.from('campaigns').select('*').eq('active', true).order('created_at', { ascending: false });
  return data || [];
}

// الفحص الدوري (Supabase بيشغله كل 30 ثانية)
async function poll(force = false) {
  const settings = await getSettings();
  const pages = await getPages();
  if (!pages.length) return { skipped: 'no page' };
  if (!force && settings.last_poll && Date.now() - new Date(settings.last_poll).getTime() < 20_000) return { skipped: 'too soon' };
  await setSettings({ last_poll: new Date().toISOString() });
  const all = await activeCampaigns();
  if (!all.length) return { skipped: 'no campaigns' };

  const started = Date.now();
  let handled = 0;
  const jobs: Promise<unknown>[] = []; // التعليقات بتشتغل مع بعض (كل واحد بمواعيده) بدل ما تستنى بعض
  for (const page of pages) {
  const s = ctxFor(settings, page);
  const campaigns = campaignsFor(all, page.id, pages[0].id);
  if (!campaigns.length) continue;
  const targets = new Set<string>();
  for (const c of campaigns) for (const p of c.posts || []) targets.add(p.id);
  if (campaigns.some((c) => c.all_posts)) {
    try { for (const p of await recentPosts(s.page_id, s.page_token, 5)) targets.add(p.id); } catch { /* */ }
  }
  for (const objectId of targets) {
    if (Date.now() - started > 40_000) break;
    let comments: any[] = [];
    try {
      const r = await fb('GET', `/${objectId}/comments`, { fields: 'id,message,from{id,name},created_time', filter: 'stream', order: 'reverse_chronological', limit: 40 }, s.page_token)
        .catch(() => fb('GET', `/${tail(objectId)}/comments`, { fields: 'id,message,from{id,name},created_time', filter: 'stream', order: 'reverse_chronological', limit: 40 }, s.page_token));
      comments = r.data || [];
    } catch (e) {
      if ((e as FbError).code === 190) { await log('error', `⚠️ ${page.name}: ${explain(e)}`); break; }
      continue;
    }
    if (!comments.length) continue;
    const { data: done } = await db.from('processed').select('comment_id').in('comment_id', comments.map((c) => c.id));
    const doneSet = new Set((done || []).map((d) => d.comment_id));
    for (const c of comments.reverse()) {
      if (doneSet.has(c.id) || handled >= 25) continue;
      jobs.push(handleComment({ commentId: c.id, postId: objectId, message: c.message || '', fromId: c.from?.id, fromName: c.from?.name, created: new Date(c.created_time).getTime() }, s, campaigns).catch((e) => console.error(e)));
      handled++;
      await sleep(300);
    }
  }
  }
  await Promise.allSettled(jobs);
  return { ok: true, pages: pages.length, handled };
}

// =====================================================================
//  الويب هوك
// =====================================================================
async function validSignature(req: Request, raw: string) {
  const secret = env('FB_APP_SECRET');
  if (!secret) return true;
  const sig = req.headers.get('x-hub-signature-256') || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const expected = 'sha256=' + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sig.length === expected.length && sig === expected;
}

async function processWebhook(body: any) {
  if (body.object !== 'page') return;
  const settings = await getSettings();
  await setSettings({ last_webhook: new Date().toISOString() });
  const pages = await getPages();
  if (!pages.length) return;
  let all: any[] | null = null;
  const jobs: Promise<unknown>[] = [];
  for (const entry of body.entry || []) {
    // كل حدث جاي من صفحة معينة — بنشتغل بتوكن الصفحة دي وطلباتها بس
    const page = pages.find((p) => p.id === String(entry.id));
    if (!page) continue;
    const s = ctxFor(settings, page);
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      if (ch.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
        all ??= await activeCampaigns();
        const campaigns = campaignsFor(all, page.id, pages[0].id);
        jobs.push(handleComment({ commentId: v.comment_id, postId: v.post_id, message: v.message || '', fromId: v.from?.id, fromName: v.from?.name, created: v.created_time ? v.created_time * 1000 : Date.now() }, s, campaigns));
      }
    }
    for (const m of entry.messaging || []) {
      if (m.message?.is_echo || !m.sender?.id) continue;
      const text = m.message?.text || m.message?.quick_reply?.payload || m.postback?.title || '';
      if (m.message || m.postback) jobs.push(handleMessage(m.sender.id, text, s));
    }
  }
  await Promise.allSettled(jobs);
}

// =====================================================================
//  لوحة التحكم
// =====================================================================
function cleanCampaign(b: any) {
  const lines = (x: unknown) => (Array.isArray(x) ? x : String(x || '').split('\n')).map((v) => cut(String(v).trim(), 1000)).filter(Boolean);
  const kws = (Array.isArray(b.keywords) ? b.keywords : String(b.keywords || '').split(/[,،\n]/)).map((k: string) => String(k).trim()).filter(Boolean);
  const c = {
    name: cut(String(b.name || '').trim(), 80) || (kws[0] ? `طلب "${kws[0]}"` : 'طلب جديد'),
    all_posts: !!b.all_posts,
    posts: b.all_posts ? [] : (b.posts || []).slice(0, 50).map((p: any) => ({ id: String(p.id), alt: (p.alt || []).map(String), text: cut(p.text, 160), image: String(p.image || ''), link: String(p.link || '') })),
    keywords: kws,
    match_all: !!b.match_all,
    reply_enabled: b.reply_enabled !== false,
    replies: lines(b.replies),
    dm_enabled: b.dm_enabled !== false,
    dm_messages: (Array.isArray(b.dm_messages) ? b.dm_messages : [b.dm_messages]).map((x: string) => cut(String(x || '').trim(), 2000)).filter(Boolean),
    button_title: cut(String(b.button_title || '').trim(), 20) || null,
    button_url: String(b.button_url || '').trim() || null,
    like_comment: b.like_comment !== false,
    one_per_user: b.one_per_user !== false,
    follow_button: b.follow_button !== false,
    smart_reply: b.smart_reply !== false,
  };
  let err = '';
  if (!c.all_posts && !c.posts.length) err = 'اختار فيديو أو منشور واحد على الأقل';
  else if (!c.match_all && !c.keywords.length) err = 'اكتب الكلمة المفتاحية (زي: مهتم)';
  else if (!c.reply_enabled && !c.dm_enabled && !c.like_comment) err = 'شغّل الرد على التعليق أو رسالة الماسنجر';
  else if (c.reply_enabled && !c.replies.length && !c.smart_reply) err = 'اكتب الرد على التعليق (أو شغّل الرد الذكي)';
  else if (c.dm_enabled && !c.dm_messages.length) err = 'اكتب رسالة الماسنجر';
  else if (c.button_url && !/^https?:\/\//.test(c.button_url)) err = 'رابط الزرار لازم يبدأ بـ https://';
  return { c, err };
}

async function selectPage(p: any) {
  let info: any = {};
  try { info = await fb('GET', `/${p.id}`, { fields: 'name,picture{url},followers_count,fan_count' }, p.token); } catch { /* */ }
  // بتتضاف لقايمة الصفحات (ولو موجودة بيتحدث التوكن بتاعها)
  const { error } = await db.from('pages').upsert({
    id: p.id, name: info.name || p.name, token: p.token,
    picture: info.picture?.data?.url || p.picture || null,
    followers: info.followers_count || info.fan_count || null,
  });
  if (error) throw new Error('قاعدة البيانات محتاجة تحديث (جدول الصفحات): ' + error.message);
  const warnings: string[] = [];
  // تفعيل الويب هوك تلقائيًا في تطبيق فيسبوك + اشتراك الصفحة
  if (env('FB_APP_ID') && env('FB_APP_SECRET')) {
    try {
      await fb('POST', `/${env('FB_APP_ID')}/subscriptions`, { object: 'page', callback_url: FN_URL + '/webhook', verify_token: await verifyToken(), fields: 'feed,messages,messaging_postbacks', include_values: true }, `${env('FB_APP_ID')}|${env('FB_APP_SECRET')}`);
    } catch (e) { warnings.push('تفعيل الويب هوك: ' + explain(e)); }
  }
  try { await fb('POST', `/${p.id}/subscribed_apps`, { subscribed_fields: 'feed,messages,messaging_postbacks' }, p.token); }
  catch (e) { warnings.push('اشتراك الصفحة: ' + explain(e)); }
  await log('system', `📄 تم ربط صفحة "${info.name || p.name}"` + (warnings.length ? ' — ' + warnings.join(' / ') : ''));
  return warnings;
}

async function pagesFromUserToken(userToken: string) {
  let token = userToken;
  if (env('FB_APP_ID') && env('FB_APP_SECRET')) {
    try { token = (await fb('GET', '/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: env('FB_APP_ID'), client_secret: env('FB_APP_SECRET'), fb_exchange_token: userToken })).access_token || userToken; } catch { /* */ }
  }
  const pages = new Map<string, any>();
  try {
    const r = await fb('GET', '/me/accounts', { fields: 'id,name,access_token,picture{url}', limit: 100 }, token);
    for (const p of r.data || []) pages.set(p.id, { id: p.id, name: p.name, token: p.access_token, picture: p.picture?.data?.url });
  } catch { /* */ }
  // الصفحات اللي بتتدار من حافظة أعمال مش بتظهر في /me/accounts — نجيبها من الصلاحيات اللي الشخص وافق عليها
  if (env('FB_APP_ID') && env('FB_APP_SECRET')) {
    try {
      const d = await fb('GET', '/debug_token', { input_token: token }, `${env('FB_APP_ID')}|${env('FB_APP_SECRET')}`);
      const ids = new Set<string>();
      for (const g of d.data?.granular_scopes || []) if (String(g.scope).startsWith('pages_')) for (const id of g.target_ids || []) ids.add(String(id));
      for (const id of ids) {
        if (pages.has(id)) continue;
        try {
          const p = await fb('GET', `/${id}`, { fields: 'id,name,access_token,picture{url}' }, token);
          if (p.access_token) pages.set(p.id, { id: p.id, name: p.name, token: p.access_token, picture: p.picture?.data?.url });
        } catch { /* */ }
      }
    } catch { /* */ }
  }
  return [...pages.values()];
}

async function api(req: Request, path: string): Promise<Response> {
  const pass = env('ADMIN_PASSWORD');
  if (!pass) return json({ error: 'لازم تضيف ADMIN_PASSWORD في Secrets بتاعة Supabase' }, 500);
  if ((req.headers.get('x-admin-password') || '') !== pass) return json({ error: 'كلمة السر غلط', auth: true }, 401);

  const method = req.method;
  const body = method === 'GET' || method === 'DELETE' ? {} : await req.json().catch(() => ({}));
  const s = await getSettings();
  const pages = await getPages();
  // الصفحة اللي اللوحة شغالة عليها دلوقتي (?page= أو page_id في الطلب) — وإلا أول صفحة
  const wanted = String(new URL(req.url).searchParams.get('page') || body.page_id || '');
  const cur = pages.find((p) => p.id === wanted) || pages[0];
  const ps = cur ? ctxFor(s, cur) : s;
  let m: RegExpMatchArray | null;

  // ---- الحالة ----
  if (path === '/status' && method === 'GET') {
    if (s.cron_url !== FN_URL + '/cron') {
      const { error } = await db.rpc('setup_cron', { fn_url: FN_URL + '/cron' });
      if (!error) await setSettings({ cron_url: FN_URL + '/cron' });
      else console.error('cron', error);
    }
    const { data: camps } = await db.from('campaigns').select('active,matched,replied,messaged,liked,errors');
    const sum = (k: string) => (camps || []).reduce((a: number, c: any) => a + (c[k] || 0), 0);
    return json({
      page: cur ? safePageRow(cur) : null,
      pages: pages.map(safePageRow),
      dmFollowButton: s.dm_follow_button !== false,
      aiReady: !!env('GEMINI_API_KEY'),
      totals: { comments: sum('matched'), replies: sum('replied'), messages: sum('messaged'), likes: sum('liked'), errors: sum('errors'), active: (camps || []).filter((c: any) => c.active).length },
      lastPoll: s.last_poll, lastWebhook: s.last_webhook, cronReady: s.cron_url === FN_URL + '/cron',
      setup: {
        appId: !!env('FB_APP_ID'), appSecret: !!env('FB_APP_SECRET'),
        webhookUrl: FN_URL + '/webhook', redirectUri: FN_URL + '/fb/callback', verifyToken: await verifyToken(),
      },
    });
  }

  // ---- ربط فيسبوك ----
  if (path === '/fb/login' && method === 'POST') {
    if (!env('FB_APP_ID') || !env('FB_APP_SECRET')) return json({ error: 'ضيف FB_APP_ID و FB_APP_SECRET في Secrets بتاعة Supabase الأول' }, 400);
    const state = crypto.randomUUID();
    const returnTo = /^https?:\/\//.test(body.return_to || '') ? body.return_to : '';
    await setSettings({ oauth_state: state, return_to: returnTo });
    const u = new URL(`https://www.facebook.com/${GRAPH.split('/').pop()}/dialog/oauth`);
    u.searchParams.set('client_id', env('FB_APP_ID'));
    u.searchParams.set('redirect_uri', FN_URL + '/fb/callback');
    u.searchParams.set('state', state);
    if (env('FB_LOGIN_CONFIG_ID')) u.searchParams.set('config_id', env('FB_LOGIN_CONFIG_ID'));
    else u.searchParams.set('scope', 'pages_show_list,pages_read_engagement,pages_manage_metadata,pages_manage_engagement,pages_read_user_content,pages_messaging');
    return json({ url: u.toString() });
  }
  if (path === '/fb/token' && method === 'POST') {
    const token = String(body.token || '').trim();
    if (!token) return json({ error: 'الصق التوكن' }, 400);
    let pages: any[] = [];
    try { pages = await pagesFromUserToken(token); } catch { /* ممكن يكون توكن صفحة */ }
    if (!pages.length) {
      const me = await fb('GET', '/me', { fields: 'id,name,picture{url}' }, token);
      pages = [{ id: me.id, name: me.name, token, picture: me.picture?.data?.url }];
    }
    await setSettings({ pending_pages: pages });
    return json({ pages: pages.map(({ token: _t, ...p }) => p) });
  }
  if (path === '/fb/pages' && method === 'GET') {
    return json({ pages: (s.pending_pages || []).map(({ token: _t, ...p }: any) => p) });
  }
  if (path === '/fb/select' && method === 'POST') {
    const p = (s.pending_pages || []).find((x: any) => x.id === body.id);
    if (!p) return json({ error: 'سجل الدخول بفيسبوك تاني' }, 404);
    const warnings = await selectPage(p);
    return json({ ok: true, warnings });
  }
  if (path === '/fb/disconnect' && method === 'POST') {
    const p = pages.find((x) => x.id === String(body.id || ''));
    if (!p) return json({ error: 'الصفحة مش موجودة' }, 404);
    try { await fb('DELETE', `/${p.id}/subscribed_apps`, {}, p.token); } catch { /* */ }
    await db.from('pages').delete().eq('id', p.id);
    await db.from('campaigns').update({ active: false }).eq('page_id', p.id); // طلباتها بتقف بس مش بتتمسح
    await log('system', `🔌 تم فصل صفحة "${p.name}"`);
    return json({ ok: true });
  }

  // ---- المنشورات ----
  if (path === '/posts' && method === 'GET') {
    if (!cur) return json({ error: 'اربط الصفحة الأول' }, 400);
    return json({ posts: await recentPosts(ps.page_id, ps.page_token) });
  }
  if (path === '/posts/resolve' && method === 'POST') {
    if (!cur) return json({ error: 'اربط الصفحة الأول' }, 400);
    const parsed = parseLink(body.url);
    if (parsed.error) return json({ error: parsed.error }, 400);
    const id = parsed.id!;
    for (const t of id.includes('_') ? [id] : [`${ps.page_id}_${id}`, id]) {
      try {
        const o = await fb('GET', `/${t}`, { fields: 'id,message,full_picture,permalink_url' }, ps.page_token)
          .catch(() => fb('GET', `/${t}`, { fields: 'id,description,title,picture,permalink_url' }, ps.page_token));
        return json({ post: { id: o.id.includes('_') ? o.id : `${ps.page_id}_${o.id}`, alt: [t, id], text: cut(o.message || o.title || o.description || '', 160), image: o.full_picture || o.picture || '', link: body.url } });
      } catch { /* جرب اللي بعده */ }
    }
    return json({ post: { id: `${ps.page_id}_${id}`, alt: [id], text: '', image: '', link: body.url } });
  }

  // ---- الطلبات ----
  if (path === '/campaigns' && method === 'GET') {
    const { data } = await db.from('campaigns').select('*').order('created_at', { ascending: false });
    return json({ campaigns: data || [] });
  }
  if (path === '/campaigns' && method === 'POST') {
    const { c, err } = cleanCampaign(body);
    if (err) return json({ error: err }, 400);
    if (!cur) return json({ error: 'اربط صفحة الأول من الإعدادات' }, 400);
    const { data, error } = await db.from('campaigns').insert({ ...c, page_id: cur.id, active: true, since: new Date().toISOString() }).select().single();
    if (error) return json({ error: error.message }, 500);
    await log('system', `🚀 تم تشغيل طلب "${c.name}"`);
    return json({ campaign: data });
  }
  if ((m = path.match(/^\/campaigns\/([\w-]+)$/))) {
    if (method === 'PUT') {
      const { c, err } = cleanCampaign(body);
      if (err) return json({ error: err }, 400);
      const { data, error } = await db.from('campaigns').update(c).eq('id', m[1]).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ campaign: data });
    }
    if (method === 'DELETE') {
      await db.from('campaigns').delete().eq('id', m[1]);
      return json({ ok: true });
    }
  }
  if ((m = path.match(/^\/campaigns\/([\w-]+)\/toggle$/)) && method === 'POST') {
    const { data: cur } = await db.from('campaigns').select('active,name').eq('id', m[1]).single();
    if (!cur) return json({ error: 'الطلب مش موجود' }, 404);
    const patch: any = { active: !cur.active };
    if (!cur.active) patch.since = new Date().toISOString();
    await db.from('campaigns').update(patch).eq('id', m[1]);
    await log('system', `${patch.active ? '▶️ تشغيل' : '⏸️ إيقاف'} طلب "${cur.name}"`);
    return json({ active: patch.active });
  }

  // ---- الماسنجر ----
  if (path === '/dm' && method === 'GET') {
    const { data } = await db.from('dm_rules').select('*').order('created_at');
    return json({ auto_enabled: s.dm_auto_enabled, auto_text: s.dm_auto_text, follow_button: s.dm_follow_button !== false, rules: data || [] });
  }
  if (path === '/dm' && method === 'PUT') {
    await setSettings({ dm_auto_enabled: !!body.auto_enabled, dm_auto_text: cut(body.auto_text, 2000), dm_follow_button: body.follow_button !== false });
    const rules = (body.rules || []).map((r: any) => ({
      active: r.active !== false,
      keywords: (Array.isArray(r.keywords) ? r.keywords : String(r.keywords || '').split(/[,،]/)).map((k: string) => k.trim()).filter(Boolean),
      reply: cut(String(r.reply || '').trim(), 2000),
    })).filter((r: any) => r.keywords.length && r.reply);
    await db.from('dm_rules').delete().gte('created_at', '1970-01-01');
    if (rules.length) await db.from('dm_rules').insert(rules);
    return json({ ok: true });
  }

  // ---- النشاط ----
  if (path === '/logs' && method === 'GET') {
    const { data } = await db.from('logs').select('*').order('at', { ascending: false }).limit(80);
    return json({ logs: data || [] });
  }
  // تجربة الرد الذكي من لوحة التحكم (من غير ما يتنشر حاجة)
  if (path === '/ai-test' && method === 'POST') {
    try {
      const text = await generateSmart(String(body.comment || ''), String(body.name || 'أحمد محمد'), cur?.name || 'صفحتك', String(body.topic || ''), body.dm !== false);
      return json({ ok: !!text, text });
    } catch (e) { return json({ ok: false, error: (e as Error).message }); }
  }
  if (path === '/poll-now' && method === 'POST') {
    return json(await poll(true));
  }

  return json({ error: 'مسار غير معروف' }, 404);
}

// =====================================================================
//  نقطة الدخول
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/bot(?=\/|$)/, '') || '/';

  try {
    // فيسبوك بيتأكد من الويب هوك
    if (path === '/webhook' && req.method === 'GET') {
      if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === (await verifyToken())) {
        return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
      }
      return new Response('forbidden', { status: 403 });
    }
    // أحداث فيسبوك
    if (path === '/webhook' && req.method === 'POST') {
      const raw = await req.text();
      if (!(await validSignature(req, raw))) return new Response('bad signature', { status: 401 });
      let body: any = {};
      try { body = JSON.parse(raw); } catch { /* */ }
      background(processWebhook(body));
      return new Response('EVENT_RECEIVED', { status: 200 });
    }
    // الفحص التلقائي
    if (path === '/cron') {
      background(poll(false));
      return json({ ok: true });
    }
    // رجوع تسجيل الدخول
    if (path === '/fb/callback') {
      const s = await getSettings();
      const back = (s.return_to || '') as string;
      const go = (hash: string) => back
        ? Response.redirect(back.split('#')[0] + hash, 302)
        : new Response(`<meta charset="utf-8"><body style="font-family:sans-serif;background:#0B0E11;color:#EAECEF;text-align:center;padding:60px">${hash.includes('err') ? '❌ حصل خطأ' : '✅ تم تسجيل الدخول'} — ارجع للوحة التحكم</body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      const code = url.searchParams.get('code');
      if (!code || !s.oauth_state || url.searchParams.get('state') !== s.oauth_state) return go('#err=' + encodeURIComponent(url.searchParams.get('error_description') || 'انتهت المحاولة، جرب تاني'));
      await setSettings({ oauth_state: null });
      const t = await fb('GET', '/oauth/access_token', { client_id: env('FB_APP_ID'), client_secret: env('FB_APP_SECRET'), redirect_uri: FN_URL + '/fb/callback', code });
      const pages = await pagesFromUserToken(t.access_token);
      await setSettings({ pending_pages: pages });
      if (pages.length === 1) { await selectPage(pages[0]); return go('#connected'); }
      return go('#pick-page');
    }
    if (path.startsWith('/api/')) return await api(req, path.slice(4));
    if (path === '/' || path === '/health') return json({ ok: true, name: 'page-auto-reply' });
    return json({ error: 'not found' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof FbError ? explain(e) : (e as Error).message }, 500);
  }
});
