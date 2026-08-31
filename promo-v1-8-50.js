/* RML Sales Visit v2.00 - Promo catalog with external Google Drive images
   Images are referenced by URL only; no image file is uploaded to Supabase. */
(function(){
  const KEY='rml_monthly_promo_v4';
  const OLD_KEY='rml_monthly_promo_v3';
  const CACHE_KEY='rml_monthly_promo_remote_cache_v2';
  const monthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const monthLabel=m=>{const [y,mo]=String(m).split('-').map(Number);return new Date(y,mo-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})};
  const escP=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const escAttr=v=>escP(v).replace(/`/g,'&#96;');
  const getUser=()=>{try{return currentUser||window.currentUser||null}catch(_){return window.currentUser||null}};
  const isSupervisor=()=>{const u=getUser();return !!(u&&(u.role==='supervisor'||(typeof isSupervisorUser==='function'&&isSupervisorUser(u))))};
  const canManage=()=>{const u=getUser();return !!(u&&(u.role==='admin'||isSupervisor()))};
  const managedUsers=()=>{try{
    const list=Array.isArray(USERS)?USERS.slice():[]; const me=getUser();
    if(me && (me.role==='sales'||me.role==='supervisor') && !list.some(u=>String(u.email||'').toLowerCase()===String(me.email||'').toLowerCase())) list.push(me);
    const defaults=[{email:'rini@rml.app',name:'Rini',role:'sales',active:true},{email:'lisna@rml.app',name:'Lisna',role:'sales',active:true},{email:'septino@rml.app',name:'Septino',role:'supervisor',active:true}];
    defaults.forEach(d=>{if(!list.some(u=>String(u.email||'').toLowerCase()===d.email)) list.push(d)});
    return list.filter(u=>(String(u.role||'').toLowerCase()==='sales'||String(u.role||'').toLowerCase()==='supervisor')&&u.active!==false);
  }catch(_){return []}};
  const sessionToken=()=>{try{return typeof getSbSession==='function'?getSbSession()?.session_token:null}catch(_){return null}};

  function normalizeItem(x){if(typeof x==='string')return {name:String(x).trim()};return {name:String(x?.name||'').trim()};}

  const normalizeCategories=raw=>{
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray(raw.categories)) return raw.categories.map((c,i)=>({
      name:String(c?.name||`Kategori ${i+1}`).trim(),
      items:Array.isArray(c?.items)?c.items.map(normalizeItem).filter(x=>x.name):[]
    })).filter(c=>c.name||c.items.length);
    if(Array.isArray(raw)){const old=raw.map(normalizeItem).filter(x=>x.name);return old.length?[{name:'Umum',items:old}]:[]}
    return [];
  };
  const readLocal=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){return {}}};
  const writeLocal=v=>localStorage.setItem(KEY,JSON.stringify(v||{}));
  const migrateOld=()=>{try{if(localStorage.getItem(KEY))return;const old=JSON.parse(localStorage.getItem(OLD_KEY)||'{}');if(old&&typeof old==='object'){writeLocal(old)}}catch(_) {}};
  migrateOld();
  let remoteRows=[]; let masterCards=[]; let lastPullAt=0;
  function normalizeRows(rows){const allowed=new Set(managedUsers().map(u=>String(u.email||'').toLowerCase()).filter(Boolean));return (Array.isArray(rows)?rows:[]).map(r=>({monthKey:r.month_key,ownerEmail:String(r.sales_email||'').toLowerCase(),categories:normalizeCategories(r.items),updatedAt:r.updated_at||''})).filter(r=>r.monthKey===monthKey()&&r.ownerEmail&&allowed.has(r.ownerEmail))}
  function hydrateFromLocal(){const all=readLocal(),m=all[monthKey()]||{};remoteRows=Object.entries(m).map(([email,v])=>({monthKey:monthKey(),ownerEmail:String(email).toLowerCase(),categories:normalizeCategories(v)}));}
  async function pullRemote(force=false){
    const now=Date.now(); if(!force&&lastPullAt&&now-lastPullAt<120000)return true;
    hydrateFromLocal(); const token=sessionToken(); if(!navigator.onLine||!token)return false;
    try{const data=await rpc('app_get_monthly_promos',{p_token:token,p_month_key:monthKey()});remoteRows=normalizeRows(data);const all=readLocal(),m={};remoteRows.forEach(r=>{m[r.ownerEmail]={categories:r.categories}});all[monthKey()]=m;writeLocal(all);lastPullAt=Date.now();localStorage.setItem(CACHE_KEY,JSON.stringify({monthKey:monthKey(),at:lastPullAt}));return true}catch(e){console.warn('Promo remote gagal',e);return false}
  }
  function userName(email){const key=String(email||'').toLowerCase();const u=managedUsers().find(x=>String(x.email||'').toLowerCase()===key);return u?.name||email||'-'}
  function allAssignees(){return managedUsers()}
  
  function signature(c){return `${String(c.name||'').trim().toLowerCase()}\n${(c.items||[]).map(normalizeItem).map(x=>x.name).join('\n').toLowerCase()}`}
  function buildMasterCards(){const map=new Map();remoteRows.forEach(r=>r.categories.forEach(c=>{if(!c.name&&!c.items.length)return;const key=signature(c);let card=map.get(key);if(!card){card={name:c.name,items:c.items.map(normalizeItem),assignees:[]};map.set(key,card)}if(!card.assignees.includes(r.ownerEmail))card.assignees.push(r.ownerEmail)}));masterCards=[...map.values()]}
  function itemEditorHtml(item,i){const x=normalizeItem(item);return `<div class="promo-item-editor" data-item-index="${i}"><div class="promo-item-editor-fields"><label>Nama Barang<input class="promo-item-name" type="text" value="${escAttr(x.name)}" placeholder="Contoh: Dodo 11"></label></div><button class="danger compact promo-item-delete" type="button" onclick="removePromoItem(this)">Hapus</button></div>`}
  function addMasterPromo(){masterCards.push({name:'',items:[{name:''}],assignees:[]});renderMasterCards();setTimeout(()=>{const cards=document.querySelectorAll('.promo-master-card');cards[cards.length-1]?.scrollIntoView({behavior:'smooth',block:'center'});cards[cards.length-1]?.querySelector('.promo-master-name')?.focus()},30)}
  function addPromoItem(i){const card=masterCards[i];if(!card)return;const current=readMasterCards();if(current[i])masterCards[i]={...card,...current[i]};masterCards[i].items.push({name:''});renderMasterCards();setTimeout(()=>{const el=document.querySelectorAll('.promo-master-card')[i];el?.querySelectorAll('.promo-item-name')[masterCards[i].items.length-1]?.focus()},20)}
  function removePromoItem(btn){const card=btn.closest('.promo-master-card');if(!card)return;const i=Number(card.dataset.promoIndex);const j=Number(btn.closest('.promo-item-editor')?.dataset.itemIndex);const current=readMasterCards();if(!current[i])return;current[i].items.splice(j,1);masterCards=current;renderMasterCards()}
  function readMasterCards(){return [...document.querySelectorAll('.promo-master-card')].map(el=>({name:String(el.querySelector('.promo-master-name')?.value||'').trim(),items:[...el.querySelectorAll('.promo-item-editor')].map(row=>({name:String(row.querySelector('.promo-item-name')?.value||'').trim()})).filter(x=>x.name),assignees:[...el.querySelectorAll('.promo-assignees input[type=checkbox]:checked')].map(x=>x.value.toLowerCase())})).filter(c=>c.name||c.items.length||c.assignees.length)}
  async function removeMasterPromo(i){const cards=readMasterCards();if(!cards[i])return;if(!confirm(`Hapus promo ${cards[i].name||''}?`))return;cards.splice(i,1);const token=sessionToken();if(!navigator.onLine||!token)return toast('Memerlukan internet');const byOwner={};cards.forEach(c=>c.assignees.forEach(e=>{(byOwner[e]??=[]).push({name:c.name,items:c.items})}));try{const owners=new Set(remoteRows.map(r=>r.ownerEmail));for(const email of owners)await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:email,p_items:{categories:byOwner[email]||[]}});remoteRows=remoteRows.map(r=>({...r,categories:byOwner[r.ownerEmail]||[]})).filter(r=>r.categories.length);const all=readLocal(),m={};remoteRows.forEach(r=>{m[r.ownerEmail]={categories:r.categories}});all[monthKey()]=m;writeLocal(all);buildMasterCards();renderMasterCards();renderSaved();renderCard();toast('Promo dihapus')}catch(e){toast(`Gagal menghapus promo: ${e.message||'periksa koneksi'}`)}}
  function cardsForOwner(email){const key=String(email||'').toLowerCase();const r=remoteRows.find(x=>x.ownerEmail===key);return r?.categories||[]}
  function openDetail(email){const cats=cardsForOwner(email).filter(c=>c.items.length);if(!cats.length)return;const view=document.getElementById('promoCatalogView');if(!view)return;if(typeof hide==='function')hide();document.getElementById('promoCatalogOwner').textContent='Promo';document.getElementById('promoCatalogMonth').textContent=monthLabel(monthKey());document.getElementById('promoCatalogList').innerHTML=cats.map(c=>`<section class="promo-catalog-category"><div class="promo-catalog-category-head"><span>🎁</span><div><strong>${escP(c.name)}</strong><small>${c.items.length} barang promo</small></div></div><div class="promo-catalog-items">${c.items.map((x,i)=>{const it=normalizeItem(x),img=imageUrl(it.image);return `<div class="promo-catalog-item">${img?`<img class="promo-catalog-image" src="${escAttr(img)}" alt="${escAttr(it.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:''}<span>${i+1}</span><strong>${escP(it.name)}</strong></div>`}).join('')}</div></section>`).join('');view.classList.remove('hidden')}
  function closeDetail(){document.getElementById('promoCatalogView')?.classList.add('hidden');if(typeof showDashboard==='function')showDashboard();else if(typeof showAreaAssignments==='function')showAreaAssignments()}
  function salesPromoCard(email){const cats=cardsForOwner(email),items=cats.flatMap(c=>c.items||[]);if(!items.length)return '';return `<button class="dashboard-price-card monthly-promo-card monthly-promo-sales-card" type="button" onclick="openMonthlyPromoDetail('${escAttr(email)}')"><span class="dashboard-price-icon monthly-promo-icon" aria-hidden="true">🎁</span><span><strong>Promo</strong><small>${cats.length} kategori • ${items.length} barang • ${monthLabel(monthKey())}</small><em class="monthly-promo-generic-note">Lihat semua barang promo</em></span><span class="dashboard-price-arrow">›</span></button>`}
  function renderCard(){const area=document.getElementById('monthlyPromoArea');if(!area)return;const u=getUser();if(!u||u.role==='admin'){area.innerHTML='';area.classList.add('hidden');return}let html='';if(u.role==='sales'||u.role==='supervisor')html=salesPromoCard(u.email);if(isSupervisor()&&u.role!=='sales'){const managed=managedUsers().filter(x=>String(x.email||'').toLowerCase()!==String(u.email||'').toLowerCase());html+=managed.map(x=>salesPromoCard(x.email)).filter(Boolean).join('')}area.innerHTML=html;area.classList.toggle('hidden',!html)}
  window.showPromoManagementPage=showPage;window.closePromoManagementPage=()=>{if(typeof showAreaAssignments==='function')showAreaAssignments();else if(typeof showDashboard==='function')showDashboard()};window.saveMonthlyPromo=savePage;window.addMasterPromo=addMasterPromo;window.removeMasterPromo=removeMasterPromo;window.addPromoItem=addPromoItem;window.removePromoItem=removePromoItem;window.openMonthlyPromoDetail=openDetail;window.closePromoDetailModal=closeDetail;window.closePromoCatalog=closeDetail;window.renderMonthlyPromoCard=renderCard;window.pullMonthlyPromos=pullRemote;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{hydrateFromLocal();renderCard();await pullRemote(false);renderCard()},0));
  const oldOpenApp=window.openApp;window.openApp=function(){const r=oldOpenApp?oldOpenApp.apply(this,arguments):undefined;setTimeout(async()=>{hydrateFromLocal();renderCard();await pullRemote(false);renderCard()},300);return r};
  const oldRefresh=window.refreshDashboard;if(oldRefresh)window.refreshDashboard=async function(){const r=await oldRefresh.apply(this,arguments);await pullRemote(false);renderCard();return r};
})();
