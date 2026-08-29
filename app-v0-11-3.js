const SUPABASE_URL="https://djaevqqzhscmslsdfxvq.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqYWV2cXF6aHNjbXNsc2RmeHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNzM3ODUsImV4cCI6MjEwMDg0OTc4NX0.fuUOQbVKN6OKWxsApS5ZU62Q7uVj0O2SaGh3C38-zhA";
const SUPABASE_SESSION_KEY="rml_internal_session_v1";
function getSbSession(){try{return JSON.parse(localStorage.getItem(SUPABASE_SESSION_KEY)||"null")}catch(e){return null}}
function setSbSession(v){if(v)localStorage.setItem(SUPABASE_SESSION_KEY,JSON.stringify(v));else localStorage.removeItem(SUPABASE_SESSION_KEY)}
async function sbFetch(path,{method="POST",body=null,headers={}}={}){
 const h={apikey:SUPABASE_ANON_KEY,"Content-Type":"application/json",...headers};
 const res=await fetch(`${SUPABASE_URL}${path}`,{method,headers:h,body:body==null?null:JSON.stringify(body)});
 const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch(e){data=text}
 if(!res.ok)throw new Error(data?.message||data?.error_description||data?.hint||`Supabase ${res.status}`);
 return data;
}
async function rpc(name,args={}){return sbFetch(`/rest/v1/rpc/${name}`,{body:args})}
async function sbSignIn(name,password){const data=await rpc('app_login',{p_login_name:name,p_password:password});const row=Array.isArray(data)?data[0]:data;if(!row?.session_token)throw new Error('Nama atau password salah');setSbSession(row);return row}
async function sbProfile(){const session=getSbSession();if(!session?.session_token)return null;const data=await rpc('app_get_profile',{p_token:session.session_token});return Array.isArray(data)?data[0]:data}
async function sbUpdatePassword(oldPassword,newPassword){const session=getSbSession();if(!session?.session_token)throw new Error('Sesi login tidak tersedia');return rpc('app_change_password',{p_token:session.session_token,p_old_password:oldPassword,p_new_password:newPassword})}
function visitToRemote(v){return {id:v.id,sales_email:v.salesEmail||currentUser?.email||'',sales_name:v.salesName||currentUser?.name||'',customer_no:String(v.customerNo||''),customer_code:v.code||'',customer_name:v.name||'',area:v.area||'',status:v.status||'',visit_type:v.visitType||'Kunjungan Area',check_in_at:v.checkInAt||null,check_out_at:v.checkOutAt||null,updated_at:v.updatedAt||new Date().toISOString(),payload:v}}
async function pullRemoteVisits(){const session=getSbSession();if(!navigator.onLine||!session?.session_token)return;const rows=await rpc('app_pull_visits',{p_token:session.session_token,p_limit:5000});for(const r of rows||[]){const local={...(r.payload||{}),id:r.id,syncStatus:'synced',updatedAt:r.updated_at};await idbPut(STORE_VISITS,local)}}
async function syncSettingsToSupabase(){const session=getSbSession();if(currentUser?.role!=='admin'||!navigator.onLine||!session?.session_token)return;const users=USERS.map(u=>({account_key:u.email,display_name:u.name,login_name:(u.loginName||u.name).trim().toLowerCase(),phone:u.phone,role:u.role,active:u.active!==false,can_switch_area_freely:u.canSwitchAreaFreely===true}));const map=getAreaAssignments();const assignments=[];for(const u of USERS.filter(x=>x.role==='sales'))for(const area of (map[u.email]||[]))assignments.push({sales_email:u.email,area});await rpc('app_admin_save_settings',{p_token:session.session_token,p_users:users,p_assignments:assignments})}
const APP_VERSION="0.11.3";
const USER_SETTINGS_KEY="rml_user_accounts_v1";
const DEFAULT_USERS=[
{email:"rini@rml.app",loginName:"rini",active:true,phone:"085668027045",name:"Rini",role:"sales",***REMOVED***,mustChangePassword:true,canSwitchAreaFreely:false},
{email:"lisna@rml.app",loginName:"lisna",active:true,phone:"085218600582",name:"Lisna",role:"sales",***REMOVED***,mustChangePassword:true,canSwitchAreaFreely:false},
{email:"septino@rml.app",loginName:"septino",active:true,phone:"08116946999",name:"Septino",role:"sales",***REMOVED***,mustChangePassword:true,canSwitchAreaFreely:true},
{email:"admin@rml.app",loginName:"admin",active:true,phone:"082284879722",name:"Admin",role:"admin",***REMOVED***,mustChangePassword:true,canSwitchAreaFreely:false}];
function loadUsers(){
 try{
  const saved=JSON.parse(localStorage.getItem(USER_SETTINGS_KEY)||"null");
  if(Array.isArray(saved)&&saved.length===DEFAULT_USERS.length){
   return DEFAULT_USERS.map(def=>{const old=saved.find(x=>x.email===def.email)||{};const merged={...def,...old};if(typeof old.canSwitchAreaFreely!=="boolean")merged.canSwitchAreaFreely=def.canSwitchAreaFreely===true;if(!old.password){merged.password=normalizePhone(old.phone||def.phone);merged.mustChangePassword=true}return merged});
  }
 }catch(e){}
 return DEFAULT_USERS.map(x=>({...x}));
}
let USERS=loadUsers();
function persistUsers(){localStorage.setItem(USER_SETTINGS_KEY,JSON.stringify(USERS));}
function normalizePhone(value){return String(value||"").replace(/[^0-9]/g,"");}

const DB_NAME="rml_sales_visit_db";
const DB_VERSION=1;
const STORE_VISITS="visits";
const STORE_META="meta";

const AREA_ASSIGNMENT_KEY="rml_area_assignments_v1";
function allAreas(){return [...new Set(customers().filter(c=>!c.isHidden).map(c=>c.area).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"id",{numeric:true}));}
function defaultAreaAssignments(){const r={};USERS.filter(u=>u.role==="sales").forEach(u=>r[u.email]=[...new Set(customers().filter(c=>!c.isHidden&&(c.assignedSalesEmail===u.email||c.assignedSalesEmail==="__ALL__")).map(c=>c.area).filter(Boolean))]);return r;}
function getAreaAssignments(){try{return JSON.parse(localStorage.getItem(AREA_ASSIGNMENT_KEY))||defaultAreaAssignments()}catch(e){return defaultAreaAssignments()}}
function assignedAreasForSales(email){return getAreaAssignments()[email]||[]}
function isAreaAssigned(email,area){return assignedAreasForSales(email).includes(area)}
function canSwitchAreaFreely(user=currentUser){return !!(user&&user.role==="sales"&&user.canSwitchAreaFreely===true)}
function showAreaAssignments(){if(currentUser?.role!=="admin")return;hide();document.getElementById("assignmentView").classList.remove("hidden");renderAreaAssignments();renderUserManagement()}
function renderAreaAssignments(){const areas=allAreas(),sales=USERS.filter(u=>u.role==="sales"),map=getAreaAssignments();document.getElementById("areaAssignmentMatrix").innerHTML=`<table class="assignment-matrix"><thead><tr><th>Area</th>${sales.map(u=>`<th>${esc(u.name)}</th>`).join("")}</tr></thead><tbody>${areas.map(a=>`<tr><td><strong>${esc(a)}</strong></td>${sales.map(u=>`<td><input type="checkbox" ${((map[u.email]||[]).includes(a))?"checked":""} onchange="toggleAreaAssignment('${u.email}','${esc(a)}',this.checked)"></td>`).join("")}</tr>`).join("")}</tbody></table>`}
function toggleAreaAssignment(email,area,checked){const map=getAreaAssignments(),set=new Set(map[email]||[]);checked?set.add(area):set.delete(area);map[email]=[...set];localStorage.setItem(AREA_ASSIGNMENT_KEY,JSON.stringify(map));syncSettingsToSupabase().catch(e=>console.error(e));toast("Penugasan area disimpan")}
function resetAreaAssignments(){if(!confirm("Reset penugasan area ke default?"))return;localStorage.removeItem(AREA_ASSIGNMENT_KEY);renderAreaAssignments();toast("Penugasan direset")}
function renderUserManagement(){
 const host=document.getElementById("userManagementList");
 if(!host)return;
 host.innerHTML=USERS.map((u,index)=>`<div class="user-setting-card">
  <div class="user-setting-head"><div><strong>${esc(u.role==="admin"?"Admin":"Sales")}</strong><span>${esc(u.email)}</span></div><span class="badge">${esc(u.role==="admin"?"ADMIN":"SALES")}</span></div>
  <label>Nama Tampilan</label>
  <input id="userName_${index}" type="text" value="${esc(u.name)}" autocomplete="off">
  <label>Nama Login</label>
  <input id="userLogin_${index}" type="text" value="${esc(u.loginName||u.name.toLowerCase())}" autocomplete="off" autocapitalize="none">
  <label>Nomor Handphone</label>
  <input id="userPhone_${index}" type="tel" inputmode="numeric" value="${esc(u.phone||"")}" autocomplete="off">
  <label class="account-active-row"><input id="userActive_${index}" type="checkbox" ${u.active===false?"":"checked"}> Akun aktif</label>
  ${u.role==="sales"?`<label class="account-active-row permission-row"><input id="userFreeArea_${index}" type="checkbox" ${u.canSwitchAreaFreely===true?"checked":""}> Bebas ganti area tanpa isi alasan outlet</label>`:""}
  <div class="user-setting-actions"><button id="saveUserBtn_${index}" class="primary compact" type="button" onclick="saveUserAccount(${index})">Simpan Akun</button><button class="secondary compact" type="button" onclick="resetUserPassword(${index})">Reset Password</button></div>
 </div>`).join("");
}
async function saveUserAccount(index){
 if(currentUser?.role!=="admin")return;
 const user=USERS[index];
 if(!user)return;
 const name=document.getElementById(`userName_${index}`).value.trim();
 const loginName=document.getElementById(`userLogin_${index}`).value.trim().toLowerCase();
 const phone=normalizePhone(document.getElementById(`userPhone_${index}`).value);
 const active=document.getElementById(`userActive_${index}`).checked;
 const canSwitchFreely=user.role==="sales"?!!document.getElementById(`userFreeArea_${index}`)?.checked:false;
 const btn=document.getElementById(`saveUserBtn_${index}`);
 if(!name)return toast("Nama tampilan wajib diisi");
 if(!/^[a-z0-9._-]{3,40}$/i.test(loginName))return toast("Nama login minimal 3 karakter dan hanya boleh huruf, angka, titik, garis bawah, atau strip");
 if(phone.length<8)return toast("Nomor handphone tidak valid");
 const duplicateLogin=USERS.some((u,i)=>i!==index&&(u.loginName||u.name).trim().toLowerCase()===loginName);
 if(duplicateLogin)return toast("Nama login sudah digunakan akun lain");
 const duplicatePhone=USERS.some((u,i)=>i!==index&&normalizePhone(u.phone)===phone);
 if(duplicatePhone)return toast("Nomor handphone sudah digunakan akun lain");
 if(!navigator.onLine)return toast("Perubahan akun memerlukan internet");
 const session=getSbSession();
 if(!session?.session_token)return toast("Sesi admin tidak tersedia. Silakan login ulang");
 const before={name:user.name,loginName:user.loginName||user.name.toLowerCase(),phone:user.phone,active:user.active!==false,canSwitchAreaFreely:user.canSwitchAreaFreely===true};
 try{
  if(btn){btn.disabled=true;btn.textContent="Menyimpan..."}
  await rpc('app_admin_update_user',{p_token:session.session_token,p_account_key:user.email,p_display_name:name,p_login_name:loginName,p_phone:phone,p_active:active,p_can_switch_area_freely:canSwitchFreely});
  user.name=name;user.loginName=loginName;user.phone=phone;user.active=active;user.canSwitchAreaFreely=canSwitchFreely;persistUsers();
  if(currentUser.email===user.email){
   currentUser={...currentUser,...user};
   sessionStorage.setItem("rml_user",JSON.stringify(currentUser));
   document.getElementById("userText").textContent=currentUser.name;
   const sb=getSbSession();if(sb){sb.display_name=name;setSbSession(sb)}
  }
  fillAreas();fillHistorySalesFilter();renderAreaAssignments();renderUserManagement();
  toast("Akun berhasil diperbarui");
 }catch(e){
  Object.assign(user,before);
  toast(`Gagal menyimpan akun: ${e.message}`);
 }finally{if(btn){btn.disabled=false;btn.textContent="Simpan Akun"}}
}

