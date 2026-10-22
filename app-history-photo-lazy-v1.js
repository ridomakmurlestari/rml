/* RML v2.0.5 — check-in photo history (on-demand; low-egress). */
(function(){
 "use strict";
 const photoCache=new Map();
 let flagLoadBusy=false, lastFlagLoadAt=0;
 const FLAG_COOLDOWN=30000;
 const token=()=>{try{return typeof getSbSession==="function"?getSbSession()?.session_token:null}catch(_){return null}};
 const user=()=>{try{return typeof currentUser!=="undefined"?currentUser:null}catch(_){return null}};
 const normalEmail=x=>String(x||"").trim().toLowerCase();
 const dataUrl=x=>typeof x==="string"&&/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(x);
 const obj=x=>Array.isArray(x)?(x[0]||{}):(x&&typeof x==="object"?x:{});

 async function uploadPhotoAwareSync(options={}){
   const {silent=false,autoRetry=false}=options||{};
   if(syncInProgress)return false;
   if(!navigator.onLine){if(!silent)toast("Tidak ada internet. Data tetap aman di HP.");return false}
   const session=getSbSession();
   if(!session?.session_token){if(!silent)toast("Silakan login kembali untuk menyinkronkan data");return false}
   const all=await getVisitsOffline();
   const pending=all.filter(v=>v.syncStatus!=="synced");
   if(!pending.length){await updatePendingSyncCount();if(!silent)toast("Semua data sudah sinkron");return true}
   syncInProgress=true;let successCount=0;
   try{
     const batchSize=3;
     for(let i=0;i<pending.length;i+=batchSize){
       const batch=pending.slice(i,i+batchSize);
       const results=await Promise.allSettled(batch.map(async v=>{
         await rpc("app_upsert_visit",{p_token:session.session_token,p_visit:visitToRemote(v)});
         if(dataUrl(v.checkInPhoto)){
           await rpc("app_upsert_visit_photo",{
             p_token:session.session_token,p_visit_id:String(v.id),
             p_sales_email:normalEmail(v.salesEmail||user()?.email),p_photo:v.checkInPhoto
           });
           photoCache.set(String(v.id),v.checkInPhoto);
         }
         await idbPut(STORE_VISITS,{
           ...visitWithoutPhoto(v),
           hasCheckInPhoto:Boolean(v.checkInPhoto||v.hasCheckInPhoto),
           syncStatus:"synced",updatedAt:new Date().toISOString()
         });
         return v.id;
       }));
       for(let j=0;j<results.length;j++){
         if(results[j].status==="fulfilled")successCount++;
         else await idbPut(STORE_VISITS,{...batch[j],syncStatus:"failed"});
       }
     }
     await pullRemoteVisits();
     await refreshVisitCache();
     await updatePendingSyncCount();
     const failed=pending.length-successCount;
     if(!silent)toast(failed?`${successCount} data sinkron, ${failed} data belum berhasil`:`${successCount} data berhasil disinkronkan`);
     if(failed&&autoRetry){clearTimeout(autoSyncRetryTimer);autoSyncRetryTimer=setTimeout(()=>scheduleAutoSync(0),10000)}
     return failed===0;
   }catch(e){
     console.error("Sinkronisasi foto/kunjungan gagal",e);
     await updatePendingSyncCount();
     if(!silent)toast(`Sinkronisasi gagal: ${e.message||"periksa koneksi"}`);
     if(autoRetry){clearTimeout(autoSyncRetryTimer);autoSyncRetryTimer=setTimeout(()=>scheduleAutoSync(0),10000)}
     return false;
   }finally{syncInProgress=false}
 }

 async function loadPhotoFlagsForVisibleHistory(){
   if(flagLoadBusy||!navigator.onLine||!token())return;
   const cards=[...document.querySelectorAll(".history-card[data-visit-id]")];
   const ids=[...new Set(cards.map(c=>String(c.getAttribute("data-visit-id")||"")).filter(Boolean))];
   if(!ids.length)return;
   const rows=await getVisitsOffline();
   const byId=new Map(rows.map(v=>[String(v.id),v]));
   const unknown=ids.filter(id=>{
     const v=byId.get(id);
     return v&&typeof v.hasCheckInPhoto!=="boolean"&&!v.checkInPhoto;
   });
   if(!unknown.length||Date.now()-lastFlagLoadAt<FLAG_COOLDOWN)return;
   flagLoadBusy=true;lastFlagLoadAt=Date.now();
   try{
     // Metadata only: response is [{id, hasCheckInPhoto}], never image bytes.
     const result=await rpc("app_pull_visit_photo_flags",{p_token:token(),p_visit_ids:unknown.slice(0,500)});
     const flags=Array.isArray(result)?result:(Array.isArray(obj(result).flags)?obj(result).flags:[]);
     const set=new Map(flags.map(f=>[String(f.id),f.hasCheckInPhoto===true]));
     for(const id of unknown){
       const v=byId.get(id);
       if(set.has(id))await idbPut(STORE_VISITS,{...v,hasCheckInPhoto:set.get(id)});
     }
   }catch(e){console.warn("Metadata foto belum tersedia",e)}
   finally{flagLoadBusy=false}
 }

 function renderImage(slot,id,src){
   slot.replaceChildren();
   const img=document.createElement("img");
   img.className="history-photo";
   img.alt="Foto check-in";
   img.loading="lazy";
   img.decoding="async";
   img.src=src;
   img.addEventListener("click",()=>openPhotoModal(src));
   slot.appendChild(img);
   addAdminDeleteButton(slot,id);
 }
 function addAdminDeleteButton(slot,id){
   if(user()?.role!=="admin")return;
   const card=slot.closest(".history-card");
   const actions=card?.querySelector(".history-card-actions");
   if(!actions||actions.querySelector(`[data-photo-delete-id="${CSS.escape(id)}"]`))return;
   const b=document.createElement("button");
   b.type="button";b.className="danger compact";b.textContent="Hapus Foto";
   b.setAttribute("data-photo-delete-id",id);
   b.addEventListener("click",()=>deletePhoto(id,slot,b));
   actions.insertBefore(b,actions.firstChild);
 }
 async function loadPhoto(id,button){
   const slot=button.closest(".history-photo-slot");if(!slot)return;
   const cached=photoCache.get(id);if(cached){renderImage(slot,id,cached);return}
   const localRows=await getVisitsOffline();
   const local=localRows.find(v=>String(v.id)===String(id));
   if(local&&dataUrl(local.checkInPhoto)){photoCache.set(id,local.checkInPhoto);renderImage(slot,id,local.checkInPhoto);return}
   if(!navigator.onLine)return toast("Foto memerlukan koneksi internet. Riwayat tetap tersedia.");
   if(!token())return toast("Sesi login tidak tersedia. Silakan login kembali.");
   button.disabled=true;button.textContent="Memuat foto...";
   try{
     const data=obj(await rpc("app_pull_visit_photo",{p_token:token(),p_visit_id:String(id)}));
     if(!data.found||!data.checkInPhoto){button.disabled=true;button.textContent="Foto belum tersedia";toast("Foto check-in tidak ditemukan di server.");return}
     photoCache.set(id,data.checkInPhoto);renderImage(slot,id,data.checkInPhoto);
   }catch(e){console.error(e);button.disabled=false;button.textContent="📷 Lihat Foto Check-in";toast(e?.message||"Gagal memuat foto")}
 }
 async function deletePhoto(id,slot,button){
   if(user()?.role!=="admin")return toast("Hanya admin yang dapat menghapus foto");
   if(!confirm("Hapus foto check-in ini? Data kunjungan tetap disimpan."))return;
   button.disabled=true;button.textContent="Menghapus...";
   try{
     const result=await rpc("app_admin_delete_visit_photo_v2",{p_token:token(),p_visit_id:String(id)});
     photoCache.delete(id);
     const rows=await getVisitsOffline(),v=rows.find(x=>String(x.id)===String(id));
     if(v){const next={...v,hasCheckInPhoto:false};delete next.checkInPhoto;await idbPut(STORE_VISITS,next)}
     slot.remove();button.remove();toast(result?.photo_deleted===false?"Foto sudah tidak ada di server":"Foto check-in dihapus");
   }catch(e){button.disabled=false;button.textContent="Hapus Foto";toast(e?.message||"Gagal menghapus foto")}
 }
 async function decorateHistory(){
   try{
     await loadPhotoFlagsForVisibleHistory();
     const rows=await getVisitsOffline(),byId=new Map(rows.map(v=>[String(v.id),v]));
     document.querySelectorAll(".history-card[data-visit-id]").forEach(card=>{
       const id=String(card.getAttribute("data-visit-id")||"");if(!id)return;
       if(card.querySelector(".history-photo-slot"))return;
       const v=byId.get(id);if(!v)return;
       if(v.hasCheckInPhoto!==true&&!dataUrl(v.checkInPhoto))return;
       const slot=document.createElement("div");slot.className="history-photo-slot";
       slot.setAttribute("data-history-photo-slot",id);
       if(dataUrl(v.checkInPhoto)){photoCache.set(id,v.checkInPhoto);renderImage(slot,id,v.checkInPhoto)}
       else{
         const btn=document.createElement("button");
         btn.type="button";btn.className="history-photo-load";btn.textContent="📷 Lihat Foto Check-in";
         btn.addEventListener("click",()=>loadPhoto(id,btn));slot.appendChild(btn);
       }
       const pills=card.querySelector(".pills");
       if(pills)pills.insertAdjacentElement("afterend",slot);else card.prepend(slot);
     });
   }catch(e){console.warn("Foto riwayat belum siap",e)}
 }
 function installCss(){
   if(document.getElementById("rmlPhotoHistoryCss"))return;
   const s=document.createElement("style");s.id="rmlPhotoHistoryCss";
   s.textContent=`
   .history-photo-slot{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:10px 0;width:100%;min-width:0}
   .history-photo-load{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:9px 14px;border:1px solid #b9dcd8;border-radius:12px;background:#eff9f8;color:#0d716a;font-size:12px;font-weight:800;cursor:pointer}
   .history-photo-load:hover{background:#e3f5f3}.history-photo-load:disabled{opacity:.7;cursor:wait}
   .history-photo-slot img.history-photo{display:block;width:min(100%,320px);max-height:260px;height:auto;object-fit:contain;object-position:left center;border-radius:12px;border:1px solid #dce7e5;background:#f7faf9;cursor:zoom-in}
   @media(max-width:560px){.history-photo-load{width:100%}.history-photo-slot img.history-photo{width:100%;max-height:280px}}
   `;
   document.head.appendChild(s);
 }
 const oldRender=window.renderHistory;
 if(typeof oldRender==="function"){
   window.renderHistory=async function(){const r=await oldRender.apply(this,arguments);await decorateHistory();return r};
 }
 window.syncPendingVisits=uploadPhotoAwareSync;
 window.loadHistoryCheckInPhoto=loadPhoto;
 document.addEventListener("DOMContentLoaded",installCss);
 installCss();
 window.RML_PHOTO_HISTORY_VERSION="2.0.5-full-lazy1";
})();
