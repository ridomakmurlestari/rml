/* RML Sales Visit v1.8.63 - Target Sales Reward Bertingkat */
(function(){
const TARGET_KEY='rml_dashboard_targets_v1';
const TARGET_REMOTE_READY='rml_dashboard_targets_remote_ready_v1';
const targetRows=()=>{try{const v=JSON.parse(localStorage.getItem(TARGET_KEY)||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
const saveTargetRows=rows=>localStorage.setItem(TARGET_KEY,JSON.stringify(rows||[]));
const escTarget=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v||0));
const monthNow=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const monthLabel=v=>{if(!v)return '-';const [y,m]=String(v).split('-');return new Date(Number(y),Number(m)-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})};
const addMonths=(ym,n)=>{const [y,m]=String(ym).split('-').map(Number);const d=new Date(y,m-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const periodMonths=x=>Math.max(1,Number(x.durationMonths||1));
const targetStart=x=>x.startMonth||x.month||monthNow();
const targetEnd=x=>addMonths(targetStart(x),periodMonths(x)-1);
const targetActiveInMonth=(x,m)=>m>=targetStart(x)&&m<=targetEnd(x);
const DEFAULT_TARGET_USERS=[{email:'rini@rml.app',name:'Rini',role:'sales',active:true},{email:'lisna@rml.app',name:'Lisna',role:'sales',active:true},{email:'septino@rml.app',name:'Septino',role:'supervisor',active:true},{email:'admin@rml.app',name:'Admin',role:'admin',active:true}];
const usersList=()=>{
 try{
   const saved=JSON.parse(localStorage.getItem('rml_user_accounts_v1')||'null');
   const list=Array.isArray(saved)?saved.slice():[];
   const me=getAppUser();
   if(me && (me.role==='sales'||me.role==='supervisor') && !list.some(u=>String(u.email||'').toLowerCase()===String(me.email||'').toLowerCase())) list.push(me);
   DEFAULT_TARGET_USERS.forEach(d=>{if(!list.some(u=>String(u.email||'').toLowerCase()===d.email))list.push(d)});
   return list;
 }catch(_){return DEFAULT_TARGET_USERS}
};
const getAppUser=()=>{try{return currentUser||window.currentUser||null}catch(_){return window.currentUser||null}};
const canManageTargets=()=>{const u=getAppUser();return !!(u&&(u.role==='admin'||u.role==='supervisor'||(typeof isSupervisorUser==='function'&&isSupervisorUser(u))))};
const isSalesUser=()=>String(getAppUser()?.role||'').toLowerCase()==='sales';
function customersList(){try{return typeof customers==='function'?(customers()||[]).filter(c=>!c.isHidden):[]}catch(_){return []}}
function salesName(email){const key=String(email||'').toLowerCase();const u=usersList().find(u=>String(u.email||'').toLowerCase()===key);if(u?.name)return u.name;const me=getAppUser();if(String(me?.email||'').toLowerCase()===key)return me.name||email||'-';return email||'-'}
function outletName(no){return customersList().find(c=>String(c.no)===String(no))?.name||no||'-'}
function outletSalesName(x){return salesName(x.targetSalesEmail||x.salesEmail||x.assignedSalesEmail)}
function sessionToken(){try{return typeof getSbSession==='function'?getSbSession()?.session_token:null}catch(_){return null}}
async function targetRpc(name,args){if(typeof rpc!=='function')throw new Error('Modul sinkronisasi Supabase tidak tersedia');return rpc(name,args)}
function decodeRewardTiers(description){
 const raw=String(description||'');
 const m=raw.match(/\n?\[\[RML_TIERS:(.*?)\]\]\s*$/s);
 if(!m)return {description:raw,tiers:[]};
 try{const tiers=JSON.parse(m[1]);return {description:raw.slice(0,m.index).trimEnd(),tiers:Array.isArray(tiers)?tiers.map(t=>({target:Number(t.target||0),rewardType:String(t.rewardType||'nominal'),rewardValue:Number(t.rewardValue||0)})).filter(t=>t.target>0&&t.rewardValue>0):[]}}catch(_){return {description:raw,tiers:[]}}
}
function encodeRewardTiers(description,tiers){
 const base=String(description||'').replace(/\n?\[\[RML_TIERS:.*?\]\]\s*$/s,'').replace(/\n?\[\[RML_REWARD:[^:]+:[^\]]+\]\]\s*$/,'').trimEnd();
 const clean=(Array.isArray(tiers)?tiers:[]).map(t=>({target:Number(t.target||0),rewardType:String(t.rewardType||'nominal'),rewardValue:Number(t.rewardValue||0)})).filter(t=>t.target>0&&t.rewardValue>0).sort((a,b)=>a.target-b.target);
 return clean.length?`${base}\n[[RML_TIERS:${JSON.stringify(clean)}]]`:base;
}
function targetTiers(x){if(Array.isArray(x?.tiers)&&x.tiers.length)return x.tiers.map(t=>({target:Number(t.target||0),rewardType:String(t.rewardType||'nominal'),rewardValue:Number(t.rewardValue||0)})).filter(t=>t.target>0&&t.rewardValue>0).sort((a,b)=>a.target-b.target);const d=decodeRewardTiers(x?.description||'');return d.tiers.length?d.tiers:((x.rewardType&&x.rewardType!=='none'&&Number(x.rewardValue||0)>0)?[{target:Number(x.target||0),rewardType:x.rewardType,rewardValue:Number(x.rewardValue||0)}]:[])}
function tierRewardAmount(t,realization=0){return t.rewardType==='percent'?Number(realization||0)*Number(t.rewardValue||0)/100:Number(t.rewardValue||0)}
function achievedTier(x){const tiers=targetTiers(x),ach=Number(x.achieved||0);let hit=null;for(const t of tiers)if(ach>=Number(t.target||0))hit=t;return hit}
function decodeRewardDescription(description){
 const raw=String(description||'');
 const m=raw.match(/\n?\[\[RML_REWARD:([^:]+):([^\]]+)\]\]\s*$/);
 if(!m)return {description:raw,rewardType:'none',rewardValue:0};
 const type=['none','percent','nominal'].includes(m[1])?m[1]:'none';
 const value=Math.max(0,Number(m[2]||0));
 return {description:raw.slice(0,m.index).trimEnd(),rewardType:type,rewardValue:value};
}
function encodeRewardDescription(description,rewardType,rewardValue){
 const base=String(description||'').replace(/\n?\[\[RML_REWARD:[^:]+:[^\]]+\]\]\s*$/,'').trimEnd();
 if(!rewardType||rewardType==='none'||Number(rewardValue||0)<=0)return base;
 return `${base}\n[[RML_REWARD:${rewardType}:${Number(rewardValue)}]]`;
}
function normalizeRemoteRow(r){
 const d=decodeRewardDescription(r.description||'');
 const td=decodeRewardTiers(d.description);const tiers=td.tiers;const legacyTarget=Number(r.target||0);return {id:String(r.id),type:r.type,startMonth:r.start_month||r.month||monthNow(),month:r.start_month||r.month||monthNow(),durationMonths:Number(r.duration_months||1),ownerId:r.owner_id||'',targetSalesEmail:r.target_sales_email||'',description:td.description||d.description,target:tiers.length?Math.max(...tiers.map(t=>Number(t.target||0)),legacyTarget):legacyTarget,achieved:Number(r.achieved||0),rewardType:String(r.reward_type||d.rewardType||'none'),rewardValue:Number(r.reward_value||d.rewardValue||0),tiers,updatedDate:r.updated_date||'',updatedAt:r.updated_at||''}
}
function targetToRemote(x){return {id:String(x.id),type:x.type,start_month:targetStart(x),duration_months:periodMonths(x),owner_id:String(x.ownerId||''),target_sales_email:String(x.targetSalesEmail||''),description:encodeRewardTiers(x.description,x.tiers||[]),target:Number((x.tiers&&x.tiers.length)?Math.max(...x.tiers.map(t=>Number(t.target||0))):x.target||0),achieved:Number(x.achieved||0),reward_type:String((x.tiers&&x.tiers.length)?'none':(x.rewardType||'none')),reward_value:Number((x.tiers&&x.tiers.length)?0:(x.rewardValue||0)),updated_date:x.updatedDate||null,updated_at:x.updatedAt||new Date().toISOString()}}
async function pullTargetsFromServer({silent=true,throwOnError=false}={}){
 const token=sessionToken();if(!navigator.onLine||!token){if(throwOnError)throw new Error('Tidak ada koneksi internet atau sesi login tidak valid');return null;}
 try{
  const data=await targetRpc('app_get_dashboard_targets',{p_token:token});
  let remote=Array.isArray(data)?data.map(normalizeRemoteRow):[];
  const local=targetRows();
  // Migrasi target lama hanya SATU KALI. Setelah remote berhasil dibaca,
  // server menjadi sumber data utama. Ini penting agar target yang sudah
  // dihapus di server tidak muncul kembali karena masih tertinggal di localStorage.
  const remoteReady=localStorage.getItem(TARGET_REMOTE_READY)==='1';
  if(canManageTargets() && !remoteReady){
   const remoteIds=new Set(remote.map(x=>x.id));
   const missing=local.filter(x=>x?.id&&!remoteIds.has(String(x.id)));
   for(const x of missing){
    try{await targetRpc('app_admin_upsert_dashboard_target',{p_token:token,p_target:targetToRemote(x)})}
    catch(e){console.warn('Migrasi target gagal',e)}
   }
   if(missing.length){const fresh=await targetRpc('app_get_dashboard_targets',{p_token:token});remote=Array.isArray(fresh)?fresh.map(normalizeRemoteRow):[]}
  }
  saveTargetRows(remote);localStorage.setItem(TARGET_REMOTE_READY,'1');return remote;
 }catch(e){console.warn('Sinkronisasi target gagal',e);if(throwOnError)throw e;if(!silent&&typeof toast==='function')toast(`Sinkronisasi target gagal: ${e.message||'periksa koneksi/database'}`);return null}
}
function fillTargetMonthFilter(){const el=document.getElementById('targetMonthFilter');if(!el)return;const cur=el.value||monthNow(),months=new Set([cur,monthNow()]);targetRows().forEach(x=>{for(let i=0;i<periodMonths(x);i++)months.add(addMonths(targetStart(x),i))});el.innerHTML=[...months].sort().reverse().map(m=>`<option value="${escTarget(m)}">${escTarget(monthLabel(m))}</option>`).join('');el.value=months.has(cur)?cur:monthNow()}
function fillTargetDurationFilter(){const el=document.getElementById('targetDurationFilter');if(!el)return;const cur=el.value||'all';el.innerHTML='<option value="all">Semua Periode</option><option value="1">1 Bulan</option><option value="3">3 Bulan</option><option value="6">6 Bulan</option><option value="12">12 Bulan</option>';el.value=['all','1','3','6','12'].includes(cur)?cur:'all'}
function fillTargetManagerFields(){
 const type=document.getElementById('targetTypeInput')?.value||'sales',owner=document.getElementById('targetOwnerInput'),label=document.getElementById('targetOwnerLabel'),salesWrap=document.getElementById('targetSalesWrap'),sales=document.getElementById('targetSalesInput');
 if(!owner)return;
 const oldOwner=owner.value||'',oldSales=sales?.value||'';
 const selectableUsers=usersList().filter(u=>(u.role==='sales'||u.role==='supervisor')&&u.active!==false);
 if(type==='sales'){
  label.textContent='Sales / Penanggung Jawab';
  owner.innerHTML=selectableUsers.map(u=>`<option value="${escTarget(u.email)}">${escTarget(u.name)}</option>`).join('');
  if([...owner.options].some(o=>o.value===oldOwner))owner.value=oldOwner;
  salesWrap?.classList.add('hidden');
 }else{
  label.textContent='Outlet';
  owner.innerHTML=customersList().map(c=>`<option value="${escTarget(c.no)}">${escTarget(c.name)}${c.area?` — ${escTarget(c.area)}`:''}</option>`).join('');
  if([...owner.options].some(o=>o.value===oldOwner))owner.value=oldOwner;
  salesWrap?.classList.remove('hidden');
  if(sales){
   sales.innerHTML=selectableUsers.map(u=>`<option value="${escTarget(u.email)}">${escTarget(u.name)}</option>`).join('');
   if([...sales.options].some(o=>o.value===oldSales))sales.value=oldSales;
  }
 }
}
function formatUpdateDate(v){if(!v)return '-';const d=new Date(String(v).length===10?String(v)+'T00:00:00':v);if(Number.isNaN(d.getTime()))return escTarget(v);return d.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})}
function periodText(x){return periodMonths(x)===1?'1 bulan':`${periodMonths(x)} bulan`}
function ownerMeta(x){return x.type==='sales'?salesName(x.ownerId):outletName(x.ownerId)}
function rewardTypeLabel(type){return type==='percent'?'Persentase':type==='nominal'?'Nominal':'Tanpa Reward'}
function rewardBaseAmount(x){const v=Math.max(0,Number(x.rewardValue||0));return x.rewardType==='percent'?Number(x.target||0)*v/100:x.rewardType==='nominal'?v:0}
function rewardText(x){if(x.rewardType==='percent')return `${Math.round(Number(x.rewardValue||0)*100)/100}% dari target`;if(x.rewardType==='nominal')return money(x.rewardValue);return 'Tidak ada reward'}
function rewardEarnedAmount(x){const pct=Math.min(100,Math.max(0,targetPct(x)));return rewardBaseAmount(x)*pct/100}
function rewardDisplayAmount(x,t){return tierRewardAmount(t,Number(x.achieved||0))}
function rewardTableHtml(x){if(x.type!=='sales')return '';const tiers=targetTiers(x);if(!tiers.length)return '';const ach=Number(x.achieved||0);const hit=achievedTier(x);return `<div class="target-tier-table-wrap"><div class="target-tier-table-title">Target & Reward Bertingkat</div><table class="target-tier-table"><thead><tr><th>Level</th><th>Target</th><th>Reward</th><th>Status</th></tr></thead><tbody>${tiers.map((t,i)=>{const reached=ach>=Number(t.target||0);const reward=reached?rewardDisplayAmount(x,t):tierRewardAmount(t,0);const rewardLabel=t.rewardType==='percent'?`${Number(t.rewardValue||0)}% × realisasi`:money(reward);return `<tr class="${reached?'is-reached':''}"><td>Target ${String.fromCharCode(65+i)}</td><td>${money(t.target)}</td><td>${t.rewardType==='percent'&&reached?`${money(reward)} <small>(${escTarget(t.rewardValue)}% × realisasi)</small>`:t.rewardType==='percent'?`${escTarget(t.rewardValue)}% <small>dari realisasi</small>`:money(reward)}</td><td>${reached?'✓ Tercapai':'Belum'}</td></tr>`}).join('')}</tbody></table>${hit?`<div class="target-current-reward"><small>Reward saat ini</small><strong>${money(rewardDisplayAmount(x,hit))}</strong></div>`:''}</div>`}
function outletRewardAmount(x){const type=String(x.rewardType||'none');const value=Math.max(0,Number(x.rewardValue||0));const achieved=Math.max(0,Number(x.achieved||0));if(type==='percent')return achieved>=Number(x.target||0)?achieved*value/100:0;if(type==='nominal')return achieved>=Number(x.target||0)?value:0;return 0}
function outletRewardHtml(x){if(x.type!=='outlet'||String(x.rewardType||'none')==='none'||Number(x.rewardValue||0)<=0)return '';const type=String(x.rewardType||'none');const value=Number(x.rewardValue||0);const reached=Number(x.achieved||0)>=Number(x.target||0);const amount=outletRewardAmount(x);const label=type==='percent'?`${value}% × realisasi`:money(value);return `<div class="target-outlet-reward-box"><small>Reward</small><strong>${reached?money(amount):'Belum tercapai'}</strong><span>${escTarget(label)}</span></div>`}
function rewardHtml(x){return x.type==='sales'?rewardTableHtml(x):outletRewardHtml(x)}
function rewardSummaryText(x){const tiers=targetTiers(x);if(!tiers.length)return '';const hit=achievedTier(x);const next=tiers.find(t=>Number(t.target||0)>Number(x.achieved||0));if(hit)return `Reward: ${money(rewardDisplayAmount(x,hit))}${next?` • Berikutnya ${money(tierRewardAmount(next))}`:''}`;return `Reward berikutnya ${money(tierRewardAmount(tiers[0]))}`}
function targetCardHtml(x){const pct=x.target>0?(Number(x.achieved||0)/Number(x.target))*100:0,shown=Math.round(pct*10)/10,rem=Math.max(0,Number(x.target||0)-Number(x.achieved||0));const outletSales=x.type==='outlet'&&x.targetSalesEmail?`<span class="target-meta-pill">Sales: <strong>${escTarget(outletSalesName(x))}</strong></span>`:'';return `<article class="target-item-row"><div class="target-item-main"><div class="target-item-top"><div class="target-item-title">${escTarget(ownerMeta(x))}</div><div class="target-percent">${shown}%</div></div><div class="target-item-desc"><span>${escTarget(x.description||'Target')}</span><span>•</span><span>${escTarget(periodText(x))}</span>${outletSales?`<span>•</span>${outletSales}`:''}</div><div class="target-progress-bar"><span style="width:${Math.min(100,Math.max(0,pct))}%"></span></div><div class="target-progress-values"><div><small>Realisasi</small><strong>${money(x.achieved)}</strong></div><div><small>Target</small><strong>${money(x.target)}</strong></div></div>${rewardHtml(x)}<div class="target-item-foot"><span>Sisa <strong>${money(rem)}</strong></span><span>Update <strong>${formatUpdateDate(x.updatedDate||x.updatedAt?.slice?.(0,10)||'')}</strong></span></div></div>${canManageTargets()?`<div class="target-item-actions"><button type="button" class="secondary compact" onclick="editDashboardTarget('${escTarget(x.id)}')">Edit</button><button type="button" class="danger compact" onclick="deleteDashboardTarget('${escTarget(x.id)}')">Hapus</button></div>`:''}</article>`}
function groupToggleHtml(id,title,count,body,open=true,cls=''){return `<section class="target-group-card ${cls}"><button type="button" class="target-group-toggle" onclick="toggleTargetGroup('${id}')"><span><span class="target-group-chevron ${open?'open':''}">›</span><span><strong>${title}</strong><small>${count}</small></span></span><span class="target-group-toggle-label">${open?'Tutup':'Buka'}</span></button><div id="${id}" class="target-group-content ${open?'':'collapsed'}">${body}</div></section>`}
function targetPct(x){return x.target>0?(Number(x.achieved||0)/Number(x.target))*100:0}
function outletCategoryKey(x){return String(x.description||'Target Outlet').trim()||'Target Outlet'}
function outletCategoryGroupHtml(category,list,groupId){
 const totalTarget=list.reduce((n,x)=>n+Number(x.target||0),0),totalAchieved=list.reduce((n,x)=>n+Number(x.achieved||0),0),pct=totalTarget>0?(totalAchieved/totalTarget)*100:0;
 const rows=list.map(x=>{const p=targetPct(x),rem=Math.max(0,Number(x.target||0)-Number(x.achieved||0));return `<div class="target-outlet-category-row"><div class="target-outlet-category-info"><strong>${escTarget(outletName(x.ownerId))}</strong><small>${escTarget(periodText(x))}${x.targetSalesEmail?` • Sales: ${escTarget(outletSalesName(x))}`:''} • Update ${formatUpdateDate(x.updatedDate||x.updatedAt?.slice?.(0,10)||'')}</small><div class="target-outlet-category-bar"><span style="width:${Math.min(100,Math.max(0,p))}%"></span></div></div><div class="target-outlet-category-value"><strong>${Math.round(p*10)/10}%</strong><small>${money(x.achieved)} / ${money(x.target)}</small></div>${outletRewardHtml(x)}${canManageTargets()?`<div class="target-item-actions"><button type="button" class="secondary compact" onclick="editDashboardTarget('${escTarget(x.id)}')">Edit</button><button type="button" class="danger compact" onclick="deleteDashboardTarget('${escTarget(x.id)}')">Hapus</button></div>`:''}</div>`}).join('');
 const summary=`<div class="target-category-summary"><strong>${Math.round(pct*10)/10}%</strong><small>${list.length} outlet • Target ${money(totalTarget)} • Realisasi ${money(totalAchieved)}</small></div>`;
 return `<section class="target-outlet-category-card target-category-collapsible"><button type="button" class="target-outlet-category-toggle" onclick="toggleTargetCategory('${groupId}')" aria-expanded="true"><span class="target-category-left"><span class="target-group-chevron open">›</span><span><strong>🏷️ ${escTarget(category)}</strong><small>${list.length} outlet • Target ${money(totalTarget)} • Realisasi ${money(totalAchieved)}</small></span></span><span class="target-category-right"><strong>${Math.round(pct*10)/10}%</strong><span class="target-category-toggle-label">Tutup</span></span></button><div id="${groupId}" class="target-outlet-category-list target-category-content">${rows}</div></section>`;
}
function outletGroupsBySales(rows,prefix){const salesGroups={};rows.forEach(x=>{const key=String(x.targetSalesEmail||'').toLowerCase()||'__unassigned__';(salesGroups[key]??=[]).push(x)});return Object.entries(salesGroups).map(([sales,list],i)=>{const cats={};list.forEach(x=>{(cats[outletCategoryKey(x)]??=[]).push(x)});const body=Object.entries(cats).map(([cat,items],j)=>outletCategoryGroupHtml(cat,items,`${prefix}_${i}_${j}`)).join('');const salesLabel=sales==='__unassigned__'?'Tanpa Sales':salesName(sales);return `<div class="target-outlet-sales-group"><div class="target-outlet-sales-head"><span>👤 <strong>${escTarget(salesLabel)}</strong></span><span>${list.length} outlet</span></div>${body}</div>`}).join('')}
async function renderDashboardTargets({sync=true}={}){
 if(sync)await pullTargetsFromServer({silent:true});
 fillTargetMonthFilter();
 fillTargetDurationFilter();
 const host=document.getElementById('targetDashboardGroups')||document.getElementById('dashboardTargetList');
 if(!host)return;
 const duration=document.getElementById('targetDurationFilter')?.value||'all';
 let rows=targetRows().filter(x=>duration==='all'||periodMonths(x)===Number(duration));
 const u=getAppUser();
 const email=String(u?.email||'').toLowerCase();
 const isManager=canManageTargets();
 if(!isManager){rows=rows.filter(x=>x.type==='sales'?String(x.ownerId||'').toLowerCase()===email:String(x.targetSalesEmail||'').toLowerCase()===email)}
 if(!rows.length){host.innerHTML='<div class="empty target-page-empty">Belum ada target aktif pada periode ini.</div>';return}
 const groups={};
 rows.forEach(x=>{
   let key='__unassigned__';
   if(x.type==='sales') key=String(x.ownerId||'').toLowerCase()||'__unassigned__';
   else key=String(x.targetSalesEmail||'').toLowerCase()||'__unassigned__';
   (groups[key]??=[]).push(x);
 });
 const groupEntries=Object.entries(groups).sort((a,b)=>{
   const an=a[0]==='__unassigned__'?'':salesName(a[0]);
   const bn=b[0]==='__unassigned__'?'':salesName(b[0]);
   return an.localeCompare(bn,'id');
 });
 let html='';
 groupEntries.forEach(([key,list],idx)=>{
   const name=key==='__unassigned__'?'Tanpa Sales':salesName(key);
   const salesTargets=list.filter(x=>x.type==='sales');
   const outletTargets=list.filter(x=>x.type==='outlet');
   let body='';
   if(salesTargets.length)body+=groupToggleHtml(`targetSalesOwner_${idx}_sales`,`🎯 Target Sales`,`${salesTargets.length} target`,`<div class="target-group-list">${salesTargets.map(targetCardHtml).join('')}</div>`,true,'target-sales-subgroup');
   if(outletTargets.length)body+=groupToggleHtml(`targetSalesOwner_${idx}_outlet`,`🏪 Target Outlet`,`${outletTargets.length} outlet`,outletGroupsBySales(outletTargets,'dashboardOutlet'),true,'target-sales-subgroup');
   html+=groupToggleHtml(`targetSalesOwner_${idx}`,`👤 ${escTarget(name)}`,`${list.length} target`,body,true,'target-owner-group');
 });
 host.innerHTML=html;
}
async function renderDashboardTargetSummary(){
 const host=document.getElementById('dashboardTargetSummary');if(!host)return;const u=getAppUser();if(!u){host.classList.add('hidden');return;}
 const email=String(u.email||'').toLowerCase();const rows=targetRows().filter(x=>targetActiveInMonth(x,monthNow())&&(String(x.ownerId||'').toLowerCase()===email||String(x.targetSalesEmail||'').toLowerCase()===email));
 if(!rows.length){host.classList.add('hidden');host.innerHTML='';return;}host.classList.remove('hidden');const sales=rows.filter(x=>x.type==='sales').length,outlets=rows.filter(x=>x.type==='outlet').length;
 host.innerHTML=`<button type="button" class="dashboard-target-summary-card" onclick="openTargetCatalog()"><span class="dashboard-target-summary-icon">🎯</span><span class="dashboard-target-summary-copy"><strong>Target Saya</strong><small>${sales} target sales${outlets?` • ${outlets} target outlet`:''}</small><em>Buka Target & Reward</em></span><span class="dashboard-target-summary-arrow">›</span></button>`;
}
function openTargetCatalog(){const view=document.getElementById('targetCatalogView'),list=document.getElementById('targetCatalogList');if(!view||!list)return;const u=getAppUser();if(!u)return;hide();view.classList.remove('hidden');const email=String(u.email||'').toLowerCase();const rows=targetRows().filter(x=>targetActiveInMonth(x,monthNow())&&(String(x.ownerId||'').toLowerCase()===email||String(x.targetSalesEmail||'').toLowerCase()===email));const sales=rows.filter(x=>x.type==='sales'),outlets=rows.filter(x=>x.type==='outlet');document.getElementById('targetCatalogSubtitle').textContent=`${rows.length} target aktif • ${monthLabel(monthNow())}`;let html='';if(sales.length)html+=`<section class="target-catalog-section"><div class="target-catalog-section-head"><strong>🎯 Target Sales</strong><small>${sales.length} target</small></div><div class="target-catalog-list-inner">${sales.map(targetCardHtml).join('')}</div></section>`;if(outlets.length)html+=`<section class="target-catalog-section"><div class="target-catalog-section-head"><strong>🏪 Target Outlet</strong><small>${outlets.length} outlet</small></div><div class="target-catalog-list-inner">${outletGroupsBySales(outlets,'catalogOutlet')}</div></section>`;list.innerHTML=html||'<div class="empty">Belum ada target aktif.</div>';}
function closeTargetCatalog(){document.getElementById('targetCatalogView')?.classList.add('hidden');if(typeof showDashboard==='function')showDashboard()}