async function resetUserPassword(index){
 if(currentUser?.role!=="admin")return;const user=USERS[index];if(!user)return;
 if(!confirm(`Reset password ${user.name} menjadi nomor handphone ${user.phone}?`))return;
 if(!navigator.onLine)return toast("Reset password memerlukan internet");
 try{await rpc('app_admin_reset_password',{p_token:getSbSession()?.session_token,p_account_key:user.email});user.password=normalizePhone(user.phone);user.mustChangePassword=true;persistUsers();toast("Password berhasil direset ke nomor handphone");renderUserManagement()}catch(e){toast(`Gagal reset: ${e.message}`)}
}

function passwordIsValid(value){return String(value||"").length>=6}
function showForcedPasswordPage(){
 document.getElementById("loginPage").classList.add("hidden");
 document.getElementById("appPage").classList.add("hidden");
 document.getElementById("forcePasswordPage").classList.remove("hidden");
 document.getElementById("forcePasswordUser").textContent=currentUser?.name||"Pengguna";
 ["forceOldPassword","forceNewPassword","forceConfirmPassword"].forEach(id=>document.getElementById(id).value="");
}
async function saveForcedPassword(){
 const old=document.getElementById("forceOldPassword").value;
 const next=document.getElementById("forceNewPassword").value;
 const confirmValue=document.getElementById("forceConfirmPassword").value;
 const user=USERS.find(u=>u.email===currentUser?.email);
 if(!user)return toast("Akun tidak ditemukan");
 if(!old)return toast("Password lama wajib diisi");
 if(!passwordIsValid(next))return toast("Password baru minimal 6 karakter");
 if(next!==confirmValue)return toast("Konfirmasi password tidak sama");
 if(next===old)return toast("Password baru harus berbeda");
 try{await sbUpdatePassword(old,next)}catch(e){return toast(e.message||"Gagal mengubah password")}
 user.password=next;user.mustChangePassword=false;persistUsers();
 sessionStorage.removeItem("rml_user");setSbSession(null);currentUser=null;
 document.getElementById("forcePasswordPage").classList.add("hidden");
 document.getElementById("loginPage").classList.remove("hidden");
 resetLoginForm();
 toast("Password berhasil diperbarui. Silakan login kembali.");
}
function showAccount(){
 if(!currentUser)return;hide();document.getElementById("accountView").classList.remove("hidden");
 document.getElementById("accountName").textContent=currentUser.name;
 document.getElementById("accountPhone").textContent=currentUser.phone;
 ["accountOldPassword","accountNewPassword","accountConfirmPassword"].forEach(id=>document.getElementById(id).value="");
}
async function changeOwnPassword(){
 const old=document.getElementById("accountOldPassword").value;
 const next=document.getElementById("accountNewPassword").value;
 const confirmValue=document.getElementById("accountConfirmPassword").value;
 const user=USERS.find(u=>u.email===currentUser?.email);
 if(!user)return toast("Akun tidak ditemukan");
 if(!old)return toast("Password lama wajib diisi");
 if(!passwordIsValid(next))return toast("Password baru minimal 6 karakter");
 if(next!==confirmValue)return toast("Konfirmasi password tidak sama");
 if(next===old)return toast("Password baru harus berbeda");
 try{await sbUpdatePassword(old,next)}catch(e){return toast(e.message||"Gagal mengubah password")}
 user.password=next;user.mustChangePassword=false;persistUsers();currentUser={...user};sessionStorage.setItem("rml_user",JSON.stringify(currentUser));
 toast("Password berhasil diubah");showAccount();
}

function openOutsideAreaOrder(){
 const areas=allAreas().filter(a=>a!==getDailyArea());
 if(!areas.length)return toast("Tidak ada area lain");
 hide();
 document.getElementById("outsideAreaOrderView").classList.remove("hidden");
 document.getElementById("outsideOrderActiveArea").textContent=getDailyArea()||"Belum dipilih";
 outsideOrderArea.innerHTML=areas.map(a=>`<option>${esc(a)}</option>`).join("");
 fillOutsideOrderCustomers();outsideOrderNote.value="";
 window.scrollTo({top:0,behavior:"smooth"});
}
function fillOutsideOrderCustomers(){const rows=customers().filter(c=>!c.isHidden&&c.area===outsideOrderArea.value).sort(compareCustomerCode);outsideOrderCustomer.innerHTML=rows.map(c=>`<option value="${c.no}">${esc(c.code||"-")} • ${esc(c.name)}</option>`).join("")}
function closeOutsideAreaOrder(){showCustomers()}
async function saveOutsideAreaOrder(){const c=customers().find(x=>String(x.no)===String(outsideOrderCustomer.value)),note=outsideOrderNote.value.trim();if(!c)return toast("Pilih pelanggan");if(!note)return toast("Orderan wajib diisi");const now=new Date().toISOString();await saveVisitOffline({id:`OUT-${Date.now()}-${c.no}`,customerNo:c.no,code:c.code||"",name:c.name||"",area:c.area,salesEmail:currentUser.email,salesName:currentUser.name,checkInAt:now,checkOutAt:now,durationMinutes:0,status:"Ada Order",note,visitState:"completed",createdAt:now,syncStatus:"pending",completionType:"outside-area-order",visitType:"Order Luar Area"});await refreshVisitCache();toast("Order luar area berhasil disimpan");showCustomers()}


function openDB(){
 return new Promise((resolve,reject)=>{
   const req=indexedDB.open(DB_NAME,DB_VERSION);
   req.onupgradeneeded=()=>{
     const db=req.result;
     if(!db.objectStoreNames.contains(STORE_VISITS)){
       const store=db.createObjectStore(STORE_VISITS,{keyPath:"id"});
       store.createIndex("salesEmail","salesEmail",{unique:false});
       store.createIndex("syncStatus","syncStatus",{unique:false});
       store.createIndex("checkOutAt","checkOutAt",{unique:false});
     }
     if(!db.objectStoreNames.contains(STORE_META)){
       db.createObjectStore(STORE_META,{keyPath:"key"});
     }
   };
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error);
 });
}
async function idbPut(storeName,value){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction(storeName,"readwrite");
   tx.objectStore(storeName).put(value);
   tx.oncomplete=()=>resolve(value);
   tx.onerror=()=>reject(tx.error);
 });
}
async function idbGet(storeName,key){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
   const req=db.transaction(storeName,"readonly").objectStore(storeName).get(key);
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error);
 });
}
async function idbGetAll(storeName){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
   const req=db.transaction(storeName,"readonly").objectStore(storeName).getAll();
   req.onsuccess=()=>resolve(req.result||[]);
   req.onerror=()=>reject(req.error);
 });
}
async function idbDelete(storeName,key){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction(storeName,"readwrite");
   tx.objectStore(storeName).delete(key);
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
 });
}
async function migrateLegacyVisits(){
 const legacy=JSON.parse(localStorage.getItem("rml_visits")||"[]");
 if(!legacy.length)return;
 const existing=await idbGetAll(STORE_VISITS);
 const ids=new Set(existing.map(v=>v.id));
 for(const v of legacy){
   if(!ids.has(v.id)){
     await idbPut(STORE_VISITS,{
       ...v,
       syncStatus:v.syncStatus||"pending",
       updatedAt:v.updatedAt||new Date().toISOString()
     });
   }
 }
 localStorage.removeItem("rml_visits");
}
async function getVisitsOffline(){
 return (await idbGetAll(STORE_VISITS)).sort((a,b)=>new Date(b.checkOutAt||b.createdAt)-new Date(a.checkOutAt||a.createdAt));
}
async function saveVisitOffline(visit){
 const row={...visit,syncStatus:"pending",updatedAt:new Date().toISOString()};
 await idbPut(STORE_VISITS,row);
 await updatePendingSyncCount();
 return row;
}


const DATA_VERSION="v16.1-dashboard-sales";
let currentUser=null,selected=null,cameraStream=null,capturedPhotoData="",deferredInstallPrompt=null;

function initializeData(){
 if(localStorage.getItem("rml_data_version")!==DATA_VERSION){
   let existing=[];
   try{existing=JSON.parse(localStorage.getItem("rml_customers")||"[]")}catch(e){}
   const source=existing.length?existing:DEFAULT_CUSTOMERS;
   const migrated=source.map(x=>({
     ...x,
     isHidden:Boolean(x.isHidden),
     assignedSalesEmail:"__ALL__",
     outletStatus:(()=>{
       const old=x.outletStatus||"normal";
       if(["due","dueSoon","promise"].includes(old)) return "dueSoon";
       if(["blocked","pending"].includes(old)) return "pending";
       return "normal";
     })(),
     dueDate:x.dueDate||"",
     dueAmount:Number(x.dueAmount||0),
     outletNote:x.outletNote||""
   }));
   localStorage.setItem("rml_customers",JSON.stringify(migrated));
   localStorage.setItem("rml_data_version",DATA_VERSION);
 }
}
function customers(){return JSON.parse(localStorage.getItem("rml_customers")||"[]")}
function saveCustomers(v){localStorage.setItem("rml_customers",JSON.stringify(v))}
function visits(){return []}
function saveVisits(v){console.warn("saveVisits legacy dipanggil",v)}
function activeVisitKey(){return currentUser?`rml_active_visit_${currentUser.email}`:""}
function getActiveVisit(){
 if(!currentUser)return null;
 try{return JSON.parse(localStorage.getItem(activeVisitKey())||"null")}catch(e){return null}
}
function saveActiveVisit(v){localStorage.setItem(activeVisitKey(),JSON.stringify(v))}
function clearActiveVisit(){localStorage.removeItem(activeVisitKey())}


function resetLoginForm(){
 const name=document.getElementById("loginName");
 const password=document.getElementById("password");
 const toggle=document.getElementById("passwordToggle");
 if(name)name.value="";
 if(password){password.value="";password.type="password";}
 if(toggle){toggle.textContent="👁";toggle.setAttribute("aria-label","Tampilkan password");}
 setTimeout(()=>name?.focus(),50);
}
function toggleLoginPassword(){
 const password=document.getElementById("password");
 const toggle=document.getElementById("passwordToggle");
 if(!password)return;
 const show=password.type==="password";
 password.type=show?"text":"password";
 if(toggle){toggle.textContent=show?"🙈":"👁";toggle.setAttribute("aria-label",show?"Sembunyikan password":"Tampilkan password");}
 password.focus();
}

async function login(){
 USERS=loadUsers();
 const name=document.getElementById("loginName").value.trim();
 const password=document.getElementById("password").value;
 if(!name||!password)return toast("Nama dan password wajib diisi");
 if(!navigator.onLine)return toast("Login pertama memerlukan internet. Setelah login berhasil, aplikasi tetap dapat dipakai offline.");
 try{
  const auth=await sbSignIn(name,password);
  const p=await sbProfile();if(!p)throw new Error("Profil pengguna tidak ditemukan");
  const local=USERS.find(x=>x.email===p.account_key)||{};
  let permissions=null;
  try{const pr=await rpc("app_get_permissions",{p_token:auth.session_token});permissions=Array.isArray(pr)?pr[0]:pr}catch(e){console.warn("Permission fallback lokal",e)}
  currentUser={...local,email:p.account_key,phone:p.phone||local.phone||"",name:p.display_name,role:p.role,mustChangePassword:!!p.must_change_password,canSwitchAreaFreely:permissions?.can_switch_area_freely??local.canSwitchAreaFreely??false};
  sessionStorage.setItem("rml_user",JSON.stringify(currentUser));localStorage.setItem("rml_cached_user",JSON.stringify(currentUser));
  if(currentUser.mustChangePassword)return showForcedPasswordPage();
  await pullRemoteVisits();openApp();
 }catch(e){toast(e.message||"Nama atau password salah")}
}

