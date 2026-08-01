const CACHE_NAME = 'expense-workbench-v1';

function isAppPage(text){ return text.includes('id="dayModal"'); }

// 预缓存的同源静态资源（相对路径，兼容 GitHub Pages 子目录）
const PRECACHE = ['manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'sw.js'];

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

function notifyCached(){ self.clients.matchAll().then(cls => cls.forEach(c => { try{ c.postMessage({type:'cached'}); }catch(_){} })); }

// 主页面发来 cache-page：总是重新拉取并覆盖缓存（不跳过命中），保证离线副本是最新的
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'cache-page' && e.data.url){
    const base = new URL(e.data.url);
    const targets = [e.data.url].concat(PRECACHE.map(p => new URL(p, base.href).href));
    caches.open(CACHE_NAME).then(async c => {
      let cachedAny = false;
      for (const u of targets) {
        try {
          const resp = await fetch(u);
          if (resp.ok) {
            const ct = resp.headers.get('content-type') || '';
            if (ct.includes('text/html')) {
              const text = await resp.clone().text();
              if (isAppPage(text)) { await c.put(u, resp.clone()); cachedAny = true; }
            } else if (ct.includes('image/') || ct.includes('manifest') || ct.includes('javascript')) {
              await c.put(u, resp.clone()); cachedAny = true;
            }
          }
        } catch(_) {}
      }
      if (cachedAny) notifyCached();
    });
  }
});

// network-first：在线永远拿最新版本；离线/失败时回退到缓存
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 不拦截跨域请求
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const resp = await fetch(req);
      if (resp.ok) {
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('text/html') && isAppPage(await resp.clone().text())) {
          await cache.put(req, resp.clone());
        } else if (ct.includes('image/') || ct.includes('manifest') || ct.includes('javascript')) {
          await cache.put(req, resp.clone());
        }
      }
      return resp;
    } catch (err) {
      const hit = await cache.match(req, {ignoreVary:true});
      if (hit) return hit; // 离线兜底
      throw err;
    }
  })());
});
