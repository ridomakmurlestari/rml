/* RML Sales Visit v1.8.8 - Dashboard Target Grouped / Sales Scoped */
(function(){
const TARGET_KEY='rml_dashboard_targets_v1';
const targetRows=()=>{try{const v=JSON.parse(localStorage.getItem(TARGET_KEY)||'[]');return Array.isArray(v)?v:[]}catch(_){return []}};
const saveTargetRows=rows=>localStorage.setItem(TARGET_KEY,JSON.stringify(rows||[]));
const escTarget=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v||0));
const monthNow=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const monthLabel=v=>{if(!v)return '-';const [y,m]=String(v).split('-');return new Date(Number(y),Number(m)-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})};
const addMonths=(ym,n)=>{const [y,m]=String(ym).split('-').map(Number);const d=new Date(y,m-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const periodMonths=x=>Number(x.durationMonths||1);
const targetStart=x=>x.startMonth||x.month||monthNow();
const targetEnd=x=>addMonths(targetStart(x),periodMonths(x)-1);
const targetActiveInMonth=(x,m)=>m>=targetStart(x)&&m<=targetEnd(x);
const DEFAULT_TARGET_USERS=[
 {email:'rini@rml.app',name:'Rini',role:'sales',active:true},
 {email:'lisna@rml.app',name:'Lisna',role:'sales',active:true},
 {email:'septino@rml.app',name:'Septino',role:'sales',active:true},
 {email:'admin@rml.app',name:'Admin',role:'admin',active:true}
];
const usersList=()=>{
 try{
   const saved=JSON.parse(localStorage.getItem('rml_user_accounts_v1')||'null');
   if(Array.isArray(saved)&&saved.length) return saved;
 }catch(_){}
 return DEFAULT_TARGET_USERS;
};
const getAppUser=()=>{try{return currentUser||window.currentUser||null}catch(_){return window.currentUser||null}};
const canManageTargets=()=>{const u=getAppUser();return !!(u&&(u.role==='admin'||(typeof isSupervisorUser==='function'&&isSupervisorUser(u))));};
const isSalesUser=()=>getAppUser()?.role==='sales';
function customersList(){return typeof window.customers==='function'?(customers()||[]).filter(c=>!c.isHidden):[]}
function salesName(email){
 const u=usersList().find(u=>String(u.email||'').toLowerCase()===String(email||'').toLowerCase());
 return u?.name||email||'-';
}
function outletName(no){return customersList().find(c=>String(c.no)===String(no))?.name||no||'-'}
function outletSalesName(x){return salesName(x.targetSalesEmail||x.salesEmail||x.assignedSalesEmail)}
function fillTargetMonthFilter(){
 const el=document.getElementById('targetMonthFilter'); if(!el)return;
 const cur=el.value||monthNow(); const months=new Set([cur,monthNow()]);
 targetRows().forEach(x=>{const st=targetStart(x),dur=periodMonths(x); for(let i=0;i<dur;i++)months.add(addMonths(st,i));});
 el.innerHTML=[...months].sort().reverse().map(m=>`<option value="${escTarget(m)}">${escTarget(monthLabel(m))}</option>`).join('');
 el.value=months.has(cur)?cur:monthNow();
}
function fillTargetManagerFields(){
 const type=document.getElementById('targetTypeInput')?.value||'sales';
 const owner=document.getElementById('targetOwnerInput'); const label=document.getElementById('targetOwnerLabel'); const salesWrap=document.getElementById('targetSalesWrap'); const sales=document.getElementById('targetSalesInput');
 if(!owner)return;
 if(type==='sales'){
   label.textContent='Sales';
   owner.innerHTML=usersList().filter(u=>u.role==='sales'&&u.active!==false).map(u=>`<option value="${escTarget(u.email)}">${escTarget(u.name)}</option>`).join('');
   if(salesWrap)salesWrap.classList.add('hidden');
 }else{
   label.textContent='Outlet';
   owner.innerHTML=customersList().map(c=>`<option value="${escTarget(c.no)}">${escTarget(c.name)}${c.area?` — ${escTarget(c.area)}`:''}</option>`).join('');
   if(salesWrap)salesWrap.classList.remove('hidden');
   if(sales){sales.innerHTML=usersList().filter(u=>u.role==='sales'&&u.active!==false).map(u=>`<option value="${escTarget(u.email)}">${escTarget(u.name)}</option>`).join('');}
 }
}
function formatUpdateDate(v){if(!v)return '-';const d=new Date(String(v).length===10?String(v)+'T00:00:00':v);if(Number.isNaN(d.getTime()))return escTarget(v);return d.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});}
function periodText(x){const n=periodMonths(x);return n===1?'1 bulan':`${n} bulan`}
function ownerMeta(x){return x.type==='sales'?salesName(x.ownerId):outletName(x.ownerId)}
function targetCardHtml(x){
 const pct=x.target>0?(Number(x.achieved||0)/Number(x.target))*100:0; const shown=Math.round(pct*10)/10; const rem=Math.max(0,Number(x.target||0)-Number(x.achieved||0));
 const outletSales=x.type==='outlet'&&x.targetSalesEmail?`<span class="target-meta-pill">Sales: <strong>${escTarget(outletSalesName(x))}</strong></span>`:'';
 return `<article class="target-item-row">
   <div class="target-item-main">
     <div class="target-item-top"><div class="target-item-title">${escTarget(ownerMeta(x))}</div><div class="target-percent">${shown}%</div></div>
     <div class="target-item-desc"><span>${escTarget(x.description||'Target')}</span><span>•</span><span>${escTarget(periodText(x))}</span>${outletSales?`<span>•</span>${outletSales}`:''}</div>
     <div class="target-progress-bar"><span style="width:${Math.min(100,Math.max(0,pct))}%"></span></div>
     <div class="target-progress-values"><div><small>Realisasi</small><strong>${money(x.achieved)}</strong></div><div><small>Target</small><strong>${money(x.target)}</strong></div></div>
     <div class="target-item-foot"><span>Sisa <strong>${money(rem)}</strong></span><span>Update <strong>${formatUpdateDate(x.updatedDate||x.updatedAt?.slice?.(0,10)||'')}</strong></span></div>
   </div>
   ${canManageTargets()?`<div class="target-item-actions"><button class="secondary compact" onclick="editDashboardTarget('${escTarget(x.id)}')">Edit</button><button class="danger compact" onclick="deleteDashboardTarget('${escTarget(x.id)}')">Hapus</button></div>`:''}
 </article>`;
}
function groupToggleHtml(id,title,count,body,open=true,cls=''){return `<section class="target-group-card ${cls}"><button type="button" class="target-group-toggle" onclick="toggleTargetGroup('${id}')"><span><span class="target-group-chevron ${open?'open':''}">›</span><span><strong>${title}</strong><small>${count}</small></span></span><span class="target-group-toggle-label">${open?'Tutup':'Buka'}</span></button><div id="${id}" class="target-group-content ${open?'':'collapsed'}">${body}</div></section>`}
function renderDashboardTargets(){
 fillTargetMonthFilter();
 const host=document.getElementById('targetDashboardGroups') || document.getElementById('dashboardTargetList');
 if(!host)return;
 const month=document.getElementById('targetMonthFilter')?.value||monthNow();
 let rows=targetRows().filter(x=>targetActiveInMonth(x,month));
 if(isSalesUser()){const u=getAppUser(); rows=rows.filter(x=>x.type==='sales'?String(x.ownerId||'').toLowerCase()===String(u.email||'').toLowerCase():String(x.targetSalesEmail||'').toLowerCase()===String(u.email||'').toLowerCase());}
 if(!rows.length){host.innerHTML='<div class="empty">Belum ada target pada periode ini.</div>';return;}
 const salesRows=rows.filter(x=>x.type==='sales');
 const outletRows=rows.filter(x=>x.type==='outlet');
 let html='';
 if(salesRows.length) html+=groupToggleHtml('targetGroupSales','🎯 Target Sales',`${salesRows.length} target`,`<div class="target-group-list">${salesRows.map(targetCardHtml).join('')}</div>`,true,'target-group-sales');
 if(outletRows.length){
   const groups={}; outletRows.forEach(x=>{const key=x.description||'Target Outlet';(groups[key]??=[]).push(x)});
   const body=Object.entries(groups).map(([name,list])=>`<div class="target-outlet-program"><div class="target-outlet-program-head"><strong>${escTarget(name)}</strong><span>${list.length} outlet</span></div><div class="target-group-list">${list.map(targetCardHtml).join('')}</div></div>`).join('');
   html+=groupToggleHtml('targetGroupOutlet','🏪 Target Outlet',`${outletRows.length} outlet`,body,true,'target-group-outlet');
 }
 host.innerHTML=html;
}