async function finishAreaTask(){
 if(currentUser?.role!=="sales")return;
 if(getActiveVisit())return toast("Selesaikan Check Out outlet yang sedang dikunjungi terlebih dahulu");
 await refreshVisitCache();
 const area=getDailyArea();
 if(!area)return toast("Belum ada area aktif hari ini");
 if(canSwitchAreaFreely()){
   if(!confirm(`Selesaikan tugas area ${area} hari ini?\n\nAnda tetap login dan dapat memilih area lain.`))return;
   return completeAreaTask(area);
 }
 const pending=getPendingOutletsForArea(area);
 return openUnvisitedReasonModal({type:"finishArea",area,pending});
}
function completeAreaTask(area){
 const key=dailyAreaStorageKey();
 if(key)localStorage.removeItem(key);
 pendingAreaAction=null;
 toast(`Tugas area ${area} hari ini selesai`);
 setTimeout(showDashboard,350);
}
function logout(){
 if(getActiveVisit())return toast("Selesaikan Check Out outlet yang sedang dikunjungi terlebih dahulu");
 if(!confirm("Logout dari aplikasi?"))return;
 completeLogout();
}
function completeLogout(){sessionStorage.removeItem("rml_user");localStorage.removeItem("rml_cached_user");localStorage.removeItem("lastLogin");sessionStorage.removeItem("lastLogin");setSbSession(null);currentUser=null;location.reload()}
function openApp(){
 initializeData();
 if(navigator.onLine)setTimeout(()=>syncPendingVisits(),800);
 document.getElementById("loginPage").classList.add("hidden");
 document.getElementById("appPage").classList.remove("hidden");
 document.getElementById("roleText").textContent=currentUser.role==="admin"?"Admin":"Sales";
 document.getElementById("userText").textContent=currentUser.name;
 document.getElementById("finishBtn").textContent="Selesai Tugas Area Hari Ini";
 document.getElementById("finishBtn").classList.toggle("hidden",currentUser.role!=="sales");
 document.getElementById("addBtn").classList.toggle("hidden",currentUser.role!=="admin");
 document.getElementById("editBtn").classList.toggle("hidden",currentUser.role!=="admin");
 document.getElementById("hideBtn").classList.toggle("hidden",currentUser.role!=="admin");
 document.getElementById("deleteBtn").classList.toggle("hidden",currentUser.role!=="admin");
 document.getElementById("statusFilter").classList.toggle("hidden",currentUser.role!=="admin");
 document.getElementById("exportPdfBtn")?.classList.toggle("hidden",currentUser.role!=="admin");
 document.getElementById("assignmentNavBtn")?.classList.toggle("hidden",currentUser.role!=="admin");
 document.getElementById("accountNavBtn")?.classList.remove("hidden");
 document.getElementById("outsideAreaOrderBtn")?.classList.toggle("hidden",currentUser.role!=="sales");
 fillAreas();currentUser.role==="admin"?showDashboard():(getDailyArea()?showCustomers():showDailyAreaSelection());
}
function hide(){document.querySelectorAll(".view").forEach(x=>x.classList.add("hidden"))}
function fillAreas(){
 const a=[...new Set(customers().map(x=>x.area))].sort();
 document.getElementById("areaFilter").innerHTML='<option value="">Semua Area</option>'+a.map(x=>`<option>${esc(x)}</option>`).join("");
 document.getElementById("formArea").innerHTML=a.map(x=>`<option>${esc(x)}</option>`).join("");
 const salesUsers=USERS.filter(x=>x.role==="sales");
 document.getElementById("formSales").innerHTML=
   '<option value="">Belum ditentukan</option>'+
   '<option value="__ALL__">Semua Sales</option>'+
   salesUsers.map(x=>`<option value="${esc(x.email)}">${esc(x.name)} — ${esc(x.email)}</option>`).join("");
 document.getElementById("areaCount").textContent=a.length;
 fillHistorySalesFilter();
}
function fillHistorySalesFilter(){
 const el=document.getElementById("historySalesFilter");if(!el)return;
 const selected=el.value;
 el.innerHTML='<option value="">Semua Sales</option>'+USERS.filter(x=>x.role==="sales").map(x=>`<option value="${esc(x.email)}">${esc(x.name)}</option>`).join("");
 if([...el.options].some(o=>o.value===selected))el.value=selected;
}

let visitCache=[];

async function refreshVisitCache(){
 try{visitCache=await getVisitsOffline()}catch(e){visitCache=[]}
 return visitCache;
}
function visitsForCustomer(customerNo){
 return visitCache.filter(v=>String(v.customerNo)===String(customerNo));
}
function lastVisitForCustomer(customerNo){
 return visitsForCustomer(customerNo)[0]||null;
}
function daysSinceVisit(value){
 if(!value)return Infinity;
 return Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/86400000));
}
function lastVisitText(customerNo){
 const last=lastVisitForCustomer(customerNo);
 if(!last)return "Belum pernah dikunjungi";
 const days=daysSinceVisit(last.checkOutAt||last.createdAt);
 if(days===0)return `Terakhir hari ini • ${esc(last.status||"-")}`;
 if(days===1)return `Terakhir kemarin • ${esc(last.status||"-")}`;
 return `Terakhir ${days} hari lalu • ${esc(last.status||"-")}`;
}
function reminderClass(customerNo){
 const last=lastVisitForCustomer(customerNo);
 const days=last?daysSinceVisit(last.checkOutAt||last.createdAt):9999;
 if(days>=60)return "reminder-60";
 if(days>=30)return "reminder-30";
 if(days>=14)return "reminder-14";
 return "";
}
async function showDashboard(){
 hide();
 document.getElementById("dashboardView").classList.remove("hidden");
 await refreshDashboard();
}
async function refreshDashboard(){
 await refreshVisitCache();
 const todayKey=todayLocalKey();
 const allToday=visitCache.filter(v=>(v.checkOutAt||v.createdAt||"").slice(0,10)===todayKey);
 const isAdmin=currentUser.role==="admin";
 const today=isAdmin?allToday:allToday.filter(v=>v.salesEmail===currentUser.email);

 document.getElementById("dashboardTitle").textContent=isAdmin?"Dashboard Kunjungan":"Dashboard Saya";
 document.getElementById("dashboardSubtitle").textContent=isAdmin?"Ringkasan aktivitas seluruh sales hari ini":"Ringkasan kunjungan Anda hari ini";
 document.getElementById("dashboardSummary").innerHTML=`
  <div class="dashboard-stat ${isAdmin?"clickable-stat":""}" ${isAdmin?'onclick="openVisitDetailModal(\'\',\'\')"':''}><small>Kunjungan Hari Ini</small><strong>${today.length}</strong></div>
  <div class="dashboard-stat ${isAdmin?"clickable-stat":""}" ${isAdmin?'onclick="openVisitDetailModal(\'\',\'Ada Order\')"':''}><small>Ada Order</small><strong>${today.filter(v=>v.status==="Ada Order").length}</strong></div>
  <div class="dashboard-stat ${isAdmin?"clickable-stat":""}" ${isAdmin?'onclick="openVisitDetailModal(\'\',\'Tidak Order\')"':''}><small>Tidak Order</small><strong>${today.filter(v=>v.status==="Tidak Order").length}</strong></div>
  <div class="dashboard-stat ${isAdmin?"clickable-stat":""}" ${isAdmin?'onclick="openVisitDetailModal(\'\',\'Tidak Bertemu\')"':''}><small>Tidak Bertemu</small><strong>${today.filter(v=>v.status==="Tidak Bertemu").length}</strong></div>`;
 document.getElementById("dashboardDateLabel").textContent=new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"});

 const statsCard=document.getElementById("allSalesStatsCard");
 const reminderCard=document.getElementById("reminderCard");
 const activeCard=document.getElementById("activeVisitCard");
 statsCard.classList.remove("hidden");

 if(!isAdmin){
   reminderCard.classList.add("hidden");
   activeCard.classList.add("hidden");
   document.getElementById("salesStatsTitle").textContent="Progres Saya Hari Ini";
   const area=getDailyArea();
   const p=area?areaProgress(area):null;
   document.getElementById("salesStatsList").innerHTML=`<div class="sales-stat-card">
     <div class="sales-stat-top">
       <div><strong>${esc(currentUser.name)}</strong><div class="meta">Area aktif: ${esc(area||"Belum memilih area")}</div></div>
       <span>${today.length} kunjungan</span>
     </div>
     <div class="sales-stat-numbers">
       <div class="sales-stat-number"><strong>${p?p.completed:today.length}</strong><small>Selesai</small></div>
       <div class="sales-stat-number"><strong>${p?p.pending:0}</strong><small>Belum</small></div>
       <div class="sales-stat-number"><strong>${today.filter(v=>v.status==="Ada Order").length}</strong><small>Ada Order</small></div>
       <div class="sales-stat-number"><strong>${today.filter(v=>v.status==="Tidak Bertemu").length}</strong><small>Tidak Bertemu</small></div>
     </div>
     ${area?`<button class="primary compact" onclick="showCustomers()">Lanjutkan Area ${esc(area)}</button>`:`<button class="primary compact" onclick="showDailyAreaSelection()">Pilih Area Hari Ini</button>`}
   </div>`;
   return;
 }

 reminderCard.classList.remove("hidden");
 activeCard.classList.remove("hidden");
 document.getElementById("salesStatsTitle").textContent="Statistik Sales Hari Ini";
 const salesUsers=USERS.filter(u=>u.role==="sales");
 document.getElementById("salesStatsList").innerHTML=salesUsers.map(user=>{
   const rows=allToday.filter(v=>v.salesEmail===user.email);
   return `<div class="sales-stat-card">
    <div class="sales-stat-top">
     <div><strong>${esc(user.name)}</strong><div class="meta">Area aktif: ${esc(localStorage.getItem(`rml_current_area_${user.email}_${todayKey}`)||"Belum memilih")}</div></div>
     <span>${rows.length} kunjungan</span>
    </div>
    <div class="sales-stat-numbers">
      <div class="sales-stat-number clickable-stat" onclick="openVisitDetailModal('${esc(user.email)}','')"><strong>${rows.length}</strong><small>Total</small></div>
      <div class="sales-stat-number clickable-stat" onclick="openVisitDetailModal('${esc(user.email)}','Ada Order')"><strong>${rows.filter(v=>v.status==="Ada Order").length}</strong><small>Ada Order</small></div>
      <div class="sales-stat-number clickable-stat" onclick="openVisitDetailModal('${esc(user.email)}','Tidak Order')"><strong>${rows.filter(v=>v.status==="Tidak Order").length}</strong><small>Tidak Order</small></div>
      <div class="sales-stat-number clickable-stat" onclick="openVisitDetailModal('${esc(user.email)}','Tidak Bertemu')"><strong>${rows.filter(v=>v.status==="Tidak Bertemu").length}</strong><small>Tidak Bertemu</small></div>
      <div class="sales-stat-number clickable-stat outside-area-stat" onclick="openVisitDetailModal('${esc(user.email)}','OUTSIDE_AREA')"><strong>${rows.filter(v=>v.completionType==="outside-area-order"||v.visitType==="Order Luar Area").length}</strong><small>Order Luar Area</small></div>
    </div>
   </div>`;
 }).join("");

 const limit=Number(document.getElementById("reminderDays").value||30);
 const reminders=customers().filter(c=>!c.isHidden).map(c=>{
   const last=lastVisitForCustomer(c.no);
   const days=last?daysSinceVisit(last.checkOutAt||last.createdAt):9999;
   return {c,last,days};
 }).filter(x=>x.days>=limit).sort((a,b)=>b.days-a.days);
 document.getElementById("reminderOutletList").innerHTML=reminders.slice(0,100).map(x=>`
  <div class="reminder-item ${x.days>=60?"overdue":"warning"}" onclick="selectCustomer(${x.c.no})">
    <strong>${esc(x.c.code||"TANPA KODE")} • ${esc(x.c.name)}</strong>
    <div class="meta">${esc(x.c.area)} • ${x.last?`${x.days} hari belum dikunjungi`:"Belum pernah dikunjungi"}</div>
  </div>`).join("")||'<div class="empty">Tidak ada outlet dalam kategori ini.</div>';

 const localActive=USERS.filter(u=>u.role==="sales").map(u=>{
   try{return JSON.parse(localStorage.getItem(`rml_active_visit_${u.email}`)||"null")}catch(e){return null}
 }).filter(Boolean);
 document.getElementById("activeVisitList").innerHTML=localActive.map(v=>`
  <div class="active-visit-item">
    <strong><span class="active-dot"></span>${esc(v.salesName)} — ${esc(v.name)}</strong>
    <div class="meta">${esc(v.area)} • ${formatVisitDateTime(v.checkInAt)}</div>
  </div>`).join("")||'<div class="empty">Tidak ada kunjungan yang sedang berlangsung di perangkat ini.</div>';
}
let currentVisitDetailSalesEmail="";
let currentVisitDetailStatus="";
let editingVisitId="";

