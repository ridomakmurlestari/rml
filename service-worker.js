const CACHE_NAME="rml-sales-visit-v1-4-3-product-save-fix";
const APP_SHELL=[
 "./","./index.html","./style-v1-4-2.css",
 "./pdf-preview.html","./pdf-preview.css","./pdf-preview.js",
 "./app-v1-4-4.js","./customers-v0-10-3.js",
 "./manifest.webmanifest","./icon-192.svg","./icon-512.svg"
];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
 self.clients.claim();
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const request=event.request;
 event.respondWith((async()=>{
  try{
   const response=await fetch(request,{cache:"no-store"});
   if(response&&response.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone())}
   return response;
  }catch(_){return (await caches.match(request))||(request.mode==="navigate"?await caches.match("./index.html"):Response.error())}
 })());
});