function toggleDashboardTargetSummary(){const body=document.getElementById('dashboardTargetSummaryBody');if(!body)return;const collapsed=body.classList.toggle('collapsed');localStorage.setItem('rml_dashboard_target_summary_collapsed',collapsed?'1':'0');const btn=body.previousElementSibling?.querySelector('.dashboard-target-collapse-btn');btn?.setAttribute('aria-expanded',collapsed?'false':'true');btn?.querySelector('.dashboard-target-chevron')?.classList.toggle('collapsed',collapsed)}
async function renderSettingsTargetList(){
 const host=document.getElementById('targetSettingsList');if(!host)return;
 const filter=document.getElementById('targetSettingsMonthFilter');
 const month=filter?.value||monthNow();
 const rows=targetRows().filter(x=>targetActiveInMonth(x,month));
 if(!rows.length){host.innerHTML='<div class="empty target-settings-empty">Belum ada target aktif pada periode ini.</div>';return;}
 const salesRows=rows.filter(x=>x.type==='sales'),outletRows=rows.filter(x=>x.type==='outlet');
 let html='';
 if(salesRows.length)html+=groupToggleHtml('settingsTargetGroupSales','🎯 Target Sales',`${salesRows.length} target`,`<div class="target-group-list">${salesRows.map(targetCardHtml).join('')}</div>`,true,'target-group-sales');
 if(outletRows.length){const body=outletGroupsBySales(outletRows,'settingsOutlet');html+=groupToggleHtml('settingsTargetGroupOutlet','🏪 Target Outlet',`${outletRows.length} outlet`,body,true,'target-group-outlet')}
 host.innerHTML=html;
}
async function refreshSettingsTargetList(){try{await pullTargetsFromServer({silent:false,throwOnError:true});fillTargetSettingsMonthFilter();await renderSettingsTargetList();if(typeof toast==='function')toast('Target berhasil diperbarui dari server')}catch(e){if(typeof toast==='function')toast(`Refresh target gagal: ${e.message||'periksa koneksi Supabase'}`)}}
function fillTargetSettingsMonthFilter(){const el=document.getElementById('targetSettingsMonthFilter');if(!el)return;const cur=el.value||monthNow(),months=new Set([cur,monthNow()]);targetRows().forEach(x=>{for(let i=0;i<periodMonths(x);i++)months.add(addMonths(targetStart(x),i))});el.innerHTML=[...months].sort().reverse().map(m=>`<option value="${escTarget(m)}">${escTarget(monthLabel(m))}</option>`).join('');el.value=months.has(cur)?cur:monthNow()}