function closeVisitDetailModal(){
 const modal=document.getElementById("visitDetailModal");
 if(modal)modal.classList.add("hidden");
}
function getVisitDetailFieldLabel(status){
 if(status==="Ada Order")return "Orderan";
 if(status==="Tidak Order")return "Alasan Tidak Order";
 return "Catatan";
}
function canEditVisitNote(visit){
 if(!currentUser)return false;
 if(currentUser.role==="admin")return true;
 return currentUser.role==="sales" &&
   visit.salesEmail===currentUser.email &&
   visit.status==="Ada Order";
}
function formatAuditHistory(audit){
 if(!Array.isArray(audit)||!audit.length)return "";
 return `<details class="visit-audit-details">
   <summary>Riwayat perubahan (${audit.length})</summary>
   <div class="visit-audit-list">${audit.slice().reverse().map(item=>`
     <div class="visit-audit-item">
       <div><strong>${esc(item.editedByName||item.editedByEmail||"-")}</strong>
       <span>${esc(formatVisitDateTime(item.editedAt))}</span></div>
       <small>Sebelumnya</small>
       <p>${esc(item.oldNote||"-")}</p>
       <small>Diubah menjadi</small>
       <p>${esc(item.newNote||"-")}</p>
     </div>`).join("")}</div>
 </details>`;
}
async function openVisitDetailModal(salesEmail,status){
 if(!currentUser||currentUser.role!=="admin")return;
 await refreshVisitCache();

 currentVisitDetailSalesEmail=salesEmail||"";
 currentVisitDetailStatus=status||"";

 const todayKey=todayLocalKey();
 let rows=visitCache.filter(v=>
   String(v.checkOutAt||v.createdAt||"").slice(0,10)===todayKey
 );
 if(status==="OUTSIDE_AREA")rows=rows.filter(v=>v.completionType==="outside-area-order"||v.visitType==="Order Luar Area");
 else if(status)rows=rows.filter(v=>v.status===status);
 if(salesEmail)rows=rows.filter(v=>v.salesEmail===salesEmail);

 const salesName=salesEmail?getSalesName(salesEmail):"Semua Sales";
 const title=status==="OUTSIDE_AREA"?`Order Luar Area (${rows.length})`:status?`${status} (${rows.length})`:`Kunjungan Hari Ini (${rows.length})`;
 document.getElementById("visitDetailModalSales").textContent=salesName;
 document.getElementById("visitDetailModalTitle").textContent=title;

 document.getElementById("visitDetailModalList").innerHTML=rows.map(v=>{
   const fieldLabel=getVisitDetailFieldLabel(v.status);
   return `<div class="visit-detail-item">
     <div class="visit-detail-item-head">
       <div>
         <strong>${esc(v.code||"TANPA KODE")} • ${esc(v.name||"-")}</strong>
         <span>${esc(v.area||"-")} • ${esc(v.salesName||getSalesName(v.salesEmail))}${(v.completionType==="outside-area-order"||v.visitType==="Order Luar Area")?" • Pesanan tanpa kunjungan fisik":""}</span>
       </div>
       <span class="visit-detail-time">${esc(formatVisitDateTime(v.checkOutAt||v.createdAt))}</span>
     </div>
     <div class="pills visit-detail-status-row">
       <span class="pill">${esc(v.status||"-")}</span>
       ${(v.completionType==="outside-area-order"||v.visitType==="Order Luar Area")?'<span class="pill outside-area-badge">ORDER LUAR AREA</span>':""}
     </div>
     <div class="visit-detail-note">
       <small>${fieldLabel}</small>
       <p>${esc(v.note||"-")}</p>
     </div>
     ${formatAuditHistory(v.editHistory)}
     ${canEditVisitNote(v)?`<button class="secondary compact edit-visit-button" onclick="openEditVisitModal('${esc(v.id)}')">Edit ${esc(fieldLabel)}</button>`:""}
   </div>`;
 }).join("")||'<div class="empty">Belum ada data kunjungan hari ini.</div>';

 document.getElementById("visitDetailModal").classList.remove("hidden");
}

function closeEditVisitModal(){
 editingVisitId="";
 document.getElementById("editVisitNoteModal")?.classList.add("hidden");
}
async function openEditVisitModal(visitId){
 await refreshVisitCache();
 const visit=visitCache.find(v=>String(v.id)===String(visitId));
 if(!visit)return toast("Data kunjungan tidak ditemukan");
 if(!canEditVisitNote(visit))return toast("Anda tidak memiliki izin mengedit data ini");

 editingVisitId=visit.id;
 const label=getVisitDetailFieldLabel(visit.status);
 document.getElementById("editVisitModalTitle").textContent=`Edit ${label}`;
 document.getElementById("editVisitOutletMeta").textContent=
   `${visit.code||"TANPA KODE"} • ${visit.name||"-"} • ${visit.salesName||getSalesName(visit.salesEmail)}`;
 document.getElementById("editVisitNoteLabel").textContent=`${label} *`;
 document.getElementById("editVisitNoteInput").value=visit.note||"";
 document.getElementById("editVisitNoteInput").placeholder=
   visit.status==="Ada Order"?"Masukkan orderan pelanggan...":
   visit.status==="Tidak Order"?"Tuliskan alasan tidak order...":"Tuliskan catatan...";

 const audit=Array.isArray(visit.editHistory)?visit.editHistory:[];
 const section=document.getElementById("editVisitAuditSection");
 section.classList.toggle("hidden",audit.length===0);
 document.getElementById("editVisitAuditList").innerHTML=audit.slice().reverse().map(item=>`
   <div class="edit-audit-item">
     <strong>${esc(item.editedByName||item.editedByEmail||"-")}</strong>
     <span>${esc(formatVisitDateTime(item.editedAt))}</span>
     <small>${esc(item.oldNote||"-")} → ${esc(item.newNote||"-")}</small>
   </div>`).join("");

 document.getElementById("editVisitNoteModal").classList.remove("hidden");
 setTimeout(()=>{
   const input=document.getElementById("editVisitNoteInput");
   input.focus();
   // Catatan/order lama tetap tampil. Kursor langsung berada di akhir
   // supaya pengguna cukup menambahkan order atau catatan baru.
   const end=input.value.length;
   input.setSelectionRange(end,end);
   input.scrollTop=input.scrollHeight;
 },80);
}
async function saveEditedVisitNote(){
 if(!editingVisitId)return;
 await refreshVisitCache();
 const visit=visitCache.find(v=>String(v.id)===String(editingVisitId));
 if(!visit)return toast("Data kunjungan tidak ditemukan");
 if(!canEditVisitNote(visit))return toast("Anda tidak memiliki izin mengedit data ini");

 const input=document.getElementById("editVisitNoteInput");
 const newNote=input.value.trim();
 const label=getVisitDetailFieldLabel(visit.status);
 if(!newNote){
   toast(`${label} wajib diisi.`);
   input.focus();
   return;
 }
 if(newNote===String(visit.note||"").trim()){
   toast("Tidak ada perubahan yang disimpan");
   return;
 }

 const change={
   oldNote:visit.note||"",
   newNote,
   editedAt:new Date().toISOString(),
   editedByEmail:currentUser.email,
   editedByName:currentUser.name,
   editorRole:currentUser.role
 };
 const updated={
   ...visit,
   note:newNote,
   editHistory:[...(Array.isArray(visit.editHistory)?visit.editHistory:[]),change],
   lastEditedAt:change.editedAt,
   lastEditedBy:currentUser.email
 };

 try{
   await saveVisitOffline(updated);
   await refreshVisitCache();
 }catch(e){
   console.error(e);
   return toast("Gagal menyimpan perubahan");
 }

 closeEditVisitModal();
 toast(`${label} berhasil diperbarui dan dicatat`);
 if(!document.getElementById("visitDetailModal").classList.contains("hidden")){
   await openVisitDetailModal(currentVisitDetailSalesEmail,currentVisitDetailStatus);
 }
 if(!document.getElementById("historyView").classList.contains("hidden")){
   await renderHistory();
 }
 if(!document.getElementById("dashboardView").classList.contains("hidden")){
   await refreshDashboard();
 }
}

async function renderOutletVisitHistory(customerNo){
 await refreshVisitCache();
 const rows=visitsForCustomer(customerNo);
 const count=document.getElementById("outletVisitHistoryCount");
 const list=document.getElementById("outletVisitHistory");
 if(!count||!list)return;
 count.textContent=`${rows.length} kunjungan`;
 list.innerHTML=rows.slice(0,10).map(v=>`
  <div class="mini-history-item">
    <strong>${esc(v.status||"-")}</strong>
    <div class="meta">${formatVisitDateTime(v.checkOutAt||v.createdAt)} • ${esc(v.salesName||"-")} • ${v.durationMinutes||0} menit</div>
    ${v.note?`<div class="meta">${esc(v.note)}</div>`:""}
  </div>`).join("")||'<div class="empty">Belum ada riwayat kunjungan.</div>';
}


