/* RML Sales Visit v1.8.41 - Promo Bulan Ini: per Penanggung Jawab + kategori */
(function(){
  const KEY='rml_monthly_promo_v3';
  const monthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const monthLabel=m=>{const [y,mo]=String(m).split('-').map(Number);return new Date(y,mo-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})};
  const escP=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const getUser=()=>{try{return currentUser||window.currentUser||null}catch(_){return window.currentUser||null}};
  const isSupervisor=()=>{const u=getUser();return !!(u&&(u.role==='supervisor'||(typeof isSupervisorUser==='function'&&isSupervisorUser(u))))};
  const canManage=()=>{const u=getUser();return !!(u&&(u.role==='admin'||isSupervisor()))};
  const managedUsers=()=>{
  try{
    const list=Array.isArray(USERS)?USERS.slice():[];
    const me=getUser();
    if(me && (me.role==='sales'||me.role==='supervisor') && !list.some(u=>String(u.email||'').toLowerCase()===String(me.email||'').toLowerCase())) list.push(me);
    const defaults=[
      {email:'rini@rml.app',name:'Rini',role:'sales',active:true},
      {email:'lisna@rml.app',name:'Lisna',role:'sales',active:true},
      {email:'septino@rml.app',name:'Septino',role:'supervisor',active:true}
    ];
    defaults.forEach(d=>{if(!list.some(u=>String(u.email||'').toLowerCase()===d.email)) list.push(d)});
    return list.filter(u=>(String(u.role||'').toLowerCase()==='sales'||String(u.role||'').toLowerCase()==='supervisor')&&u.active!==false);
  }catch(_){return []}
};
  const sessionToken=()=>{try{return typeof getSbSession==='function'?getSbSession()?.session_token:null}catch(_){return null}};
  const readLocal=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'?v:{}}catch(_){return {}}};
  const writeLocal=v=>localStorage.setItem(KEY,JSON.stringify(v||{}));
  const normalizeCategories=raw=>{
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray(raw.categories)){
      return raw.categories.map((c,i)=>({name:String(c?.name||`Kategori ${i+1}`).trim()||`Kategori ${i+1}`,items:Array.isArray(c?.items)?c.items.map(x=>String(x).trim()).filter(Boolean):[]})).filter(c=>c.name||c.items.length);
    }
    if(Array.isArray(raw)){
      const old=raw.map(x=>String(x).trim()).filter(Boolean);
      return old.length?[{name:'Umum',items:old}]:[];
    }
    return [];
  };
  const localForOwner=email=>{const all=readLocal(),m=all[monthKey()]||{},raw=m[String(email||'').toLowerCase()];return normalizeCategories(raw)};
  const saveLocal=(email,categories)=>{const all=readLocal(),m=all[monthKey()]||{};m[String(email||'').toLowerCase()]={categories};all[monthKey()]=m;writeLocal(all)};
  let remoteRows=[];let selectedOwnerEmail='';
  function normalizeRows(rows){return (Array.isArray(rows)?rows:[]).map(r=>({monthKey:r.month_key,ownerEmail:String(r.sales_email||'').toLowerCase(),categories:normalizeCategories(r.items),updatedAt:r.updated_at||''}));}
  async function pullRemote(){const token=sessionToken();if(!navigator.onLine||!token)return false;try{const data=await rpc('app_get_monthly_promos',{p_token:token,p_month_key:monthKey()});remoteRows=normalizeRows(data);const all=readLocal(),m={};remoteRows.forEach(r=>{m[r.ownerEmail]={categories:r.categories}});all[monthKey()]=m;writeLocal(all);return true}catch(e){console.warn('Promo remote gagal',e);return false}}
  function categoriesForOwner(email){const key=String(email||'').toLowerCase();const r=remoteRows.find(x=>x.ownerEmail===key&&x.monthKey===monthKey());return r?r.categories:localForOwner(key)}
  function ownerByEmail(email){const key=String(email||'').toLowerCase();return managedUsers().find(u=>String(u.email||'').toLowerCase()===key)||(()=>{const me=getUser();return String(me?.email||'').toLowerCase()===key?me:null})()}
  function userName(email){return ownerByEmail(email)?.name||email||'-'}
  function flatItems(categories){return (categories||[]).flatMap(c=>Array.isArray(c.items)?c.items:[])}
  function openDetail(email){
    const categories=categoriesForOwner(email).filter(c=>c.items.length);
    if(!flatItems(categories).length)return;
    const name=userName(email);
    if(typeof hide==='function')hide();
    const view=document.getElementById('promoCatalogView');
    if(!view)return;
    const ownerEl=document.getElementById('promoCatalogOwner');
    const monthEl=document.getElementById('promoCatalogMonth');
    const list=document.getElementById('promoCatalogList');
    if(ownerEl)ownerEl.textContent=`Promo ${name}`;
    if(monthEl)monthEl.textContent=monthLabel(monthKey());
    if(list)list.innerHTML=categories.map(c=>`<section class="promo-catalog-category"><div class="promo-catalog-category-head"><span>🎁</span><div><strong>${escP(c.name)}</strong><small>${c.items.length} barang promo</small></div></div><div class="promo-catalog-items">${c.items.map((x,i)=>`<div class="promo-catalog-item"><span>${i+1}</span><strong>${escP(x)}</strong></div>`).join('')}</div></section>`).join('');
    view.classList.remove('hidden');
  }
  function closeDetail(){
    document.getElementById('promoCatalogView')?.classList.add('hidden');
    document.getElementById('promoDetailModal')?.classList.add('hidden');
    if(typeof showDashboard==='function')showDashboard();
    else if(typeof showAreaAssignments==='function')showAreaAssignments();
  }
  function salesPromoCard(email){const categories=categoriesForOwner(email),items=flatItems(categories);if(!items.length)return '';const u=ownerByEmail(email);const name=userName(email);const categoryCount=categories.filter(c=>c.items.length).length;return `<button class="dashboard-price-card monthly-promo-card monthly-promo-sales-card" type="button" onclick="openMonthlyPromoDetail('${escP(email)}')"><span class="dashboard-price-icon monthly-promo-icon" aria-hidden="true">🎁</span><span><strong>Promo ${escP(name)}</strong><small>${categoryCount} kategori • ${items.length} barang • ${monthLabel(monthKey())}</small><span class="monthly-promo-list">${categories.filter(c=>c.items.length).slice(0,2).map(c=>`<span class="monthly-promo-category"><b>${escP(c.name)}</b><em>${escP(c.items.slice(0,2).join(' • '))}</em></span>`).join('')}</span></span><span class="dashboard-price-arrow" aria-hidden="true">›</span></button>`}
  function renderCard(){const area=document.getElementById('monthlyPromoArea');if(!area)return;const u=getUser();if(!u||u.role==='admin'){area.innerHTML='';area.classList.add('hidden');return}let html='';if(u.role==='sales')html=salesPromoCard(u.email);else if(isSupervisor())html=managedUsers().map(x=>salesPromoCard(x.email)).filter(Boolean).join('');area.innerHTML=html;area.classList.toggle('hidden',!html)}
  function renderOwnerSelect(){const el=document.getElementById('promoSalesSelect');if(!el)return;const old=selectedOwnerEmail||el.value||managedUsers()[0]?.email||'';el.innerHTML=managedUsers().map(u=>`<option value="${escP(u.email)}">${escP(u.name)}</option>`).join('');selectedOwnerEmail=[...el.options].some(o=>o.value===old)?old:(el.options[0]?.value||'');el.value=selectedOwnerEmail}
  function renderCategories(categories){const host=document.getElementById('promoCategories');if(!host)return;const list=(categories?.length?categories:[{name:'',items:[]}]);host.innerHTML=list.map((c,i)=>`<div class="promo-category-editor" data-index="${i}"><div class="promo-category-head"><label>Kategori ${i+1}</label>${list.length>1?`<button class="danger compact promo-category-delete" type="button" onclick="removePromoCategory(${i})">Hapus</button>`:''}</div><input class="promo-category-name" type="text" value="${escP(c.name||'')}" placeholder="Contoh: Dodo"><label>Barang Promo</label><textarea class="promo-category-items" rows="6" placeholder="Satu baris untuk satu barang promo">${escP((c.items||[]).join('\n'))}</textarea></div>`).join('')}
  function readCategories(){return [...document.querySelectorAll('#promoCategories .promo-category-editor')].map((el,i)=>({name:String(el.querySelector('.promo-category-name')?.value||'').trim(),items:String(el.querySelector('.promo-category-items')?.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}))}
  function addCategory(){const cats=readCategories();cats.push({name:'',items:[]});renderCategories(cats);const inputs=document.querySelectorAll('#promoCategories .promo-category-name');inputs[inputs.length-1]?.focus()}
  function removeCategory(i){const cats=readCategories();if(cats.length<=1)return;cats.splice(i,1);renderCategories(cats)}
  function loadSelectedIntoForm(){renderCategories(categoriesForOwner(selectedOwnerEmail));const meta=document.getElementById('promoSalesLabel');if(meta)meta.textContent=`Penanggung Jawab: ${userName(selectedOwnerEmail)}`;renderSaved()}
  function renderSaved(){const box=document.getElementById('promoSavedList');if(!box)return;const cats=categoriesForOwner(selectedOwnerEmail);box.innerHTML=cats.length?cats.filter(c=>c.items.length).map(c=>`<div class="promo-saved-category"><strong>${escP(c.name)}</strong>${c.items.map((x,i)=>`<div class="promo-saved-item"><span>${i+1}</span><strong>${escP(x)}</strong></div>`).join('')}</div>`).join(''):'<div class="empty">Belum ada promo untuk penanggung jawab ini.</div>'}
  async function showPage(){if(!canManage())return typeof toast==='function'&&toast('Hanya Admin/Supervisor yang dapat mengelola promo');if(typeof hide==='function')hide();document.getElementById('promoView')?.classList.remove('hidden');await pullRemote();renderOwnerSelect();const label=document.getElementById('promoMonthLabel');if(label)label.textContent=monthLabel(monthKey());loadSelectedIntoForm()}
  function handleOwnerChange(){selectedOwnerEmail=document.getElementById('promoSalesSelect')?.value||'';loadSelectedIntoForm()}
  async function savePage(){if(!canManage())return;const categories=readCategories().filter(c=>c.name||c.items.length);if(!selectedOwnerEmail)return toast('Pilih penanggung jawab terlebih dahulu');if(!categories.length)return toast('Isi minimal satu kategori dengan barang promo');if(categories.some(c=>c.items.length&&!c.name))return toast('Nama kategori wajib diisi');saveLocal(selectedOwnerEmail,categories);const token=sessionToken();try{if(!navigator.onLine||!token)throw new Error('Promo memerlukan koneksi internet agar tersimpan untuk semua perangkat');await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:selectedOwnerEmail,p_items:{categories}});await pullRemote();loadSelectedIntoForm();renderCard();toast(`Promo untuk ${userName(selectedOwnerEmail)} berhasil disimpan`)}catch(e){toast(`Gagal menyimpan promo: ${e.message||'periksa SQL Supabase'}`)}}
  async function clearPage(){if(!canManage()||!selectedOwnerEmail)return;if(!confirm('Hapus promo bulan ini untuk penanggung jawab yang dipilih?'))return;const token=sessionToken();try{if(!navigator.onLine||!token)throw new Error('Memerlukan internet');await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:selectedOwnerEmail,p_items:{categories:[]}});saveLocal(selectedOwnerEmail,[]);await pullRemote();loadSelectedIntoForm();renderCard();toast('Promo dihapus')}catch(e){toast(`Gagal menghapus promo: ${e.message||'periksa koneksi'}`)}}
  window.showPromoManagementPage=showPage;window.closePromoManagementPage=()=>{if(typeof showAreaAssignments==='function')showAreaAssignments();else if(typeof showDashboard==='function')showDashboard()};window.saveMonthlyPromo=savePage;window.clearMonthlyPromo=clearPage;window.handlePromoSalesChange=handleOwnerChange;window.addPromoCategory=addCategory;window.removePromoCategory=removeCategory;window.openMonthlyPromoDetail=openDetail;window.closePromoDetailModal=closeDetail;window.closePromoCatalog=closeDetail;window.renderMonthlyPromoCard=renderCard;window.pullMonthlyPromos=pullRemote;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{await pullRemote();renderCard()},0));
  const oldOpenApp=window.openApp;window.openApp=function(){const r=oldOpenApp?oldOpenApp.apply(this,arguments):undefined;setTimeout(async()=>{await pullRemote();renderCard()},300);return r};
  const oldRefresh=window.refreshDashboard;if(oldRefresh)window.refreshDashboard=async function(){const r=await oldRefresh.apply(this,arguments);await pullRemote();renderCard();return r};
})();