async function showTargetView(){
 const u=getAppUser();if(!u)return;
 hide();document.getElementById('targetView')?.classList.remove('hidden');
 const back=document.querySelector('#targetView .target-page-head .back');
 if(back){back.textContent=canManageTargets()?'← Kembali ke Pengaturan':'← Kembali ke Dashboard';back.onclick=canManageTargets()?showAreaAssignments:showDashboard;}
 fillTargetDurationFilter();
 await renderDashboardTargets({sync:true});
}
async function showTargetManagementPage(){
 if(!canManageTargets())return toast('Hanya Admin/Supervisor yang dapat melihat dan mengelola target');
 hide();
 document.getElementById('targetView')?.classList.remove('hidden');
 const back=document.querySelector('#targetView .target-page-head .back');
 if(back){back.textContent='← Kembali ke Pengaturan';back.onclick=showAreaAssignments;}
 fillTargetDurationFilter();
 await renderDashboardTargets({sync:true});
}
async function refreshTargetManagementPage(){
 const btn=document.querySelector('#targetView .target-page-actions button[onclick*="refreshTargetManagementPage"]');
 if(btn){btn.disabled=true;btn.textContent='↻ Memuat...';}
 try{
   await pullTargetsFromServer({silent:false,throwOnError:true});
   fillTargetDurationFilter();
   await renderDashboardTargets({sync:false});
   if(typeof toast==='function')toast('Target berhasil diperbarui dari server');
 }catch(e){
   if(typeof toast==='function')toast(`Refresh target gagal: ${e.message||'periksa koneksi Supabase'}`);
 }finally{
   if(btn){btn.disabled=false;btn.textContent='↻ Refresh';}
 }
}
function toggleTargetGroup(id){const el=document.getElementById(id);if(!el)return;el.classList.toggle('collapsed');const btn=el.previousElementSibling,chev=btn?.querySelector('.target-group-chevron'),label=btn?.querySelector('.target-group-toggle-label'),open=!el.classList.contains('collapsed');chev?.classList.toggle('open',open);if(label)label.textContent=open?'Tutup':'Buka';btn?.setAttribute('aria-expanded',open?'true':'false')}
function toggleTargetCategory(id){const el=document.getElementById(id);if(!el)return;const btn=el.previousElementSibling;const collapsed=el.classList.toggle('collapsed');const open=!collapsed;btn?.setAttribute('aria-expanded',open?'true':'false');btn?.querySelector('.target-group-chevron')?.classList.toggle('open',open);const label=btn?.querySelector('.target-category-toggle-label');if(label)label.textContent=open?'Tutup':'Buka'}
async function renderTargetManagerList(){const host=document.getElementById('targetManagerList');if(!host)return;const month=document.getElementById('targetMonthInput')?.value||monthNow();const rows=targetRows().filter(x=>targetActiveInMonth(x,month));host.innerHTML=rows.length?rows.map(x=>`<div class="target-manager-row"><div><strong>${x.type==='sales'?'Target Sales':'Target Outlet'}</strong><small>${escTarget(ownerMeta(x))} • ${escTarget(x.description||'Target')} • ${escTarget(periodText(x))}${x.type==='outlet'&&x.targetSalesEmail?` • Sales: ${escTarget(outletSalesName(x))}`:''}${targetTiers(x).length?` • ${escTarget(rewardSummaryText(x))}`:''} • Update ${escTarget(formatUpdateDate(x.updatedDate||x.updatedAt?.slice?.(0,10)||'-'))}</small></div><strong>${money(x.target)}</strong></div>`).join(''):'<div class="empty">Belum ada target aktif pada periode ini.</div>'}
function refreshTargetRewardFields(){const type=document.getElementById('targetTypeInput')?.value||'sales';const salesSection=document.getElementById('targetSalesTierSection'),outletSection=document.getElementById('targetOutletRewardSection');if(salesSection)salesSection.classList.toggle('hidden',type!=='sales');if(outletSection)outletSection.classList.toggle('hidden',type!=='outlet');const label=document.getElementById('targetRewardValueLabel');const input=document.getElementById('targetRewardValueInput');const rewardType=document.getElementById('targetRewardTypeInput')?.value||'none';if(!input)return;if(rewardType==='percent'){if(label)label.textContent='Isi persentase reward. Reward dihitung dari realisasi setelah target tercapai.';input.placeholder='Contoh: 5';input.max='100';}else if(rewardType==='nominal'){if(label)label.textContent='Isi nominal reward jika target tercapai.';input.placeholder='Contoh: 125000';input.removeAttribute('max');}else{if(label)label.textContent='Tanpa reward';input.placeholder='Tidak ada reward';input.removeAttribute('max');input.value='';}}
function resetTargetForm(){const byId=id=>document.getElementById(id);byId('targetEditId').value='';byId('targetTypeInput').value='sales';byId('targetMonthInput').value=monthNow();byId('targetDurationInput').value='1';const amount=byId('targetAmountInput');if(amount)amount.value='';byId('targetAchievedInput').value='';byId('targetRewardTypeInput').value='nominal';byId('targetRewardValueInput').value='';renderTargetTiersForm([{target:'',rewardType:'nominal',rewardValue:''}]);byId('targetDescriptionInput').value='';const date=byId('targetUpdatedDateInput');if(date)date.value=new Date().toISOString().slice(0,10);fillTargetManagerFields();refreshTargetRewardFields()}
async function openTargetManager(id){if(!canManageTargets()){return toast('Hanya Admin/Supervisor yang dapat mengelola target');}document.getElementById('targetManagerModal')?.classList.remove('hidden');resetTargetForm();await pullTargetsFromServer({silent:false});await renderTargetManagerList();if(id)await editDashboardTarget(id)}
function closeTargetManager(){document.getElementById('targetManagerModal')?.classList.add('hidden')}
async function editDashboardTarget(id){
 if(!canManageTargets())return toast('Tidak memiliki izin mengedit target');
 await pullTargetsFromServer({silent:false});
 const x=targetRows().find(r=>String(r.id)===String(id));
 if(!x)return toast('Target tidak ditemukan di server');
 const modal=document.getElementById('targetManagerModal');
 modal?.classList.remove('hidden');
 const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??'';};
 set('targetEditId',x.id);
 set('targetTypeInput',x.type||'sales');
 set('targetMonthInput',targetStart(x));
 set('targetDurationInput',periodMonths(x));
 set('targetAchievedInput',x.achieved||0);
 set('targetDescriptionInput',x.description||'');
 set('targetUpdatedDateInput',x.updatedDate||x.updatedAt?.slice?.(0,10)||new Date().toISOString().slice(0,10));
 set('targetOwnerInput',x.ownerId||'');
 set('targetSalesInput',x.targetSalesEmail||'');
 const amount=document.getElementById('targetAmountInput');
 if(amount)amount.value=x.type==='outlet'?(x.target||''):'';
 set('targetRewardTypeInput',x.type==='outlet'?(x.rewardType||'none'):'none');
 set('targetRewardValueInput',x.type==='outlet'?(x.rewardValue||''):'');
 fillTargetManagerFields();
 // Re-apply exact saved selections after options are rebuilt.
 set('targetOwnerInput',x.ownerId||'');
 if(x.type==='outlet')set('targetSalesInput',x.targetSalesEmail||'');
 refreshTargetRewardFields();
 if(x.type==='sales'){
   setTargetTiersForm(x.tiers&&x.tiers.length?x.tiers:[{target:x.target,rewardType:x.rewardType||'nominal',rewardValue:x.rewardValue||0}]);
 }else{
   renderTargetTiersForm([]);
 }
 await renderTargetManagerList();
}
function readTargetTiersForm(){const host=document.getElementById('targetTierList');if(!host)return [];return [...host.querySelectorAll('.target-tier-row')].map(row=>({target:Number(row.querySelector('.target-tier-target')?.value||0),rewardType:String(row.querySelector('.target-tier-type')?.value||'nominal'),rewardValue:Number(row.querySelector('.target-tier-value')?.value||0)})).filter(t=>t.target>0||t.rewardValue>0)}
function renderTargetTiersForm(tiers){const host=document.getElementById('targetTierList');if(!host)return;const list=Array.isArray(tiers)&&tiers.length?tiers:[{target:'',rewardType:'nominal',rewardValue:''}];host.innerHTML=list.map((t,i)=>`<div class="target-tier-row"><div class="target-tier-head"><strong>Tingkat ${i+1}</strong><button type="button" class="danger compact" onclick="removeTargetTier(${i})">Hapus</button></div><div class="target-tier-grid"><input class="target-tier-target" type="number" min="0" step="1000" placeholder="Target Rp" value="${escTarget(t.target??'')}"><select class="target-tier-type"><option value="nominal" ${t.rewardType==='nominal'?'selected':''}>Nominal</option><option value="percent" ${t.rewardType==='percent'?'selected':''}>Persentase</option></select><input class="target-tier-value" type="number" min="0" step="0.01" placeholder="Reward" value="${escTarget(t.rewardValue??'')}"></div></div>`).join('');}
function addTargetTier(){const tiers=readTargetTiersForm();tiers.push({target:'',rewardType:'nominal',rewardValue:''});renderTargetTiersForm(tiers)}
function removeTargetTier(i){const tiers=readTargetTiersForm();tiers.splice(i,1);renderTargetTiersForm(tiers)}
function setTargetTiersForm(tiers){renderTargetTiersForm(tiers)}
function readTargetTiersFromDescription(description){return decodeRewardTiers(description).tiers}