function todayLocalKey(){
 const d=new Date();
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dailyAreaStorageKey(){
 return currentUser?`rml_current_area_${currentUser.email}_${todayLocalKey()}`:"";
}
function getDailyArea(){
 if(!currentUser||currentUser.role!=="sales")return "";
 return localStorage.getItem(dailyAreaStorageKey())||"";
}
function saveDailyArea(area){localStorage.setItem(dailyAreaStorageKey(),area)}
function salesVisitsToday(){
 if(!currentUser)return [];
 const key=todayLocalKey();
 return visitCache.filter(v=>v.salesEmail===currentUser.email&&
   String(v.checkOutAt||v.createdAt||"").slice(0,10)===key);
}
function todayVisitForOutlet(customerNo){
 return salesVisitsToday().find(v=>String(v.customerNo)===String(customerNo))||null;
}
function areaProgress(area){
 const outlets=customers().filter(c=>!c.isHidden&&
   isAreaAssigned(currentUser.email,area)&&c.area===area);
 const visits=salesVisitsToday().filter(v=>v.area===area);
 const completedOutletNos=new Set(visits.map(v=>String(v.customerNo)));
 const completed=outlets.filter(c=>completedOutletNos.has(String(c.no))).length;
 return {
   area,
   total:outlets.length,
   completed,
   pending:Math.max(0,outlets.length-completed),
   order:visits.filter(v=>v.status==="Ada Order").length,
   noOrder:visits.filter(v=>v.status==="Tidak Order").length,
   notMet:visits.filter(v=>v.status==="Tidak Bertemu").length,
   percent:outlets.length?Math.round(completed/outlets.length*100):0
 };
}
async function showDailyAreaSelection(){
 await refreshVisitCache();
 hide();
 document.getElementById("dailyAreaView").classList.remove("hidden");
 document.getElementById("areaPickerDate").textContent=
   new Date().toLocaleDateString("id-ID",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});

 const areas=assignedAreasForSales(currentUser.email).filter(area=>customers().some(c=>!c.isHidden&&c.area===area)).sort((a,b)=>a.localeCompare(b,"id",{numeric:true}));

 const current=getDailyArea();
 const rows=areas.map(area=>areaProgress(area));
 const allComplete=rows.length>0&&rows.every(x=>x.total>0&&x.completed===x.total);
 document.getElementById("allAreasCompleteMessage").classList.toggle("hidden",!allComplete);

 document.getElementById("areaChoiceList").innerHTML=rows.map(x=>{
   const isCurrent=current===x.area;
   const isComplete=x.total>0&&x.completed===x.total;
   const isStarted=x.completed>0&&!isComplete;
   const cls=isCurrent?"current":isComplete?"complete":isStarted?"started":"";
   const icon=isComplete?"✓":isStarted?"◐":"○";
   const status=isComplete
     ?`Selesai • ${x.completed}/${x.total}`
     :isStarted
       ?`Sedang dikerjakan • ${x.completed}/${x.total}`
       :`Belum dimulai • ${x.total} outlet`;
   return `<div class="area-choice-card ${cls}" onclick="chooseArea('${esc(x.area)}')">
     <div class="area-choice-main">
       <div class="area-choice-title"><strong>${esc(x.area)}</strong>${isCurrent?'<span class="badge">Area aktif</span>':""}</div>
       <div class="area-choice-meta">${x.total} outlet</div>
       <div class="area-choice-progress">${status}</div>
     </div>
     <div class="area-choice-icon">${icon}</div>
   </div>`;
 }).join("")||'<div class="empty">Tidak ada area yang tersedia.</div>';
}
async function chooseArea(area){
 await refreshVisitCache();
 if(!isAreaAssigned(currentUser.email,area))return toast("Area ini tidak ditugaskan kepada Anda");
 const currentArea=getDailyArea();
 if(currentUser?.role==="sales"&&currentArea&&currentArea!==area){
   if(getActiveVisit())return toast("Selesaikan Check Out outlet yang sedang dikunjungi terlebih dahulu");
   if(!canSwitchAreaFreely()){
     const pending=getPendingOutletsForArea(currentArea);
     if(pending.length){
       return openUnvisitedReasonModal({type:"switchArea",area:currentArea,targetArea:area,pending});
     }
   }
 }
 const progress=areaProgress(area);
 const previouslyVisited=progress.completed>0;
 const msg=previouslyVisited?`Area ${area} sudah dikerjakan ${progress.completed}/${progress.total}. Lanjutkan area ini?`:`Konfirmasi Area Hari Ini\n\nAnda memilih ${area}.\n\n${canSwitchAreaFreely()?"Anda memiliki akses bebas ganti area tanpa wajib mengisi alasan outlet.":"Apakah benar hari ini Anda bertugas di area tersebut? Pastikan jangan salah memilih area."}`;
 if(!confirm(msg))return;
 saveDailyArea(area);
 toast(`Area ${area} dipilih`);
 showCustomers();
}


let pendingAreaAction=null;
function getPendingOutletsForArea(area){
 if(!currentUser||currentUser.role!=="sales"||!area)return [];
 const completedNos=new Set(
   salesVisitsToday().filter(v=>v.area===area).map(v=>String(v.customerNo))
 );
 return customers().filter(c=>
   !c.isHidden&&
   c.area===area&&
   isAreaAssigned(currentUser.email,area)&&
   !completedNos.has(String(c.no))
 );
}
function openUnvisitedReasonModal(action){
 pendingAreaAction=action;
 hide();
 document.getElementById("finishAreaView").classList.remove("hidden");
 document.getElementById("unvisitedReasonTitle").textContent=action.pending.length?`Area ${action.area} Belum Selesai`:`Area ${action.area} Sudah Selesai`;
 document.getElementById("unvisitedReasonSubtitle").textContent=action.pending.length
   ?`${action.pending.length} outlet belum dikunjungi. Isi alasan untuk setiap outlet.`
   :"Seluruh outlet di area ini sudah memiliki status hari ini.";
 document.getElementById("finishCompleteMessage").classList.toggle("hidden",action.pending.length>0);
 document.getElementById("saveFinishAreaBtn").textContent=action.pending.length?"Simpan Alasan & Selesai Tugas Area Hari Ini":"Selesai Tugas Area Hari Ini";
 document.getElementById("unvisitedReasonList").innerHTML=action.pending.map((c,index)=>`
   <div class="unvisited-reason-item">
     <div class="unvisited-reason-outlet">
       <strong>${esc(c.code||"TANPA KODE")} • ${esc(c.name)}</strong>
       <span>${esc(c.area)}</span>
     </div>
     <label for="unvisitedReason_${index}">Alasan tidak dikunjungi *</label>
     <textarea id="unvisitedReason_${index}" data-customer-no="${esc(c.no)}" rows="3" placeholder="Contoh: toko tutup, pemilik tidak berada di tempat, cuaca tidak memungkinkan..." required></textarea>
   </div>`).join("");
 window.scrollTo({top:0,behavior:"smooth"});
 setTimeout(()=>document.querySelector("#unvisitedReasonList textarea")?.focus(),50);
}
function closeUnvisitedReasonModal(){
 const action=pendingAreaAction;
 pendingAreaAction=null;
 if(action?.type==="switchArea")return showDailyAreaSelection();
 showCustomers();
}
async function saveUnvisitedReasons(){
 const action=pendingAreaAction;
 if(!action)return;
 const textareas=[...document.querySelectorAll("#unvisitedReasonList textarea")];
 for(const textarea of textareas){
   if(!textarea.value.trim()){
     toast("Semua alasan wajib diisi");
     textarea.focus();
     return;
   }
 }
 const now=new Date().toISOString();
 try{
   for(const textarea of textareas){
     const customer=action.pending.find(c=>String(c.no)===String(textarea.dataset.customerNo));
     if(!customer)continue;
     await saveVisitOffline({
       id:`VISIT-${Date.now()}-${customer.no}-${Math.random().toString(36).slice(2,7)}`,
       customerNo:customer.no,
       code:customer.code||"",
       name:customer.name||"",
       area:customer.area||action.area,
       salesEmail:currentUser.email,
       salesName:currentUser.name,
       checkInAt:now,
       checkOutAt:now,
       durationMinutes:0,
       status:"Tidak Bertemu",
       note:textarea.value.trim(),
       visitState:"completed",
       createdAt:now,
       syncStatus:"pending",
       completionType:"unvisited-reason"
     });
   }
   await refreshVisitCache();
 }catch(error){
   console.error(error);
   return toast("Gagal menyimpan alasan. Silakan coba lagi.");
 }
 pendingAreaAction=null;
 toast(textareas.length?`${textareas.length} outlet disimpan sebagai Tidak Bertemu`:"Area selesai");
 if(action.type==="finishArea")return setTimeout(()=>completeAreaTask(action.area),400);
 if(action.type==="switchArea"){
   saveDailyArea(action.targetArea);
   toast(`Area ${action.targetArea} dipilih`);
   return setTimeout(showCustomers,400);
 }
}

function confirmDailyArea(){showDailyAreaSelection()}
function changeDailyArea(){showDailyAreaSelection()}

async function showCustomers(){
 await refreshVisitCache();
 if(currentUser&&currentUser.role==="sales"&&!getDailyArea())return showDailyAreaSelection();
 hide();
 document.getElementById("customerView").classList.remove("hidden");
 const banner=document.getElementById("selectedAreaBanner");
 const name=document.getElementById("selectedAreaName");
 const areaFilter=document.getElementById("areaFilter");
 if(currentUser.role==="sales"){
   banner.classList.remove("hidden");
   name.textContent=getDailyArea();
   if(areaFilter){areaFilter.value=getDailyArea();areaFilter.disabled=true}
   updateCurrentAreaProgress();
 }else{
   banner.classList.add("hidden");
   document.getElementById("areaProgressCard")?.classList.add("hidden");
   document.getElementById("areaDoneCard")?.classList.add("hidden");
   if(areaFilter)areaFilter.disabled=false;
 }
 renderCustomers();
}

