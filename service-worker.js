const CACHE_NAME="rml-sales-visit-1.8.49";
const APP_SHELL=[
 "./","./index.html","./style-v1-7-6.css",
 "./pdf-preview.html","./pdf-preview.css","./pdf-preview.js",
 "./app-v1-8-3.js?v=1.8.52","./promo-v1-8-49.js?v=1.8.49","./customers-v0-10-3.js",
 "./dashboard-target-v1-8-5.js?v=1.8.52","./admin-sales-v1-8-9.js?v=1.8.52",
 "./app-admin-photo-v1-7-8.js","./app-admin-delete-all-photos-v1-7-9.js"
];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET") return;
 event.respondWith(fetch(req).then(res=>{
   if(new URL(req.url).origin===self.location.origin){
     const copy=res.clone(); caches.open(CACHE_NAME).then(c=>c.put(req,copy)).catch(()=>{});
   }
   return res;
 }).catch(()=>caches.match(req).then(c=>c||caches.match("./index.html"))));
});
