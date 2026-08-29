function androidSaveBase64File(filename,mimeType,base64Data){
 if(window.AndroidBridge&&typeof window.AndroidBridge.saveBase64File==="function"){
  window.AndroidBridge.saveBase64File(filename,mimeType||"application/octet-stream",base64Data);
  return true;
 }
 return false;
}
function bytesToBase64(bytes){
 let binary="";const step=0x8000;
 for(let i=0;i<bytes.length;i+=step)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+step,bytes.length)));
 return btoa(binary);
}

let customerSelectMode=false;
let selectedCustomerNos=new Set();
let historySelectMode=false;
let selectedVisitIds=new Set();
const REMOTE_VISIT_INITIAL_LIMIT=20;
const HISTORY_PAGE_SIZE=30;
let historyRenderLimit=HISTORY_PAGE_SIZE;
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
async function rpcWithTimeout(name,args={},timeoutMs=20000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
   method:'POST',
   headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},
   body:JSON.stringify(args),
   signal:controller.signal
  });
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}
  if(!res.ok)throw new Error(data?.message||data?.error_description||data?.hint||`Supabase ${res.status}`);
  return data;
 }catch(e){
  if(e?.name==='AbortError')throw new Error('Waktu penyimpanan habis. Periksa koneksi lalu coba lagi.');
  throw e;
 }finally{clearTimeout(timer)}
}
async function upsertSingleProductToSupabase(product){
 const session=getSbSession();
 if(currentUser?.role!=='admin')throw new Error('Hanya admin yang dapat mengubah produk');
 if(!navigator.onLine)throw new Error('Tidak ada koneksi internet');
 if(!session?.session_token)throw new Error('Sesi login tidak tersedia. Silakan login ulang.');
 return rpcWithTimeout('app_admin_upsert_product',{
  p_token:session.session_token,
  p_product:product
 },20000);
}
async function sbSignIn(name,password){const data=await rpc('app_login',{p_login_name:name,p_password:password});const row=Array.isArray(data)?data[0]:data;if(!row?.session_token)throw new Error('Nama atau password salah');setSbSession(row);return row}
async function sbProfile(){const session=getSbSession();if(!session?.session_token)return null;const data=await rpc('app_get_profile',{p_token:session.session_token});return Array.isArray(data)?data[0]:data}
async function sbUpdatePassword(oldPassword,newPassword){const session=getSbSession();if(!session?.session_token)throw new Error('Sesi login tidak tersedia');return rpc('app_change_password',{p_token:session.session_token,p_old_password:oldPassword,p_new_password:newPassword})}
function visitToRemote(v){return {id:v.id,sales_email:v.salesEmail||currentUser?.email||'',sales_name:v.salesName||currentUser?.name||'',customer_no:String(v.customerNo||''),customer_code:v.code||'',customer_name:v.name||'',area:v.area||'',status:v.status||'',visit_type:v.visitType||'Kunjungan Area',check_in_at:v.checkInAt||null,check_out_at:v.checkOutAt||null,updated_at:v.updatedAt||new Date().toISOString(),payload:v}}
async function pullRemoteVisits({reconcile=false}={}){
 const session=getSbSession();
 if(!navigator.onLine||!session?.session_token)return [];
 const rows=await rpc('app_pull_visits',{p_token:session.session_token,p_limit:REMOTE_VISIT_INITIAL_LIMIT});
 if(reconcile){
  const remoteIds=new Set((rows||[]).map(r=>String(r.id)));
  const localRows=await idbGetAll(STORE_VISITS);
  for(const local of localRows){
   const belongsToCurrentUser=currentUser?.role==='admin'||local.salesEmail===currentUser?.email;
   if(belongsToCurrentUser&&local.syncStatus==='synced'&&!remoteIds.has(String(local.id)))await idbDelete(STORE_VISITS,local.id);
  }
 }
 for(const r of rows||[]){
  const local={...(r.payload||{}),id:r.id,syncStatus:'synced',updatedAt:r.updated_at};
  await idbPut(STORE_VISITS,local);
 }
 return rows||[];
}
async function deleteVisitsRemote(ids){const session=getSbSession();if(currentUser?.role!=='admin')throw new Error('Hanya admin yang dapat menghapus riwayat');if(!navigator.onLine)throw new Error('Penghapusan riwayat memerlukan koneksi internet');if(!session?.session_token)throw new Error('Sesi login tidak tersedia');return rpc('app_admin_delete_visits',{p_token:session.session_token,p_visit_ids:ids})}
async function syncSettingsToSupabase(){const session=getSbSession();if(currentUser?.role!=='admin'||!navigator.onLine||!session?.session_token)return;const users=USERS.map(u=>({account_key:u.email,display_name:u.name,login_name:(u.loginName||u.name).trim().toLowerCase(),phone:u.phone,role:u.role,active:u.active!==false,can_switch_area_freely:u.canSwitchAreaFreely===true}));const map=getAreaAssignments();const assignments=[];for(const u of USERS.filter(x=>x.role==='sales'))for(const area of (map[u.email]||[]))assignments.push({sales_email:u.email,area});await rpc('app_admin_save_settings',{p_token:session.session_token,p_users:users,p_assignments:assignments})}

let customerSyncTimer=null;
async function syncCustomersToSupabase({silent=false}={}){
 const session=getSbSession();
 if(currentUser?.role!=='admin'||!navigator.onLine||!session?.session_token)return false;
 try{
  await rpc('app_admin_save_customers',{p_token:session.session_token,p_customers:customers()});
  return true;
 }catch(e){
  console.error('Sinkronisasi outlet gagal',e);
  if(!silent)toast(`Gagal sinkron outlet: ${e.message}`);
  return false;
 }
}
function scheduleCustomerSync(delay=250){
 clearTimeout(customerSyncTimer);
 customerSyncTimer=setTimeout(()=>syncCustomersToSupabase({silent:true}),delay);
}
async function pullCustomersFromSupabase({silent=true}={}){
 const session=getSbSession();
 if(!navigator.onLine||!session?.session_token)return false;
 try{
  const data=await rpc('app_pull_customers',{p_token:session.session_token});
  const row=Array.isArray(data)?data[0]:data;
  const remote=Array.isArray(row?.customers)?row.customers:(Array.isArray(row)?row:null);
  if(Array.isArray(remote)&&remote.length){
   localStorage.setItem('rml_customers',JSON.stringify(remote));
   fillAreas();
   if(currentUser?.role==='admin')fillCustomerSalesFilter();
   return true;
  }
  if(currentUser?.role==='admin'&&customers().length){
   await syncCustomersToSupabase({silent:true});
   return true;
  }
  return false;
 }catch(e){
  console.error('Tarik data outlet gagal',e);
  if(!silent)toast(`Gagal memuat outlet terbaru: ${e.message}`);
  return false;
 }
}