function updateCurrentAreaProgress(){
 if(currentUser.role!=="sales")return;
 const p=areaProgress(getDailyArea());
 document.getElementById("areaProgressCard").classList.remove("hidden");
 document.getElementById("areaProgressCount").textContent=`${p.completed}/${p.total} outlet`;
 document.getElementById("areaProgressPercent").textContent=`${p.percent}%`;
 document.getElementById("areaProgressBar").style.width=`${p.percent}%`;
 document.getElementById("areaProgressStats").innerHTML=`
   <span>Belum: ${p.pending}</span>
   <span>Ada Order: ${p.order}</span>
   <span>Tidak Order: ${p.noOrder}</span>
   <span>Tidak Bertemu: ${p.notMet}</span>`;
 const done=p.total>0&&p.completed===p.total;
 document.getElementById("areaDoneCard").classList.toggle("hidden",!done);
 if(done){
   document.getElementById("areaDoneSummary").textContent=
     `${p.total} outlet • Ada Order ${p.order} • Tidak Order ${p.noOrder} • Tidak Bertemu ${p.notMet}`;
 }
}
function customerAssignedSales(customer){
 const raw=Array.isArray(customer.assignedSalesEmails)?customer.assignedSalesEmails:[];
 if(raw.length)return [...new Set(raw.filter(Boolean))];
 if(customer.assignedSalesEmail==="__ALL__")return USERS.filter(u=>u.role==="sales").map(u=>u.email);
 return customer.assignedSalesEmail?[customer.assignedSalesEmail]:[];
}
function canSalesAccessCustomer(customer,email){return customerAssignedSales(customer).includes(email)}
function adminCustomerCard(x){
 const sales=USERS.filter(u=>u.role==="sales");
 return `<div class="customer-card admin-customer-card ${x.isHidden?"hidden-customer":""}">
  <div class="admin-customer-main">
   <div class="admin-customer-head"><div><div class="customer-code">${esc(x.code||"TANPA KODE")}</div><h4>${esc(x.name)}</h4></div><span class="badge">${esc(x.area)}</span></div>
   <div class="admin-sales-checks">${sales.map(u=>`<label class="sales-check"><input type="checkbox" ${customerAssignedSales(x).includes(u.email)?"checked":""} onchange="toggleCustomerSales(${x.no},'${u.email}',this.checked)"><span>${esc(u.name)}</span></label>`).join("")}</div>
   <div class="admin-customer-actions">
    <label class="customer-active-switch"><input type="checkbox" ${x.isHidden?"":"checked"} onchange="setCustomerActive(${x.no},this.checked)"><span>${x.isHidden?"Tidak Aktif":"Aktif"}</span></label>
    <button class="danger compact admin-delete-customer" type="button" onclick="deleteCustomerInline(${x.no})">Hapus</button>
   </div>
  </div>
 </div>`;
}
function toggleCustomerSales(no,email,checked){
 if(currentUser.role!=="admin")return;
 const data=customers(),i=data.findIndex(x=>x.no===no);if(i<0)return;
 const set=new Set(customerAssignedSales(data[i]));checked?set.add(email):set.delete(email);
 data[i]={...data[i],assignedSalesEmails:[...set],assignedSalesEmail:""};saveCustomers(data);toast("Pembagian sales disimpan");
}
function setCustomerActive(no,active){
 if(currentUser.role!=="admin")return;
 const data=customers(),i=data.findIndex(x=>x.no===no);if(i<0)return;
 data[i]={...data[i],isHidden:!active};saveCustomers(data);renderCustomers();toast(active?"Pelanggan diaktifkan":"Pelanggan dinonaktifkan");
}
function deleteCustomerInline(no){
 if(currentUser.role!=="admin")return;
 const c=customers().find(x=>x.no===no);if(!c)return;
 const hasHistory=visits().some(v=>String(v.customerNo)===String(no)||(v.code===c.code&&v.name===c.name));
 const extra=hasHistory?" Riwayat kunjungan yang sudah tersimpan tetap dipertahankan.":"";
 if(!confirm(`Hapus permanen pelanggan ${c.name}?${extra}`))return;
 saveCustomers(customers().filter(x=>x.no!==no));fillAreas();renderCustomers();toast("Pelanggan berhasil dihapus");
}
function renderCustomers(){
 const all=customers(),q=document.getElementById("search").value.toLowerCase(),a=document.getElementById("areaFilter").value;
 const s=document.getElementById("statusFilter")?.value||"";
 const os=document.getElementById("outletStatusFilter")?.value||"";
 let base=currentUser.role==="sales"
   ?all.filter(x=>!x.isHidden&&isAreaAssigned(currentUser.email,x.area)&&canSalesAccessCustomer(x,currentUser.email)&&x.area===getDailyArea())
   :all;
 const data=base.filter(x=>(!a||x.area===a)&&(!s||(s==="hidden"?x.isHidden:!x.isHidden))&&(!os||(x.outletStatus||"normal")===os)&&(`${x.code} ${x.name}`.toLowerCase().includes(q))).sort(compareCustomerCode);
 document.getElementById("customerCount").textContent=base.length;
 if(currentUser.role==="admin")document.getElementById("customerList").innerHTML=data.map(adminCustomerCard).join("");
 else document.getElementById("customerList").innerHTML=data.map(x=>`<div class="customer-card ${reminderClass(x.no)} ${todayVisitForOutlet(x.no)?"today-complete":"today-pending"}" onclick="selectCustomer(${x.no})"><div><div class="customer-code">${esc(x.code||"TANPA KODE")}</div><h4>${esc(x.name)}</h4><div class="status-line"><span class="badge ${getOutletStatusClass(x.outletStatus)}">${esc(getOutletStatusLabel(x.outletStatus))}</span></div>${isOutletBeingVisited(x)?`<div class="customer-visit-state visiting">● Sedang Dikunjungi</div>`:""}<div class="last-visit-label">${lastVisitText(x.no)}</div><div class="today-visit-state ${todayVisitForOutlet(x.no)?"done":"pending"}">${todayVisitForOutlet(x.no)?`✓ ${esc(todayVisitForOutlet(x.no).status)}`:"○ Belum dikunjungi hari ini"}</div></div><span class="badge">${esc(x.area)}</span></div>`).join("");
 document.getElementById("empty").classList.toggle("hidden",data.length>0);
}
function compareCustomerCode(a,b){
 const ca=String(a.code||"").trim().toUpperCase();
 const cb=String(b.code||"").trim().toUpperCase();

 // Pelanggan tanpa kode ditempatkan paling bawah.
 if(!ca&&!cb)return a.name.localeCompare(b.name,"id",{numeric:true,sensitivity:"base"});
 if(!ca)return 1;
 if(!cb)return -1;

 // Urutan natural: 1096 < 1130, A001 < A002, SW001 < SW010, TBT01 < TBT10.
 return ca.localeCompare(cb,"id",{numeric:true,sensitivity:"base"});
}
function selectCustomer(no){
 selected=customers().find(x=>x.no===no);
 if(!selected)return;
 if(currentUser.role==="sales"&&selected.isHidden)return toast("Pelanggan ini tidak aktif");
 if(currentUser.role==="sales"&&!canSalesAccessCustomer(selected,currentUser.email))
   return toast("Anda tidak memiliki akses ke outlet ini");
 showDetail();
}
function showDetail(){
 hide();document.getElementById("detailView").classList.remove("hidden");
 document.getElementById("detailArea").textContent=selected.area;
 document.getElementById("detailCode").textContent=selected.code||"Tanpa kode";
 document.getElementById("detailName").textContent=selected.name;
 document.getElementById("detailSales").textContent=getSalesName(selected.assignedSalesEmail);
 document.getElementById("detailSalesWrap").classList.toggle("hidden",currentUser.role!=="admin");
 const ost=document.getElementById("detailOutletStatus");
 ost.textContent=getOutletStatusLabel(selected.outletStatus);
 ost.className="badge "+getOutletStatusClass(selected.outletStatus);
 const hasExtra=(selected.outletStatus||"normal")!=="normal";
 document.getElementById("outletInfoBox").classList.toggle("hidden",!hasExtra);
 document.getElementById("detailDueDate").textContent=selected.dueDate?formatDate(selected.dueDate):"-";
 const amountEl=document.getElementById("detailDueAmount");
 amountEl.textContent=selected.outletStatus==="dueSoon"&&selected.dueAmount?formatRupiah(selected.dueAmount):"-";
 amountEl.parentElement.classList.toggle("hidden",selected.outletStatus!=="dueSoon");
 document.getElementById("detailOutletNote").textContent=selected.outletNote||"-";
 const st=document.getElementById("detailStatus");
 st.textContent=selected.isHidden?"Hidden":"Aktif";
 st.className="badge "+(selected.isHidden?"status-hidden":"status-active");
 document.getElementById("hideBtn").textContent=selected.isHidden?"Aktifkan untuk Sales":"Hide dari Sales";
 const visitBtn=document.getElementById("visitBtn");
 visitBtn.classList.toggle("hidden",currentUser.role!=="sales"||(selected.isHidden&&currentUser.role==="sales"));
 const active=getActiveVisit();
 visitBtn.textContent=active&&active.customerNo===selected.no?"Lanjutkan Kunjungan":"Check In";
 renderOutletVisitHistory(selected.no);
}
function openForm(){
 hide();document.getElementById("formView").classList.remove("hidden");
 document.getElementById("formTitle").textContent="Tambah Pelanggan";
 document.getElementById("editNo").value="";
 document.getElementById("formCode").value="";
 document.getElementById("formName").value="";
 document.getElementById("formSales").value="";
 document.getElementById("formOutletStatus").value="normal";
 document.getElementById("formDueDate").value="";
 document.getElementById("formDueAmount").value="";
 document.getElementById("formOutletNote").value="";
 toggleOutletFields();
}
function editCustomer(){
 if(currentUser.role!=="admin")return;
 hide();document.getElementById("formView").classList.remove("hidden");
 document.getElementById("formTitle").textContent="Edit Pelanggan";
 document.getElementById("editNo").value=selected.no;
 document.getElementById("formCode").value=selected.code;
 document.getElementById("formName").value=selected.name;
 document.getElementById("formArea").value=selected.area;
 document.getElementById("formSales").value=selected.assignedSalesEmail||"";
 document.getElementById("formOutletStatus").value=selected.outletStatus||"normal";
 document.getElementById("formDueDate").value=selected.dueDate||"";
 document.getElementById("formDueAmount").value=selected.dueAmount||"";
 document.getElementById("formOutletNote").value=selected.outletNote||"";
 toggleOutletFields();
}
function saveCustomer(){
 if(currentUser.role!=="admin")return toast("Hanya admin yang dapat mengubah data");
 const code=document.getElementById("formCode").value.trim().toUpperCase();
 const name=document.getElementById("formName").value.trim();
 const area=document.getElementById("formArea").value;
 const assignedSalesEmail=document.getElementById("formSales").value;
 const outletStatus=document.getElementById("formOutletStatus").value;
 const dueDate=document.getElementById("formDueDate").value;
 const rawAmount=Number(document.getElementById("formDueAmount").value||0);
 const dueAmount=outletStatus==="dueSoon"?rawAmount:0;
 const outletNote=document.getElementById("formOutletNote").value.trim();
 const id=Number(document.getElementById("editNo").value);
 if(!name||!area)return toast("Nama dan area wajib diisi");
 let data=customers();
 if(code&&data.some(x=>x.code.toUpperCase()===code&&x.no!==id))return toast("Kode sudah digunakan");
 if(id){
   const i=data.findIndex(x=>x.no===id);
   data[i]={...data[i],code,name,area,assignedSalesEmail,outletStatus,dueDate,dueAmount,outletNote};
   selected=data[i];
 }else{
   const no=Math.max(...data.map(x=>x.no),0)+1;
   selected={no,code,name,area,isHidden:false,assignedSalesEmail,outletStatus,dueDate,dueAmount,outletNote};
   data.push(selected);
 }
 saveCustomers(data);fillAreas();toast("Data berhasil disimpan");showDetail();
}