async function saveDashboardTarget(){if(!canManageTargets())return toast('Hanya Admin/Supervisor yang dapat menyimpan target');const type=document.getElementById('targetTypeInput').value,startMonth=document.getElementById('targetMonthInput').value,durationMonths=Number(document.getElementById('targetDurationInput').value||1),ownerId=document.getElementById('targetOwnerInput').value,description=document.getElementById('targetDescriptionInput').value.trim(),achieved=Number(document.getElementById('targetAchievedInput').value||0),updatedDate=new Date().toISOString().slice(0,10),targetSalesEmail=type==='outlet'?(document.getElementById('targetSalesInput')?.value||''):'',id=document.getElementById('targetEditId').value||`T-${Date.now()}`;if(!startMonth||!ownerId||!description)return toast('Lengkapi periode, pemilik target, dan deskripsi target.');if(![1,3,6,12].includes(durationMonths))return toast('Periode target hanya 1, 3, 6, atau 12 bulan.');let tiers=[],target=0,rewardType='none',rewardValue=0;if(type==='sales'){tiers=readTargetTiersForm();if(!tiers.length)return toast('Tambahkan minimal 1 tingkat target dan reward.');if(tiers.some(t=>t.target<=0||t.rewardValue<=0))return toast('Semua tingkat harus memiliki target dan reward.');if(tiers.some(t=>t.rewardType==='percent'&&t.rewardValue>100))return toast('Reward persentase maksimal 100%.');for(let i=1;i<tiers.length;i++)if(tiers[i].target<=tiers[i-1].target)return toast('Target tiap tingkat harus semakin besar.');target=Math.max(...tiers.map(t=>t.target));}else{target=Number(document.getElementById('targetAmountInput')?.value||0);rewardType=String(document.getElementById('targetRewardTypeInput')?.value||'none');rewardValue=Number(document.getElementById('targetRewardValueInput')?.value||0);if(target<=0)return toast('Isi target outlet.');if(rewardType==='percent'&&rewardValue>100)return toast('Reward persentase maksimal 100%.');if(rewardType!=='none'&&rewardValue<=0)return toast('Isi nilai reward outlet.');if(!targetSalesEmail)return toast('Pilih sales untuk target outlet agar muncul di Dashboard Sales.');}const row={id,type,startMonth,month:startMonth,durationMonths,ownerId,targetSalesEmail,description,target,achieved:Math.max(0,achieved),tiers,rewardType,rewardValue,updatedDate,updatedAt:new Date().toISOString()};const token=sessionToken();if(!navigator.onLine||!token)return toast('Target memerlukan koneksi internet agar tersimpan untuk semua Sales.');try{await targetRpc('app_admin_upsert_dashboard_target',{p_token:token,p_target:targetToRemote(row)});await pullTargetsFromServer({silent:false});fillTargetDurationFilter();await renderDashboardTargets({sync:false});await renderSettingsTargetList();await renderTargetManagerList();resetTargetForm();toast(type==='outlet'?'Target outlet berhasil disimpan':'Target bertingkat berhasil disimpan');}catch(e){toast(`Gagal menyimpan target: ${e.message||'periksa SQL/permission Supabase'}`)}}
async function deleteDashboardTarget(id){if(!canManageTargets())return toast('Tidak memiliki izin menghapus target');if(!confirm('Hapus target ini?'))return;const token=sessionToken();if(!navigator.onLine||!token)return toast('Penghapusan target memerlukan koneksi internet.');try{await targetRpc('app_admin_delete_dashboard_target',{p_token:token,p_target_id:String(id)});await pullTargetsFromServer({silent:false});await renderDashboardTargets({sync:false});await renderSettingsTargetList();await renderTargetManagerList();toast('Target berhasil dihapus dari server');}catch(e){toast(`Gagal menghapus target: ${e.message||'periksa SQL/permission Supabase'}`)}}
window.addTargetTier=addTargetTier;window.removeTargetTier=removeTargetTier;window.setTargetTiersForm=setTargetTiersForm;window.renderDashboardTargets=renderDashboardTargets;window.showTargetView=showTargetView;window.showTargetManagementPage=showTargetManagementPage;window.refreshTargetManagementPage=refreshTargetManagementPage;window.toggleDashboardTargetSummary=toggleDashboardTargetSummary;window.openTargetManager=openTargetManager;window.closeTargetManager=closeTargetManager;window.editDashboardTarget=editDashboardTarget;window.saveDashboardTarget=saveDashboardTarget;window.deleteDashboardTarget=deleteDashboardTarget;window.refreshTargetManagerFields=fillTargetManagerFields;window.refreshTargetRewardFields=refreshTargetRewardFields;window.toggleTargetGroup=toggleTargetGroup;window.toggleTargetCategory=toggleTargetCategory;window.pullTargetsFromServer=pullTargetsFromServer;window.renderDashboardTargetSummary=renderDashboardTargetSummary;window.openTargetCatalog=openTargetCatalog;window.closeTargetCatalog=closeTargetCatalog;window.renderSettingsTargetList=renderSettingsTargetList;window.refreshSettingsTargetList=refreshSettingsTargetList;window.fillTargetSettingsMonthFilter=fillTargetSettingsMonthFilter;
const oldRefresh=window.refreshDashboard;window.refreshDashboard=async function(){const r=oldRefresh?await oldRefresh.apply(this,arguments):undefined;try{await pullTargetsFromServer({silent:true})}catch(_){}renderDashboardTargetSummary();if(!document.getElementById('targetView')?.classList.contains('hidden'))await renderDashboardTargets({sync:false});return r};
})();
