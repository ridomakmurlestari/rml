/* RML v1.8.9 - Admin/Supervisor add sales */
function getSalesAdminUser(){try{return currentUser||window.currentUser||null}catch(_){return window.currentUser||null}}
function canManageSalesAccounts(){const u=getSalesAdminUser();return !!(u&&(u.role==='admin'||(typeof isSupervisorUser==='function'&&isSupervisorUser(u))));}
function openAddSalesModal(){if(!canManageSalesAccounts())return;['newSalesName','newSalesLogin','newSalesPhone'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=''});document.getElementById('newSalesActive').checked=true;document.getElementById('newSalesFreeArea').checked=false;document.getElementById('addSalesModal')?.classList.remove('hidden');setTimeout(()=>document.getElementById('newSalesName')?.focus(),50)}
function closeAddSalesModal(){document.getElementById('addSalesModal')?.classList.add('hidden')}
function normalizeSalesLogin(v){return String(v||'').trim().toLowerCase()}
async function saveNewSales(){
 if(!canManageSalesAccounts())return;
 const name=document.getElementById('newSalesName')?.value.trim();
 const login=normalizeSalesLogin(document.getElementById('newSalesLogin')?.value);
 const phone=normalizePhone(document.getElementById('newSalesPhone')?.value);
 const active=document.getElementById('newSalesActive')?.checked!==false;
 const canSwitch=!!document.getElementById('newSalesFreeArea')?.checked;
 if(!name)return toast('Nama sales wajib diisi');
 if(!/^[a-z0-9._-]{3,40}$/.test(login))return toast('Nama login minimal 3 karakter dan hanya boleh huruf, angka, titik, garis bawah, atau strip');
 if(phone.length<8)return toast('Nomor handphone tidak valid');
 if(USERS.some(u=>String(u.loginName||u.name||'').trim().toLowerCase()===login))return toast('Nama login sudah digunakan');
 if(USERS.some(u=>normalizePhone(u.phone)===phone))return toast('Nomor handphone sudah digunakan');
 const email=`${login}@rml.app`;
 if(USERS.some(u=>String(u.email||'').toLowerCase()===email))return toast('Email akun sudah digunakan');
 const user={email,loginName:login,active,phone,name,role:'sales',password:phone,mustChangePassword:true,canSwitchAreaFreely:canSwitch};
 const btn=document.getElementById('saveNewSalesBtn');
 const oldUsers=USERS.map(u=>({...u}));
 USERS.push(user);persistUsers();
 try{
  if(btn){btn.disabled=true;btn.textContent='Menyimpan...'}
  if(!navigator.onLine)throw new Error('Tambah sales memerlukan internet agar akun dapat disimpan ke server');
  const session=getSbSession();if(!session?.session_token)throw new Error('Sesi login tidak tersedia. Silakan login ulang.');
  await rpc('app_admin_upsert_user',{p_token:session.session_token,p_user:{account_key:email,display_name:name,login_name:login,phone,role:'sales',active,can_switch_area_freely:canSwitch}});
  closeAddSalesModal();fillAreas();fillHistorySalesFilter();renderAreaAssignments();renderUserManagement();toast(`Sales ${name} berhasil ditambahkan`);
 }catch(e){USERS=oldUsers;persistUsers();toast(`Gagal menambah sales: ${e.message||'Periksa koneksi'}`)}
 finally{if(btn){btn.disabled=false;btn.textContent='Simpan Sales'}}
}
window.openAddSalesModal=openAddSalesModal;window.closeAddSalesModal=closeAddSalesModal;window.saveNewSales=saveNewSales;

async function deleteSalesAccount(index){
 if(!canManageSalesAccounts())return;
 const user=USERS[index];
 if(!user||user.role!=="sales")return toast("Akun Sales tidak ditemukan");
 if(!confirm(`Hapus Sales ${user.name}? Akun akan dinonaktifkan dan tidak dapat login lagi. Riwayat kunjungan tetap disimpan.`))return;
 if(!navigator.onLine)return toast("Hapus Sales memerlukan internet");
 const session=getSbSession();if(!session?.session_token)return toast("Sesi login tidak tersedia. Silakan login ulang.");
 try{
   await rpc('app_admin_delete_user',{p_token:session.session_token,p_account_key:user.email});
   const pos=USERS.findIndex(u=>u.email===user.email);
   if(pos>=0)USERS.splice(pos,1);
   persistUsers();
   if(typeof renderAreaAssignments==='function')renderAreaAssignments();
   if(typeof fillAreas==='function')fillAreas();
   if(typeof fillHistorySalesFilter==='function')fillHistorySalesFilter();
   if(typeof renderUserManagement==='function')renderUserManagement();
   if(typeof renderMonthlyPromoCard==='function')renderMonthlyPromoCard();
   toast(`Sales ${user.name} berhasil dihapus`);
 }catch(e){toast(`Gagal menghapus Sales: ${e.message||'periksa SQL Supabase'}`)}
}
window.deleteSalesAccount=deleteSalesAccount;
