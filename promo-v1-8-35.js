/* RML Sales Visit v1.8.39 - Promo per Penanggung Jawab + kategori */
(function(){
  const KEY='rml_monthly_promo_v3';
  const monthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const monthLabel=m=>{const [y,mo]=String(m).split('-').map(Number);return new Date(y,mo-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})};
  const escP=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const getUser=()=>{try{return currentUser||window.currentUser||null}catch(_){return window.currentUser||null}};
  const isSupervisor=()=>{const u=getUser();return !!(u&&(u.role==='supervisor'||(typeof isSupervisorUser==='function'&&isSupervisorUser(u))))};
  const canManage=()=>{const u=getUser();return !!(u&&(u.role==='admin'||isSupervisor()))};
  const allManagers=()=>{try{return (USERS||[]).filter(u=>(u.role==='sales'||u.role==='supervisor')&&u.active!==false)}catch(_){return []}};
  const sessionToken=()=>{try{return typeof getSbSession==='function'?getSbSession()?.session_token:null}catch(_){return null}};
  const readLocal=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'?v:{}}catch(_){return {}}};
  const writeLocal=v=>localStorage.setItem(KEY,JSON.stringify(v||{}));
  const normalizeItem=x=>{
    if(x&&typeof x==='object'&&!Array.isArray(x)){
      const category=String(x.category||'Umum').trim()||'Umum';
      const items=Array.isArray(x.items)?x.items.map(v=>String(v).trim()).filter(Boolean):[];
      return {category,items};
    }
    const text=String(x??'').trim(); return text?{category:'Umum',items:[text]}:null;
  };
  const normalizeItems=arr=>{
    const groups=[]; const src=Array.isArray(arr)?arr:[];
    src.forEach(x=>{const n=normalizeItem(x);if(!n||!n.items.length)return;let g=groups.find(v=>v.category.toLowerCase()===n.category.toLowerCase());if(!g){g={category:n.category,items:[]};groups.push(g)};n.items.forEach(i=>{if(!g.items.includes(i))g.items.push(i)})});
    return groups;
  };
  const readLocalFor=email=>normalizeItems((readLocal()[monthKey()]||{})[String(email||'').toLowerCase()]||[]);
  let remoteRows=[]; let selectedOwnerEmail='';
  function normalizeRows(rows){return (Array.isArray(rows)?rows:[]).map(r=>({monthKey:r.month_key,ownerEmail:String(r.sales_email||'').toLowerCase(),groups:normalizeItems(r.items)}));}
  async function pullRemote(){
    const token=sessionToken(); if(!navigator.onLine||!token)return false;
    try{const data=await rpc('app_get_monthly_promos',{p_token:token,p_month_key:monthKey()});remoteRows=normalizeRows(data);const all=readLocal(),m={};remoteRows.forEach(r=>{m[r.ownerEmail]=r.groups});all[monthKey()]=m;writeLocal(all);return true;}catch(e){console.warn('Promo remote gagal',e);return false}
  }
  function currentForOwner(email){const key=String(email||'').toLowerCase();const r=remoteRows.find(x=>x.ownerEmail===key&&x.monthKey===monthKey());return r?r.groups:readLocalFor(key)}
  function saveLocal(email,groups){const all=readLocal(),m=all[monthKey()]||{};m[String(email).toLowerCase()]=groups;all[monthKey()]=m;writeLocal(all)}
  function ownerName(email){return allManagers().find(u=>String(u.email||'').toLowerCase()===String(email||'').toLowerCase())?.name||email||'-'}
  function ownerRole(email){return allManagers().find(u=>String(u.email||'').toLowerCase()===String(email||'').toLowerCase())?.role||'sales'}
  function flatCount(groups){return normalizeItems(groups).reduce((n,g)=>n+g.items.length,0)}
  function groupsToText(groups){return normalizeItems(groups).map(g=>`[${g.category}]\n${g.items.join('\n')}`).join('\n\n')}
  function parseLegacyText(text){
    const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean); const groups=[]; let current=null;
    lines.forEach(line=>{const m=line.match(/^\[(.+)\]$/);if(m){current={category:m[1].trim()||'Umum',items:[]};groups.push(current)}else{if(!current){current={category:'Umum',items:[]};groups.push(current)}current.items.push(line)}});
    return normalizeItems(groups);
  }
  function openDetail(email){
    const groups=currentForOwner(email);if(!groups.length)return;
    const salesEl=document.getElementById('promoDetailSales');if(salesEl)salesEl.textContent=ownerName(email);
    const monthEl=document.getElementById('promoDetailMonth');if(monthEl)monthEl.textContent=monthLabel(monthKey());
    const list=document.getElementById('promoDetailList');
    if(list)list.innerHTML=groups.map(g=>`<div class="promo-detail-group"><h4>${escP(g.category)}</h4>${g.items.map((x,i)=>`<div class="promo-detail-item"><span>${i+1}</span><strong>${escP(x)}</strong></div>`).join('')}</div>`).join('');
    document.getElementById('promoDetailModal')?.classList.remove('hidden');
  }
  function closeDetail(){document.getElementById('promoDetailModal')?.classList.add('hidden')}
  function card(email){
    const groups=currentForOwner(email);if(!groups.length)return '';
    const count=flatCount(groups); const role=ownerRole(email); const name=ownerName(email);
    return `<button class="dashboard-price-card monthly-promo-card monthly-promo-sales-card" type="button" onclick="openMonthlyPromoDetail('${escP(email)}')"><span class="dashboard-price-icon monthly-promo-icon" aria-hidden="true">🎁</span><span><strong>Promo ${escP(name)}</strong><small>${count} barang • ${groups.length} kategori • ${monthLabel(monthKey())}</small><span class="monthly-promo-list">${groups.slice(0,3).map(g=>`<span class="monthly-promo-item"><b>${escP(g.category)}</b><span>${escP(g.items.slice(0,2).join(' • '))}</span></span>`).join('')}</span></span><span class="dashboard-price-arrow" aria-hidden="true">›</span></button>`;
  }
  function renderCard(){
    const area=document.getElementById('monthlyPromoArea');if(!area)return;const u=getUser();
    if(!u||u.role==='admin'){area.innerHTML='';area.classList.add('hidden');return}
    const owners=u.role==='sales'?[u]:allManagers(); const html=owners.map(x=>card(x.email)).filter(Boolean).join(''); area.innerHTML=html;area.classList.toggle('hidden',!html);
  }
  function renderOwnerSelect(){
    const el=document.getElementById('promoSalesSelect');if(!el)return;const old=selectedOwnerEmail||el.value||allManagers()[0]?.email||'';
    el.innerHTML=allManagers().map(u=>`<option value="${escP(u.email)}">${escP(u.name)} — ${u.role==='supervisor'?'Supervisor':'Sales'}</option>`).join('');selectedOwnerEmail=[...el.options].some(o=>o.value===old)?old:(el.options[0]?.value||'');el.value=selectedOwnerEmail;
  }
  function renderEditor(groups){
    const box=document.getElementById('promoCategoryEditor');if(!box)return;
    const gs=normalizeItems(groups); if(!gs.length)gs.push({category:'',items:[]});
    box.innerHTML=gs.map((g,i)=>`<div class="promo-category-row"><div class="promo-category-head"><label>Kategori ${i+1}</label>${gs.length>1?`<button type="button" class="danger compact" onclick="removePromoCategory(${i})">Hapus</button>`:''}</div><input class="promo-category-name" value="${escP(g.category)}" placeholder="Contoh: Dodo"><label>Barang Promo</label><textarea class="promo-category-items" rows="4" placeholder="1 baris = 1 barang promo">${escP(g.items.join('\n'))}</textarea></div>`).join('');
  }
  function readEditor(){return [...document.querySelectorAll('.promo-category-row')].map(row=>({category:row.querySelector('.promo-category-name')?.value.trim()||'Umum',items:String(row.querySelector('.promo-category-items')?.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)})).filter(g=>g.items.length);}
  function loadForm(){const groups=currentForOwner(selectedOwnerEmail);const label=document.getElementById('promoSalesLabel');if(label)label.textContent=`Penanggung Jawab: ${ownerName(selectedOwnerEmail)}`;renderEditor(groups);renderSaved(groups)}
  function renderSaved(groups){const box=document.getElementById('promoSavedList');if(!box)return;const gs=normalizeItems(groups);box.innerHTML=gs.length?gs.map(g=>`<div class="promo-saved-category"><strong>${escP(g.category)}</strong>${g.items.map((x,i)=>`<div class="promo-saved-item"><span>${i+1}</span><b>${escP(x)}</b></div>`).join('')}</div>`).join(''):'<div class="empty">Belum ada promo untuk penanggung jawab ini.</div>'}
  function addCategory(){const box=document.getElementById('promoCategoryEditor');if(!box)return;const current=readEditor();current.push({category:'',items:[]});renderEditor(current);box.lastElementChild?.querySelector('.promo-category-name')?.focus()}
  function removeCategory(i){const current=readEditor();current.splice(i,1);renderEditor(current)}
  async function showPage(){if(!canManage())return toast('Hanya Admin/Supervisor yang dapat mengelola promo');if(typeof hide==='function')hide();document.getElementById('promoView')?.classList.remove('hidden');await pullRemote();renderOwnerSelect();const label=document.getElementById('promoMonthLabel');if(label)label.textContent=monthLabel(monthKey());loadForm()}
  function handleOwnerChange(){selectedOwnerEmail=document.getElementById('promoSalesSelect')?.value||'';loadForm()}
  async function savePage(){
    if(!canManage())return;const groups=readEditor();if(!selectedOwnerEmail)return toast('Pilih penanggung jawab terlebih dahulu');if(!groups.length)return toast('Isi minimal satu kategori dan satu barang promo');
    saveLocal(selectedOwnerEmail,groups);const token=sessionToken();try{if(!navigator.onLine||!token)throw new Error('Promo memerlukan koneksi internet agar tersimpan untuk semua perangkat');await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:selectedOwnerEmail,p_items:groups});await pullRemote();loadForm();renderCard();toast(`Promo untuk ${ownerName(selectedOwnerEmail)} berhasil disimpan`)}catch(e){toast(`Gagal menyimpan promo: ${e.message||'periksa SQL Supabase'}`)}}
  async function clearPage(){if(!canManage()||!selectedOwnerEmail)return;if(!confirm('Hapus promo bulan ini untuk penanggung jawab yang dipilih?'))return;const token=sessionToken();try{if(!navigator.onLine||!token)throw new Error('Memerlukan internet');await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:selectedOwnerEmail,p_items:[]});saveLocal(selectedOwnerEmail,[]);await pullRemote();loadForm();renderCard();toast('Promo dihapus')}catch(e){toast(`Gagal menghapus promo: ${e.message||'periksa koneksi'}`)}}
  window.showPromoManagementPage=showPage;window.closePromoManagementPage=()=>{if(typeof showAreaAssignments==='function')showAreaAssignments();else if(typeof showDashboard==='function')showDashboard()};window.saveMonthlyPromo=savePage;window.clearMonthlyPromo=clearPage;window.handlePromoSalesChange=handleOwnerChange;window.openMonthlyPromoDetail=openDetail;window.closePromoDetailModal=closeDetail;window.renderMonthlyPromoCard=renderCard;window.pullMonthlyPromos=pullRemote;window.addPromoCategory=addCategory;window.removePromoCategory=removeCategory;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{pullRemote().finally(renderCard)},150));
  const oldOpenApp=window.openApp;window.openApp=function(){const r=oldOpenApp?oldOpenApp.apply(this,arguments):undefined;setTimeout(()=>{pullRemote().finally(renderCard)},500);return r};
  const oldRefresh=window.refreshDashboard;window.refreshDashboard=async function(){const r=oldRefresh?await oldRefresh.apply(this,arguments):undefined;await pullRemote();renderCard();return r};
})();