function showTargetView(){
 const u=getAppUser();
 if(!u)return;
 hide();
 document.getElementById('targetView')?.classList.remove('hidden');
 document.getElementById('manageTargetsBtn')?.classList.toggle('hidden',!canManageTargets());
 fillTargetMonthFilter();
 renderDashboardTargets();
}

function toggleTargetGroup(id){const el=document.getElementById(id);if(!el)return;el.classList.toggle('collapsed');const btn=el.previousElementSibling;const chev=btn?.querySelector('.target-group-chevron');const label=btn?.querySelector('.target-group-toggle-label');const open=!el.classList.contains('collapsed');chev?.classList.toggle('open',open);if(label)label.textContent=open?'Tutup':'Buka'}
function renderTargetManagerList(){const host=document.getElementById('targetManagerList');if(!host)return;const month=document.getElementById('targetMonthInput')?.value||monthNow();const rows=targetRows().filter(x=>targetActiveInMonth(x,month));host.innerHTML=rows.length?rows.map(x=>`<div class="target-manager-row"><div><strong>${x.type==='sales'?'Target Sales':'Target Outlet'}</strong><small>${escTarget(ownerMeta(x))} • ${escTarget(x.description||'Target')} • ${escTarget(periodText(x))}${x.type==='outlet'&&x.targetSalesEmail?` • Sales: ${escTarget(outletSalesName(x))}`:''} • Update ${escTarget(formatUpdateDate(x.updatedDate||x.updatedAt?.slice?.(0,10)||'-'))}</small></div><strong>${money(x.target)}</strong></div>`).join(''):'<div class="empty">Belum ada target aktif pada periode ini.</div>'}
function resetTargetForm(){document.getElementById('targetEditId').value='';document.getElementById('targetTypeInput').value='sales';document.getElementById('targetMonthInput').value=monthNow();document.getElementById('targetDurationInput').value='1';document.getElementById('targetAmountInput').value='';document.getElementById('targetAchievedInput').value='';document.getElementById('targetDescriptionInput').value='';document.getElementById('targetUpdatedDateInput').value=new Date().toISOString().slice(0,10);fillTargetManagerFields()}
function openTargetManager(id){if(!canManageTargets())return;document.getElementById('targetManagerModal')?.classList.remove('hidden');resetTargetForm();renderTargetManagerList();if(id)editDashboardTarget(id)}
function closeTargetManager(){document.getElementById('targetManagerModal')?.classList.add('hidden')}
function editDashboardTarget(id){if(!canManageTargets())return;const x=targetRows().find(r=>r.id===id);if(!x)return;document.getElementById('targetManagerModal')?.classList.remove('hidden');document.getElementById('targetEditId').value=x.id;document.getElementById('targetTypeInput').value=x.type;document.getElementById('targetMonthInput').value=targetStart(x);document.getElementById('targetDurationInput').value=periodMonths(x);document.getElementById('targetAmountInput').value=x.target;document.getElementById('targetAchievedInput').value=x.achieved;document.getElementById('targetDescriptionInput').value=x.description||'';document.getElementById('targetUpdatedDateInput').value=x.updatedDate||x.updatedAt?.slice?.(0,10)||new Date().toISOString().slice(0,10);fillTargetManagerFields();document.getElementById('targetOwnerInput').value=x.ownerId;if(x.type==='outlet'&&document.getElementById('targetSalesInput'))document.getElementById('targetSalesInput').value=x.targetSalesEmail||'';renderTargetManagerList()}
function saveDashboardTarget(){
 if(!canManageTargets())return;const type=document.getElementById('targetTypeInput').value,startMonth=document.getElementById('targetMonthInput').value,durationMonths=Number(document.getElementById('targetDurationInput').value||1),ownerId=document.getElementById('targetOwnerInput').value,description=document.getElementById('targetDescriptionInput').value.trim(),target=Number(document.getElementById('targetAmountInput').value||0),achieved=Number(document.getElementById('targetAchievedInput').value||0),updatedDate=document.getElementById('targetUpdatedDateInput').value||new Date().toISOString().slice(0,10),targetSalesEmail=type==='outlet'?(document.getElementById('targetSalesInput')?.value||''):'' ,id=document.getElementById('targetEditId').value||`T-${Date.now()}`;
 if(!startMonth||!ownerId||!description||target<=0)return toast('Lengkapi periode, pemilik target, deskripsi target, dan target Rupiah.'); if(![1,3,6].includes(durationMonths))return toast('Periode target hanya 1, 3, atau 6 bulan.'); if(type==='outlet'&&!targetSalesEmail)return toast('Pilih sales untuk target outlet agar muncul di Dashboard Sales.');
 const rows=targetRows(),row={id,type,startMonth,month:startMonth,durationMonths,ownerId,targetSalesEmail,description,target,achieved:Math.max(0,achieved),updatedDate,updatedAt:new Date().toISOString()};const i=rows.findIndex(x=>x.id===id);if(i>=0)rows[i]=row;else rows.push(row);saveTargetRows(rows);toast('Target berhasil disimpan');fillTargetMonthFilter();document.getElementById('targetMonthFilter').value=startMonth;renderDashboardTargets();renderTargetManagerList();document.getElementById('targetEditId').value='';document.getElementById('targetAmountInput').value='';document.getElementById('targetAchievedInput').value='';document.getElementById('targetDescriptionInput').value='';document.getElementById('targetUpdatedDateInput').value=new Date().toISOString().slice(0,10)
}
function deleteDashboardTarget(id){if(!canManageTargets()||!confirm('Hapus target ini?'))return;saveTargetRows(targetRows().filter(x=>x.id!==id));renderDashboardTargets();renderTargetManagerList();toast('Target dihapus')}
window.renderDashboardTargets=renderDashboardTargets;window.showTargetView=showTargetView;window.openTargetManager=openTargetManager;window.closeTargetManager=closeTargetManager;window.editDashboardTarget=editDashboardTarget;window.saveDashboardTarget=saveDashboardTarget;window.deleteDashboardTarget=deleteDashboardTarget;window.refreshTargetManagerFields=fillTargetManagerFields;window.toggleTargetGroup=toggleTargetGroup;
const oldRefresh=window.refreshDashboard;window.refreshDashboard=async function(){const r=oldRefresh?await oldRefresh.apply(this,arguments):undefined;if(!document.getElementById('targetView')?.classList.contains('hidden'))renderDashboardTargets();return r};
})();
