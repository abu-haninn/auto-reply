/* ===== الرد التلقائي — لوحة التحكم ===== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('en-US');

// ---------- أيقونات ----------
const P = {
  bot: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="currentColor" stroke="none"/><circle cx="9" cy="11" r="1.3" fill="#FCD535" stroke="none"/><circle cx="15" cy="11" r="1.3" fill="#FCD535" stroke="none"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  fb: '<path d="M15 3h-3a4 4 0 0 0-4 4v3H6v4h2v7h4v-7h3l1-4h-4V7h3z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  msg: '<path d="M4 4h16v12H8l-4 4z"/>',
  reply: '<path d="M9 17 4 12l5-5M20 18v-2a4 4 0 0 0-4-4H4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
  logout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h12"/>',
  rocket: '<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1zM12 15l-3-3a22 22 0 0 1 2-4A13 13 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2zM9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  video: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>',
  heart: '<path d="M12 21s-8-5-8-11a5 5 0 0 1 8-3.5A5 5 0 0 1 20 10c0 6-8 11-8 11z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4V4h11v1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || P.info}</svg>`;
const paint = () => $$('i[data-i]').forEach((i) => { i.outerHTML = icon(i.dataset.i); });

// ---------- الاتصال بالسيرفر ----------
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { } },
  del: (k) => { try { localStorage.removeItem(k); } catch { } },
};
let SERVER = (window.SERVER_URL || store.get('server')).replace(/\/+$/, '');
let PASS = store.get('pass');

async function api(path, method = 'GET', body) {
  const res = await fetch(SERVER + '/api' + path, {
    method,
    headers: { 'x-admin-password': PASS, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.auth) { showLogin('كلمة السر غلط'); throw new Error('auth'); }
  if (!res.ok) throw new Error(data.error || 'حصل خطأ، جرب تاني');
  return data;
}
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = icon(type === 'err' ? 'info' : 'check') + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = '.3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
}
async function busy(btn, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try { return await fn(); }
  catch (e) { if (e.message !== 'auth') toast(e.message === 'Failed to fetch' ? 'مش قادر أوصل للسيرفر — اتأكد من الرابط' : e.message, 'err'); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}
const ago = (t) => {
  if (!t) return 'لسه';
  const s = Math.round((Date.now() - new Date(t)) / 1000);
  if (s < 60) return 'من ثواني';
  if (s < 3600) return `من ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `من ${Math.floor(s / 3600)} ساعة`;
  return new Date(t).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
};

// ---------- الدخول ----------
function showLogin(err) {
  $('#appView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
  $('#urlField').classList.toggle('hidden', !!window.SERVER_URL);
  $('#loginUrl').value = SERVER;
  if (err) toast(err, 'err');
}
$('#loginForm').onsubmit = (e) => {
  e.preventDefault();
  const btn = e.submitter || $('#loginForm button');
  busy(btn, async () => {
    if (!window.SERVER_URL) SERVER = $('#loginUrl').value.trim().replace(/\/+$/, '');
    PASS = $('#loginPass').value;
    if (!/^https:\/\//.test(SERVER)) throw new Error('اكتب رابط السيرفر صح (بيبدأ بـ https://)');
    await api('/status');
    store.set('server', SERVER); store.set('pass', PASS);
    start();
  });
};

// ---------- الحالة العامة ----------
let ST = null;
let REQS = [];

// الصفحة اللي شغالين عليها دلوقتي (لو عندك أكتر من صفحة)
let CUR_PAGE = store.get('page');
const pq = () => (CUR_PAGE ? `?page=${encodeURIComponent(CUR_PAGE)}` : '');

async function loadStatus() {
  ST = await api('/status' + pq());
  if (!ST.pages.some((p) => p.id === CUR_PAGE)) { CUR_PAGE = ST.page ? ST.page.id : ''; store.set('page', CUR_PAGE); }
  const page = ST.page;
  renderPageSwitch();
  $('#pageName').textContent = page ? page.name : 'الرد التلقائي';
  $('#connectBox').classList.toggle('hidden', !!page);
  $('#mainBox').classList.toggle('hidden', !page);
  const live = page && ST.totals.active > 0;
  const pill = $('#livePill');
  pill.className = 'pill ' + (live ? 'on' : 'off');
  pill.innerHTML = live ? '<span class="pulse"></span>شغال 24 ساعة' : page ? 'مفيش طلبات شغالة' : 'الصفحة مش مربوطة';
  if (ST.pages.length < 2) {
    $('#sComments').textContent = num(ST.totals.comments);
    $('#sReplies').textContent = num(ST.totals.replies);
    $('#sMessages').textContent = num(ST.totals.messages);
  }
}
function renderPageSwitch() {
  const box = $('#pageSwitch');
  box.classList.toggle('hidden', ST.pages.length < 2);
  box.innerHTML = ST.pages.map((p) => `<button data-page="${p.id}" class="${p.id === CUR_PAGE ? 'on' : ''}"><img src="${esc(p.picture || '')}" alt="">${esc(p.name)}</button>`).join('');
}
$('#pageSwitch').onclick = async (e) => {
  const b = e.target.closest('[data-page]'); if (!b || b.dataset.page === CUR_PAGE) return;
  CUR_PAGE = b.dataset.page; store.set('page', CUR_PAGE); F.pagePosts = null;
  await loadStatus().catch(() => {}); loadRequests();
};
// الطلبات القديمة اللي مالهاش صفحة تبع أول صفحة
const reqPage = (c) => c.page_id || (ST && ST.pages[0] ? ST.pages[0].id : '');

// ---------- التبويبات ----------
function tab(name) {
  $$('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === 'tab-' + name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'requests') loadRequests();
  if (name === 'messenger') loadDm();
  if (name === 'activity') loadLogs();
  if (name === 'settings') renderSettings();
}
$$('nav.tabs button').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));

// ---------- الطلبات ----------
async function loadRequests() {
  try { REQS = (await api('/campaigns')).campaigns; } catch { return; }
  if (ST && ST.pages.length > 1) {
    REQS = REQS.filter((c) => reqPage(c) === CUR_PAGE);
    const sum = (k) => REQS.reduce((a, c) => a + (c[k] || 0), 0);
    $('#sComments').textContent = num(sum('matched'));
    $('#sReplies').textContent = num(sum('replied'));
    $('#sMessages').textContent = num(sum('messaged'));
  }
  const box = $('#reqList');
  if (!REQS.length) {
    box.innerHTML = `<div class="card empty"><div class="ic">${icon('rocket')}</div><h2>اعمل أول طلب</h2><p>اختار الفيديو، اكتب الكلمة زي "مهتم"، واكتب الرد ورسالة الماسنجر — والباقي علينا.</p></div>`;
    return;
  }
  box.innerHTML = REQS.map((c) => {
    const p = (c.posts || [])[0];
    const th = p && p.image ? `<img class="thumb" src="${esc(p.image)}" alt="">` : `<div class="thumb">${icon(c.all_posts ? 'image' : 'video')}</div>`;
    const kws = c.match_all ? '<span class="tag">أي تعليق</span>' : (c.keywords || []).slice(0, 5).map((k) => `<span class="tag">${esc(k)}</span>`).join('');
    return `<div class="card req ${c.active ? '' : 'off'}">
      <div class="req-top">${th}
        <div style="flex:1;min-width:0"><h4>${esc(c.name)}</h4><div class="tags">${kws}</div></div>
        <div class="center"><label class="sw"><input type="checkbox" data-toggle="${c.id}" ${c.active ? 'checked' : ''}><i></i></label>
          <div class="status-txt ${c.active ? 'on' : 'off'}">${c.active ? 'شغال' : 'متوقف'}</div></div>
      </div>
      <div class="req-nums">${[['matched', 'تعليق', 'msg'], ['replied', 'رد', 'reply'], ['messaged', 'رسالة ماسنجر', 'chat']].map(([k, l, ic]) => {
        const changed = PREV[c.id] && PREV[c.id][k] !== c[k];
        return `<div class="${changed ? 'bump' : ''}">${icon(ic)}<b>${num(c[k])}</b><small>${l}</small></div>`;
      }).join('')}</div>
      <div class="row"><span class="small muted sp">${c.all_posts ? 'كل المنشورات' : `${num((c.posts || []).length)} منشور`}${c.active ? ' · <span class="live-dot"></span> بيتحدث لوحده' : ''}</span>
        <button class="btn btn-g btn-sm" data-edit="${c.id}">${icon('edit')}تعديل</button>
        <button class="ibtn" data-del="${c.id}" title="حذف">${icon('trash')}</button></div>
    </div>`;
  }).join('');
  PREV = Object.fromEntries(REQS.map((c) => [c.id, { matched: c.matched, replied: c.replied, messaged: c.messaged }]));
}
let PREV = {};

$('#reqList').addEventListener('change', async (e) => {
  const id = e.target.dataset.toggle; if (!id) return;
  try { const r = await api(`/campaigns/${id}/toggle`, 'POST'); toast(r.active ? 'الطلب اشتغل ✓' : 'الطلب اتوقف'); }
  catch (err) { toast(err.message, 'err'); }
  loadRequests(); loadStatus();
});
$('#reqList').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-edit]'); const del = e.target.closest('[data-del]');
  if (ed) openSheet(REQS.find((c) => c.id === ed.dataset.edit));
  if (del && confirm('متأكد إنك عايز تمسح الطلب ده؟')) {
    await api('/campaigns/' + del.dataset.del, 'DELETE').catch((err) => toast(err.message, 'err'));
    toast('اتمسح'); loadRequests(); loadStatus();
  }
});

// ---------- نموذج الطلب ----------
const F = { id: null, posts: [], pagePosts: null };
const DEF_REPLIES = 'عينيا ليك ❤️ بعتلك التفاصيل على الخاص 📩\nمنور، شيك على الماسنجر 🙏\nتم، بعتلك كل حاجة على الخاص ✅';
const DEF_DM = 'أهلاً بيك 👋\nشكرًا لاهتمامك! ده الرابط اللي طلبته:\n\n';
const tail = (id) => String(id).split('_').pop();

function syncDims() {
  $('#postsArea').classList.toggle('dim', $('#fAll').checked);
  $('#kwField').classList.toggle('dim', $('#fAny').checked);
  $('#replyField').classList.toggle('dim', !$('#fReplyOn').checked);
  $('#dmField').classList.toggle('dim', !$('#fDmOn').checked);
}
['#fAll', '#fAny', '#fReplyOn', '#fDmOn'].forEach((s) => ($(s).onchange = syncDims));
function syncSmart() {
  const on = $('#fSmart').checked;
  $('#aiMissing').classList.toggle('hidden', !on || !ST || ST.aiReady);
  $('#repliesLabel').textContent = on ? 'ردود احتياطية (لو الرد الذكي اتعطل)' : 'الردود اللي هتتكتب على التعليقات';
  $('#repliesBox').open = !on;
  $('#aiTestRow').classList.toggle('hidden', !on);
}
$('#fSmart').onchange = syncSmart;
// تجربة الرد الذكي قبل التشغيل
$('#aiTestBtn').onclick = (e) => busy(e.currentTarget, async () => {
  const comment = $('#aiTestIn').value.trim() || 'مهتم جدا ممكن الشرح';
  const topic = [$('#fName').value, ...F.posts.map((p) => p.text)].filter(Boolean).join(' — ');
  const r = await api('/ai-test' + pq(), 'POST', { comment, topic, dm: $('#fDmOn').checked });
  const out = $('#aiTestOut');
  out.classList.remove('hidden');
  out.innerHTML = r.ok
    ? `<div class="small muted">💬 المتابع: ${esc(comment)}</div><div style="margin-top:6px">↩️ <b>${esc(r.text)}</b></div>`
    : `<span style="color:var(--red)">الرد الذكي مش شغال: ${esc(r.error || 'رد فاضي')}</span>`;
});

function openSheet(c) {
  F.id = c ? c.id : null;
  F.posts = c ? JSON.parse(JSON.stringify(c.posts || [])) : [];
  $('#sheetTitle').textContent = c ? 'تعديل الطلب' : 'طلب جديد';
  $('#saveReq').innerHTML = c ? icon('check') + 'حفظ التعديل' : icon('rocket') + 'تشغيل الطلب';
  $('#fAll').checked = c ? c.all_posts : false;
  $('#fAny').checked = c ? c.match_all : true; // طلب جديد: "أي تعليق" مفتوح افتراضيًا
  $('#fKeywords').value = c ? (c.keywords || []).join('، ') : 'مهتم';
  $('#fReplyOn').checked = c ? c.reply_enabled : true;
  $('#fReplies').value = c ? (c.replies || []).join('\n') : DEF_REPLIES;
  $('#fDmOn').checked = c ? c.dm_enabled : true;
  $('#fDm').value = c ? (c.dm_messages || [])[0] || '' : DEF_DM;
  $('#fBtnTitle').value = c ? c.button_title || '' : '';
  $('#fBtnUrl').value = c ? c.button_url || '' : '';
  $('#btnDetails').open = !!(c && c.button_url);
  $('#fLike').checked = c ? c.like_comment : true;
  $('#fOnce').checked = c ? c.one_per_user : true;
  $('#fFollow').checked = c ? c.follow_button !== false : true;
  $('#fSmart').checked = c ? c.smart_reply !== false : true;
  syncSmart();
  $('#fName').value = c ? c.name : '';
  $('#fUrl').value = '';
  syncDims(); renderChosen();
  $('#sheet').classList.add('on'); $('#sheetBg').classList.add('on');
  document.body.style.overflow = 'hidden';
  if (!F.pagePosts) loadPagePosts(); else renderPagePosts();
}
function closeSheet() { $('#sheet').classList.remove('on'); $('#sheetBg').classList.remove('on'); document.body.style.overflow = ''; }
$('#newBtn').onclick = () => openSheet(null);
$('#sheetX').onclick = $('#sheetBg').onclick = closeSheet;

async function loadPagePosts() {
  $('#posts').innerHTML = Array(6).fill('<div class="sk" style="aspect-ratio:1"></div>').join('');
  try { F.pagePosts = (await api('/posts' + pq())).posts; renderPagePosts(); }
  catch (e) { $('#posts').innerHTML = `<div class="note red" style="grid-column:1/-1">${esc(e.message)}</div>`; }
}
function renderPagePosts() {
  if (!F.pagePosts.length) { $('#posts').innerHTML = '<div class="small muted">مفيش منشورات على الصفحة</div>'; return; }
  $('#posts').innerHTML = F.pagePosts.map((p, i) => {
    const on = F.posts.some((x) => tail(x.id) === tail(p.id));
    return `<div class="post ${on ? 'on' : ''}" data-i="${i}"><div class="im" style="${p.image ? `background-image:url('${esc(p.image)}')` : ''}">${p.image ? '' : icon(p.video ? 'video' : 'msg')}</div>
      ${p.video ? `<span class="vid">${icon('video')}</span>` : ''}<span class="ok">${icon('check')}</span><p>${esc(p.text || 'بدون كلام')}</p></div>`;
  }).join('');
}
$('#posts').onclick = (e) => {
  const el = e.target.closest('.post'); if (!el) return;
  const p = F.pagePosts[Number(el.dataset.i)];
  const i = F.posts.findIndex((x) => tail(x.id) === tail(p.id));
  if (i >= 0) F.posts.splice(i, 1); else F.posts.push({ id: p.id, text: p.text, image: p.image, link: p.link });
  el.classList.toggle('on', i < 0);
  if (i < 0 && !$('#fName').value && p.text) $('#fName').value = p.text.slice(0, 40);
  renderChosen();
};
function renderChosen() {
  // نعرض بس اللي اتضاف بالرابط (اللي من الصور ظاهر عليه علامة ✓)
  const fromGrid = new Set((F.pagePosts || []).map((p) => tail(p.id)));
  const extra = F.posts.map((p, i) => [p, i]).filter(([p]) => !fromGrid.has(tail(p.id)));
  $('#chosen').innerHTML = extra.map(([p, i]) => `<div class="it">${p.image ? `<img src="${esc(p.image)}" alt="">` : '<div class="ph"></div>'}<span>${esc(p.text || p.link || p.id)}</span><button class="ibtn" data-rm="${i}">${icon('x')}</button></div>`).join('');
}
$('#chosen').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { F.posts.splice(Number(b.dataset.rm), 1); renderChosen(); } };
$('#addUrl').onclick = (e) => busy(e.currentTarget, async () => {
  const url = $('#fUrl').value.trim(); if (!url) return;
  const { post } = await api('/posts/resolve', 'POST', { url, page_id: CUR_PAGE });
  if (F.posts.some((x) => tail(x.id) === tail(post.id))) return toast('المنشور ده مضاف بالفعل');
  F.posts.push(post); $('#fUrl').value = '';
  if (F.pagePosts) renderPagePosts();
  renderChosen(); toast('اتضاف ✓');
});

$('#saveReq').onclick = (e) => busy(e.currentTarget, async () => {
  const body = {
    name: $('#fName').value, all_posts: $('#fAll').checked, posts: F.posts,
    keywords: $('#fKeywords').value, match_all: $('#fAny').checked,
    reply_enabled: $('#fReplyOn').checked, replies: $('#fReplies').value,
    dm_enabled: $('#fDmOn').checked, dm_messages: [$('#fDm').value],
    button_title: $('#fBtnTitle').value, button_url: $('#fBtnUrl').value,
    like_comment: $('#fLike').checked, one_per_user: $('#fOnce').checked,
    follow_button: $('#fFollow').checked, smart_reply: $('#fSmart').checked, page_id: CUR_PAGE,
  };
  if (F.id) await api('/campaigns/' + F.id, 'PUT', body);
  else await api('/campaigns', 'POST', body);
  closeSheet();
  toast(F.id ? 'اتحفظ ✓' : 'الطلب اشتغل 🚀 — هيفضل شغال لحد ما توقفه');
  loadRequests(); loadStatus();
});

// ---------- الماسنجر ----------
let RULES = [];
async function loadDm() {
  try {
    const d = await api('/dm');
    $('#autoOn').checked = d.auto_enabled; $('#autoText').value = d.auto_text || '';
    $('#dmFollow').checked = d.follow_button !== false;
    $('#aiOn').checked = !!d.ai_enabled;
    $('#aiAbout').value = d.ai_about || '';
    $('#bcCount').textContent = '…';
    api('/broadcast/count' + pq()).then((r) => { $('#bcCount').textContent = r.queued ? `بيتبعت… فاضل ${num(r.queued)}` : `${num(r.count)} شخص`; }).catch(() => {});
    RULES = d.rules.map((r) => ({ keywords: (r.keywords || []).join('، '), reply: r.reply, active: r.active }));
    renderRules();
  } catch { }
}
function readRules() {
  return $$('#rules .step').map((el) => ({ keywords: el.querySelector('.k').value, reply: el.querySelector('.r').value, active: true }));
}
function renderRules() {
  $('#rules').innerHTML = RULES.map((r, i) => `<div class="step">
    <div class="row"><input class="in k" value="${esc(r.keywords)}" placeholder="الكلمة: سعر، بكام"><button class="ibtn" data-rmr="${i}">${icon('trash')}</button></div>
    <textarea class="in r mt" placeholder="الرد" style="min-height:70px">${esc(r.reply)}</textarea></div>`).join('') || '<p class="small muted">مفيش ردود لسه</p>';
}
$('#addRule').onclick = () => { RULES = readRules(); RULES.push({ keywords: '', reply: '' }); renderRules(); };
$('#rules').onclick = (e) => { const b = e.target.closest('[data-rmr]'); if (b) { RULES = readRules(); RULES.splice(Number(b.dataset.rmr), 1); renderRules(); } };
$('#saveDm').onclick = (e) => busy(e.currentTarget, async () => {
  await api('/dm', 'PUT', dmBody());
  toast('اتحفظ ✓'); loadDm();
});
const dmBody = () => ({ auto_enabled: $('#autoOn').checked, auto_text: $('#autoText').value, follow_button: $('#dmFollow').checked, ai_enabled: $('#aiOn').checked, ai_about: $('#aiAbout').value, rules: readRules() });
// الرد الذكي بيتحفظ أول ما تدوس على الزرار
$('#aiOn').onchange = () => api('/dm', 'PUT', dmBody())
  .then(() => toast($('#aiOn').checked ? 'الرد الذكي اشتغل ✨' : 'الرد الذكي اتقفل'), (e) => toast(e.message, 'err'));
$('#aiAboutSave').onclick = (e) => busy(e.currentTarget, async () => { await api('/dm', 'PUT', dmBody()); toast('البوت اتعلّم المعلومات دي ✓'); });
$('#bcSend').onclick = (e) => busy(e.currentTarget, async () => {
  const text = $('#bcText').value.trim();
  if (!text) throw new Error('اكتب الرسالة الأول');
  if (!confirm('هتتبعت الرسالة دي لكل اللي كلموك آخر 24 ساعة. متأكد؟')) return;
  const r = await api('/broadcast' + pq(), 'POST', { text, page_id: CUR_PAGE });
  $('#bcText').value = '';
  toast(`بدأ الإرسال لـ ${num(r.sending)} شخص 📢 — هياخد حوالي ${num(r.minutes)} دقيقة، وهتلاقي النتيجة في النشاط`);
  $('#bcCount').textContent = `بيتبعت… ${num(r.sending)}`;
});

// ---------- النشاط ----------
const logIc = { comment: 'msg', reply: 'reply', dm: 'chat', error: 'info', system: 'gear', skip: 'info' };
async function loadLogs() {
  try {
    const { logs } = await api('/logs');
    $('#logs').innerHTML = logs.map((l) => `<div class="log ${l.type}"><div class="ic">${icon(logIc[l.type] || 'info')}</div><div class="t">${esc(l.text)}<time>${ago(l.at)}</time></div></div>`).join('')
      || '<div class="center muted" style="padding:30px 0">لسه مفيش نشاط — أول ما حد يعلّق بالكلمة هيظهر هنا</div>';
  } catch { }
}
$('#pollNow').onclick = (e) => busy(e.currentTarget, async () => { await api('/poll-now', 'POST'); toast('تم الفحص ✓'); loadLogs(); loadStatus(); });

// ---------- الإعدادات ----------
async function renderSettings() {
  try { await loadStatus(); } catch { return; }
  const p = ST.page;
  $('#pagesList').innerHTML = ST.pages.length
    ? ST.pages.map((x) => `<div class="pg"><img src="${esc(x.picture || '')}" alt=""><div class="sp" style="min-width:0"><b style="display:block">${esc(x.name)}</b>${x.followers ? `<span class="small muted">${num(x.followers)} متابع</span>` : ''}</div>
        <button class="btn btn-r btn-sm" data-disc="${x.id}" data-name="${esc(x.name)}">${icon('x')}فصل</button></div>`).join('')
    : '<p class="small muted">مفيش صفحات مربوطة — دوس "إضافة صفحة"</p>';
  const checks = [
    [ST.setup.appId && ST.setup.appSecret, 'بيانات تطبيق فيسبوك موجودة'],
    [!!p, 'الصفحة مربوطة'],
    [ST.cronReady, 'الفحص التلقائي كل 30 ثانية شغال'],
    [!!ST.lastWebhook, ST.lastWebhook ? `فيسبوك بيبعت التعليقات لحظيًا (آخر مرة ${ago(ST.lastWebhook)})` : 'لسه موصلش تعليق لحظي من فيسبوك'],
    [ST.totals.active > 0, `${num(ST.totals.active)} طلب شغال`],
  ];
  $('#checks').innerHTML = checks.map(([ok, t]) => `<div class="check ${ok ? 'ok' : ''}"><span class="c">${icon(ok ? 'check' : 'x')}</span>${esc(t)}</div>`).join('')
    + `<div class="small muted mt">آخر فحص: ${ago(ST.lastPoll)}</div>`;
  const rows = [['رابط الرجوع', ST.setup.redirectUri], ['Webhook', ST.setup.webhookUrl], ['Verify Token', ST.setup.verifyToken], ['الخصوصية', location.href.split('#')[0].replace(/index\.html$/, '') + 'privacy.html']];
  $('#setupInfo').innerHTML = rows.map(([l, v]) => `<div class="kv"><label>${l}</label><code>${esc(v)}</code><button class="ibtn" data-copy="${esc(v)}">${icon('copy')}</button></div>`).join('');
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]');
  if (c) navigator.clipboard.writeText(c.dataset.copy).then(() => toast('اتنسخ ✓'), () => toast(c.dataset.copy));
  const d = e.target.closest('[data-disc]');
  if (d && confirm(`فصل صفحة "${d.dataset.name}"؟\nطلباتها هتقف (مش هتتمسح) لحد ما تربطها تاني.`)) {
    api('/fb/disconnect', 'POST', { id: d.dataset.disc }).then(() => { toast('اتفصلت'); renderSettings(); loadRequests(); }, (err) => toast(err.message, 'err'));
  }
});
$('#addPage').onclick = (e) => fbLogin(e.currentTarget);
// تسجيل الخروج بس لما إنت تدوس بنفسك (الصفحة نفسها بتفضل مربوطة على السيرفر وشغالة)
$('#logout').onclick = () => {
  if (!confirm('متأكد إنك عايز تسجل خروج من التطبيق؟\n(الطلبات هتفضل شغالة عادي على السيرفر)')) return;
  store.del('pass'); PASS = ''; showLogin();
};

// ---------- تطبيق الموبايل ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
let installEvent = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
function renderInstall() {
  $('#installedHint').classList.toggle('hidden', !standalone);
  $('#installBtn').classList.toggle('hidden', standalone || !installEvent);
  $('#iosHint').classList.toggle('hidden', standalone || !isIOS);
  $('#androidHint').classList.toggle('hidden', standalone || isIOS || !!installEvent);
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; renderInstall(); });
addEventListener('appinstalled', () => { installEvent = null; toast('تم تثبيت التطبيق ✓'); renderInstall(); });
$('#installBtn').onclick = async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice; installEvent = null; renderInstall(); };
renderInstall();

// ---------- ربط فيسبوك ----------
function fbLogin(btn) {
  return busy(btn, async () => {
    const { url } = await api('/fb/login', 'POST', { return_to: location.href.split('#')[0] });
    location.href = url;
  });
}
$('#fbLogin').onclick = (e) => fbLogin(e.currentTarget);
$('#tokenBtn').onclick = (e) => busy(e.currentTarget, async () => {
  const { pages } = await api('/fb/token', 'POST', { token: $('#tokenIn').value });
  $('#tokenIn').value = '';
  if (pages.length === 1) await choosePage(pages[0].id); else showPicker(pages);
});
async function showPicker(pages) {
  if (!pages) pages = (await api('/fb/pages')).pages;
  if (!pages.length) return toast('مفيش صفحات على الحساب ده', 'err');
  PICK = pages;
  renderPicker();
  $('#pickSheet').classList.add('on'); $('#pickBg').classList.add('on');
}
// تقدر تربط أكتر من صفحة من نفس القايمة
let PICK = [];
function renderPicker() {
  const linked = new Set((ST && ST.pages || []).map((p) => p.id));
  $('#pickList').innerHTML = PICK.map((p) => `<div class="pg"><img src="${esc(p.picture || '')}" alt=""><b>${esc(p.name)}</b>${linked.has(p.id)
    ? '<span class="ok-tag">✓ مربوطة</span>' : `<button class="btn btn-y btn-sm" data-pick="${p.id}">ربط</button>`}</div>`).join('')
    + '<button class="btn btn-g btn-full mt" id="pickDone">تم</button>';
}
const closePicker = () => { $('#pickSheet').classList.remove('on'); $('#pickBg').classList.remove('on'); loadStatus().then(() => tab('requests')).catch(() => {}); };
$('#pickList').onclick = (e) => {
  if (e.target.closest('#pickDone')) return closePicker();
  const b = e.target.closest('[data-pick]'); if (b) busy(b, () => choosePage(b.dataset.pick));
};
$('#pickBg').onclick = closePicker;
async function choosePage(id) {
  const r = await api('/fb/select', 'POST', { id });
  toast('الصفحة اتربطت ✓');
  (r.warnings || []).forEach((w) => toast(w, 'err'));
  CUR_PAGE = id; store.set('page', id); F.pagePosts = null;
  await loadStatus();
  if (PICK.length > 1) renderPicker(); else closePicker();
}

// ---------- البداية ----------
async function start() {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  const hash = decodeURIComponent(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  try { await loadStatus(); } catch (e) { if (e.message !== 'auth') toast(e.message, 'err'); return; }
  if (hash.startsWith('err=')) toast('فيسبوك: ' + hash.slice(4), 'err');
  if (hash === 'connected') toast('الصفحة اتربطت ✓');
  if (hash === 'pick-page') showPicker();
  loadRequests();
}
// تحديث تلقائي كل 10 ثواني: الأرقام والطلبات والنشاط
setInterval(() => {
  if (document.hidden || !PASS || $('#appView').classList.contains('hidden')) return;
  loadStatus().catch(() => {});
  if ($('#tab-requests').classList.contains('on') && !$('#sheet').classList.contains('on')) loadRequests();
  if ($('#tab-activity').classList.contains('on')) loadLogs();
}, 10000);

paint();
if (SERVER && PASS) start(); else showLogin();