function toggleHidden(){
 if(currentUser.role!=="admin")return;
 const action=selected.isHidden?"mengaktifkan kembali":"menyembunyikan";
 if(!confirm(`Yakin ingin ${action} pelanggan ${selected.name}?`))return;
 const data=customers();
 const i=data.findIndex(x=>x.no===selected.no);
 data[i]={...data[i],isHidden:!data[i].isHidden};
 selected=data[i];saveCustomers(data);
 toast(selected.isHidden?"Pelanggan disembunyikan dari sales":"Pelanggan aktif kembali");
 showDetail();
}
function deleteCustomer(){
 if(currentUser.role!=="admin")return;
 const hasHistory=visits().some(v=>v.code===selected.code&&v.name===selected.name);
 if(hasHistory)return toast("Tidak dapat dihapus karena sudah memiliki histori kunjungan. Gunakan Hide.");
 if(!confirm(`Hapus permanen pelanggan ${selected.name}?`))return;
 saveCustomers(customers().filter(x=>x.no!==selected.no));
 toast("Pelanggan berhasil dihapus");
 selected=null;fillAreas();showCustomers();
}
function isOutletBeingVisited(customer){
 const active=getActiveVisit();
 return Boolean(active&&active.customerNo===customer.no);
}
function openVisitFlow(){
 if(currentUser.role!=="sales")return toast("Fitur kunjungan hanya untuk sales");
 const active=getActiveVisit();
 if(active&&active.customerNo!==selected.no){
   return toast(`Selesaikan Check Out di ${active.name} terlebih dahulu`);
 }
 hide();
 document.getElementById("visitView").classList.remove("hidden");
 document.getElementById("visitArea").textContent=selected.area;
 document.getElementById("visitCode").textContent=selected.code||"Tanpa kode";
 document.getElementById("visitName").textContent=selected.name;
 resetCameraUI();

 if(active&&active.customerNo===selected.no){
   showCheckOutPanel(active);
 }else{
   document.getElementById("checkInPanel").classList.remove("hidden");
   document.getElementById("checkOutPanel").classList.add("hidden");
 }
}
function closeVisitFlow(){
 stopCamera();
 capturedPhotoData="";
 showDetail();
}
async function openCamera(){
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
   return toast("Browser ini tidak mendukung kamera langsung");
 }
 stopCamera();
 try{
   cameraStream=await navigator.mediaDevices.getUserMedia({
     video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:960}},
     audio:false
   });
   const video=document.getElementById("cameraVideo");
   video.srcObject=cameraStream;
   video.classList.remove("hidden");
   document.getElementById("cameraPlaceholder").classList.add("hidden");
   document.getElementById("checkInPreview").classList.add("hidden");
   document.getElementById("openCameraBtn").classList.add("hidden");
   document.getElementById("captureBtn").classList.remove("hidden");
   document.getElementById("retakeBtn").classList.add("hidden");
   capturedPhotoData="";
   document.getElementById("checkInBtn").disabled=true;
 }catch(err){
   toast("Izin kamera ditolak atau kamera tidak tersedia");
 }
}
function captureCheckInPhoto(){
 const video=document.getElementById("cameraVideo");
 if(!video.videoWidth)return toast("Kamera belum siap");
 const canvas=document.getElementById("cameraCanvas");
 const maxWidth=720;
 const scale=Math.min(1,maxWidth/video.videoWidth);
 canvas.width=Math.round(video.videoWidth*scale);
 canvas.height=Math.round(video.videoHeight*scale);
 const ctx=canvas.getContext("2d");
 ctx.drawImage(video,0,0,canvas.width,canvas.height);
 capturedPhotoData=canvas.toDataURL("image/jpeg",0.72);

 const preview=document.getElementById("checkInPreview");
 preview.src=capturedPhotoData;
 preview.classList.remove("hidden");
 video.classList.add("hidden");
 document.getElementById("captureBtn").classList.add("hidden");
 document.getElementById("retakeBtn").classList.remove("hidden");
 document.getElementById("checkInBtn").disabled=false;
 stopCamera();
}
function retakePhoto(){
 capturedPhotoData="";
 document.getElementById("checkInPreview").src="";
 document.getElementById("checkInPreview").classList.add("hidden");
 document.getElementById("checkInBtn").disabled=true;
 document.getElementById("retakeBtn").classList.add("hidden");
 document.getElementById("openCameraBtn").classList.remove("hidden");
 document.getElementById("cameraPlaceholder").classList.remove("hidden");
}
function confirmCheckIn(){
 if(!capturedPhotoData)return toast("Ambil foto langsung dari kamera terlebih dahulu");
 if(getActiveVisit())return toast("Masih ada kunjungan yang belum Check Out");
 const now=new Date();
 const active={
   id:"V"+Date.now(),
   customerNo:selected.no,
   code:selected.code,
   name:selected.name,
   area:selected.area,
   salesName:currentUser.name,
   salesEmail:currentUser.email,
   checkInAt:now.toISOString(),
   checkInPhoto:capturedPhotoData,
   visitState:"visiting"
 };
 try{
   saveActiveVisit(active);
 }catch(e){
   return toast("Foto terlalu besar untuk disimpan. Coba ambil ulang.");
 }
 capturedPhotoData="";
 stopCamera();
 toast("Check In berhasil. Status: Sedang Dikunjungi");
 showCheckOutPanel(active);
}
function showCheckOutPanel(active){
 document.getElementById("checkInPanel").classList.add("hidden");
 document.getElementById("checkOutPanel").classList.remove("hidden");
 document.getElementById("visitCheckInDate").textContent=formatOnlyDate(active.checkInAt);
 document.getElementById("visitCheckIn").textContent=formatTime(active.checkInAt);
 document.getElementById("activeCheckInPhoto").src=active.checkInPhoto;
 document.getElementById("visitStatus").value="";
 document.getElementById("visitNote").value="";
 updateVisitNoteField();
}
function updateVisitNoteField(){
 const status=document.getElementById("visitStatus").value;
 const container=document.getElementById("visitNoteContainer");
 const label=document.getElementById("visitNoteLabel");
 const note=document.getElementById("visitNote");

 if(!status){
   container.classList.add("hidden");
   label.textContent="Catatan *";
   note.placeholder="Tuliskan catatan...";
   note.value="";
   return;
 }

 container.classList.remove("hidden");
 if(status==="Ada Order"){
   label.textContent="Orderan *";
   note.placeholder="Masukkan orderan pelanggan...";
 }else if(status==="Tidak Order"){
   label.textContent="Alasan Tidak Order *";
   note.placeholder="Tuliskan alasan tidak order...";
 }else{
   label.textContent="Catatan *";
   note.placeholder="Tuliskan catatan...";
 }
}

