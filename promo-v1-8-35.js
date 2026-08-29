/* RML Sales Visit v1.8.38 - Promo Bulan Ini per Sales + dashboard detail */
(function(){
  const KEY='rml_monthly_promo_v2';
  const monthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const monthLabel=m=>{const [y,mo]=String(m).split('-').map(Number);return new Date(y,mo-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})};
  const escP=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const getUser=()=>{try{return currentUser||window.currentUser||null}catch(_){return window.currentUser||null}};
  const isSupervisor=()=>{const u=getUser();return !!(u&&(u.role==='supervisor'||(typeof isSupervisorUser==='function'&&isSupervisorUser(u))))};
  const canManage=()=>{const u=getUser();return !!(u&&(u.role==='admin'||isSupervisor()))};
  const salesUsers=()=>{try{return (USERS||[]).filter(u=>u.role==='sales'&&u.active!==false)}catch(_){return []}};
  const sessionToken=()=>{try{return typeof getSbSession==='function'?getSbSession()?.session_token:null}catch(_){return null}};
  const readLocal=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'?v:{}}catch(_){return {}}};
  const writeLocal=v=>localStorage.setItem(KEY,JSON.stringify(v||{}));
  const localForSales=email=>{const all=readLocal(),m=all[monthKey()]||{};return Array.isArray(m[email])?m[email].filter(x=>String(x).trim()):[]};
  let remoteRows=[];
  let selectedSalesEmail='';
  function normalizeRows(rows){return (Array.isArray(rows)?rows:[]).map(r=>({monthKey:r.month_key,salesEmail:String(r.sales_email||'').toLowerCase(),items:Array.isArray(r.items)?r.items.filter(x=>String(x).trim()):[]}));}
  async function pullRemote(){
    const token=sessionToken(); if(!navigator.onLine||!token)return false;
    try{const data=await rpc('app_get_monthly_promos',{p_token:token,p_month_key:monthKey()});remoteRows=normalizeRows(data);const all=readLocal(),m={};remoteRows.forEach(r=>{m[r.salesEmail]=r.items});all[monthKey()]=m;writeLocal(all);return true;}catch(e){console.warn('Promo remote gagal',e);return false}
  }
  function currentForSales(email){const key=String(email||'').toLowerCase();const r=remoteRows.find(x=>x.salesEmail===key&&x.monthKey===monthKey());return r?r.items:localForSales(key)}
  function saveLocal(email,items){const all=readLocal(),m=all[monthKey()]||{};m[email]=items;all[monthKey()]=m;writeLocal(all)}
  function userName(email){return salesUsers().find(u=>String(u.email||'').toLowerCase()===String(email||'').toLowerCase())?.name||email||'-'}
  function openDetail(email){
    const items=currentForSales(email);if(!items.length)return;
    const name=userName(email);
    const salesEl=document.getElementById('promoDetailSales');if(salesEl)salesEl.textContent=name;
    const monthEl=document.getElementById('promoDetailMonth');if(monthEl)monthEl.textContent=monthLabel(monthKey());
    const list=document.getElementById('promoDetailList');if(list)list.innerHTML=items.map((x,i)=>`<div class="promo-detail-item"><span>${i+1}</span><strong>${escP(x)}</strong></div>`).join('');
    document.getElementById('promoDetailModal')?.classList.remove('hidden');
  }
  function closeDetail(){document.getElementById('promoDetailModal')?.classList.add('hidden')}
  function salesPromoCard(email){
    const items=currentForSales(email);if(!items.length)return '';
    const name=userName(email);
    return `<button class="dashboard-price-card monthly-promo-card monthly-promo-sales-card" type="button" onclick="openMonthlyPromoDetail('${escP(email)}')">\n      <span class="dashboard-price-icon monthly-promo-icon" aria-hidden="true">🎁</span>\n      <span><strong>Promo ${escP(name)}</strong><small>${items.length} barang promo • ${monthLabel(monthKey())}</small><span class="monthly-promo-list">${items.slice(0,3).map((x,i)=>`<span class="monthly-promo-item"><span>${i+1}</span><strong>${escP(x)}</strong></span>`).join('')}</span></span>\n      <span class="dashboard-price-arrow" aria-hidden="true">›</span>\n    </button>`;
  }
  function renderCard(){
    const area=document.getElementById('monthlyPromoArea');if(!area)return;
    const u=getUser();
    // Admin tidak menampilkan promo di Dashboard. Promo tetap dikelola dari Pengaturan.
    if(!u||u.role==='admin'){area.innerHTML='';area.classList.add('hidden');return;}
    let html='';
    if(u.role==='sales') html=salesPromoCard(u.email);
    else if(isSupervisor()) html=salesUsers().map(x=>salesPromoCard(x.email)).filter(Boolean).join('');
    area.innerHTML=html;
    area.classList.toggle('hidden',!html);
  }
  function renderSalesSelect(){
    const el=document.getElementById('promoSalesSelect');if(!el)return;
    const old=selectedSalesEmail||el.value||salesUsers()[0]?.email||'';
    el.innerHTML=salesUsers().map(u=>`<option value="${escP(u.email)}">${escP(u.name)}</option>`).join('');
    selectedSalesEmail=[...el.options].some(o=>o.value===old)?old:(el.options[0]?.value||'');el.value=selectedSalesEmail;
  }
  function loadSelectedIntoForm(){
    const input=document.getElementById('promoItemsInput');if(input)input.value=currentForSales(selectedSalesEmail).join('\n');
    const meta=document.getElementById('promoSalesLabel');if(meta)meta.textContent=`Sales: ${userName(selectedSalesEmail)}`;renderSaved();
  }
  function renderSaved(){const box=document.getElementById('promoSavedList');if(!box)return;const items=currentForSales(selectedSalesEmail);box.innerHTML=items.length?items.map((x,i)=>`<div class="promo-saved-item"><span>${i+1}</span><strong>${escP(x)}</strong></div>`).join(''):'<div class="empty">Belum ada barang promo untuk sales ini.</div>';}
  async function showPage(){
    if(!canManage())return typeof toast==='function'&&toast('Hanya Admin/Supervisor yang dapat mengelola promo');
    if(typeof hide==='function')hide();document.getElementById('promoView')?.classList.remove('hidden');
    await pullRemote();renderSalesSelect();const label=document.getElementById('promoMonthLabel');if(label)label.textContent=monthLabel(monthKey());loadSelectedIntoForm();
  }
  function handleSalesChange(){selectedSalesEmail=document.getElementById('promoSalesSelect')?.value||'';loadSelectedIntoForm();}
  async function savePage(){
    if(!canManage())return;const items=String(document.getElementById('promoItemsInput')?.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!selectedSalesEmail)return toast('Pilih sales terlebih dahulu');
    saveLocal(selectedSalesEmail,items);const token=sessionToken();
    try{if(!navigator.onLine||!token)throw new Error('Promo memerlukan koneksi internet agar tersimpan untuk semua perangkat');await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:selectedSalesEmail,p_items:items});await pullRemote();renderSaved();renderCard();toast(`Promo untuk ${userName(selectedSalesEmail)} berhasil disimpan`)}catch(e){toast(`Gagal menyimpan promo: ${e.message||'periksa SQL Supabase'}`)}
  }
  async function clearPage(){
    if(!canManage()||!selectedSalesEmail)return;if(!confirm('Hapus promo bulan ini untuk sales yang dipilih?'))return;
    const token=sessionToken();try{if(!navigator.onLine||!token)throw new Error('Memerlukan internet');await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:selectedSalesEmail,p_items:[]});saveLocal(selectedSalesEmail,[]);await pullRemote();loadSelectedIntoForm();renderCard();toast('Promo sales dihapus')}catch(e){toast(`Gagal menghapus promo: ${e.message||'periksa koneksi'}`)}
  }
  function handleCardClick(){const u=getUser();if(u?.role==='sales')openDetail(u.email);else if(isSupervisor()&&!canManage())return;else if(canManage())showPage();}
  window.showPromoManagementPage=showPage;window.closePromoManagementPage=()=>{if(typeof showAreaAssignments==='function')showAreaAssignments();else if(typeof showDashboard==='function')showDashboard()};window.saveMonthlyPromo=savePage;window.clearMonthlyPromo=clearPage;window.handlePromoSalesChange=handleSalesChange;window.handlePromoCardClick=handleCardClick;window.openMonthlyPromoDetail=openDetail;window.closePromoDetailModal=closeDetail;window.renderMonthlyPromoCard=renderCard;window.pullMonthlyPromos=pullRemote;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{await pullRemote();renderCard()},0));
  const oldOpenApp=window.openApp;window.openApp=function(){const r=oldOpenApp?oldOpenApp.apply(this,arguments):undefined;setTimeout(async()=>{await pullRemote();renderCard()},300);return r};
  const oldRefresh=window.refreshDashboard;if(oldRefresh)window.refreshDashboard=async function(){const r=await oldRefresh.apply(this,arguments);await pullRemote();renderCard();return r};
})();