const PRODUCT_CACHE_KEY="rml_product_catalog_v1";
const PRODUCT_ASSIGNMENT_KEY="rml_product_assignments_v2";
const PRODUCT_PAGE_SIZE=100;
let productVisibleLimit=PRODUCT_PAGE_SIZE;
let productSyncTimer=null;
let productBulkSelectMode=false;
let selectedProductIds=new Set();
let productHistoryRows=[];
function productCatalog(){try{const v=JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY)||"[]");return Array.isArray(v)?v:[]}catch(_){return []}}
function saveProductCatalogLocal(rows){localStorage.setItem(PRODUCT_CACHE_KEY,JSON.stringify(Array.isArray(rows)?rows:[]))}
function productAssignments(){
 try{
  const v=JSON.parse(localStorage.getItem(PRODUCT_ASSIGNMENT_KEY)||"{}");
  if(v&&typeof v==="object")return v;
 }catch(_){}
 // Migrasi otomatis dari pembagian lama yang hanya berdasarkan Sales.
 try{
  const legacy=JSON.parse(localStorage.getItem("rml_product_assignments_v1")||"{}");
  if(legacy&&typeof legacy==="object"){localStorage.setItem(PRODUCT_ASSIGNMENT_KEY,JSON.stringify(legacy));return legacy}
 }catch(_){}
 return {};
}
function saveProductAssignmentsLocal(map){localStorage.setItem(PRODUCT_ASSIGNMENT_KEY,JSON.stringify(map||{}))}
function productAssignmentKey(email,area,customerNo=""){
 const base=`${String(email||"").trim()}@@${String(area||"").trim()}`;
 return String(customerNo||"").trim()?`${base}@@${String(customerNo).trim()}`:base;
}
function assignedProductIds(email,area,customerNo=""){
 const map=productAssignments();
 const shopSpecific=String(customerNo||"").trim()?map[productAssignmentKey(email,area,customerNo)]:undefined;
 if(Array.isArray(shopSpecific))return shopSpecific;
 const areaSpecific=map[productAssignmentKey(email,area)];
 if(Array.isArray(areaSpecific))return areaSpecific;
 // Pembagian versi lama tetap berlaku sebagai fallback sampai Admin menyimpan area tertentu.
 return Array.isArray(map[email])?map[email]:[];
}
function productAssignmentCustomers(email,area){
 return customers().filter(c=>!c.isHidden&&c.area===area&&canSalesAccessCustomer(c,email)).sort(compareCustomerCode);
}
function activeProductCustomerNo(){
 const active=getActiveVisit();
 return active&&String(active.area||"")===String(getDailyArea()||"")?String(active.customerNo||""):"";
}
function areasForProductSales(email){
 const assigned=getAreaAssignments()[email]||[];
 return [...new Set((assigned.length?assigned:allAreas()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"id",{numeric:true}));
}
function productCategories(rows=productCatalog()){return [...new Set(rows.map(x=>String(x.category||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"id",{numeric:true}))}
function makeProductId(){return `prd-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
function formatProductPrice(value){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value)||0)}
function normalizeProductDiscount(value){
 const n=Number(value);
 if(!Number.isFinite(n))return 0;
 return Math.max(0,Math.min(100,Math.round(n*100)/100));
}
function formatProductDiscount(value){
 const n=normalizeProductDiscount(value);
 return `${new Intl.NumberFormat("id-ID",{maximumFractionDigits:2}).format(n)}%`;
}
function productNetPrice(product){
 const price=Math.max(0,Number(product?.price)||0);
 const discount=normalizeProductDiscount(product?.discount);
 return Math.round(price*(1-discount/100));
}
async function pullProductsFromSupabase({silent=true}={}){
 const session=getSbSession();if(!navigator.onLine||!session?.session_token)return false;
 try{
  const data=await rpc('app_pull_products',{p_token:session.session_token});
  const row=Array.isArray(data)?data[0]:data;
  if(Array.isArray(row?.products))saveProductCatalogLocal(row.products);
  if(row?.assignments&&typeof row.assignments==='object')saveProductAssignmentsLocal(row.assignments);
  return true;
 }catch(e){console.error('Tarik daftar harga gagal',e);if(!silent)toast(`Gagal memuat daftar harga: ${e.message}`);return false}
}
async function syncProductsToSupabase({silent=false}={}){
 const session=getSbSession();if(currentUser?.role!=="admin"||!navigator.onLine||!session?.session_token)return false;
 try{
  await rpc('app_admin_save_products',{p_token:session.session_token,p_products:productCatalog(),p_assignments:productAssignments()});
  return true;
 }catch(e){console.error('Simpan daftar harga gagal',e);if(!silent)toast(`Gagal menyimpan daftar harga: ${e.message}`);return false}
}
function scheduleProductSync(delay=250){clearTimeout(productSyncTimer);productSyncTimer=setTimeout(()=>syncProductsToSupabase({silent:true}),delay)}
function fillProductFilters(){
 const cats=productCategories();
 const opts='<option value="">Semua Kategori</option>'+cats.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
 ['productCategoryFilter','productAssignCategoryFilter'].forEach(id=>{const el=document.getElementById(id);if(!el)return;const old=el.value;el.innerHTML=opts;if([...el.options].some(o=>o.value===old))el.value=old});
 const dl=document.getElementById('productCategoryList');if(dl)dl.innerHTML=cats.map(x=>`<option value="${esc(x)}"></option>`).join('');
 const sf=document.getElementById('productSalesFilter');if(sf){const old=sf.value;sf.innerHTML=USERS.filter(x=>x.role==='sales'&&x.active!==false).map(x=>`<option value="${esc(x.email)}">${esc(x.name)}</option>`).join('');if([...sf.options].some(o=>o.value===old))sf.value=old}
 fillProductAssignmentAreaFilter();
}
function fillProductAssignmentAreaFilter(){
 const sf=document.getElementById('productSalesFilter');
 const af=document.getElementById('productAreaFilter');
 const copy=document.getElementById('productCopyAreaFilter');
 if(!sf||!af)return;
 const email=sf.value;
 const areas=areasForProductSales(email);
 const old=af.value;
 af.innerHTML=areas.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
 if(areas.includes(old))af.value=old;
 if(copy){
  const current=af.value;
  const oldCopy=copy.value;
  copy.innerHTML='<option value="">Salin dari area...</option>'+areas.filter(a=>a!==current).map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
  if([...copy.options].some(o=>o.value===oldCopy))copy.value=oldCopy;
 }
 fillProductAssignmentShopFilter();
}
function fillProductAssignmentShopFilter(){
 const sf=document.getElementById('productSalesFilter');
 const af=document.getElementById('productAreaFilter');
 const shop=document.getElementById('productShopFilter');
 if(!sf||!af||!shop)return;
 const old=shop.value;
 const rows=productAssignmentCustomers(sf.value,af.value);
 shop.innerHTML='<option value="">Semua Toko (Default Area)</option>'+rows.map(c=>`<option value="${esc(String(c.no))}">${esc(c.code||'-')} · ${esc(c.name)}</option>`).join('');
 if([...shop.options].some(o=>o.value===old))shop.value=old;
}
function handleProductSalesChange(){fillProductAssignmentAreaFilter();renderProductAssignments()}
function handleProductAreaChange(){fillProductAssignmentAreaFilter();renderProductAssignments()}
function handleProductShopChange(){renderProductAssignments()}
async function showPriceList(){
 hide();document.getElementById('priceListView').classList.remove('hidden');
 const admin=currentUser?.role==='admin';
 document.getElementById('productAdminTitleActions')?.classList.toggle('hidden',!admin);
 document.getElementById('priceListSubtitle').textContent=admin
  ?'Kelola master barang, kategori, dan harga. Semua pengguna melihat seluruh barang aktif.'
  :'Cari seluruh daftar harga barang aktif berdasarkan nama, kategori, atau barcode.';
 if(navigator.onLine)await pullProductsFromSupabase({silent:true});
 fillProductFilters();renderPriceList();
}
function productsVisibleForCurrentUser(){
 const all=productCatalog();
 // Admin tetap melihat barang aktif dan nonaktif agar dapat mengelolanya.
 // Sales dan pengguna lain melihat seluruh barang aktif tanpa pembatasan Sales, Area, atau Toko.
 return currentUser?.role==='admin' ? all : all.filter(x=>x.active!==false);
}
function normalizeProductSearchText(value){
 return String(value??'').toLowerCase().replace(/\s+/g,' ').trim();
}
function renderPriceList(resetLimit=false){
 if(resetLimit)productVisibleLimit=PRODUCT_PAGE_SIZE;
 const admin=currentUser?.role==='admin';
 const searchInput=document.getElementById('productSearchInput');
 const q=normalizeProductSearchText(searchInput?.value||'');
 const cat=document.getElementById('productCategoryFilter')?.value||'';
 const rows=productsVisibleForCurrentUser().filter(x=>{
  if(cat&&x.category!==cat)return false;
  if(!q)return true;
  const haystack=normalizeProductSearchText(`${x.code||''} ${x.name||''} ${x.category||''}`);
  return haystack.includes(q);
 }).sort((a,b)=>String(a.category||'').localeCompare(String(b.category||''),'id')||String(a.name||'').localeCompare(String(b.name||''),'id'));
 const visible=rows.slice(0,productVisibleLimit);
 const box=document.getElementById('productPriceList');
 box.innerHTML=visible.map(x=>{
  const discount=normalizeProductDiscount(x.discount);
  const net=productNetPrice(x);
  return `<article class="product-price-card ${x.active===false?'product-inactive':''} ${selectedProductIds.has(String(x.id))?'product-selected':''}">${admin&&productBulkSelectMode?`<label class="product-bulk-check"><input type="checkbox" ${selectedProductIds.has(String(x.id))?'checked':''} onchange="toggleProductBulkSelection('${esc(x.id)}',this.checked)"><span>Pilih</span></label>`:''}<div class="product-price-main"><small>${esc(x.category||'Tanpa Kategori')} · ${esc(x.code||'Tanpa Kode')}</small><strong>${esc(x.name)}</strong><div class="product-price-row"><span class="product-list-price">${formatProductPrice(x.price)}</span>${discount>0?`<span class="product-discount-badge">Diskon ${formatProductDiscount(discount)}</span>`:''}</div>${discount>0?`<small class="product-net-price">Harga setelah diskon: ${formatProductPrice(net)}</small>`:''}</div>${admin&&!productBulkSelectMode?`<div class="product-card-actions"><span class="badge ${x.active===false?'status-hidden':'status-active'}">${x.active===false?'Tidak Aktif':'Aktif'}</span><button class="secondary compact" onclick="editProduct('${esc(x.id)}')">Edit</button><button class="danger compact" onclick="deleteProduct('${esc(x.id)}')">Hapus</button></div>`:''}</article>`;
 }).join('');
 document.getElementById('productPriceEmpty').classList.toggle('hidden',rows.length>0);
 const summary=document.getElementById('productPriceSummary');
 if(summary){
  if(q)summary.textContent=rows.length?`${rows.length} barang ditemukan untuk “${searchInput.value.trim()}”`:`Tidak ada barang untuk “${searchInput.value.trim()}”`;
  else summary.textContent=rows.length?`Menampilkan ${visible.length} dari ${rows.length} barang`:'0 barang';
 }
 const more=document.getElementById('productLoadMoreBtn');if(more)more.classList.toggle('hidden',visible.length>=rows.length);
 updateProductBulkToolbar();
}
function loadMoreProducts(){productVisibleLimit+=PRODUCT_PAGE_SIZE;renderPriceList()}
function handleProductFilterChange(){productVisibleLimit=PRODUCT_PAGE_SIZE;renderPriceList()}
let productSearchDebounceTimer=null;
function handleProductSearchInput(){
 const input=document.getElementById('productSearchInput');
 const category=document.getElementById('productCategoryFilter');
 if(input&&input.value.trim()&&category&&category.value){
  category.value='';
 }
 clearTimeout(productSearchDebounceTimer);
 productSearchDebounceTimer=setTimeout(()=>{
  productVisibleLimit=PRODUCT_PAGE_SIZE;
  renderPriceList();
 },250);
}



function updateProductBulkToolbar(){
 const bar=document.getElementById('productBulkToolbar'),count=document.getElementById('selectedProductCount'),selectBtn=document.getElementById('productSelectModeBtn');
 if(bar)bar.classList.toggle('hidden',!productBulkSelectMode);if(count)count.textContent=`${selectedProductIds.size} produk dipilih`;if(selectBtn)selectBtn.textContent=productBulkSelectMode?'Selesai Pilih':'Pilih Produk';
 const editBtn=document.getElementById('openBulkEditBtn');if(editBtn)editBtn.disabled=selectedProductIds.size===0;
}
function toggleProductSelectMode(){productBulkSelectMode=!productBulkSelectMode;if(!productBulkSelectMode)selectedProductIds.clear();renderPriceList()}
function toggleProductBulkSelection(id,checked){checked?selectedProductIds.add(String(id)):selectedProductIds.delete(String(id));updateProductBulkToolbar();renderPriceList()}
function selectAllVisibleProducts(checked){
 const q=normalizeProductSearchText(document.getElementById('productSearchInput')?.value||''),cat=document.getElementById('productCategoryFilter')?.value||'';
 productsVisibleForCurrentUser().filter(x=>(!cat||x.category===cat)&&(!q||normalizeProductSearchText(`${x.code||''} ${x.name||''} ${x.category||''}`).includes(q))).forEach(x=>checked?selectedProductIds.add(String(x.id)):selectedProductIds.delete(String(x.id)));renderPriceList();
}
function openProductBulkModal(){if(!selectedProductIds.size)return toast('Pilih minimal satu produk');document.getElementById('productBulkCount').textContent=`${selectedProductIds.size} produk akan diubah`;document.getElementById('productBulkOperation').value='set_discount';document.getElementById('productBulkValue').value='';handleProductBulkOperationChange();document.getElementById('productBulkModal').classList.remove('hidden');document.body.classList.add('modal-open')}
function closeProductBulkModal(){document.getElementById('productBulkModal')?.classList.add('hidden');document.body.classList.remove('modal-open')}
function handleProductBulkOperationChange(){const op=document.getElementById('productBulkOperation')?.value,input=document.getElementById('productBulkValue'),label=document.getElementById('productBulkValueLabel'),hide=['activate','deactivate'].includes(op);input?.classList.toggle('hidden',hide);label?.classList.toggle('hidden',hide);if(label)label.textContent=op==='set_category'?'Kategori Baru':op==='set_discount'?'Diskon (%)':op.includes('price')?'Persentase (%)':'Nilai';if(input){input.type=op==='set_category'?'text':'number';input.min='0';input.max=op==='set_discount'?'100':'';input.placeholder=op==='set_category'?'Contoh: ACNES':'Contoh: 10'}}
async function applyProductBulkEdit(){
 if(currentUser?.role!=='admin'||!selectedProductIds.size)return;const op=document.getElementById('productBulkOperation').value,input=document.getElementById('productBulkValue'),raw=input?.value?.trim()||'';
 if(!['activate','deactivate'].includes(op)&&!raw)return toast('Isi nilai perubahan');const value=op==='set_category'?raw:Number(raw);if(op!=='set_category'&&!['activate','deactivate'].includes(op)&&!Number.isFinite(value))return toast('Nilai tidak valid');if(!confirm(`Terapkan perubahan ke ${selectedProductIds.size} produk?`))return;
 const btn=document.getElementById('productBulkSaveBtn');btn.disabled=true;btn.textContent='Menyimpan...';
 try{const session=getSbSession();if(!navigator.onLine||!session?.session_token)throw new Error('Bulk edit memerlukan koneksi internet');const result=await rpcWithTimeout('app_admin_bulk_update_products',{p_token:session.session_token,p_product_ids:[...selectedProductIds],p_operation:op,p_value:String(value)},30000);const updated=Array.isArray(result?.products)?result.products:[];const map=new Map(updated.map(x=>[String(x.id),x]));saveProductCatalogLocal(productCatalog().map(x=>map.has(String(x.id))?{...x,...map.get(String(x.id))}:x));selectedProductIds.clear();productBulkSelectMode=false;fillProductFilters();renderPriceList();closeProductBulkModal();toast(`${updated.length||result?.updated_count||0} produk berhasil diperbarui`)}catch(e){console.error(e);toast(`Bulk edit gagal: ${e.message}`)}finally{btn.disabled=false;btn.textContent='Terapkan Perubahan'}
}
async function openProductHistoryModal(){document.getElementById('productHistoryModal').classList.remove('hidden');document.body.classList.add('modal-open');await loadProductHistory()}
function closeProductHistoryModal(){document.getElementById('productHistoryModal')?.classList.add('hidden');document.body.classList.remove('modal-open')}
async function loadProductHistory(){const box=document.getElementById('productHistoryList');box.innerHTML='<div class="empty">Memuat riwayat...</div>';try{const session=getSbSession();if(!session?.session_token)throw new Error('Sesi login tidak tersedia');const data=await rpc('app_admin_get_product_history',{p_token:session.session_token,p_limit:200});productHistoryRows=Array.isArray(data)?data:[];renderProductHistory()}catch(e){box.innerHTML=`<div class="empty">Gagal memuat riwayat: ${esc(e.message)}</div>`}}
function renderProductHistory(){const q=normalizeProductSearchText(document.getElementById('productHistorySearch')?.value||''),rows=productHistoryRows.filter(x=>!q||normalizeProductSearchText(`${x.product_name||''} ${x.product_code||''} ${x.field_name||''}`).includes(q)),box=document.getElementById('productHistoryList');box.innerHTML=rows.map(x=>`<article class="product-history-item"><div><strong>${esc(x.product_name||'Produk')}</strong><small>${esc(x.product_code||'Tanpa Kode')} · ${esc(x.changed_by||'Admin')}</small></div><div><b>${esc(productHistoryFieldLabel(x.field_name))}</b><span>${esc(formatProductHistoryValue(x.field_name,x.old_value))} → ${esc(formatProductHistoryValue(x.field_name,x.new_value))}</span><small>${new Date(x.changed_at).toLocaleString('id-ID')}</small></div></article>`).join('')||'<div class="empty">Belum ada riwayat perubahan.</div>'}
function productHistoryFieldLabel(field){return ({price:'Harga',discount:'Diskon',category:'Kategori',name:'Nama',code:'Kode',active:'Status'})[field]||field}
function formatProductHistoryValue(field,value){if(field==='price')return formatProductPrice(Number(value)||0);if(field==='discount')return formatProductDiscount(Number(value)||0);if(field==='active')return String(value)==='true'?'Aktif':'Tidak Aktif';return String(value??'-')}
async function undoLastProductUpdate(){if(!confirm('Batalkan perubahan produk terakhir?'))return;try{const session=getSbSession(),result=await rpcWithTimeout('app_admin_undo_last_product_batch',{p_token:session.session_token},30000);await pullProductsFromSupabase({silent:false});fillProductFilters();renderPriceList();toast(`${result?.restored_count||0} perubahan berhasil dibatalkan`);if(!document.getElementById('productHistoryModal')?.classList.contains('hidden'))await loadProductHistory()}catch(e){toast(`Undo gagal: ${e.message}`)}}

function normalizeProductImportHeader(value){
 return String(value??'').trim().toLowerCase().replace(/[_\-]+/g,' ').replace(/\s+/g,' ');
}
function normalizeImportedBarcode(value){
 if(value===null||value===undefined||value==='')return '';
 if(typeof value==='number'&&Number.isFinite(value))return String(Math.trunc(value));
 return String(value).trim().replace(/^'/,'').replace(/\.0+$/,'').replace(/\s+/g,'');
}
function normalizeImportedProductName(value){
 return String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
}
function parseImportedProductPrice(value){
 if(typeof value==='number'&&Number.isFinite(value))return Math.round(value);
 let text=String(value??'').trim();
 if(!text)return NaN;
 text=text.replace(/^rp\s*/i,'').replace(/\s+/g,'');
 text=text.replace(/[.,]00$/,'');
 const digits=text.replace(/[^0-9-]/g,'');
 const price=Number(digits);
 return Number.isFinite(price)&&price>=0?Math.round(price):NaN;
}
function parseImportedProductDiscount(value){
 if(value===null||value===undefined||value==='')return 0;
 if(typeof value==='number'&&Number.isFinite(value)){
  return normalizeProductDiscount(Math.abs(value)<=1?value*100:value);
 }
 let text=String(value).trim();
 if(!text)return 0;
 const percent=text.includes('%');
 text=text.replace('%','').replace(',','.').replace(/[^0-9.\-]/g,'');
 const n=Number(text);
 if(!Number.isFinite(n))return NaN;
 return normalizeProductDiscount(!percent&&Math.abs(n)<=1?n*100:n);
}
function findProductImportColumns(rows){
 const aliases={
  barcode:['barcode','kode barang','kode produk','kode','sku','plu'],
  name:['nama barang','nama produk','product name','nama','produk','barang','item'],
  category:['kategori barang','kategori produk','kategori','category'],
  price:['harga jual','harga produk','harga barang','harga','price'],
  discount:['diskon persen','diskon persentase','diskon %','diskon','discount','discount %']
 };
 for(let r=0;r<Math.min(rows.length,30);r++){
  const headers=(rows[r]||[]).map(normalizeProductImportHeader);
  const find=keys=>headers.findIndex(h=>keys.includes(h));
  const barcode=find(aliases.barcode),name=find(aliases.name),category=find(aliases.category),price=find(aliases.price),discount=find(aliases.discount);
  if(price>=0&&(barcode>=0||name>=0))return {headerRow:r,barcode,name,category,price,discount};
 }
 return null;
}
async function importProductPricesExcel(event){
 const input=event?.target;
 const file=input?.files?.[0];
 if(!file)return;
 if(currentUser?.role!=='admin'){input.value='';return}
 if(typeof XLSX==='undefined'){toast('Pembaca Excel belum tersedia. Pastikan internet aktif.');input.value='';return}
 const importBtn=document.getElementById('importProductPriceBtn');
 if(importBtn){importBtn.disabled=true;importBtn.textContent='Membaca Excel...'}
 try{
  const bytes=await file.arrayBuffer();
  const workbook=XLSX.read(bytes,{type:'array',cellDates:false});
  const imported=[];
  let sheetsRead=0;
  for(const sheetName of workbook.SheetNames){
   const sheet=workbook.Sheets[sheetName];
   const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});
   const columns=findProductImportColumns(rows);
   if(!columns)continue;
   sheetsRead++;
   for(let i=columns.headerRow+1;i<rows.length;i++){
    const row=rows[i]||[];
    const barcode=columns.barcode>=0?normalizeImportedBarcode(row[columns.barcode]):'';
    const name=columns.name>=0?String(row[columns.name]??'').trim():'';
    const category=columns.category>=0?String(row[columns.category]??'').trim():'';
    const price=parseImportedProductPrice(row[columns.price]);
    const discount=columns.discount>=0?parseImportedProductDiscount(row[columns.discount]):0;
    if((!barcode&&!name)||!Number.isFinite(price)||!Number.isFinite(discount))continue;
    imported.push({barcode,name,category,price,discount,row:i+1,sheet:sheetName});
   }
  }
  if(!sheetsRead)throw new Error('Kolom Barcode/Kode, Nama Barang, dan Harga tidak ditemukan.');
  if(!imported.length)throw new Error('Tidak ada baris harga yang dapat dibaca.');

  const products=productCatalog();
  const barcodeIndex=new Map();
  const nameIndex=new Map();
  products.forEach((product,index)=>{
   const barcode=normalizeImportedBarcode(product.code);
   const name=normalizeImportedProductName(product.name);
   if(barcode&&!barcodeIndex.has(barcode))barcodeIndex.set(barcode,index);
   if(name&&!nameIndex.has(name))nameIndex.set(name,index);
  });

  let updated=0,unchanged=0,notFound=0,invalid=0,duplicateRows=0;
  const seen=new Set();
  const missingExamples=[];
  for(const item of imported){
   const rowKey=item.barcode?`b:${item.barcode}`:`n:${normalizeImportedProductName(item.name)}`;
   if(seen.has(rowKey))duplicateRows++;
   seen.add(rowKey);
   let index=item.barcode?barcodeIndex.get(item.barcode):undefined;
   if(index===undefined&&item.name)index=nameIndex.get(normalizeImportedProductName(item.name));
   if(index===undefined){
    notFound++;
    if(missingExamples.length<5)missingExamples.push(item.name||item.barcode);
    continue;
   }
   if(!Number.isFinite(item.price)||item.price<0||!Number.isFinite(item.discount)){invalid++;continue}
   const current=products[index];
   const next={
    ...current,
    code:item.barcode||current.code||'',
    name:item.name||current.name,
    category:item.category||current.category||'Tanpa Kategori',
    price:item.price,
    discount:normalizeProductDiscount(item.discount)
   };
   const changed=String(current.code||'')!==String(next.code||'')
    ||String(current.name||'')!==String(next.name||'')
    ||String(current.category||'')!==String(next.category||'')
    ||Number(current.price)!==Number(next.price)
    ||normalizeProductDiscount(current.discount)!==normalizeProductDiscount(next.discount);
   if(!changed){unchanged++;continue}
   products[index]=next;
   updated++;
  }

  if(updated){
   saveProductCatalogLocal(products);
   fillProductFilters();
   renderPriceList();
  }
  let synced=false;
  if(updated&&navigator.onLine)synced=await syncProductsToSupabase({silent:true});
  if(updated&&!synced)scheduleProductSync();
  const details=[
   `Produk diperbarui (harga/diskon/data): ${updated}`,
   `Produk tidak berubah: ${unchanged}`,
   `Produk tidak ditemukan: ${notFound}`,
   `Baris duplikat dalam Excel: ${duplicateRows}`
  ];
  if(invalid)details.push(`Harga tidak valid: ${invalid}`);
  if(missingExamples.length)details.push(`Contoh tidak ditemukan: ${missingExamples.join(', ')}`);
  details.push(updated?(synced?'Data berhasil disimpan ke Supabase.':'Data tersimpan di perangkat dan akan disinkronkan saat online.'):'Tidak ada harga yang perlu diperbarui.');
  alert(`Import / Update Harga Selesai\n\n${details.join('\n')}`);
 }catch(error){
  console.error('Import harga gagal',error);
  alert(`Import harga gagal.\n\n${error.message||'Periksa format file Excel.'}`);
 }finally{
  if(input)input.value='';
  if(importBtn){importBtn.disabled=false;importBtn.textContent='Import / Update Harga'}
 }
}

function openProductCreateModal(){
 if(currentUser?.role!=="admin")return;
 document.getElementById('productModalEditId').value='';
 document.getElementById('productModalCodeInput').value='';
 document.getElementById('productModalNameInput').value='';
 document.getElementById('productModalCategoryInput').value='';
 document.getElementById('productModalPriceInput').value='';
 document.getElementById('productModalDiscountInput').value='0';
 document.getElementById('productModalActiveInput').checked=true;
 document.getElementById('productEditModalTitle').textContent='Tambah Barang';
 const eyebrow=document.getElementById('productModalEyebrow');if(eyebrow)eyebrow.textContent='MASTER PRODUK';
 const btn=document.getElementById('productModalSaveBtn');if(btn){btn.disabled=false;btn.textContent='Simpan Barang'}
 document.getElementById('productEditModal').classList.remove('hidden');
 document.body.classList.add('modal-open');
 setTimeout(()=>document.getElementById('productModalNameInput')?.focus(),40);
}
function editProduct(id){
 if(currentUser?.role!=='admin')return;
 const x=productCatalog().find(p=>String(p.id)===String(id));if(!x)return;
 document.getElementById('productModalEditId').value=x.id;
 document.getElementById('productModalCodeInput').value=x.code||'';
 document.getElementById('productModalNameInput').value=x.name||'';
 document.getElementById('productModalCategoryInput').value=x.category||'';
 document.getElementById('productModalPriceInput').value=Number(x.price)||0;
 document.getElementById('productModalDiscountInput').value=normalizeProductDiscount(x.discount);
 document.getElementById('productModalActiveInput').checked=x.active!==false;
 document.getElementById('productEditModalTitle').textContent='Edit Produk';
 const eyebrow=document.getElementById('productModalEyebrow');if(eyebrow)eyebrow.textContent='MASTER PRODUK';
 const btn=document.getElementById('productModalSaveBtn');if(btn){btn.disabled=false;btn.textContent='Simpan Perubahan'}
 document.getElementById('productEditModal').classList.remove('hidden');
 document.body.classList.add('modal-open');
 setTimeout(()=>document.getElementById('productModalPriceInput')?.focus(),40);
}
function closeProductEditModal(){
 document.getElementById('productEditModal')?.classList.add('hidden');
 document.body.classList.remove('modal-open');
 const btn=document.getElementById('productModalSaveBtn');if(btn){btn.disabled=false;btn.textContent='Simpan'}
}
function handleProductEditBackdrop(event){if(event.target?.id==='productEditModal')closeProductEditModal()}
async function saveProductFromModal(){
 if(currentUser?.role!=='admin')return;
 const id=document.getElementById('productModalEditId').value;
 const name=document.getElementById('productModalNameInput').value.trim();
 const category=document.getElementById('productModalCategoryInput').value.trim();
 const price=Number(document.getElementById('productModalPriceInput').value);
 const discount=normalizeProductDiscount(document.getElementById('productModalDiscountInput').value);
 if(!name||!category||!Number.isFinite(price)||price<0)return toast('Nama, kategori, dan harga wajib diisi');
 const btn=document.getElementById('productModalSaveBtn');
 const normalLabel=id?'Simpan Perubahan':'Simpan Barang';
 if(btn){btn.disabled=true;btn.textContent='Menyimpan...'}
 try{
  const rows=productCatalog();
  const payload={
   id:id||makeProductId(),
   code:document.getElementById('productModalCodeInput').value.trim(),
   name,
   category,
   price:Math.round(price),
   discount,
   active:document.getElementById('productModalActiveInput').checked
  };
  if(navigator.onLine){
   await upsertSingleProductToSupabase(payload);
  }
  const i=rows.findIndex(x=>String(x.id)===String(payload.id));
  if(i>=0)rows[i]={...rows[i],...payload};else rows.push(payload);
  saveProductCatalogLocal(rows);
  fillProductFilters();
  renderPriceList();
  closeProductEditModal();
  toast(id?'Perubahan produk berhasil disimpan':'Barang berhasil ditambahkan');
  if(!navigator.onLine)scheduleProductSync();
 }catch(e){
  console.error('Gagal menyimpan produk',e);
  toast(`Gagal menyimpan: ${e.message}`);
 }finally{
  if(btn){btn.disabled=false;btn.textContent=normalLabel}
 }
}
async function deleteProduct(id){
 if(currentUser?.role!=='admin')return;const x=productCatalog().find(p=>String(p.id)===String(id));if(!x||!confirm(`Hapus barang ${x.name}?`))return;
 saveProductCatalogLocal(productCatalog().filter(p=>String(p.id)!==String(id)));const map=productAssignments();Object.keys(map).forEach(k=>map[k]=(map[k]||[]).filter(v=>String(v)!==String(id)));saveProductAssignmentsLocal(map);fillProductFilters();renderPriceList();const ok=navigator.onLine?await syncProductsToSupabase({silent:true}):false;toast(ok?'Barang berhasil dihapus':'Barang dihapus lokal dan akan disinkronkan saat online');if(!ok)scheduleProductSync();
}
const PRODUCT_ASSIGNMENT_COLLAPSE_KEY="rml_product_assignment_collapsed_v1";
function isProductAssignmentCollapsed(){return localStorage.getItem(PRODUCT_ASSIGNMENT_COLLAPSE_KEY)!=="0"}
function applyProductAssignmentPanelState(){
 const body=document.getElementById('productAssignmentBody'),btn=document.getElementById('productAssignmentToggleBtn');
 if(!body||!btn)return;
 const collapsed=isProductAssignmentCollapsed();
 body.classList.toggle('collapsed',collapsed);
 btn.textContent=collapsed?'Tampilkan':'Sembunyikan';
 btn.setAttribute('aria-expanded',collapsed?'false':'true');
}
function toggleProductAssignmentPanel(){
 localStorage.setItem(PRODUCT_ASSIGNMENT_COLLAPSE_KEY,isProductAssignmentCollapsed()?'0':'1');
 applyProductAssignmentPanelState();
}

function renderProductAssignments(){
 if(currentUser?.role!=='admin')return;
 const assignmentList=document.getElementById('productAssignmentList');
 if(!assignmentList)return;
 const email=document.getElementById('productSalesFilter')?.value;
 const area=document.getElementById('productAreaFilter')?.value;
 const customerNo=document.getElementById('productShopFilter')?.value||'';
 if(!email){assignmentList.innerHTML='<div class="empty">Belum ada akun Sales.</div>';const c=document.getElementById('productAssignmentCollapseSummary');if(c)c.textContent='Belum ada akun Sales.';return}
 if(!area){assignmentList.innerHTML='<div class="empty">Sales ini belum memiliki area tugas.</div>';const c=document.getElementById('productAssignmentCollapseSummary');if(c)c.textContent='Sales ini belum memiliki area tugas.';return}
 const cat=document.getElementById('productAssignCategoryFilter')?.value||'';
 const q=(document.getElementById('productAssignSearchInput')?.value||'').trim().toLowerCase();
 const selected=new Set(assignedProductIds(email,area,customerNo).map(String));
 const rows=productCatalog().filter(x=>x.active!==false&&(!cat||x.category===cat)&&(!q||`${x.code||''} ${x.name||''}`.toLowerCase().includes(q))).sort((a,b)=>String(a.name).localeCompare(String(b.name),'id'));
 const shop=customers().find(c=>String(c.no)===String(customerNo));
 const scope=shop?`${shop.code||'-'} · ${shop.name}`:'Default Area';
 const summaryText=`${email.split('@')[0]} · ${area} · ${scope} · ${rows.length} barang tampil · ${rows.filter(x=>selected.has(String(x.id))).length} dipilih`;const summary=document.getElementById('productAssignmentSummary');if(summary)summary.textContent=summaryText;const collapseSummary=document.getElementById('productAssignmentCollapseSummary');if(collapseSummary)collapseSummary.textContent=summaryText;
 assignmentList.innerHTML=rows.map(x=>`<label class="product-assignment-item"><input type="checkbox" ${selected.has(String(x.id))?'checked':''} onchange="toggleProductAssignment('${esc(email)}','${esc(area)}','${esc(customerNo)}','${esc(x.id)}',this.checked)"><span><strong>${esc(x.name)}</strong><small>${esc(x.category)} · ${esc(x.code||'Tanpa Barcode')} · ${formatProductPrice(x.price)}</small></span></label>`).join('')||'<div class="empty">Tidak ada barang pada filter ini.</div>';
}

async function toggleProductAssignment(email,area,customerNo,id,checked){
 const map=productAssignments(),key=productAssignmentKey(email,area,customerNo),set=new Set(assignedProductIds(email,area,customerNo).map(String));
 checked?set.add(String(id)):set.delete(String(id));map[key]=[...set];saveProductAssignmentsLocal(map);
 const ok=navigator.onLine?await syncProductsToSupabase({silent:true}):false;if(!ok)scheduleProductSync();
}
async function setAllVisibleProductAssignments(checked){
 const email=document.getElementById('productSalesFilter')?.value,area=document.getElementById('productAreaFilter')?.value,customerNo=document.getElementById('productShopFilter')?.value||'';if(!email||!area)return;
 const cat=document.getElementById('productAssignCategoryFilter')?.value||'';const q=(document.getElementById('productAssignSearchInput')?.value||'').trim().toLowerCase();
 const visible=productCatalog().filter(x=>x.active!==false&&(!cat||x.category===cat)&&(!q||`${x.code||''} ${x.name||''}`.toLowerCase().includes(q))).map(x=>String(x.id));
 const map=productAssignments(),key=productAssignmentKey(email,area,customerNo),set=new Set(assignedProductIds(email,area,customerNo).map(String));visible.forEach(id=>checked?set.add(id):set.delete(id));map[key]=[...set];saveProductAssignmentsLocal(map);renderProductAssignments();
 const ok=navigator.onLine?await syncProductsToSupabase({silent:true}):false;toast(ok?'Pembagian barang berhasil disimpan':'Pembagian tersimpan lokal dan akan disinkronkan saat online');if(!ok)scheduleProductSync();
}
async function copyProductAssignmentsFromArea(){
 const email=document.getElementById('productSalesFilter')?.value,targetArea=document.getElementById('productAreaFilter')?.value,customerNo=document.getElementById('productShopFilter')?.value||'',sourceArea=document.getElementById('productCopyAreaFilter')?.value;
 if(!email||!targetArea||!sourceArea)return toast('Pilih area sumber');
 if(!confirm(`Salin pembagian barang dari ${sourceArea} ke ${targetArea}?`))return;
 const map=productAssignments();map[productAssignmentKey(email,targetArea,customerNo)]=[...assignedProductIds(email,sourceArea).map(String)];saveProductAssignmentsLocal(map);renderProductAssignments();
 const ok=navigator.onLine?await syncProductsToSupabase({silent:true}):false;toast(ok?'Pembagian barang berhasil disalin':'Pembagian tersimpan lokal dan akan disinkronkan saat online');if(!ok)scheduleProductSync();
}

const APP_VERSION="1.5.0";
const USER_SETTINGS_KEY="rml_user_accounts_v1";
const DEFAULT_USERS=[
{email:"rini@rml.app",loginName:"rini",active:true,phone:"PHONE_RINI",name:"Rini",role:"sales",***REMOVED***,mustChangePassword:true,canSwitchAreaFreely:false},
{email:"lisna@rml.app",loginName:"lisna",active:true,phone:"PHONE_LISNA",name:"Lisna",role:"sales",***REMOVED***,mustChangePassword:true,canSwitchAreaFreely:false},
{email:"septino@rml.app",loginName:"septino",active:true,phone:"PHONE_SEPTINO",name:"Septino",role:"sales",***REMOVED***,mustChangePassword:true,canSwitchAreaFreely:true},
{email:"admin@rml.app",loginName:"admin",active:true,phone:"PHONE_ADMIN",name:"Admin",role:"admin",***REMOVED***,mustChangePassword:true,canSwitchAreaFreely:false}];
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
 const customerNavLabel=document.getElementById("customersNavLabel");
 if(customerNavLabel)customerNavLabel.textContent=currentUser.role==="sales"?"Pelanggan":"Pembagian";
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
 fillOutsideOrderCustomers();outsideOrderNote.value="• ";enableOrderBulletInput(outsideOrderNote,true);
 window.scrollTo({top:0,behavior:"smooth"});
}
function fillOutsideOrderCustomers(){const rows=customers().filter(c=>!c.isHidden&&c.area===outsideOrderArea.value).sort(compareCustomerCode);outsideOrderCustomer.innerHTML=rows.map(c=>`<option value="${c.no}">${esc(c.code||"-")} • ${esc(c.name)}</option>`).join("")}
function closeOutsideAreaOrder(){showCustomers()}
async function saveOutsideAreaOrder(){const c=customers().find(x=>String(x.no)===String(outsideOrderCustomer.value)),note=normalizeOrderNote(outsideOrderNote.value);if(!c)return toast("Pilih pelanggan");if(!note)return toast("Orderan wajib diisi");const now=new Date().toISOString();await saveVisitOffline({id:`OUT-${Date.now()}-${c.no}`,customerNo:c.no,code:c.code||"",name:c.name||"",area:c.area,salesEmail:currentUser.email,salesName:currentUser.name,checkInAt:now,checkOutAt:now,durationMinutes:0,status:"Ada Order",note,visitState:"completed",createdAt:now,syncStatus:"pending",completionType:"outside-area-order",visitType:"Order Luar Area"});await refreshVisitCache();toast("Order luar area berhasil disimpan");showCustomers()}


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
let autoSyncTimer=null;
let autoSyncRetryTimer=null;
let syncInProgress=false;

function scheduleAutoSync(delay=350){
 clearTimeout(autoSyncTimer);
 autoSyncTimer=setTimeout(()=>{
  if(navigator.onLine&&getSbSession()?.session_token){
   syncPendingVisits({silent:true,autoRetry:true});
  }
 },delay);
}

async function saveVisitOffline(visit){
 const row={...visit,syncStatus:"pending",updatedAt:new Date().toISOString()};
 await idbPut(STORE_VISITS,row);
 await updatePendingSyncCount();
 // Setiap data tersimpan, langsung antrekan sinkronisasi ke Supabase.
 scheduleAutoSync();
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
function saveCustomers(v,{sync=true}={}){localStorage.setItem("rml_customers",JSON.stringify(v));if(sync&&currentUser?.role==="admin")scheduleCustomerSync()}
function visits(){return []}
function saveVisits(v){console.warn("saveVisits legacy dipanggil",v)}
function activeVisitKey(){return currentUser?`rml_active_visit_${currentUser.email}`:""}
function getActiveVisit(){
 if(!currentUser)return null;
 try{return JSON.parse(localStorage.getItem(activeVisitKey())||"null")}catch(e){return null}
}
function saveActiveVisit(v){localStorage.setItem(activeVisitKey(),JSON.stringify(v))}
function clearActiveVisit(){localStorage.removeItem(activeVisitKey())}

// v1.2.6 - Auto Draft Kunjungan
let visitDraftSaveTimer=null;
function visitDraftKey(active=getActiveVisit()){
 if(!currentUser||!active)return "";
 return `rml_visit_draft_${currentUser.email}_${active.customerNo}`;
}
function getVisitDraft(active=getActiveVisit()){
 const key=visitDraftKey(active);
 if(!key)return null;
 try{return JSON.parse(localStorage.getItem(key)||"null")}catch(e){return null}
}
function clearVisitDraft(active=getActiveVisit()){
 const key=visitDraftKey(active);
 if(key)localStorage.removeItem(key);
}
function collectVisitDraft(active=getActiveVisit()){
 if(!active)return null;
 return {
  customerNo:active.customerNo,
  visitId:active.id,
  status:document.getElementById("visitStatus")?.value||"",
  note:document.getElementById("visitNote")?.value||"",
  paymentStatus:document.querySelector('input[name="visitPaymentStatus"]:checked')?.value||"",
  updatedAt:new Date().toISOString()
 };
}
function saveVisitDraftNow(){
 const active=getActiveVisit();
 if(!active)return;
 const panel=document.getElementById("checkOutPanel");
 if(!panel||panel.classList.contains("hidden"))return;
 const key=visitDraftKey(active),draft=collectVisitDraft(active);
 if(!key||!draft)return;
 try{localStorage.setItem(key,JSON.stringify(draft))}catch(e){console.warn("Auto draft gagal disimpan",e)}
}
function scheduleVisitDraftSave(delay=450){
 clearTimeout(visitDraftSaveTimer);
 visitDraftSaveTimer=setTimeout(saveVisitDraftNow,delay);
}
function restoreVisitDraft(active){
 const draft=getVisitDraft(active);
 if(!draft||String(draft.visitId||"")!==String(active.id||""))return false;
 const statusEl=document.getElementById("visitStatus");
 const noteEl=document.getElementById("visitNote");
 if(statusEl)statusEl.value=draft.status||"";
 updateVisitNoteField();
 if(noteEl)noteEl.value=draft.note||"";
 document.querySelectorAll('input[name="visitPaymentStatus"]').forEach(el=>{
  el.checked=Boolean(draft.paymentStatus&&el.value===draft.paymentStatus);
 });
 return true;
}
function initializeVisitDraftAutosave(){
 const status=document.getElementById("visitStatus");
 const note=document.getElementById("visitNote");
 if(status&&!status.dataset.draftHandler){
  status.addEventListener("change",()=>scheduleVisitDraftSave(0));
  status.dataset.draftHandler="1";
 }
 if(note&&!note.dataset.draftHandler){
  note.addEventListener("input",()=>scheduleVisitDraftSave());
  note.addEventListener("change",()=>scheduleVisitDraftSave(0));
  note.dataset.draftHandler="1";
 }
 document.querySelectorAll('input[name="visitPaymentStatus"]').forEach(el=>{
  if(!el.dataset.draftHandler){el.addEventListener("change",()=>scheduleVisitDraftSave(0));el.dataset.draftHandler="1";}
 });
 window.addEventListener("pagehide",saveVisitDraftNow);
 document.addEventListener("visibilitychange",()=>{if(document.hidden)saveVisitDraftNow()});
}


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
  await pullCustomersFromSupabase({silent:true});
  await pullProductsFromSupabase({silent:true});
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
function completeLogout(){sessionStorage.removeItem("rml_user");localStorage.removeItem("rml_cached_user");localStorage.removeItem("lastLogin");sessionStorage.removeItem("lastLogin");setSbSession(null);currentUser=null;window.location.replace("index.html")}
function openApp(){
 initializeData();
 if(navigator.onLine){setTimeout(()=>syncPendingVisits(),800);setTimeout(()=>pullProductsFromSupabase({silent:true}),1000);}
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
 document.getElementById("adminCustomerToolbar")?.classList.toggle("hidden",currentUser.role!=="admin");
 document.getElementById("salesCustomerFilter")?.classList.toggle("hidden",currentUser.role!=="admin");
 fillCustomerSalesFilter();
 document.getElementById("exportPdfBtn")?.classList.toggle("hidden",currentUser.role!=="admin");
 document.getElementById("historyRefreshBtn")?.classList.toggle("hidden",currentUser.role!=="admin");
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
async function manualRefreshDashboard(){
 if(!currentUser)return;
 if(!navigator.onLine){
  await refreshDashboard();
  return toast("Tidak ada internet. Menampilkan data yang tersimpan di perangkat.");
 }
 const button=document.getElementById("dashboardRefreshBtn");
 const originalText=button?.textContent||"Refresh";
 if(button){button.disabled=true;button.textContent="Memuat..."}
 try{
  await syncPendingVisits({silent:true,autoRetry:false});
  await pullCustomersFromSupabase({silent:true});
  await pullRemoteVisits({reconcile:true});
  await refreshDashboard();
  toast("Data berhasil diperbarui");
 }catch(e){
  console.error("Refresh dashboard gagal",e);
  await refreshDashboard();
  toast(`Refresh gagal: ${e.message||"Periksa koneksi internet"}`);
 }finally{
  if(button){button.disabled=false;button.textContent=originalText}
 }
}

let promoBannerCache=null;

function setPromoImage(imgEl,emptyEl,imageData){
 if(!imgEl||!emptyEl)return;
 if(imageData){imgEl.src=imageData;imgEl.classList.remove("hidden");emptyEl.classList.add("hidden");}
 else{imgEl.removeAttribute("src");imgEl.classList.add("hidden");emptyEl.classList.remove("hidden");}
}
async function loadPromoBanner({force=false}={}){
 if(promoBannerCache&&!force)return promoBannerCache;
 try{promoBannerCache=await rpc("app_get_promo_banner",{p_token:session?.session_token||""});}
 catch(e){console.warn("Gagal memuat promo",e);promoBannerCache=null;}
 return promoBannerCache;
}
async function refreshPromoPanels(){
 const promo=await loadPromoBanner();
 const isAdmin=currentUser?.role==="admin";
 const salesCard=document.getElementById("salesPromoCard");
 const adminCard=document.getElementById("adminPromoCard");
 if(salesCard)salesCard.classList.toggle("hidden",isAdmin);
 if(adminCard)adminCard.classList.toggle("hidden",!isAdmin);
 const title=promo?.title||"Promo Terbaru";
 const image=promo?.image_data||"";
 const salesTitle=document.getElementById("salesPromoTitle");if(salesTitle)salesTitle.textContent=title;
 setPromoImage(document.getElementById("salesPromoImage"),document.getElementById("salesPromoEmpty"),image);
 const promoInput=document.getElementById("promoTitleInput");if(promoInput&&isAdmin)promoInput.value=promo?.title||"";
 setPromoImage(document.getElementById("adminPromoPreview"),document.getElementById("adminPromoEmpty"),image);
}
function readPromoFileAsCompressedDataUrl(file){
 return new Promise((resolve,reject)=>{
  if(!file)return resolve("");
  if(!file.type.startsWith("image/"))return reject(new Error("File harus berupa gambar"));
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error("Gagal membaca gambar"));
  reader.onload=()=>{
   const img=new Image();
   img.onerror=()=>reject(new Error("Gambar tidak dapat dibuka"));
   img.onload=()=>{
    const maxW=1400,maxH=700,scale=Math.min(1,maxW/img.width,maxH/img.height);
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    resolve(canvas.toDataURL("image/jpeg",0.82));
   };
   img.src=reader.result;
  };
  reader.readAsDataURL(file);
 });
}
async function savePromoBanner(){
 if(currentUser?.role!=="admin")return toast("Hanya Admin yang dapat mengubah promo");
 const btn=document.getElementById("savePromoBtn"),original=btn?.textContent||"Simpan Promo";
 if(btn){btn.disabled=true;btn.textContent="Menyimpan...";}
 try{
  const title=(document.getElementById("promoTitleInput")?.value||"").trim()||"Promo Terbaru";
  const file=document.getElementById("promoImageInput")?.files?.[0];
  let imageData=promoBannerCache?.image_data||"";if(file)imageData=await readPromoFileAsCompressedDataUrl(file);
  if(!imageData)throw new Error("Pilih gambar promo terlebih dahulu");
  promoBannerCache=await rpcWithTimeout("app_admin_save_promo_banner",{p_token:session.session_token,p_title:title,p_image_data:imageData},30000);
  const input=document.getElementById("promoImageInput");if(input)input.value="";
  await refreshPromoPanels();toast("Promo berhasil disimpan");
 }catch(e){console.error(e);toast(`Gagal menyimpan promo: ${e.message||e}`);}
 finally{if(btn){btn.disabled=false;btn.textContent=original;}}
}
async function deletePromoBanner(){
 if(currentUser?.role!=="admin")return;
 if(!confirm("Hapus banner promo yang sedang aktif?"))return;
 try{await rpcWithTimeout("app_admin_delete_promo_banner",{p_token:session.session_token},20000);promoBannerCache=null;await refreshPromoPanels();toast("Promo berhasil dihapus");}
 catch(e){toast(`Gagal menghapus promo: ${e.message||e}`);}
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

 document.getElementById("dashboardTitle").textContent=isAdmin?"Dashboard Kunjungan":`Halo, ${currentUser.name}`;
 document.getElementById("dashboardSubtitle").textContent=isAdmin?"Ringkasan aktivitas seluruh sales hari ini":"Informasi promo dan progres kunjungan hari ini";
 const dashboardSummary=document.getElementById("dashboardSummary");
 if(dashboardSummary){
  dashboardSummary.classList.toggle("hidden",!isAdmin);
  dashboardSummary.innerHTML=isAdmin?`
   <div class="dashboard-stat clickable-stat" onclick="openVisitDetailModal('','')"><small>Kunjungan Hari Ini</small><strong>${today.length}</strong></div>
   <div class="dashboard-stat clickable-stat" onclick="openVisitDetailModal('','Ada Order')"><small>Ada Order</small><strong>${today.filter(v=>v.status==="Ada Order").length}</strong></div>
   <div class="dashboard-stat clickable-stat" onclick="openVisitDetailModal('','Tidak Order')"><small>Tidak Order</small><strong>${today.filter(v=>v.status==="Tidak Order").length}</strong></div>
   <div class="dashboard-stat clickable-stat" onclick="openVisitDetailModal('','Tidak Bertemu')"><small>Tidak Bertemu</small><strong>${today.filter(v=>v.status==="Tidak Bertemu").length}</strong></div>`:"";
 }
 await refreshPromoPanels();
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
function orderLines(value){
 return String(value||"").split(/\r?\n/).map(line=>line.trim().replace(/^[•\-–—*]+\s*/,"")).filter(Boolean);
}
function normalizeOrderNote(value){
 const lines=orderLines(value);
 return lines.map(line=>`• ${line}`).join("\n");
}
function getDeliveryItems(visit){
 if(!visit||visit.status!=="Ada Order")return [];
 const existing=Array.isArray(visit.deliveryItems)?visit.deliveryItems:[];
 const lines=orderLines(visit.note);
 return lines.map((text,index)=>{
   const old=existing[index];
   return {text,delivered:Boolean(old&&old.text===text&&old.delivered)};
 });
}
function pendingDeliveryItemsForCustomer(customerNo){
 // Hanya tampilkan barang belum terkirim dari 1 kunjungan order terakhir
 // pada outlet yang sama, agar daftar tidak menumpuk dari kunjungan lama.
 const latestOrderVisit=visitCache
   .filter(v=>String(v.customerNo)===String(customerNo)&&v.status==="Ada Order")
   .sort((a,b)=>new Date(b.checkOutAt||b.createdAt||0)-new Date(a.checkOutAt||a.createdAt||0))[0];
 if(!latestOrderVisit)return [];
 return getDeliveryItems(latestOrderVisit)
   .filter(item=>!item.delivered)
   .map(item=>({...item,visitId:latestOrderVisit.id,date:latestOrderVisit.checkOutAt||latestOrderVisit.createdAt}));
}
function renderPendingDeliveryReminder(customerNo){
 const box=document.getElementById("pendingDeliveryReminder");
 const list=document.getElementById("pendingDeliveryReminderList");
 if(!box||!list)return;
 const pending=pendingDeliveryItemsForCustomer(customerNo);
 box.classList.toggle("hidden",pending.length===0);
 list.innerHTML=pending.length?`<ul>${pending.map(item=>`<li>${esc(item.text)} <small>(${esc(formatOnlyDate(item.date))})</small></li>`).join("")}</ul>`:"";
}
function orderWithDeliveryHtml(visit,editable=false){
 if(!visit||visit.status!=="Ada Order")return "";
 const items=getDeliveryItems(visit);
 if(!items.length)return "";
 return `<div class="order-delivery-list">${items.map((item,index)=>{
   const control=editable
     ? `<label class="order-delivery-control"><input type="checkbox" ${item.delivered?"checked":""} onchange="setDeliveryItemStatus('${esc(visit.id)}',${index},this.checked,this)"><span>Kirim</span></label>`
     : `<span class="order-delivery-state ${item.delivered?"delivered":"pending"}">${item.delivered?"✓ Dikirim":"Belum dikirim"}</span>`;
   return `<div class="order-delivery-row"><span class="order-delivery-item">• ${esc(item.text)}</span>${control}</div>`;
 }).join("")}</div>`;
}
async function setDeliveryItemStatus(visitId,index,checked,inputEl){
 if(!currentUser||currentUser.role!=="admin")return toast("Hanya admin yang dapat mengubah status pengiriman");
 if(inputEl)inputEl.disabled=true;
 await refreshVisitCache();
 const visit=visitCache.find(v=>String(v.id)===String(visitId));
 if(!visit){if(inputEl)inputEl.disabled=false;return toast("Data kunjungan tidak ditemukan");}
 const items=getDeliveryItems(visit);
 if(!items[index]){if(inputEl)inputEl.disabled=false;return;}
 items[index].delivered=Boolean(checked);
 const updated={...visit,deliveryItems:items,lastDeliveryEditedAt:new Date().toISOString(),lastDeliveryEditedBy:currentUser.email};
 try{
   await saveVisitOffline(updated);
   const synced=await syncPendingVisits({silent:true,autoRetry:true});
   if(synced){
     await pullRemoteVisits();
     await refreshVisitCache();
     toast("Status pengiriman berhasil disinkronkan");
   }else{
     await refreshVisitCache();
     toast("Status tersimpan di perangkat dan akan disinkronkan otomatis");
   }
   await renderHistory();
 }catch(e){
   console.error(e);
   if(inputEl){inputEl.checked=!checked;inputEl.disabled=false;}
   toast("Gagal menyimpan status pengiriman");
   return;
 }
 if(inputEl)inputEl.disabled=false;
}
function formatVisitNoteHtml(status,value,visit=null,editable=false){
 if(status!=="Ada Order")return esc(value||"-").replace(/\n/g,"<br>");
 if(visit)return orderWithDeliveryHtml(visit,editable);
 const lines=orderLines(value);
 if(!lines.length)return "-";
 return `<ul class="order-bullet-list">${lines.map(line=>`<li>${esc(line)}</li>`).join("")}</ul>`;
}
function enableOrderBulletInput(input,isOrder){
 if(!input)return;
 input.dataset.orderBullet=isOrder?"1":"0";
 if(isOrder&&!input.value.trim())input.value="• ";
}
function handleOrderBulletKeydown(event){
 const input=event.currentTarget;
 if(input?.dataset.orderBullet!=="1"||event.key!=="Enter")return;
 event.preventDefault();
 const start=input.selectionStart,end=input.selectionEnd;
 const before=input.value.slice(0,start),after=input.value.slice(end);
 input.value=`${before}\n• ${after}`;
 const pos=start+3;
 input.setSelectionRange(pos,pos);
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
       <div class="visit-note-content">${formatVisitNoteHtml(v.status,v.note,v,currentUser.role==="admin")}</div>
     </div>
     ${v.paymentStatus?`<div class="pills"><span class="pill payment-pill">Pembayaran: ${esc(v.paymentStatus)}</span></div>`:""}
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
 document.getElementById("editVisitNoteInput").value=visit.status==="Ada Order"?normalizeOrderNote(visit.note):visit.note||"";
 enableOrderBulletInput(document.getElementById("editVisitNoteInput"),visit.status==="Ada Order");
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
 const newNote=visit.status==="Ada Order"?normalizeOrderNote(input.value):input.value.trim();
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
 const selectedChecked=selectedCustomerNos.has(String(x.no));
 return `<div class="customer-card admin-customer-card ${x.isHidden?"hidden-customer":""} ${selectedChecked?"selected-for-delete":""}">
  ${customerSelectMode?`<label class="customer-select-check"><input type="checkbox" ${selectedChecked?"checked":""} onchange="toggleCustomerSelection('${esc(String(x.no))}',this.checked)"><span>Pilih</span></label>`:""}
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
function fillCustomerSalesFilter(){
 const el=document.getElementById("salesCustomerFilter");if(!el)return;
 const old=el.value;
 el.innerHTML='<option value="">Semua Sales</option><option value="__UNASSIGNED__">Belum Dibagikan</option>'+USERS.filter(u=>u.role==="sales").map(u=>`<option value="${esc(u.email)}">${esc(u.name)}</option>`).join("");
 el.value=[...el.options].some(o=>o.value===old)?old:"";
}
function toggleCustomerSelectMode(){customerSelectMode=!customerSelectMode;selectedCustomerNos.clear();updateBulkCustomerUI();renderCustomers()}
function cancelCustomerSelectMode(){customerSelectMode=false;selectedCustomerNos.clear();updateBulkCustomerUI();renderCustomers()}
function toggleCustomerSelection(no,checked){checked?selectedCustomerNos.add(String(no)):selectedCustomerNos.delete(String(no));updateBulkCustomerUI();renderCustomers()}
function updateBulkCustomerUI(){
 const bulk=document.getElementById("bulkCustomerActions"),btn=document.getElementById("selectCustomersBtn"),count=document.getElementById("selectedCustomerCount");
 bulk?.classList.toggle("hidden",!customerSelectMode);if(btn)btn.textContent=customerSelectMode?"Selesai Pilih":"Pilih";if(count)count.textContent=`${selectedCustomerNos.size} pelanggan dipilih`;
}
function deleteSelectedCustomers(){
 if(currentUser.role!=="admin"||!selectedCustomerNos.size)return toast("Pilih pelanggan terlebih dahulu");
 const list=customers().filter(x=>selectedCustomerNos.has(String(x.no)));
 if(!confirm(`Hapus permanen ${list.length} pelanggan yang dipilih? Riwayat kunjungan yang sudah tersimpan tetap dipertahankan.`))return;
 saveCustomers(customers().filter(x=>!selectedCustomerNos.has(String(x.no))));selectedCustomerNos.clear();customerSelectMode=false;fillAreas();updateBulkCustomerUI();renderCustomers();toast(`${list.length} pelanggan berhasil dihapus`);
}
function customerExportRows(rows){
 return rows.map(c=>({"Kode Outlet":c.code||"","Nama Outlet":c.name||"","Area":c.area||"","Sales":customerAssignedSales(c).map(e=>USERS.find(u=>u.email===e)?.name||e).join(", "),"Aktif":c.isHidden?"Tidak":"Ya","Status":getOutletStatusLabel(c.outletStatus)}));
}
function downloadCsv(rows,filename){
 const keys=Object.keys(rows[0]||{}),csv=[keys.join(","),...rows.map(r=>keys.map(k=>`"${String(r[k]??"").replace(/"/g,'""')}"`).join(","))].join("\n");
 const content="\ufeff"+csv;
 if(androidSaveBase64File(filename,"text/csv;charset=utf-8",btoa(unescape(encodeURIComponent(content)))))return;
 const blob=new Blob([content],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function exportCustomersExcel(){
 if(currentUser.role!=="admin")return;
 const rows=customerExportRows(getFilteredAdminCustomers());if(!rows.length)return toast("Tidak ada pelanggan untuk diekspor");
 const filename=`pembagian-area-sales-${new Date().toISOString().slice(0,10)}`;
 if(window.XLSX){const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Pelanggan");if(window.AndroidBridge){const arr=XLSX.write(wb,{bookType:"xlsx",type:"array"});androidSaveBase64File(filename+".xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",bytesToBase64(new Uint8Array(arr)));}else XLSX.writeFile(wb,filename+".xlsx")}else downloadCsv(rows,filename+".csv");
 toast(`${rows.length} pelanggan diekspor`);
}
function normalizeImportHeader(s){return String(s||"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ")}
function importSalesEmails(value){
 const parts=String(value||"").split(/[,;|]/).map(x=>x.trim()).filter(Boolean);const sales=USERS.filter(u=>u.role==="sales");
 return [...new Set(parts.map(v=>sales.find(u=>u.email.toLowerCase()===v.toLowerCase()||u.name.toLowerCase()===v.toLowerCase())?.email).filter(Boolean))];
}
async function importCustomersExcel(event){
 const file=event.target.files?.[0];event.target.value="";if(!file)return;
 try{
  let rows=[];
  if(window.XLSX){const data=await file.arrayBuffer(),wb=XLSX.read(data,{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]];rows=XLSX.utils.sheet_to_json(ws,{defval:""})}
  else if(file.name.toLowerCase().endsWith(".csv")){const text=await file.text(),lines=text.split(/\r?\n/).filter(Boolean),headers=lines.shift().split(",").map(x=>x.replace(/^"|"$/g,""));rows=lines.map(line=>Object.fromEntries(line.split(",").map((v,i)=>[headers[i],v.replace(/^"|"$/g,"")])))}
  else return toast("Library Excel belum termuat. Gunakan file CSV atau coba lagi saat online.");
  if(!rows.length)return toast("File tidak memiliki data");
  const existing=customers(),byCode=new Map(existing.filter(c=>c.code).map(c=>[String(c.code).trim().toLowerCase(),c]));let added=0,updated=0,skipped=0;let nextNo=Math.max(0,...existing.map(c=>Number(c.no)||0))+1;
  for(const raw of rows){const m={};Object.entries(raw).forEach(([k,v])=>m[normalizeImportHeader(k)]=v);
   const code=String(m["kode outlet"]||m["kode"]||m["customer code"]||"").trim(),name=String(m["nama outlet"]||m["nama pelanggan"]||m["nama"]||"").trim(),area=String(m["area"]||"").trim();if(!name||!area){skipped++;continue}
   const salesValue=m["email sales"]||m["sales"]||m["nama sales"]||"",assignedSalesEmails=importSalesEmails(salesValue),active=String(m["aktif"]||"ya").trim().toLowerCase();
   const patch={code,name,area,owner:String(m["pemilik"]||m["owner"]||"").trim(),assignedSalesEmails,assignedSalesEmail:"",isHidden:["tidak","no","0","false","nonaktif","tidak aktif"].includes(active),outletStatus:String(m["status outlet"]||"normal").trim()||"normal"};
   const found=code?byCode.get(code.toLowerCase()):null;if(found){Object.assign(found,patch);updated++}else{const c={no:nextNo++,...patch};existing.push(c);if(code)byCode.set(code.toLowerCase(),c);added++}
  }
  saveCustomers(existing);fillAreas();fillCustomerSalesFilter();renderCustomers();toast(`Import selesai: ${added} ditambah, ${updated} diperbarui${skipped?`, ${skipped} dilewati`:""}`);
 }catch(e){console.error(e);toast("Import gagal. Periksa format file Excel.")}
}
function toggleCustomerSales(no,email,checked){
 if(currentUser.role!=="admin")return;
 const data=customers(),i=data.findIndex(x=>x.no===no);if(i<0)return;
 const set=new Set(customerAssignedSales(data[i]));checked?set.add(email):set.delete(email);
 data[i]={...data[i],assignedSalesEmails:[...set],assignedSalesEmail:""};saveCustomers(data);toast("Pembagian sales disimpan");
}
async function setCustomerActive(no,active){
 if(currentUser.role!=="admin")return;
 const data=customers(),i=data.findIndex(x=>x.no===no);if(i<0)return;
 const previous={...data[i]};
 data[i]={...data[i],isHidden:!active};saveCustomers(data,{sync:false});renderCustomers();
 if(!navigator.onLine){
  scheduleCustomerSync();
  return toast(`${active?"Pelanggan diaktifkan":"Pelanggan dinonaktifkan"}. Akan disinkronkan saat online.`);
 }
 const ok=await syncCustomersToSupabase({silent:true});
 if(ok)toast(active?"Pelanggan diaktifkan dan disinkronkan":"Pelanggan dinonaktifkan dan disinkronkan");
 else{
  data[i]=previous;saveCustomers(data,{sync:false});renderCustomers();toast("Gagal menyimpan perubahan outlet");
 }
}
function deleteCustomerInline(no){
 if(currentUser.role!=="admin")return;
 const c=customers().find(x=>x.no===no);if(!c)return;
 const hasHistory=visits().some(v=>String(v.customerNo)===String(no)||(v.code===c.code&&v.name===c.name));
 const extra=hasHistory?" Riwayat kunjungan yang sudah tersimpan tetap dipertahankan.":"";
 if(!confirm(`Hapus permanen pelanggan ${c.name}?${extra}`))return;
 saveCustomers(customers().filter(x=>x.no!==no));fillAreas();renderCustomers();toast("Pelanggan berhasil dihapus");
}
function getFilteredAdminCustomers(){
 const all=customers(),q=(document.getElementById("search")?.value||"").trim().toLowerCase(),a=document.getElementById("areaFilter")?.value||"",s=document.getElementById("statusFilter")?.value||"",os=document.getElementById("outletStatusFilter")?.value||"",sf=document.getElementById("salesCustomerFilter")?.value||"";
 return all.filter(x=>(!a||x.area===a)&&(!s||(s==="hidden"?x.isHidden:!x.isHidden))&&(!os||(x.outletStatus||"normal")===os)&&(!sf||(sf==="__UNASSIGNED__"?!customerAssignedSales(x).length:customerAssignedSales(x).includes(sf)))&&(!q||`${x.code||""} ${x.name||""} ${x.area||""} ${x.owner||x.pemilik||""}`.toLowerCase().includes(q))).sort(compareCustomerCode);
}
function renderCustomers(){
 const all=customers();let base,data;
 if(currentUser.role==="sales"){
  const q=(document.getElementById("search")?.value||"").toLowerCase(),a=document.getElementById("areaFilter")?.value||"",os=document.getElementById("outletStatusFilter")?.value||"";
  base=all.filter(x=>!x.isHidden&&isAreaAssigned(currentUser.email,x.area)&&canSalesAccessCustomer(x,currentUser.email)&&x.area===getDailyArea());
  data=base.filter(x=>(!a||x.area===a)&&(!os||(x.outletStatus||"normal")===os)&&(`${x.code||""} ${x.name||""} ${x.area||""}`.toLowerCase().includes(q))).sort(compareCustomerCode);
 }else{base=all;data=getFilteredAdminCustomers()}
 document.getElementById("customerCount").textContent=data.length;
 if(currentUser.role==="admin")document.getElementById("customerList").innerHTML=data.map(adminCustomerCard).join("");
 else document.getElementById("customerList").innerHTML=data.map(x=>`<div class="customer-card ${reminderClass(x.no)} ${todayVisitForOutlet(x.no)?"today-complete":"today-pending"}" onclick="selectCustomer(${x.no})"><div><div class="customer-code">${esc(x.code||"TANPA KODE")}</div><h4>${esc(x.name)}</h4><div class="status-line"><span class="badge ${getOutletStatusClass(x.outletStatus)}">${esc(getOutletStatusLabel(x.outletStatus))}</span></div>${isOutletBeingVisited(x)?`<div class="customer-visit-state visiting">● Sedang Dikunjungi</div>`:""}<div class="last-visit-label">${lastVisitText(x.no)}</div><div class="today-visit-state ${todayVisitForOutlet(x.no)?"done":"pending"}">${todayVisitForOutlet(x.no)?`✓ ${esc(todayVisitForOutlet(x.no).status)}`:"○ Belum dikunjungi hari ini"}</div></div><span class="badge">${esc(x.area)}</span></div>`).join("");
 document.getElementById("empty").classList.toggle("hidden",data.length>0);updateBulkCustomerUI();
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
 saveVisitDraftNow();
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
 document.querySelectorAll('input[name="visitPaymentStatus"]').forEach(el=>el.checked=false);
 renderPendingDeliveryReminder(active.customerNo);
 updateVisitNoteField();
 restoreVisitDraft(active);
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
   enableOrderBulletInput(note,false);
   return;
 }

 container.classList.remove("hidden");
 if(status==="Ada Order"){
   label.textContent="Orderan *";
   note.placeholder="Masukkan orderan pelanggan...";
   enableOrderBulletInput(note,true);
 }else if(status==="Tidak Order"){
   label.textContent="Alasan Tidak Order *";
   note.placeholder="Tuliskan alasan tidak order...";
   enableOrderBulletInput(note,false);
 }else{
   label.textContent="Catatan *";
   note.placeholder="Tuliskan catatan...";
   enableOrderBulletInput(note,false);
 }
}

async function confirmCheckOut(){
 const active=getActiveVisit();
 if(!active)return toast("Data Check In tidak ditemukan");
 const status=document.getElementById("visitStatus").value;
 if(!status)return toast("Pilih status kunjungan outlet");

 const noteInput=document.getElementById("visitNote");
 const note=status==="Ada Order"?normalizeOrderNote(noteInput.value):noteInput.value.trim();
 const paymentStatus=document.querySelector('input[name="visitPaymentStatus"]:checked')?.value||"";
 if(!paymentStatus)return toast("Pilih status pembayaran: Bayar atau Tidak Bayar");
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
   paymentStatus,
   deliveryItems:status==="Ada Order"?orderLines(note).map(text=>({text,delivered:false})):[],
   checkOutAt:checkOut.toISOString(),
   durationMinutes:calculateDurationMinutes(active.checkInAt,checkOut.toISOString()),
   visitState:"completed",
   createdAt:checkOut.toISOString(),
   syncStatus:"pending"
 };
 try{
   await saveVisitOffline(completed);
   clearVisitDraft(active);
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
async function refreshHistoryFromServer(){
 if(!currentUser||currentUser.role!=='admin')return;
 if(!navigator.onLine)return toast('Tidak ada internet. Menampilkan riwayat yang tersimpan di perangkat.');
 const button=document.getElementById('historyRefreshBtn');
 const originalText=button?.textContent||'Refresh';
 if(button){button.disabled=true;button.textContent='Memuat...'}
 try{
  await syncPendingVisits({silent:true,autoRetry:false});
  await pullRemoteVisits({reconcile:true});
  historyRenderLimit=HISTORY_PAGE_SIZE;
  await renderHistory();
  toast('Riwayat berhasil diperbarui');
 }catch(e){
  console.error('Refresh riwayat gagal',e);
  toast(`Refresh gagal: ${e.message||'Periksa koneksi internet'}`);
 }finally{
  if(button){button.disabled=false;button.textContent=originalText}
 }
}

function showHistory(){
 historyRenderLimit=HISTORY_PAGE_SIZE;
 hide();
 document.getElementById("historyView").classList.remove("hidden");
 const isAdmin=currentUser?.role==="admin";
 document.getElementById("adminHistorySalesFilterWrap")?.classList.remove("hidden");
 document.getElementById("historySalesField")?.classList.toggle("hidden",!isAdmin);
 document.getElementById("historyAreaField")?.classList.toggle("hidden",!isAdmin);
 document.getElementById("historyOutletField")?.classList.toggle("hidden",!isAdmin);
 document.getElementById("adminHistoryDeleteToolbar")?.classList.toggle("hidden",!isAdmin);
 if(!isAdmin)cancelHistorySelectMode(false);
 renderHistory();
}
function startOfLocalDay(date){const d=new Date(date);d.setHours(0,0,0,0);return d}
function endOfLocalDay(date){const d=new Date(date);d.setHours(23,59,59,999);return d}
function visitDateValue(v){const raw=v.checkOutAt||v.checkInAt||v.createdAt;const d=new Date(raw);return Number.isNaN(d.getTime())?null:d}
function isoDateInput(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");return `${y}-${m}-${d}`}
function getHistoryPeriodRange(){
 const period=document.getElementById("historyPeriodFilter")?.value||"today",now=new Date();
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
 historyRenderLimit=HISTORY_PAGE_SIZE;
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
function setSelectOptions(el,items,placeholder,valueFn,labelFn){
 if(!el)return;
 const old=el.value;
 el.innerHTML=`<option value="">${esc(placeholder)}</option>`+items.map(x=>`<option value="${esc(valueFn(x))}">${esc(labelFn(x))}</option>`).join("");
 if([...el.options].some(o=>o.value===old))el.value=old;
}
function refreshHistoryFilterOptions(allRows){
 if(currentUser?.role!=="admin")return;
 const salesMap=new Map();
 allRows.forEach(v=>{if(v.salesEmail)salesMap.set(v.salesEmail,v.salesName||getSalesName(v.salesEmail)||v.salesEmail)});
 USERS.filter(u=>u.role==="sales").forEach(u=>salesMap.set(u.email,u.name));
 setSelectOptions(document.getElementById("historySalesFilter"),[...salesMap].sort((a,b)=>a[1].localeCompare(b[1],"id")),"Semua Sales",x=>x[0],x=>x[1]);
 const areas=[...new Set(allRows.map(v=>v.area).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"id",{numeric:true}));
 setSelectOptions(document.getElementById("historyAreaFilter"),areas,"Semua Area",x=>x,x=>x);
 refreshHistoryOutletOptions(allRows);
}
function refreshHistoryOutletOptions(allRows){
 const selectedArea=document.getElementById("historyAreaFilter")?.value||"";
 const outlets=new Map();
 allRows.filter(v=>!selectedArea||v.area===selectedArea).forEach(v=>{
   const key=String(v.customerNo||v.code||`${v.name}|${v.area}`);
   outlets.set(key,{key,label:`${v.code?`${v.code} - `:""}${v.name||"Tanpa Nama"}`});
 });
 setSelectOptions(document.getElementById("historyOutletFilter"),[...outlets.values()].sort((a,b)=>a.label.localeCompare(b.label,"id",{numeric:true})),"Semua Outlet",x=>x.key,x=>x.label);
}
async function handleHistoryAreaChange(){historyRenderLimit=HISTORY_PAGE_SIZE;refreshHistoryOutletOptions(await getVisitsOffline());renderHistory()}
function applyHistoryFilters(data){
 let rows=[...data];
 if(currentUser.role==="sales")rows=rows.filter(x=>x.salesEmail===currentUser.email);
 else{
   const selectedSales=document.getElementById("historySalesFilter")?.value||"";
   const selectedArea=document.getElementById("historyAreaFilter")?.value||"";
   const selectedOutlet=document.getElementById("historyOutletFilter")?.value||"";
   if(selectedSales)rows=rows.filter(x=>x.salesEmail===selectedSales);
   if(selectedArea)rows=rows.filter(x=>x.area===selectedArea);
   if(selectedOutlet)rows=rows.filter(x=>String(x.customerNo||x.code||`${x.name}|${x.area}`)===selectedOutlet);
 }
 const range=getHistoryPeriodRange();
 if(range.from||range.to)rows=rows.filter(v=>{const d=visitDateValue(v);return d&&(!range.from||d>=range.from)&&(!range.to||d<=range.to)});
 return rows.sort((a,b)=>(visitDateValue(b)?.getTime()||0)-(visitDateValue(a)?.getTime()||0));
}
function toggleHistorySelectMode(){
 if(currentUser?.role!=="admin")return;
 historySelectMode=!historySelectMode;
 selectedVisitIds.clear();
 updateHistoryDeleteToolbar();
 renderHistory();
}
function cancelHistorySelectMode(shouldRender=true){
 historySelectMode=false;
 selectedVisitIds.clear();
 updateHistoryDeleteToolbar();
 if(shouldRender&&document.getElementById("historyView")&&!document.getElementById("historyView").classList.contains("hidden"))renderHistory();
}
function toggleVisitSelection(id,checked){
 checked?selectedVisitIds.add(String(id)):selectedVisitIds.delete(String(id));
 updateHistoryDeleteToolbar();
 document.querySelector(`[data-visit-id="${CSS.escape(String(id))}"]`)?.classList.toggle("selected-for-delete",checked);
}
function updateHistoryDeleteToolbar(){
 const selectBtn=document.getElementById("historySelectModeBtn"),bulk=document.getElementById("historyBulkDeleteActions"),count=selectedVisitIds.size;
 if(selectBtn){selectBtn.classList.toggle("hidden",historySelectMode);selectBtn.textContent="Pilih Riwayat"}
 bulk?.classList.toggle("hidden",!historySelectMode);
 const countEl=document.getElementById("historySelectedCount"),deleteBtn=document.getElementById("historyBulkDeleteBtn");
 if(countEl)countEl.textContent=`${count} dipilih`;
 if(deleteBtn){deleteBtn.textContent=`Hapus (${count})`;deleteBtn.disabled=count===0}
}
async function deleteVisitById(id){
 if(currentUser?.role!=="admin")return toast("Hanya admin yang dapat menghapus riwayat");
 if(!confirm("Hapus riwayat kunjungan ini?\n\nData yang dihapus tidak dapat dikembalikan kecuali melalui Restore Database."))return;
 await performVisitDeletion([String(id)]);
}
async function deleteSelectedVisits(){
 const ids=[...selectedVisitIds];
 if(!ids.length)return toast("Pilih riwayat yang ingin dihapus");
 if(!confirm(`Hapus ${ids.length} riwayat kunjungan?\n\nData yang dihapus tidak dapat dikembalikan kecuali melalui Restore Database.`))return;
 await performVisitDeletion(ids);
}
async function performVisitDeletion(ids){
 try{
   await deleteVisitsRemote(ids);
   for(const id of ids)await idbDelete(STORE_VISITS,id);
   selectedVisitIds.clear();
   historySelectMode=false;
   await updatePendingSyncCount();
   toast(`${ids.length} riwayat berhasil dihapus`);
   updateHistoryDeleteToolbar();
   await renderHistory();
 }catch(e){console.error(e);toast(e.message?.includes("app_admin_delete_visits")?"Fungsi hapus database belum dipasang. Jalankan file SQL v1.0.2 di Supabase.":(e.message||"Gagal menghapus riwayat"))}
}
function loadMoreHistory(){
 historyRenderLimit+=HISTORY_PAGE_SIZE;
 renderHistory();
}
async function renderHistory(){
 const allRows=await getVisitsOffline();
 refreshHistoryFilterOptions(allRows);
 let data=applyHistoryFilters(allRows);
 const range=getHistoryPeriodRange();
 const summary=document.getElementById("historyFilterSummary");
 if(summary)summary.textContent=`Menampilkan ${data.length} data • ${range.label}`;
 updateHistoryDeleteToolbar();
 const visibleData=data.slice(0,historyRenderLimit);
 document.getElementById("historyList").innerHTML=visibleData.map(v=>`
 <div class="history-card ${selectedVisitIds.has(String(v.id))?"selected-for-delete":""}" data-visit-id="${esc(v.id)}">
   ${currentUser.role==="admin"&&historySelectMode?`<label class="history-select-check"><input type="checkbox" ${selectedVisitIds.has(String(v.id))?"checked":""} onchange="toggleVisitSelection('${esc(v.id)}',this.checked)"> Pilih riwayat</label>`:""}
   <div class="customer-code">${esc(v.code||"TANPA KODE")} • ${esc(v.area)}</div>
   <h4>${esc(v.name)}</h4>
   <div class="pills">
     <span class="pill">${esc(v.status||"-")}</span>
     <span class="pill">${esc(v.salesName)}</span>
     ${v.paymentStatus?`<span class="pill payment-pill">${esc(v.paymentStatus)}</span>`:""}
     <span class="pill">${esc(String(v.durationMinutes??calculateDurationMinutes(v.checkInAt,v.checkOutAt)))} menit</span>
     <span class="sync-badge ${getSyncClass(v.syncStatus)}">${getSyncLabel(v.syncStatus)}</span>
   </div>
   ${v.checkInPhoto?`<img class="history-photo" src="${v.checkInPhoto}" alt="Foto check in" loading="lazy" decoding="async" onclick="openPhotoModal(this.src)">`:""}
   <div class="history-time">
     <span>Check In: ${esc(formatVisitDateTime(v.checkInAt||v.createdAt))}</span>
     <span>Check Out: ${esc(formatVisitDateTime(v.checkOutAt||v.createdAt))}</span>
     ${currentUser.role==="sales"&&v.lastEditedAt?`<span class="history-last-edited">Terakhir diubah: ${esc(formatVisitDateTime(v.lastEditedAt))}</span>`:""}
   </div>
   <div class="history-note-block">
     <small>${esc(getVisitDetailFieldLabel(v.status))}</small>
     <div class="visit-note-content">${formatVisitNoteHtml(v.status,v.note||"Tanpa catatan",v,currentUser.role==="admin")}</div>
   </div>
   ${formatAuditHistory(v.editHistory)}
   <div class="history-card-actions">
     ${canEditVisitNote(v)?`<button class="secondary compact edit-visit-button" onclick="openEditVisitModal('${esc(v.id)}')">Edit ${esc(getVisitDetailFieldLabel(v.status))}</button>`:""}
     ${currentUser.role==="admin"&&!historySelectMode?`<button class="danger compact" type="button" onclick="deleteVisitById('${esc(v.id)}')">Hapus</button>`:""}
   </div>
 </div>`).join("")+(data.length>visibleData.length?`<button class="secondary history-load-more" type="button" onclick="loadMoreHistory()">Muat ${Math.min(HISTORY_PAGE_SIZE,data.length-visibleData.length)} riwayat berikutnya</button>`:"")||'<div class="empty">Belum ada riwayat untuk filter yang dipilih.</div>';
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
 const button=document.getElementById("exportPdfBtn");
 const oldText=button?.textContent;
 if(button){button.disabled=true;button.textContent="Membuka Preview...";}
 try{
   const data=applyHistoryFilters(await getVisitsOffline());
   const selectedSales=document.getElementById("historySalesFilter")?.value||"";
   const range=getHistoryPeriodRange();
   const salesLabel=selectedSales?getSalesName(selectedSales):"Semua Sales";
   const generatedAt=new Date().toLocaleString("id-ID",{dateStyle:"long",timeStyle:"short"});
   const payload={
     title:"Laporan Riwayat Kunjungan Sales",
     subtitle:`RML Sales Visit - ${salesLabel}`,
     generatedAt,
     periodLabel:range.label,
     salesLabel,
     summary:{
       total:data.length,
       adaOrder:data.filter(v=>v.status==="Ada Order").length,
       tidakOrder:data.filter(v=>v.status==="Tidak Order").length,
       tidakBertemu:data.filter(v=>v.status==="Tidak Bertemu").length,
       orderLuarArea:data.filter(v=>v.completionType==="outside-area-order"||v.visitType==="Order Luar Area").length
     },
     rows:data.map((v,i)=>({
       no:i+1,
       code:v.code||"TANPA KODE",
       outlet:v.name||"-",
       area:v.area||"-",
       sales:v.salesName||getSalesName(v.salesEmail),
       status:v.status||"-",
       checkIn:formatVisitDateTime(v.checkInAt||v.createdAt),
       checkOut:formatVisitDateTime(v.checkOutAt||v.createdAt),
       duration:`${v.durationMinutes??calculateDurationMinutes(v.checkInAt,v.checkOutAt)} menit`,
       detailLabel:getVisitDetailFieldLabel(v.status),
       note:v.status==="Ada Order"?normalizeOrderNote(v.note):(v.note||"-"),
       paymentStatus:v.paymentStatus||"-",
       deliveryItems:getDeliveryItems(v)
     }))
   };
   localStorage.setItem("rml_pdf_preview_data",JSON.stringify(payload));
   window.location.href="pdf-preview.html";
 }catch(error){
   console.error("Preview PDF gagal",error);
   toast(`Preview PDF gagal: ${error?.message||"Terjadi kesalahan"}`);
 }finally{
   if(button){button.disabled=false;button.textContent=oldText||"Export PDF";}
 }
}

function updateNetworkStatus(){
 const online=navigator.onLine;
 const banner=document.getElementById("networkBanner");
 if(!banner)return;
 banner.textContent=online?"Online":"Offline — data tetap tersimpan di HP";
 banner.className=`network-banner ${online?"online":"offline"}`;
 const syncBtn=document.getElementById("syncBtn");
 if(syncBtn)syncBtn.disabled=!online;
}
async function updatePendingSyncCount(){
 const all=await getVisitsOffline();
 const pending=all.filter(v=>v.syncStatus!=="synced").length;
 const el=document.getElementById("pendingSyncCount");
 if(el)el.textContent=`${pending} belum sinkron`;
}
async function syncPendingVisits(options={}){
 const {silent=false,autoRetry=false}=options||{};
 if(syncInProgress)return false;
 if(!navigator.onLine){if(!silent)toast("Tidak ada internet. Data tetap aman di HP.");return false}
 const session=getSbSession();
 if(!session?.session_token){if(!silent)toast("Silakan login kembali untuk menyinkronkan data");return false}
 const all=await getVisitsOffline();
 const pending=all.filter(v=>v.syncStatus!=="synced");
 if(!pending.length){
  await updatePendingSyncCount();
  if(!silent)toast("Semua data sudah sinkron");
  return true;
 }
 syncInProgress=true;
 let successCount=0;
 try{
  const batchSize=3;
  for(let i=0;i<pending.length;i+=batchSize){
   const batch=pending.slice(i,i+batchSize);
   const results=await Promise.allSettled(batch.map(async v=>{
    await rpc('app_upsert_visit',{p_token:session.session_token,p_visit:visitToRemote(v)});
    await idbPut(STORE_VISITS,{...v,syncStatus:"synced",updatedAt:new Date().toISOString()});
    return v.id;
   }));
   for(let j=0;j<results.length;j++){
    if(results[j].status==="fulfilled")successCount++;
    else await idbPut(STORE_VISITS,{...batch[j],syncStatus:"failed"});
   }
  }
  await pullRemoteVisits();
  await refreshVisitCache();
  await updatePendingSyncCount();
  const failedCount=pending.length-successCount;
  if(!silent){
   toast(failedCount?`${successCount} data sinkron, ${failedCount} data belum berhasil`:`${successCount} data berhasil disinkronkan`);
  }
  if(failedCount&&autoRetry){
   clearTimeout(autoSyncRetryTimer);
   autoSyncRetryTimer=setTimeout(()=>scheduleAutoSync(0),10000);
  }
  return failedCount===0;
 }catch(e){
  console.error("Sinkronisasi gagal",e);
  await updatePendingSyncCount();
  if(!silent)toast(`Sinkronisasi gagal: ${e.message}`);
  if(autoRetry){
   clearTimeout(autoSyncRetryTimer);
   autoSyncRetryTimer=setTimeout(()=>scheduleAutoSync(0),10000);
  }
  return false;
 }finally{
  syncInProgress=false;
 }
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
window.addEventListener("online",()=>{updateNetworkStatus();updatePendingSyncCount();scheduleAutoSync(100);pullCustomersFromSupabase({silent:true}).then(()=>{if(currentUser)renderCustomers()}).catch(()=>{});});
window.addEventListener("focus",()=>{scheduleAutoSync(150);if(currentUser&&navigator.onLine)pullCustomersFromSupabase({silent:true}).then(()=>{if(!document.getElementById("customersView")?.classList.contains("hidden"))renderCustomers()}).catch(()=>{});pullProductsFromSupabase({silent:true}).then(()=>{if(!document.getElementById('priceListView')?.classList.contains('hidden')){fillProductFilters();renderPriceList();if(currentUser?.role==='admin')renderProductAssignments()}}).catch(()=>{})});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){scheduleAutoSync(150);if(currentUser&&navigator.onLine)pullCustomersFromSupabase({silent:true}).then(()=>{if(!document.getElementById("customersView")?.classList.contains("hidden"))renderCustomers()}).catch(()=>{});pullProductsFromSupabase({silent:true}).then(()=>{if(!document.getElementById('priceListView')?.classList.contains('hidden')){fillProductFilters();renderPriceList();if(currentUser?.role==='admin')renderProductAssignments()}}).catch(()=>{})}});
setInterval(()=>{if(document.visibilityState==="visible"&&navigator.onLine)scheduleAutoSync(0)},30000);
window.addEventListener("offline",updateNetworkStatus);

document.addEventListener("DOMContentLoaded",()=>{
 const loginPage=document.getElementById("loginPage");
 const loginName=document.getElementById("loginName");
 const password=document.getElementById("password");
 if(loginPage&&!loginPage.classList.contains("hidden"))resetLoginForm();
 loginName?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();password?.focus();}});
 password?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();login();}});
});

if("serviceWorker" in navigator&&location.protocol.startsWith("http")){
 window.addEventListener("load",async()=>{
  try{
   const registration=await navigator.serviceWorker.register("./service-worker.js?v=1.2.3",{updateViaCache:"none"});
   registration.update().catch(()=>{});
  }catch(e){console.warn("Service worker tidak dapat dipasang",e)}
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
const saved=sessionStorage.getItem("rml_user")||localStorage.getItem("rml_cached_user");if(saved){try{const oldUser=JSON.parse(saved);USERS=loadUsers();const localUser=USERS.find(u=>u.email===oldUser.email)||{};currentUser={...localUser,...oldUser};sessionStorage.setItem("rml_user",JSON.stringify(currentUser));localStorage.setItem("rml_cached_user",JSON.stringify(currentUser));currentUser.mustChangePassword?showForcedPasswordPage():(async()=>{await pullCustomersFromSupabase({silent:true});openApp()})()}catch(e){sessionStorage.removeItem("rml_user");localStorage.removeItem("rml_cached_user")}}

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


/* v1.0.0 Stable - Backup & Restore data admin */
const BACKUP_APP_ID="RML Sales Visit";
const BACKUP_SCHEMA_VERSION=1;
const BACKUP_LOCAL_KEYS=[
  USER_SETTINGS_KEY,
  AREA_ASSIGNMENT_KEY,
  "rml_customers",
  "rml_data_version"
];

function safeBackupUsers(){
 return USERS.map(({password,mustChangePassword,...u})=>({...u}));
}
function downloadJsonFile(filename,data){
 const content=JSON.stringify(data,null,2);
 if(androidSaveBase64File(filename,"application/json;charset=utf-8",btoa(unescape(encodeURIComponent(content)))))return;
 const blob=new Blob([content],{type:"application/json;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function backupTimestamp(date=new Date()){
 const p=n=>String(n).padStart(2,"0");
 return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}-${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}
async function downloadDatabaseBackup(){
 if(currentUser?.role!=="admin")return toast("Hanya admin yang dapat membuat backup");
 try{
  const visits=await idbGetAll(STORE_VISITS);
  const meta=await idbGetAll(STORE_META);
  const localData={};
  BACKUP_LOCAL_KEYS.forEach(key=>{const value=localStorage.getItem(key);if(value!==null)localData[key]=value});
  localData[USER_SETTINGS_KEY]=JSON.stringify(safeBackupUsers());
  const payload={
   app:BACKUP_APP_ID,
   appVersion:APP_VERSION,
   schemaVersion:BACKUP_SCHEMA_VERSION,
   backupDate:new Date().toISOString(),
   exportedBy:{name:currentUser.name,role:currentUser.role},
   data:{localStorage:localData,indexedDB:{visits,meta}}
  };
  downloadJsonFile(`RML-Backup-${backupTimestamp()}.json`,payload);
  toast("Backup berhasil diunduh");
 }catch(e){toast(`Backup gagal: ${e.message}`)}
}
function validateBackupPayload(payload){
 if(!payload||typeof payload!=="object")throw new Error("Isi file tidak dapat dibaca");
 if(payload.app!==BACKUP_APP_ID)throw new Error("File bukan backup RML Sales Visit");
 if(Number(payload.schemaVersion)!==BACKUP_SCHEMA_VERSION)throw new Error("Versi format backup tidak kompatibel");
 if(!payload.data||typeof payload.data.localStorage!=="object"||!payload.data.indexedDB)throw new Error("Struktur backup tidak lengkap");
 const customersRaw=payload.data.localStorage["rml_customers"];
 if(customersRaw!=null){const parsed=JSON.parse(customersRaw);if(!Array.isArray(parsed))throw new Error("Data pelanggan tidak valid")}
 const visits=payload.data.indexedDB.visits;
 if(!Array.isArray(visits))throw new Error("Data riwayat kunjungan tidak valid");
 return true;
}
function mergeRestoredUsers(raw){
 let restored=[];try{restored=JSON.parse(raw||"[]")}catch(e){}
 if(!Array.isArray(restored))return USERS;
 return USERS.map(existing=>{
  const incoming=restored.find(u=>u.email===existing.email);
  return incoming?{...existing,...incoming,password:existing.password,mustChangePassword:existing.mustChangePassword}:existing;
 });
}
async function idbClear(storeName){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(storeName,"readwrite");tx.objectStore(storeName).clear();
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
 });
}
async function handleRestoreBackupFile(event){
 const input=event?.target;const file=input?.files?.[0];if(!file)return;
 const info=document.getElementById("restoreBackupInfo");
 try{
  const payload=JSON.parse(await file.text());validateBackupPayload(payload);
  const backupDate=payload.backupDate?new Date(payload.backupDate).toLocaleString("id-ID"):"Tidak diketahui";
  if(info){info.classList.remove("hidden");info.innerHTML=`<strong>${esc(file.name)}</strong><span>Backup: ${esc(backupDate)} • ${payload.data.indexedDB.visits.length} riwayat kunjungan</span>`}
  const ok=confirm(`Pulihkan data dari ${file.name}?\n\nData pelanggan, pembagian tugas, pengaturan akun, dan riwayat lokal saat ini akan diganti. Password dan sesi login tetap dipertahankan.`);
  if(!ok){input.value="";return}
  await restoreDatabaseBackup(payload);
 }catch(e){toast(`Restore gagal: ${e.message}`);if(info)info.classList.add("hidden")}
 finally{if(input)input.value=""}
}
async function restoreDatabaseBackup(payload){
 if(currentUser?.role!=="admin")return toast("Hanya admin yang dapat melakukan restore");
 const sessionUser=currentUser;
 const currentUsers=USERS.map(u=>({...u}));
 const localData=payload.data.localStorage||{};
 try{
  for(const key of BACKUP_LOCAL_KEYS){
   if(key===USER_SETTINGS_KEY)continue;
   if(Object.prototype.hasOwnProperty.call(localData,key))localStorage.setItem(key,String(localData[key]));
   else localStorage.removeItem(key);
  }
  USERS=mergeRestoredUsers(localData[USER_SETTINGS_KEY]);persistUsers();
  const refreshedUser=USERS.find(u=>u.email===sessionUser.email)||sessionUser;
  currentUser={...refreshedUser};sessionStorage.setItem("rml_user",JSON.stringify(currentUser));localStorage.setItem("rml_cached_user",JSON.stringify(currentUser));
  await idbClear(STORE_VISITS);await idbClear(STORE_META);
  for(const row of payload.data.indexedDB.visits||[])await idbPut(STORE_VISITS,{...row,syncStatus:navigator.onLine?"pending":(row.syncStatus||"pending")});
  for(const row of payload.data.indexedDB.meta||[])await idbPut(STORE_META,row);
  await refreshVisitCache();
  if(navigator.onLine){
   try{await syncSettingsToSupabase();await syncCustomersToSupabase({silent:true});await syncPendingVisits()}catch(e){console.warn("Restore sync warning",e)}
  }
  toast("Restore berhasil. Aplikasi akan dimuat ulang.");
  setTimeout(()=>location.reload(),1200);
 }catch(e){
  USERS=currentUsers;persistUsers();throw e;
 }
}

// Auto bullet untuk input orderan.
["visitNote","outsideOrderNote","editVisitNoteInput"].forEach(id=>{
 const input=document.getElementById(id);
 if(input&&!input.dataset.bulletHandler){input.addEventListener("keydown",handleOrderBulletKeydown);input.dataset.bulletHandler="1";}
});
initializeVisitDraftAutosave();

window.loadMoreProducts=loadMoreProducts;window.handleProductFilterChange=handleProductFilterChange;


document.addEventListener('keydown',event=>{
 const modal=document.getElementById('productEditModal');
 if(!modal||modal.classList.contains('hidden'))return;
 if(event.key==='Escape'){event.preventDefault();closeProductEditModal();return}
 if(event.key==='Enter'&&event.target?.tagName!=='TEXTAREA'){event.preventDefault();saveProductFromModal()}
});

window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('productEditModal')?.classList.contains('hidden'))closeProductEditModal()});
