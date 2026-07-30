const CACHE_NAME="rml-sales-visit-v1-2-0-stage1-order-payment";
const APP_SHELL=[
 "./",
 "./index.html",
 "./style.css","./pdf-preview.html","./pdf-preview.css","./pdf-preview.js",
 "./app-v1-2-0-stage1.js",
 "./customers-v0-10-3.js",
 "./manifest.webmanifest",
 "./icon-192.svg",
 "./icon-512.svg"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match("./index.html"))));});
