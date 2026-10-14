// خدمة التطبيق: بتخلي التطبيق يفتح بسرعة ويتسطب على الموبايل
// بنجيب الأحدث من النت الأول، ولو النت مقطوع بنفتح النسخة المحفوظة
const CACHE = 'auto-reply-v1';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'config.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // طلبات السيرفر (Supabase) وأي موقع تاني بتعدي على طول من غير حفظ
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
