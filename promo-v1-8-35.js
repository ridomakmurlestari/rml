/* RML Sales Visit v1.8.35 - Promo Bulan Ini */
(function(){
  const KEY='rml_monthly_promo_v1';
  const monthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const escP=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const getUser=()=>{try{return currentUser||window.currentUser||null}catch(_){return window.currentUser||null}};
  const canManage=()=>{const u=getUser();return !!(u&&(u.role==='admin'||u.role==='supervisor'||(typeof isSupervisorUser==='function'&&isSupervisorUser(u))))};
  const monthLabel=m=>{const [y,mo]=String(m).split('-').map(Number);return new Date(y,mo-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})};
  function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'?v:{}}catch(_){return {}}}
  function current(){const m=monthKey(),v=read()[m];return Array.isArray(v)?v.filter(x=>String(x).trim()):[]}
  function save(items){const all=read();all[monthKey()]=items.map(x=>String(x).trim()).filter(Boolean);localStorage.setItem(KEY,JSON.stringify(all));return all[monthKey()]}
  function promoCardHtml(){
    const items=current();
    const card=document.getElementById('monthlyPromoCard');
    if(!card)return;
    card.classList.toggle('hidden',items.length===0);
    const list=document.getElementById('monthlyPromoList');
    if(list)list.innerHTML=items.map((x,i)=>`<div class="monthly-promo-item"><span>${i+1}</span><strong>${escP(x)}</strong></div>`).join('');
    const sub=document.getElementById('monthlyPromoSubtitle');
    if(sub)sub.textContent=items.length?`${items.length} barang promo • ${monthLabel(monthKey())}`:'Promo bulan ini belum diatur';
  }
  function showPage(){
    if(!canManage())return typeof toast==='function'&&toast('Hanya Admin/Supervisor yang dapat mengelola promo');
    if(typeof hide==='function')hide();
    document.getElementById('promoView')?.classList.remove('hidden');
    const input=document.getElementById('promoItemsInput');
    if(input)input.value=current().join('\n');
    const label=document.getElementById('promoMonthLabel');if(label)label.textContent=monthLabel(monthKey());
    renderSaved();
  }
  function closePage(){if(typeof showAreaAssignments==='function')showAreaAssignments();else if(typeof showDashboard==='function')showDashboard()}
  function renderSaved(){
    const box=document.getElementById('promoSavedList');if(!box)return;
    const items=current();
    box.innerHTML=items.length?items.map((x,i)=>`<div class="promo-saved-item"><span>${i+1}</span><strong>${escP(x)}</strong></div>`).join(''):'<div class="empty">Belum ada barang promo untuk bulan ini.</div>';
  }
  function savePage(){
    if(!canManage())return;
    const input=document.getElementById('promoItemsInput');
    const items=String(input?.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    save(items);promoCardHtml();renderSaved();
    if(typeof toast==='function')toast(items.length?`Promo ${monthLabel(monthKey())} berhasil disimpan`:'Promo bulan ini dikosongkan');
  }
  function clearPage(){if(!canManage())return;if(!confirm('Hapus promo bulan ini?'))return;save([]);const input=document.getElementById('promoItemsInput');if(input)input.value='';promoCardHtml();renderSaved();if(typeof toast==='function')toast('Promo bulan ini dihapus');}
  window.showPromoManagementPage=showPage;
  window.closePromoManagementPage=closePage;
  window.saveMonthlyPromo=savePage;
  window.clearMonthlyPromo=clearPage;
  window.renderMonthlyPromoCard=promoCardHtml;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(promoCardHtml,0));
  const oldOpenApp=window.openApp;
  window.openApp=function(){const r=oldOpenApp?oldOpenApp.apply(this,arguments):undefined;setTimeout(promoCardHtml,0);return r};
  const oldRefresh=window.refreshDashboard;
  if(oldRefresh)window.refreshDashboard=async function(){const r=await oldRefresh.apply(this,arguments);promoCardHtml();return r};
})();
