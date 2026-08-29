/* RML Sales Visit v1.8.4 - Dashboard Target
   Target UI is intentionally local-only in this first build to avoid extra Supabase egress.
*/
(function(){
const TARGET_KEY='rml_dashboard_targets_v1';
function targetRows(){try{const v=JSON.parse(localStorage.getItem(TARGET_KEY)||'[]');return Array.isArray(v)?v:[]}catch(_){return []}}
function saveTargetRows(rows){localStorage.setItem(TARGET_KEY,JSON.stringify(rows||[]))}
function targetEsc(v){return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function money(v){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v||0))}
function monthNow(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function monthLabel(v){if(!v)return '-';const [y,m]=String(v).split('-');return new Date(Number(y),Number(m)-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})}
function canManageTargets(){return !!(window.currentUser&&(currentUser.role==='admin'||(typeof isSupervisorUser==='function'&&isSupervisorUser())))}
function usersList(){return Array.isArray(window.USERS)?USERS:[]}
function productList(){return typeof productCatalog==='function'?productCatalog():[]}
function fillTargetMonthFilter(){const el=document.getElementById('targetMonthFilter');if(!el)return;const cur=el.value||monthNow();const months=new Set([cur,monthNow(),...targetRows().map(x=>x.month).filter(Boolean)]);el.innerHTML=[...months].sort().reverse().map(m=>`<option value="${targetEsc(m)}">${targetEsc(monthLabel(m))}</option>`).join('');el.value=months.has(cur)?cur:monthNow()}
function fillTargetManagerFields(){
 const type=document.getElementById('targetTypeInput')?.value||'sales';
 const owner=document.getElementById('targetOwnerInput'); const label=document.getElementById('targetOwnerLabel'); const prod=document.getElementById('targetProductInput');
 if(owner){
  if(type==='sales'){label.textContent='Sales';owner.innerHTML=usersList().filter(u=>u.role==='sales'&&u.active!==false).map(u=>`<option value="${targetEsc(u.email)}">${targetEsc(u.name)}</option>`).join('')}
  else {label.textContent='Outlet';const cs=typeof customers==='function'?customers().filter(c=>!c.isHidden):[];owner.innerHTML=cs.map(c=>`<option value="${targetEsc(c.no)}">${targetEsc(c.name)}${c.area?` — ${targetEsc(c.area)}`:''}</option>`).join('')}
 }
 if(prod){const rows=productList().filter(p=>p&&p.active!==false);prod.innerHTML=rows.length?rows.map(p=>`<option value="${targetEsc(p.id||p.code||p.name)}">${targetEsc(p.name||p.product_name||p.code||p.id)}</option>`).join(''):'<option value="">Belum ada produk</option>'}
}
function refreshTargetManagerFields(){fillTargetManagerFields()}
function renderDashboardTargets(){
 fillTargetMonthFilter();
 const host=document.getElementById('dashboardTargetList'); if(!host)return;
 const month=document.getElementById('targetMonthFilter')?.value||monthNow();
 const all=targetRows().filter(x=>x.month===month);
 const isAdmin=currentUser?.role==='admin';
 let rows=all;
 if(currentUser?.role==='sales'&&!isSupervisorUser()) rows=rows.filter(x=>x.type==='sales'?x.ownerId===currentUser.email:assignedOutletForCurrentSales(x.ownerId));
 if(!rows.length){host.innerHTML='<div class="empty">Belum ada target untuk bulan ini.</div>';return}
 host.innerHTML=rows.map(x=>{const pct=x.target>0?Math.min(999,(Number(x.achieved||0)/Number(x.target))*100):0;const shownPct=Math.round(pct*10)/10;const ownerName=x.type==='sales'?(usersList().find(u=>u.email===x.ownerId)?.name||x.ownerId):(typeof customers==='function'?(customers().find(c=>String(c.no)===String(x.ownerId))?.name||x.ownerId):x.ownerId);const p=productList().find(p=>String(p.id||p.code||p.name)===String(x.productId));const productName=p?.name||p?.product_name||p?.code||x.productId||'Produk';return `<div class="target-progress-card"><div class="target-progress-head"><div><strong>${x.type==='sales'?'Target Sales':'Target Outlet'}</strong><div class="meta">${targetEsc(ownerName)} • ${targetEsc(productName)}</div></div><span class="target-percent">${shownPct}%</span></div><div class="target-progress-bar"><span style="width:${Math.min(100,Math.max(0,pct))}%"></span></div><div class="target-progress-values"><span>${money(x.achieved)}</span><span>Target ${money(x.target)}</span></div><div class="target-progress-foot"><span>Sisa <strong>${money(Math.max(0,Number(x.target||0)-Number(x.achieved||0)))}</strong></span>${canManageTargets()?`<span><button class="secondary compact" onclick="editDashboardTarget('${targetEsc(x.id)}')">Edit</button> <button class="danger compact" onclick="deleteDashboardTarget('${targetEsc(x.id)}')">Hapus</button></span>`:''}</div></div>`}).join('');
}
function assignedOutletForCurrentSales(no){if(typeof customers!=='function')return false;const c=customers().find(c=>String(c.no)===String(no));if(!c)return false;return c.assignedSalesEmail===currentUser?.email||c.assignedSalesEmail==='__ALL__'||(typeof isAreaAssigned==='function'&&isAreaAssigned(currentUser?.email,c.area))}
function renderTargetManagerList(){const host=document.getElementById('targetManagerList');if(!host)return;const month=document.getElementById('targetMonthInput')?.value||monthNow();const rows=targetRows().filter(x=>x.month===month);host.innerHTML=rows.length?rows.map(x=>`<div class="target-manager-row"><div><strong>${x.type==='sales'?'Sales':'Outlet'}</strong><small>${targetEsc(x.ownerId)} • ${targetEsc(x.productId)}</small></div><strong>${money(x.target)}</strong></div>`).join(''):'<div class="empty">Belum ada target pada bulan ini.</div>'}
function openTargetManager(id){if(!canManageTargets())return;document.getElementById('targetManagerModal')?.classList.remove('hidden');document.getElementById('targetEditId').value='';document.getElementById('targetTypeInput').value='sales';document.getElementById('targetMonthInput').value=monthNow();document.getElementById('targetAmountInput').value='';document.getElementById('targetAchievedInput').value='';fillTargetManagerFields();renderTargetManagerList();if(id)editDashboardTarget(id)}
function closeTargetManager(){document.getElementById('targetManagerModal')?.classList.add('hidden')}
function editDashboardTarget(id){if(!canManageTargets())return;const x=targetRows().find(r=>r.id===id);if(!x)return;openTargetManager();document.getElementById('targetEditId').value=x.id;document.getElementById('targetTypeInput').value=x.type;document.getElementById('targetMonthInput').value=x.month;fillTargetManagerFields();document.getElementById('targetOwnerInput').value=x.ownerId;document.getElementById('targetProductInput').value=x.productId;document.getElementById('targetAmountInput').value=x.target;document.getElementById('targetAchievedInput').value=x.achieved}
function saveDashboardTarget(){if(!canManageTargets())return;const type=document.getElementById('targetTypeInput').value,month=document.getElementById('targetMonthInput').value,ownerId=document.getElementById('targetOwnerInput').value,productId=document.getElementById('targetProductInput').value,target=Number(document.getElementById('targetAmountInput').value||0),achieved=Number(document.getElementById('targetAchievedInput').value||0),id=document.getElementById('targetEditId').value||`T-${Date.now()}`;if(!month||!ownerId||!productId||target<=0)return toast('Lengkapi bulan, pemilik target, produk, dan target Rupiah.');const rows=targetRows();const row={id,type,month,ownerId,productId,target,achieved:Math.max(0,achieved),updatedAt:new Date().toISOString()};const i=rows.findIndex(x=>x.id===id);if(i>=0)rows[i]=row;else rows.push(row);saveTargetRows(rows);toast('Target berhasil disimpan');fillTargetMonthFilter();document.getElementById('targetMonthFilter').value=month;renderDashboardTargets();renderTargetManagerList();document.getElementById('targetEditId').value='';document.getElementById('targetAmountInput').value='';document.getElementById('targetAchievedInput').value=''}
function deleteDashboardTarget(id){if(!canManageTargets()||!confirm('Hapus target ini?'))return;saveTargetRows(targetRows().filter(x=>x.id!==id));renderDashboardTargets();renderTargetManagerList();toast('Target dihapus')}
window.renderDashboardTargets=renderDashboardTargets;window.openTargetManager=openTargetManager;window.closeTargetManager=closeTargetManager;window.editDashboardTarget=editDashboardTarget;window.saveDashboardTarget=saveDashboardTarget;window.deleteDashboardTarget=deleteDashboardTarget;window.refreshTargetManagerFields=refreshTargetManagerFields;
const oldRefresh=window.refreshDashboard;
window.refreshDashboard=async function(){const r=oldRefresh?await oldRefresh.apply(this,arguments):undefined;document.getElementById('manageTargetsBtn')?.classList.toggle('hidden',!canManageTargets());renderDashboardTargets();return r};
const oldShow=window.showDashboard;
window.showDashboard=async function(){const r=oldShow?await oldShow.apply(this,arguments):undefined;fillTargetMonthFilter();renderDashboardTargets();return r};
})();