async function confirmCheckOut(){
 const active=getActiveVisit();
 if(!active)return toast("Data Check In tidak ditemukan");
 const status=document.getElementById("visitStatus").value;
 if(!status)return toast("Pilih status kunjungan outlet");

 const noteInput=document.getElementById("visitNote");
 const note=noteInput.value.trim();
 if(!note){
   const message=status==="Ada Order"
     ?"Orderan wajib diisi."
     :status==="Tidak Order"
       ?"Alasan tidak order wajib diisi."
       :"Catatan wajib diisi.";
   toast(message);
   noteInput.focus();
   return;
 }

 const checkOut=new Date();
 const completed={
   ...active,
   status,
   note,
   checkOutAt:checkOut.toISOString(),
   durationMinutes:calculateDurationMinutes(active.checkInAt,checkOut.toISOString()),
   visitState:"completed",
   createdAt:checkOut.toISOString(),
   syncStatus:"pending"
 };
 try{
   await saveVisitOffline(completed);
   clearActiveVisit();
 }catch(e){
   console.error(e);
   return toast("Gagal menyimpan data kunjungan di HP");
 }
 toast(`Check Out berhasil. Durasi ${completed.durationMinutes} menit`);
 setTimeout(showCustomers,500);
}
function resetCameraUI(){
 stopCamera();
 capturedPhotoData="";
 document.getElementById("cameraVideo").classList.add("hidden");
 document.getElementById("cameraVideo").srcObject=null;
 document.getElementById("checkInPreview").classList.add("hidden");
 document.getElementById("checkInPreview").src="";
 document.getElementById("cameraPlaceholder").classList.remove("hidden");
 document.getElementById("openCameraBtn").classList.remove("hidden");
 document.getElementById("captureBtn").classList.add("hidden");
 document.getElementById("retakeBtn").classList.add("hidden");
 document.getElementById("checkInBtn").disabled=true;
}
function stopCamera(){
 if(cameraStream){
   cameraStream.getTracks().forEach(track=>track.stop());
   cameraStream=null;
 }
 const video=document.getElementById("cameraVideo");
 if(video)video.srcObject=null;
}
function showHistory(){
 hide();
 document.getElementById("historyView").classList.remove("hidden");
 const filterWrap=document.getElementById("adminHistorySalesFilterWrap");
 if(filterWrap){
   filterWrap.classList.toggle("hidden",currentUser.role!=="admin");
 }
 renderHistory();
}
function startOfLocalDay(date){const d=new Date(date);d.setHours(0,0,0,0);return d}
function endOfLocalDay(date){const d=new Date(date);d.setHours(23,59,59,999);return d}
function visitDateValue(v){const raw=v.checkOutAt||v.checkInAt||v.createdAt;const d=new Date(raw);return Number.isNaN(d.getTime())?null:d}
function isoDateInput(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");return `${y}-${m}-${d}`}
function getHistoryPeriodRange(){
 const period=document.getElementById("historyPeriodFilter")?.value||"30days",now=new Date();
 let from=null,to=null,label="Semua Data";
 if(period==="today"){from=startOfLocalDay(now);to=endOfLocalDay(now);label="Hari Ini"}
 else if(period==="yesterday"){const d=new Date(now);d.setDate(d.getDate()-1);from=startOfLocalDay(d);to=endOfLocalDay(d);label="Kemarin"}
 else if(period==="7days"){const d=new Date(now);d.setDate(d.getDate()-6);from=startOfLocalDay(d);to=endOfLocalDay(now);label="7 Hari Terakhir"}
 else if(period==="30days"){const d=new Date(now);d.setDate(d.getDate()-29);from=startOfLocalDay(d);to=endOfLocalDay(now);label="30 Hari Terakhir"}
 else if(period==="thisMonth"){from=startOfLocalDay(new Date(now.getFullYear(),now.getMonth(),1));to=endOfLocalDay(now);label="Bulan Ini"}
 else if(period==="lastMonth"){from=startOfLocalDay(new Date(now.getFullYear(),now.getMonth()-1,1));to=endOfLocalDay(new Date(now.getFullYear(),now.getMonth(),0));label="Bulan Lalu"}
 else if(period==="custom"){
   const fromValue=document.getElementById("historyDateFrom")?.value,toValue=document.getElementById("historyDateTo")?.value;
   if(fromValue)from=startOfLocalDay(new Date(`${fromValue}T00:00:00`));
   if(toValue)to=endOfLocalDay(new Date(`${toValue}T00:00:00`));
   label=fromValue||toValue?`${fromValue?new Date(fromValue+"T00:00:00").toLocaleDateString("id-ID"):"Awal"} - ${toValue?new Date(toValue+"T00:00:00").toLocaleDateString("id-ID"):"Hari Ini"}`:"Pilih Tanggal";
 }
 return {period,from,to,label};
}
function handleHistoryPeriodChange(){
 const custom=document.getElementById("historyPeriodFilter")?.value==="custom";
 document.getElementById("historyCustomDateWrap")?.classList.toggle("hidden",!custom);
 if(custom){
   const now=new Date(),from=new Date();from.setDate(from.getDate()-29);
   const fromInput=document.getElementById("historyDateFrom"),toInput=document.getElementById("historyDateTo");
   if(fromInput&&!fromInput.value)fromInput.value=isoDateInput(from);
   if(toInput&&!toInput.value)toInput.value=isoDateInput(now);
 }
 renderHistory();
}
function applyHistoryFilters(data){
 let rows=[...data];
 if(currentUser.role==="sales")rows=rows.filter(x=>x.salesEmail===currentUser.email);
 else{const selectedSales=document.getElementById("historySalesFilter")?.value||"";if(selectedSales)rows=rows.filter(x=>x.salesEmail===selectedSales)}
 const range=getHistoryPeriodRange();
 if(range.from||range.to)rows=rows.filter(v=>{const d=visitDateValue(v);return d&&(!range.from||d>=range.from)&&(!range.to||d<=range.to)});
 return rows.sort((a,b)=>(visitDateValue(b)?.getTime()||0)-(visitDateValue(a)?.getTime()||0));
}
async function renderHistory(){
 let data=applyHistoryFilters(await getVisitsOffline());
 const range=getHistoryPeriodRange();
 const summary=document.getElementById("historyFilterSummary");
 if(summary&&currentUser.role==="admin")summary.textContent=`Menampilkan ${data.length} data • ${range.label}`;

 document.getElementById("historyList").innerHTML=data.map(v=>`
 <div class="history-card">
   <div class="customer-code">${esc(v.code||"TANPA KODE")} • ${esc(v.area)}</div>
   <h4>${esc(v.name)}</h4>
   <div class="pills">
     <span class="pill">${esc(v.status||"-")}</span>
     <span class="pill">${esc(v.salesName)}</span>
     <span class="pill">${esc(String(v.durationMinutes??calculateDurationMinutes(v.checkInAt,v.checkOutAt)))} menit</span>
     <span class="sync-badge ${getSyncClass(v.syncStatus)}">${getSyncLabel(v.syncStatus)}</span>
   </div>
   ${v.checkInPhoto?`<img class="history-photo" src="${v.checkInPhoto}" alt="Foto check in" onclick="openPhotoModal(this.src)">`:""}
   <div class="history-time">
     <span>Check In: ${esc(formatVisitDateTime(v.checkInAt||v.createdAt))}</span>
     <span>Check Out: ${esc(formatVisitDateTime(v.checkOutAt||v.createdAt))}</span>
   </div>
   <div class="history-note-block">
     <small>${esc(getVisitDetailFieldLabel(v.status))}</small>
     <p>${esc(v.note||"Tanpa catatan")}</p>
   </div>
   ${formatAuditHistory(v.editHistory)}
   ${canEditVisitNote(v)?`<button class="secondary compact edit-visit-button" onclick="openEditVisitModal('${esc(v.id)}')">Edit ${esc(getVisitDetailFieldLabel(v.status))}</button>`:""}
 </div>`).join("")||'<div class="empty">Belum ada riwayat untuk filter yang dipilih.</div>';
}
function getSyncLabel(status){
 return status==="synced"?"Sudah Sinkron":status==="failed"?"Gagal Sinkron":"Belum Sinkron";
}
function getSyncClass(status){
 return status==="synced"?"sync-synced":status==="failed"?"sync-failed":"sync-pending";
}
function openPhotoModal(src){
 document.getElementById("photoModalImage").src=src;
 document.getElementById("photoModal").classList.remove("hidden");
}
function closePhotoModal(){
 document.getElementById("photoModal").classList.add("hidden");
 document.getElementById("photoModalImage").src="";
}
function pdfEscape(value){
 return String(value??"")
   .replace(/&/g,"&amp;")
   .replace(/</g,"&lt;")
   .replace(/>/g,"&gt;")
   .replace(/"/g,"&quot;")
   .replace(/'/g,"&#039;");
}
async function exportPDF(){
 if(!currentUser||currentUser.role!=="admin")return toast("Export PDF hanya tersedia untuk admin");

 // Open synchronously so the browser does not block the print window.
 const reportWindow=window.open("","_blank");
 if(!reportWindow)return toast("Izinkan pop-up untuk membuat PDF");
 reportWindow.document.write('<!doctype html><html><head><title>Menyiapkan laporan...</title></head><body style="font-family:Arial;padding:24px">Menyiapkan laporan PDF...</body></html>');

 let data=applyHistoryFilters(await getVisitsOffline());
 const selectedSales=document.getElementById("historySalesFilter")?.value||"";
 const range=getHistoryPeriodRange();
 const salesLabel=selectedSales?getSalesName(selectedSales):"Semua Sales";
 const total=data.length;
 const adaOrder=data.filter(v=>v.status==="Ada Order").length;
 const tidakOrder=data.filter(v=>v.status==="Tidak Order").length;
 const tidakBertemu=data.filter(v=>v.status==="Tidak Bertemu").length;
 const orderLuarArea=data.filter(v=>v.completionType==="outside-area-order"||v.visitType==="Order Luar Area").length;
 const generatedAt=new Date().toLocaleString("id-ID",{dateStyle:"long",timeStyle:"short"});

 const rows=data.map((v,i)=>{
   const label=getVisitDetailFieldLabel(v.status);
   const edits=Array.isArray(v.editHistory)&&v.editHistory.length
     ? `<div class="audit"><b>Riwayat perubahan:</b>${v.editHistory.map(e=>`<div>${pdfEscape(formatVisitDateTime(e.editedAt))} - ${pdfEscape(e.editedByName||e.editedByEmail||"-")}<br><span>${pdfEscape(e.oldNote||"-")} &rarr; ${pdfEscape(e.newNote||"-")}</span></div>`).join("")}</div>`
     : "";
   return `<tr>
     <td class="no">${i+1}</td>
     <td><b>${pdfEscape(v.code||"TANPA KODE")}</b><br>${pdfEscape(v.name||"-")}<br><span>${pdfEscape(v.area||"-")}</span></td>
     <td>${pdfEscape(v.salesName||getSalesName(v.salesEmail))}</td>
     <td>${pdfEscape(v.status||"-")}</td>
     <td>${pdfEscape(formatVisitDateTime(v.checkInAt||v.createdAt))}<br><span>Keluar: ${pdfEscape(formatVisitDateTime(v.checkOutAt||v.createdAt))}</span><br><span>Durasi: ${pdfEscape(v.durationMinutes??calculateDurationMinutes(v.checkInAt,v.checkOutAt))} menit</span></td>
     <td><b>${pdfEscape(label)}</b><br>${pdfEscape(v.note||"-")}${edits}</td>
   </tr>`;
 }).join("");

 const html=`<!doctype html>
 <html><head><meta charset="utf-8"><title>Laporan Kunjungan Sales RML</title>
 <style>
 @page{size:A4 landscape;margin:12mm}
 *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#173f38;margin:0;font-size:10px}
 .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #15775f;padding-bottom:10px;margin-bottom:12px}
 h1{font-size:20px;margin:0 0 4px}.sub{color:#5e7771}.meta{text-align:right;line-height:1.5}
 .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}
 .summary div{border:1px solid #cfe0db;border-radius:8px;padding:9px;background:#f6faf8}.summary small{display:block;color:#678079}.summary b{font-size:18px}
 table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#176e59;color:#fff;padding:7px;text-align:left}td{border:1px solid #d6e2de;padding:7px;vertical-align:top;line-height:1.35;word-break:break-word}
 tr:nth-child(even) td{background:#f8fbfa}.no{width:4%;text-align:center}th:nth-child(2){width:20%}th:nth-child(3){width:10%}th:nth-child(4){width:11%}th:nth-child(5){width:20%}th:nth-child(6){width:35%}
 td span{color:#657b76;font-size:9px}.audit{margin-top:7px;padding-top:6px;border-top:1px dashed #aebfba;font-size:8px}.audit>div{margin-top:4px}.audit span{font-size:8px}
 .empty{text-align:center;padding:25px;border:1px solid #d6e2de}.footer{margin-top:10px;color:#71837f;font-size:8px;text-align:right}
 @media print{button{display:none!important}tr{break-inside:avoid}.no-print{display:none}}
 </style></head><body>
 <div class="header"><div><h1>Laporan Riwayat Kunjungan Sales</h1><div class="sub">RML Sales Visit - ${pdfEscape(salesLabel)}</div></div><div class="meta">Dibuat: ${pdfEscape(generatedAt)}<br>Periode: <b>${pdfEscape(range.label)}</b><br>Filter Sales: <b>${pdfEscape(salesLabel)}</b></div></div>
 <div class="summary"><div><small>Total Aktivitas</small><b>${total}</b></div><div><small>Ada Order</small><b>${adaOrder}</b></div><div><small>Tidak Order</small><b>${tidakOrder}</b></div><div><small>Tidak Bertemu</small><b>${tidakBertemu}</b></div><div><small>Order Luar Area</small><b>${orderLuarArea}</b></div></div>
 ${total?`<table><thead><tr><th>No.</th><th>Outlet</th><th>Sales</th><th>Status</th><th>Waktu</th><th>Orderan / Catatan</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">Belum ada data kunjungan untuk filter yang dipilih.</div>'}
 <div class="footer">Dokumen dibuat dari RML Sales Visit</div>
 <script>window.onload=()=>{setTimeout(()=>window.print(),300)}<\/script>
 </body></html>`;

 reportWindow.document.open();
 reportWindow.document.write(html);
 reportWindow.document.close();
}

function updateNetworkStatus(){
 const online=navigator.onLine;
 const banner=document.getElementById("networkBanner");
 if(!banner)return;
 banner.textContent=online?"Online":"Offline — data tetap tersimpan di HP";
 banner.className=`network-banner ${online?"online":"offline"}`;
 document.getElementById("syncBtn").disabled=!online;
}
async function updatePendingSyncCount(){
 const all=await getVisitsOffline();
 const pending=all.filter(v=>v.syncStatus!=="synced").length;
 const el=document.getElementById("pendingSyncCount");
 if(el)el.textContent=`${pending} belum sinkron`;
}
async function syncPendingVisits(){
 if(!navigator.onLine)return toast("Tidak ada internet. Data tetap aman di HP.");
 if(!getSbSession()?.session_token)return toast("Silakan login kembali untuk menyinkronkan data");
 const all=await getVisitsOffline();const pending=all.filter(v=>v.syncStatus!=="synced");
 try{
  for(const v of pending){await rpc('app_upsert_visit',{p_token:getSbSession().session_token,p_visit:visitToRemote(v)});await idbPut(STORE_VISITS,{...v,syncStatus:"synced"})}
  await pullRemoteVisits();await refreshVisitCache();await updatePendingSyncCount();toast(pending.length?`${pending.length} data berhasil disinkronkan`:"Semua data sudah sinkron");
 }catch(e){for(const v of pending)await idbPut(STORE_VISITS,{...v,syncStatus:"failed"});await updatePendingSyncCount();toast(`Sinkronisasi gagal: ${e.message}`)}
}

async function installPWA(){
 if(!deferredInstallPrompt)return toast("Gunakan menu browser untuk memasang aplikasi");
 deferredInstallPrompt.prompt();
 await deferredInstallPrompt.userChoice;
 deferredInstallPrompt=null;
 document.getElementById("installBtn").classList.add("hidden");
}
window.addEventListener("beforeinstallprompt",e=>{
 e.preventDefault();
 deferredInstallPrompt=e;
 const btn=document.getElementById("installBtn");
 if(btn)btn.classList.remove("hidden");
});
window.addEventListener("online",()=>{updateNetworkStatus();updatePendingSyncCount();syncPendingVisits();});
window.addEventListener("offline",updateNetworkStatus);

document.addEventListener("DOMContentLoaded",()=>{
 const loginPage=document.getElementById("loginPage");
 const loginName=document.getElementById("loginName");
 const password=document.getElementById("password");
 if(loginPage&&!loginPage.classList.contains("hidden"))resetLoginForm();
 loginName?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();password?.focus();}});
 password?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();login();}});
});

if("serviceWorker" in navigator){
 window.addEventListener("load",async()=>{
  try{
   const regs=await navigator.serviceWorker.getRegistrations();
   await Promise.all(regs.map(r=>r.unregister()));
   const keys=await caches.keys();
   await Promise.all(keys.map(k=>caches.delete(k)));
  }catch(e){console.warn("Pembersihan cache lama gagal",e)}
 });
}
function toggleOutletFields(){
 const status=document.getElementById("formOutletStatus").value;
 const show=status!=="normal";
 document.getElementById("outletExtraFields").classList.toggle("hidden",!show);

 const isDue=status==="dueSoon";
 document.getElementById("dateLabel").textContent=isDue?"Tanggal Jatuh Tempo":"Tanggal Pending";
 document.getElementById("amountFields").classList.toggle("hidden",!isDue);

 if(!isDue){
   document.getElementById("formDueAmount").value="";
 }
}
function getOutletStatusLabel(status){
 return ({
   normal:"Normal",
   dueSoon:"Jatuh Tempo Dekat",
   pending:"Pending Barang"
 })[status]||"Normal";
}
function getOutletStatusClass(status){
 return ({
   normal:"outlet-normal",
   dueSoon:"outlet-due-soon",
   pending:"outlet-pending"
 })[status]||"outlet-normal";
}
function formatOnlyDate(value){
 if(!value)return "-";
 return new Date(value).toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"});
}
function formatTime(value){
 const d=value instanceof Date?value:new Date(value);
 return d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
function formatVisitDateTime(value){
 if(!value)return "-";
 return new Date(value).toLocaleString("id-ID",{
   day:"2-digit",month:"short",year:"numeric",
   hour:"2-digit",minute:"2-digit",second:"2-digit"
 });
}
function calculateDurationMinutes(start,end){
 if(!start||!end)return "";
 const mins=Math.max(0,Math.round((new Date(end)-new Date(start))/60000));
 return mins;
}
function formatRupiah(value){
 return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value||0));
}
function formatDate(value){
 if(!value)return "-";
 const d=new Date(value+"T00:00:00");
 return d.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"});
}
function getSalesName(email){
 if(!email)return "Belum ditentukan";
 if(email==="__ALL__")return "Semua Sales";
 const u=USERS.find(x=>x.email===email&&x.role==="sales");
 return u?u.name:"Sales tidak ditemukan";
}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
const saved=sessionStorage.getItem("rml_user")||localStorage.getItem("rml_cached_user");if(saved){try{const oldUser=JSON.parse(saved);USERS=loadUsers();currentUser={...(USERS.find(u=>u.email===oldUser.email)||oldUser)};sessionStorage.setItem("rml_user",JSON.stringify(currentUser));currentUser.mustChangePassword?showForcedPasswordPage():openApp()}catch(e){sessionStorage.removeItem("rml_user")}}

document.addEventListener("DOMContentLoaded",async()=>{
 try{
   await migrateLegacyVisits();
   updateNetworkStatus();
   await updatePendingSyncCount();
 }catch(e){
   console.error("Offline init error",e);
 }
});

document.addEventListener("DOMContentLoaded",()=>{
 const visitStatus=document.getElementById("visitStatus");
 if(visitStatus){
   visitStatus.addEventListener("change",updateVisitNoteField);
   updateVisitNoteField();
 }
});
