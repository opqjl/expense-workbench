const CACHE_NAME = 'expense-workbench-v1';

function isAppPage(text){ return text.includes('id="dayModal"'); }

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

function notifyCached(){ self.clients.matchAll().then(cls => cls.forEach(c => { try{ c.postMessage({type:'cached'}); }catch(_){} })); }

// 主页面会发消息过来，让 SW 缓存当前页面的真实 URL（含沙箱查询参数）
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'cache-page' && e.data.url){
    const url = e.data.url;
    caches.open(CACHE_NAME).then(c => c.match(url).then(hit => {
      if(hit){ notifyCached(); return; }
      return fetch(url).then(resp => {
        if(!resp.ok) return;
        return resp.clone().text().then(text => { if(isAppPage(text)){ c.put(url, resp); notifyCached(); } });
      }).catch(()=>{});
    }));
  }
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      return fetch(e.request).then(resp => {
        if(!resp.ok || !(resp.headers.get('content-type')||'').includes('text/html')) return resp;
        return resp.clone().text().then(text => {
          if(isAppPage(text)){
            caches.open(CACHE_NAME).then(c => c.put(e.request, resp.clone()).then(notifyCached));
            return resp;
          }
          // 沙箱休眠时代理可能返回一个非 App 的 HTML 提示页，此时优先用缓存
          return cached || resp;
        });
      }).catch(err => cached || new Response('记账工作台需要至少成功打开一次以完成离线缓存。', {status:503, headers:{'Content-Type':'text/plain;charset=utf-8'}}));
    })
  );
});
