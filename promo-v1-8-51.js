/* RML Sales Visit v2.00 - Promo catalog with external Google Drive images
   Images are referenced by URL only; no image file is uploaded to Supabase. */
(function(){
  const KEY='rml_monthly_promo_v4';
  const OLD_KEY='rml_monthly_promo_v3';
  const CACHE_KEY='rml_monthly_promo_remote_cache_v2';
  const monthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const monthLabel=m=>{const [y,mo]=String(m).split('-').map(Number);return new Date(y,mo-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})};
  const DEFAULT_PROMO_NAME='Promo Bulan Ini';
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

  function normalizeItem(x, legacyRules=null){
    if(x&&typeof x==='object'&&!Array.isArray(x)){
      const q=x.quantity!=null?Number(x.quantity):(legacyRules?.quantity!=null?Number(legacyRules.quantity):null);
      const b=x.bonus!=null?Number(x.bonus):(legacyRules?.bonus!=null?Number(legacyRules.bonus):null);
      const rawMix=x.mix??x.mix_variant??legacyRules?.mix??legacyRules?.mix_variant??'';
      const mix=String(rawMix).toUpperCase()==='YES'?'YES':(String(rawMix).toUpperCase()==='NO'?'NO':'');
      const keterangan=String(x.keterangan??x.note??x.description??legacyRules?.keterangan??legacyRules?.note??'').trim();
      return {
        name:String(x.name||x.title||'').trim(),
        image:String(x.image||x.image_url||x.imageUrl||x.url||'').trim(),
        quantity:Number.isFinite(q)&&q>0?q:null,
        bonus:Number.isFinite(b)&&b>=0?b:null,
        mix,
        keterangan
      };
    }
    const s=String(x??'').trim();
    return {name:s,image:'',quantity:legacyRules?.quantity??null,bonus:legacyRules?.bonus??null,mix:legacyRules?.mix||'',keterangan:String(legacyRules?.keterangan||legacyRules?.note||'').trim()};
  }
  const normalizeCategories=raw=>{
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray(raw.categories)) return raw.categories.map((c,i)=>{
      const legacy={
        quantity:Number.isFinite(Number(c?.quantity))&&Number(c?.quantity)>0?Number(c.quantity):null,
        bonus:Number.isFinite(Number(c?.bonus))&&Number(c?.bonus)>=0?Number(c.bonus):null,
        mix:String(c?.mix||c?.mix_variant||'').toUpperCase()==='YES'?'YES':(String(c?.mix||c?.mix_variant||'').toUpperCase()==='NO'?'NO':''),
        keterangan:String(c?.keterangan??c?.note??'').trim()
      };
      return {
        name:String(c?.name||`Kategori ${i+1}`).trim(),
        items:Array.isArray(c?.items)?c.items.map(x=>normalizeItem(x,legacy)).filter(x=>x.name):[],
      };
    }).filter(c=>c.name||c.items.length);
    if(Array.isArray(raw)){
      const old=raw.map(x=>normalizeItem(x)).filter(x=>x.name);
      return old.length?[{name:'Umum',items:old}]:[];
    }
    return [];
  };
  const readLocal=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){return {}}};
  const writeLocal=v=>localStorage.setItem(KEY,JSON.stringify(v||{}));
  const migrateOld=()=>{try{if(localStorage.getItem(KEY))return;const old=JSON.parse(localStorage.getItem(OLD_KEY)||'{}');if(old&&typeof old==='object'){writeLocal(old)}}catch(_) {}};
  migrateOld();
  let remoteRows=[]; let masterCards=[]; let masterPromoName=DEFAULT_PROMO_NAME; let lastPullAt=0;
  function normalizeRows(rows){const allowed=new Set(managedUsers().map(u=>String(u.email||'').toLowerCase()).filter(Boolean));return (Array.isArray(rows)?rows:[]).map(r=>({monthKey:r.month_key,ownerEmail:String(r.sales_email||'').toLowerCase(),promoName:String(r.items?.promo_name||r.items?.promoName||DEFAULT_PROMO_NAME).trim()||DEFAULT_PROMO_NAME,periodName:String(r.items?.promo_period_name||r.items?.promoPeriodName||'').trim(),categories:normalizeCategories(r.items),updatedAt:r.updated_at||''})).filter(r=>r.monthKey===monthKey()&&r.ownerEmail&&allowed.has(r.ownerEmail))}
  function hydrateFromLocal(){const all=readLocal(),m=all[monthKey()]||{};remoteRows=Object.entries(m).map(([email,v])=>({monthKey:monthKey(),ownerEmail:String(email).toLowerCase(),promoName:String(v?.promo_name||v?.promoName||DEFAULT_PROMO_NAME).trim()||DEFAULT_PROMO_NAME,periodName:String(v?.promo_period_name||v?.promoPeriodName||'').trim(),categories:normalizeCategories(v)}));}
  async function pullRemote(force=false){
    const now=Date.now(); if(!force&&lastPullAt&&now-lastPullAt<120000)return true;
    hydrateFromLocal(); const token=sessionToken(); if(!navigator.onLine||!token)return false;
    try{const data=await rpc('app_get_monthly_promos',{p_token:token,p_month_key:monthKey()});remoteRows=normalizeRows(data);const all=readLocal(),m={};remoteRows.forEach(r=>{m[r.ownerEmail]={promo_name:r.promoName||DEFAULT_PROMO_NAME,promo_period_name:r.periodName||masterPeriodName||monthLabel(monthKey()),categories:r.categories}});all[monthKey()]=m;writeLocal(all);lastPullAt=Date.now();localStorage.setItem(CACHE_KEY,JSON.stringify({monthKey:monthKey(),at:lastPullAt}));return true}catch(e){console.warn('Promo remote gagal',e);return false}
  }
  function userName(email){const key=String(email||'').toLowerCase();const u=managedUsers().find(x=>String(x.email||'').toLowerCase()===key);return u?.name||email||'-'}
  function allAssignees(){return managedUsers()}
  function signature(c){return String(c.name||'').trim().toLowerCase()}
  function buildMasterCards(){
    const first=remoteRows.find(r=>r.promoName||r.periodName);
    masterPromoName=(first?.promoName||DEFAULT_PROMO_NAME).trim()||DEFAULT_PROMO_NAME;
    masterPeriodName=(first?.periodName||monthLabel(monthKey())).trim()||monthLabel(monthKey());
    const map=new Map();
    remoteRows.forEach(r=>r.categories.forEach(c=>{
      if(!c.name&&!c.items.length)return;
      const key=signature(c);
      let card=map.get(key);
      if(!card){
        card={name:c.name,items:[],assignees:[]};
        map.set(key,card);
      }
      const existing=new Map(card.items.map((x)=>[String(x.name||'').trim().toLowerCase(),normalizeItem(x)]));
      c.items.map(x=>normalizeItem(x)).forEach(item=>{
        if(!item.name)return;
        const k=String(item.name).trim().toLowerCase();
        existing.set(k,item);
      });
      card.items=[...existing.values()];
      if(!card.assignees.includes(r.ownerEmail))card.assignees.push(r.ownerEmail);
    }));
    masterCards=[...map.values()];
  }
  function itemEditorHtml(item,i){
    const x=normalizeItem(item);
    const qty=x.quantity??'';
    const bonus=x.bonus??'';
    const mix=x.mix||'';
    const yesActive=mix==='YES'?'is-active':'';
    const noActive=mix==='NO'?'is-active':'';
    return `<div class="promo-item-editor" data-item-index="${i}">
      <div class="promo-item-editor-fields">
        <label>Nama Barang<input class="promo-item-name" type="text" value="${escAttr(x.name)}" placeholder="Contoh: Dodo Pahe 2oz"></label>
        <label>Jumlah Beli<input class="promo-item-quantity" type="number" min="1" step="1" value="${qty}" placeholder="12"></label>
        <label>Bonus<input class="promo-item-bonus" type="number" min="0" step="1" value="${bonus}" placeholder="1"></label>
        <label class="promo-mix-field">Boleh Campur Varian
          <div class="promo-mix-toggle" role="group" aria-label="Aturan campur varian">
            <button class="promo-mix-btn promo-mix-yes ${yesActive}" type="button" onclick="setPromoMix(this,'YES')">✓ Boleh mix</button>
            <button class="promo-mix-btn promo-mix-no ${noActive}" type="button" onclick="setPromoMix(this,'NO')">⊘ Tidak mix</button>
          </div>
          <input class="promo-item-mix" type="hidden" value="${escAttr(mix)}">
        </label>
        <label class="promo-keterangan-field">Keterangan
          <input class="promo-item-keterangan" type="text" value="${escAttr(x.keterangan||'')}" placeholder="Contoh: Bonus bebas / hadiah pilihan / syarat khusus">
        </label>
      </div>
      <button class="danger compact promo-item-delete" type="button" onclick="removePromoItem(this)">Hapus</button>
    </div>`;
  }
  function setPromoMix(btn,value){
    const row=btn?.closest('.promo-item-editor');
    if(!row)return;
    const input=row.querySelector('.promo-item-mix');
    if(input)input.value=value;
    row.querySelectorAll('.promo-mix-btn').forEach(b=>b.classList.remove('is-active'));
    btn.classList.add('is-active');
  }
  function renderMasterCards(){
    const host=document.getElementById('promoMasterCards');if(!host)return;
    if(!masterCards.length){host.innerHTML='<div class="empty promo-empty-master">Belum ada promo. Klik ＋ Tambah Promo.</div>';return}
    host.innerHTML=masterCards.map((c,i)=>{
      return `<article class="promo-master-card" data-promo-index="${i}">
        <div class="promo-master-head">
          <div><span class="promo-master-icon">🎁</span><div><strong>${escP(c.name||'Promo')}</strong><small>${c.items.length} barang • ${c.assignees.length} penanggung jawab</small></div></div>
          <button class="danger compact" type="button" onclick="removeMasterPromo(${i})">Hapus</button>
        </div>
        <label>Kategori Promo</label>
        <input class="promo-master-name" type="text" value="${escAttr(c.name||'')}" placeholder="Contoh: Dodo">
        <div class="promo-items-editor-head"><label>Barang Promo + Aturan</label><button class="secondary compact" type="button" onclick="addPromoItem(${i})">＋ Tambah Barang</button></div>
        <div class="promo-master-items">${c.items.map((x,j)=>itemEditorHtml(x,j)).join('')||'<div class="empty promo-no-items">Belum ada barang. Klik Tambah Barang.</div>'}</div>
        <label>Assign ke</label>
        <div class="promo-assignees">${allAssignees().map(u=>{
          const e=String(u.email||'').toLowerCase();
          return `<label class="promo-assignee"><input type="checkbox" value="${escAttr(e)}" ${c.assignees.includes(e)?'checked':''}><span>${escP(u.name||e)}${u.role==='supervisor'?' — Supervisor':''}</span></label>`;
        }).join('')}</div>
      </article>`;
    }).join('');
  }
  function addMasterPromo(){masterCards.push({name:'',items:[{name:'',quantity:12,bonus:1,mix:'NO',keterangan:''}],assignees:[]});renderMasterCards();setTimeout(()=>{const cards=document.querySelectorAll('.promo-master-card');cards[cards.length-1]?.scrollIntoView({behavior:'smooth',block:'center'});cards[cards.length-1]?.querySelector('.promo-master-name')?.focus()},30)}
  function addPromoItem(i){const card=masterCards[i];if(!card)return;const current=readMasterCards();if(current[i])masterCards[i]={...card,...current[i]};masterCards[i].items.push({name:'',quantity:null,bonus:null,mix:'',keterangan:''});renderMasterCards();setTimeout(()=>{const el=document.querySelectorAll('.promo-master-card')[i];el?.querySelectorAll('.promo-item-name')[masterCards[i].items.length-1]?.focus()},20)}
  function removePromoItem(btn){const card=btn.closest('.promo-master-card');if(!card)return;const i=Number(card.dataset.promoIndex);const j=Number(btn.closest('.promo-item-editor')?.dataset.itemIndex);const current=readMasterCards();if(!current[i])return;current[i].items.splice(j,1);masterCards=current;renderMasterCards()}
  function readMasterCards(){
    return [...document.querySelectorAll('.promo-master-card')].map(el=>({
      name:String(el.querySelector('.promo-master-name')?.value||'').trim(),
      items:[...el.querySelectorAll('.promo-item-editor')].map(row=>{
        const q=String(row.querySelector('.promo-item-quantity')?.value||'').trim();
        const b=String(row.querySelector('.promo-item-bonus')?.value||'').trim();
        return {
          name:String(row.querySelector('.promo-item-name')?.value||'').trim(),
          quantity:q?Number(q):null,
          bonus:b?Number(b):null,
          mix:String(row.querySelector('.promo-item-mix')?.value||''),
          keterangan:String(row.querySelector('.promo-item-keterangan')?.value||'').trim()
        };
      }).filter(x=>x.name),
      assignees:[...el.querySelectorAll('.promo-assignees input[type=checkbox]:checked')].map(x=>x.value.toLowerCase())
    })).filter(c=>c.name||c.items.length||c.assignees.length);
  }
  function renderSaved(){const box=document.getElementById('promoSavedList');if(!box)return;box.innerHTML=masterCards.length?`<div class="promo-saved-title"><span>Nama Promo</span><strong>${escP(masterPromoName)}</strong><small>Periode: ${escP(masterPeriodName)}</small></div>`+masterCards.map(c=>`<div class="promo-saved-category"><div><strong>${escP(c.name||'Promo')}</strong><small class="promo-saved-offer">${c.items.map(x=>{const q=x.quantity??'—';const b=x.bonus??0;const m=x.mix==='YES'?'Boleh mix':x.mix==='NO'?'Tidak boleh mix':'Mix belum diatur';const k=x.keterangan?` • ${escP(x.keterangan)}`:'';return `${escP(x.name)}: Beli ${escP(q)} • Bonus ${escP(b)} • ${m}${k}`}).join(' | ')}</small></div><span>${c.items.length} barang • ${c.assignees.map(userName).join(', ')||'Belum di-assign'}</span></div>`).join(''):'<div class="empty">Belum ada promo bulan ini.</div>'}
  async function showPage(){if(!canManage())return typeof toast==='function'&&toast('Hanya Admin/Supervisor yang dapat mengelola promo');if(typeof hide==='function')hide();document.getElementById('promoView')?.classList.remove('hidden');await pullRemote(true);buildMasterCards();renderMasterCards();const label=document.getElementById('promoMonthLabel');if(label)label.textContent=masterPeriodName||monthLabel(monthKey());const periodInput=document.getElementById('promoPeriodNameInput');if(periodInput)periodInput.value=masterPeriodName||monthLabel(monthKey());const nameInput=document.getElementById('promoNameInput');if(nameInput)nameInput.value=masterPromoName;renderSaved()}
  async function savePage(){
    if(!canManage())return; const cards=readMasterCards();
    const promoName=String(document.getElementById('promoNameInput')?.value||'').trim();
    const periodName=String(document.getElementById('promoPeriodNameInput')?.value||'').trim();
    masterPromoName=promoName||DEFAULT_PROMO_NAME;
    masterPeriodName=periodName||monthLabel(monthKey());
    if(!cards.length)return toast('Tambah minimal satu promo'); if(!promoName)return toast('Nama promo wajib diisi'); if(!periodName)return toast('Nama periode promo wajib diisi'); if(cards.some(c=>!c.name))return toast('Nama kategori promo wajib diisi'); if(cards.some(c=>!c.items.length))return toast('Setiap promo harus memiliki minimal satu barang'); if(cards.some(c=>c.items.some(x=>!x.name)))return toast('Nama setiap barang promo wajib diisi'); if(cards.some(c=>c.items.some(x=>x.quantity!=null&&(!Number.isInteger(x.quantity)||x.quantity<1))))return toast('Jumlah beli tiap barang harus berupa angka bulat minimal 1'); if(cards.some(c=>c.items.some(x=>x.bonus!=null&&(!Number.isInteger(x.bonus)||x.bonus<0))))return toast('Bonus tiap barang harus berupa angka bulat 0 atau lebih'); if(cards.some(c=>c.assignees.length===0))return toast('Assign minimal satu Sales/Supervisor pada setiap promo');
    const token=sessionToken();if(!navigator.onLine||!token)return toast('Promo memerlukan koneksi internet agar tersimpan untuk semua perangkat');
    const byOwner={};cards.forEach(c=>c.assignees.forEach(e=>{(byOwner[e]??=[]).push({name:c.name,items:c.items.map(x=>({name:x.name,quantity:x.quantity??null,bonus:x.bonus??null,mix:x.mix||'',keterangan:x.keterangan||''}))})})); const oldOwners=new Set(remoteRows.map(r=>r.ownerEmail)); Object.keys(byOwner).forEach(e=>oldOwners.delete(e));
    try{for(const [email,cats] of Object.entries(byOwner))await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:email,p_items:{promo_name:masterPromoName,promo_period_name:masterPeriodName,categories:cats}});for(const email of oldOwners)await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:email,p_items:{promo_name:masterPromoName,promo_period_name:masterPeriodName,categories:[]}});await pullRemote(true);buildMasterCards();renderMasterCards();if(document.getElementById('promoNameInput'))document.getElementById('promoNameInput').value=masterPromoName;renderSaved();renderCard();toast('Promo berhasil disimpan')}catch(e){toast(`Gagal menyimpan promo: ${e.message||'periksa SQL Supabase'}`)}
  }
  async function removeMasterPromo(i){const cards=readMasterCards();if(!cards[i])return;if(!confirm(`Hapus promo ${cards[i].name||''}?`))return;cards.splice(i,1);const token=sessionToken();if(!navigator.onLine||!token)return toast('Memerlukan internet');const byOwner={};cards.forEach(c=>c.assignees.forEach(e=>{(byOwner[e]??=[]).push({name:c.name,items:c.items.map(x=>({name:x.name,quantity:x.quantity??null,bonus:x.bonus??null,mix:x.mix||'',keterangan:x.keterangan||''}))})}));try{const owners=new Set(remoteRows.map(r=>r.ownerEmail));for(const email of owners)await rpc('app_admin_upsert_monthly_promo',{p_token:token,p_month_key:monthKey(),p_sales_email:email,p_items:{promo_name:masterPromoName,promo_period_name:masterPeriodName,categories:byOwner[email]||[]}});remoteRows=remoteRows.map(r=>({...r,categories:byOwner[r.ownerEmail]||[]})).filter(r=>r.categories.length);const all=readLocal(),m={};remoteRows.forEach(r=>{m[r.ownerEmail]={promo_name:r.promoName||DEFAULT_PROMO_NAME,promo_period_name:r.periodName||masterPeriodName||monthLabel(monthKey()),categories:r.categories}});all[monthKey()]=m;writeLocal(all);buildMasterCards();renderMasterCards();renderSaved();renderCard();toast('Promo dihapus')}catch(e){toast(`Gagal menghapus promo: ${e.message||'periksa koneksi'}`)}}
  function promoRowForOwner(email){const key=String(email||'').toLowerCase();return remoteRows.find(x=>x.ownerEmail===key)||null}
  function cardsForOwner(email){return promoRowForOwner(email)?.categories||[]}
  function promoNameForOwner(email){return promoRowForOwner(email)?.promoName||masterPromoName||DEFAULT_PROMO_NAME}
  function openDetail(email){
    const cats=cardsForOwner(email).filter(c=>c.items.length);
    if(!cats.length)return;
    const view=document.getElementById('promoCatalogView');
    if(!view)return;
    if(typeof hide==='function')hide();
    const row=promoRowForOwner(email);
    document.getElementById('promoCatalogOwner').textContent=promoNameForOwner(email);
    document.getElementById('promoCatalogMonth').textContent=row?.periodName||masterPeriodName||monthLabel(monthKey());
    document.getElementById('promoCatalogList').innerHTML=cats.map(c=>`
      <section class="promo-catalog-category">
        <div class="promo-catalog-category-head">
          <span>🎁</span>
          <div><strong>${escP(c.name)}</strong><small>${c.items.length} barang promo</small></div>
        </div>
        <div class="promo-catalog-items">
          ${c.items.map((x,i)=>{
            const it=normalizeItem(x);
            const q=it.quantity??'—';
            const b=it.bonus??0;
            const mixText=it.mix==='YES'?'Boleh mix varian':it.mix==='NO'?'Tidak boleh mix varian':'Mix belum diatur';
            const mixClass=it.mix==='YES'?'mix-yes':it.mix==='NO'?'mix-no':'mix-unknown';
            const note=it.keterangan?`<div class="promo-rule-note"><span class="promo-rule-note-label">Keterangan</span><span>${escP(it.keterangan)}</span></div>`:'';
            return `<div class="promo-catalog-item promo-catalog-item-text">
              <span class="promo-item-number">${i+1}</span>
              <div class="promo-catalog-item-main">
                <strong>${escP(it.name)}</strong>
                <div class="promo-offer-rules">
                  <span class="promo-rule promo-rule-buy">🛒 <b>Beli ${escP(q)}</b></span>
                  <span class="promo-rule promo-rule-bonus">🎁 <b>Bonus ${escP(b)}</b></span>
                  <span class="promo-rule promo-rule-mix ${mixClass}">${it.mix==='YES'?'✓':it.mix==='NO'?'⊘':'•'} ${escP(mixText)}</span>
                </div>
                ${note}
              </div>
            </div>`;
          }).join('')}
        </div>
      </section>`).join('');
    view.classList.remove('hidden');
  }
  function closeDetail(){document.getElementById('promoCatalogView')?.classList.add('hidden');if(typeof showDashboard==='function')showDashboard();else if(typeof showAreaAssignments==='function')showAreaAssignments()}
  function salesPromoCard(email){const cats=cardsForOwner(email),items=cats.flatMap(c=>c.items||[]);if(!items.length)return '';return `<button class="dashboard-price-card monthly-promo-card monthly-promo-sales-card" type="button" onclick="openMonthlyPromoDetail('${escAttr(email)}')"><span class="dashboard-price-icon monthly-promo-icon" aria-hidden="true">🎁</span><span><strong>${escP(promoNameForOwner(email))}</strong><small>${cats.length} kategori • ${items.length} barang • ${promoNameForOwner(email)}</small><em class="monthly-promo-generic-note">Lihat semua barang promo</em></span><span class="dashboard-price-arrow">›</span></button>`}
  function renderCard(){const area=document.getElementById('monthlyPromoArea');if(!area)return;const u=getUser();if(!u||u.role==='admin'){area.innerHTML='';area.classList.add('hidden');return}let html='';if(u.role==='sales'||u.role==='supervisor')html=salesPromoCard(u.email);if(isSupervisor()&&u.role!=='sales'){const managed=managedUsers().filter(x=>String(x.email||'').toLowerCase()!==String(u.email||'').toLowerCase());html+=managed.map(x=>salesPromoCard(x.email)).filter(Boolean).join('')}area.innerHTML=html;area.classList.toggle('hidden',!html)}
  window.showPromoManagementPage=showPage;window.closePromoManagementPage=()=>{if(typeof showAreaAssignments==='function')showAreaAssignments();else if(typeof showDashboard==='function')showDashboard()};window.saveMonthlyPromo=savePage;window.addMasterPromo=addMasterPromo;window.removeMasterPromo=removeMasterPromo;window.addPromoItem=addPromoItem;window.setPromoMix=setPromoMix;window.removePromoItem=removePromoItem;window.openMonthlyPromoDetail=openDetail;window.closePromoDetailModal=closeDetail;window.closePromoCatalog=closeDetail;window.renderMonthlyPromoCard=renderCard;window.pullMonthlyPromos=pullRemote;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{hydrateFromLocal();renderCard();await pullRemote(false);renderCard()},0));
  const oldOpenApp=window.openApp;window.openApp=function(){const r=oldOpenApp?oldOpenApp.apply(this,arguments):undefined;setTimeout(async()=>{hydrateFromLocal();renderCard();await pullRemote(false);renderCard()},300);return r};
  const oldRefresh=window.refreshDashboard;if(oldRefresh)window.refreshDashboard=async function(){const r=await oldRefresh.apply(this,arguments);await pullRemote(false);renderCard();return r};
})();
