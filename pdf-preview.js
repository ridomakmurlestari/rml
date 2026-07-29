const STORAGE_KEY="rml_pdf_preview_data";
function cleanOrderLines(value){return String(value||"").split(/\r?\n/).map(line=>line.trim().replace(/^[•\-–—*]+\s*/,"")).filter(Boolean);}
function orderHtml(value){const lines=cleanOrderLines(value);return lines.length?`<ul class="order-bullet-list">${lines.map(line=>`<li>${esc(line)}</li>`).join("")}</ul>`:"-";}
function orderText(value){const lines=cleanOrderLines(value);return lines.length?lines.map(line=>`• ${line}`).join("\n"):"-";}
let previewData=null;
function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));}
function loadPreview(){
 try{previewData=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");}catch(_){previewData=null;}
 if(!previewData){document.getElementById("reportRows").innerHTML='<tr><td class="empty" colspan="6">Data preview tidak ditemukan. Silakan kembali dan buka Export PDF lagi.</td></tr>';document.getElementById("savePdfBtn").disabled=true;return;}
 document.getElementById("reportTitle").textContent=previewData.title||"Laporan Riwayat Kunjungan Sales";
 document.getElementById("reportSubtitle").textContent=previewData.subtitle||"RML Sales Visit";
 document.getElementById("generatedAt").textContent=previewData.generatedAt||"-";
 document.getElementById("periodLabel").textContent=previewData.periodLabel||"-";
 document.getElementById("salesLabel").textContent=previewData.salesLabel||"-";
 const s=previewData.summary||{};
 document.getElementById("sumTotal").textContent=s.total||0;
 document.getElementById("sumOrder").textContent=s.adaOrder||0;
 document.getElementById("sumNoOrder").textContent=s.tidakOrder||0;
 document.getElementById("sumNoMeet").textContent=s.tidakBertemu||0;
 document.getElementById("sumOutside").textContent=s.orderLuarArea||0;
 const rows=Array.isArray(previewData.rows)?previewData.rows:[];
 document.getElementById("reportRows").innerHTML=rows.length?rows.map(r=>{
   const detail=r.status==="Ada Order"?orderHtml(r.note):esc(r.note).replace(/\n/g,"<br>");
   return `<tr><td>${esc(r.no)}</td><td><strong>${esc(r.code)}</strong><br>${esc(r.outlet)}<br><small>${esc(r.area)}</small></td><td>${esc(r.sales)}</td><td>${esc(r.status)}</td><td>Masuk: ${esc(r.checkIn)}<br>Keluar: ${esc(r.checkOut)}<br>Durasi: ${esc(r.duration)}</td><td><strong>${esc(r.detailLabel)}</strong><br>${detail}</td></tr>`;
 }).join(""):'<tr><td class="empty" colspan="6">Belum ada data kunjungan untuk filter yang dipilih.</td></tr>';
}
function goBackToHistory(){window.location.href="index.html#history";}
function safeName(value){return String(value||"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"");}
async function savePreviewAsPdf(){
 if(!previewData)return;
 const btn=document.getElementById("savePdfBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Menyimpan...";
 try{
   const JsPDF=window.jspdf?.jsPDF;
   if(!JsPDF)throw new Error("Modul PDF belum termuat. Pastikan internet aktif.");
   const doc=new JsPDF({orientation:"landscape",unit:"mm",format:"a4",compress:true});
   const pageWidth=doc.internal.pageSize.getWidth(),margin=10;
   doc.setFont("helvetica","bold");doc.setFontSize(17);doc.text(previewData.title||"Laporan Riwayat Kunjungan Sales",margin,14);
   doc.setFont("helvetica","normal");doc.setFontSize(9);doc.text(previewData.subtitle||"RML Sales Visit",margin,20);
   doc.text(`Dibuat: ${previewData.generatedAt||"-"}`,pageWidth-margin,12,{align:"right"});
   doc.text(`Periode: ${previewData.periodLabel||"-"}`,pageWidth-margin,17,{align:"right"});
   doc.text(`Filter Sales: ${previewData.salesLabel||"-"}`,pageWidth-margin,22,{align:"right"});
   const s=previewData.summary||{};
   const boxes=[["Total Aktivitas",s.total||0],["Ada Order",s.adaOrder||0],["Tidak Order",s.tidakOrder||0],["Tidak Bertemu",s.tidakBertemu||0],["Order Luar Area",s.orderLuarArea||0]];
   const gap=3,bw=(pageWidth-(margin*2)-(gap*4))/5;
   boxes.forEach(([label,value],i)=>{const x=margin+i*(bw+gap);doc.setDrawColor(200);doc.roundedRect(x,27,bw,15,2,2);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text(String(label),x+3,32);doc.setFont("helvetica","bold");doc.setFontSize(13);doc.text(String(value),x+3,39);});
   const body=(previewData.rows||[]).map(r=>[String(r.no),`${r.code}\n${r.outlet}\n${r.area}`,r.sales,r.status,`${r.checkIn}\nKeluar: ${r.checkOut}\nDurasi: ${r.duration}`,`${r.detailLabel}\n${r.status==="Ada Order"?orderText(r.note):r.note}`]);
   doc.autoTable({startY:46,head:[["No.","Outlet","Sales","Status","Waktu","Orderan / Catatan"]],body:body.length?body:[["","Belum ada data kunjungan untuk filter yang dipilih.","","","",""]],theme:"grid",styles:{font:"helvetica",fontSize:7,cellPadding:2,valign:"top",overflow:"linebreak"},headStyles:{fillColor:[23,110,89],textColor:255,fontStyle:"bold"},alternateRowStyles:{fillColor:[248,251,250]},columnStyles:{0:{cellWidth:10,halign:"center"},1:{cellWidth:50},2:{cellWidth:30},3:{cellWidth:28},4:{cellWidth:48},5:{cellWidth:"auto"}},margin:{left:margin,right:margin,bottom:12},didDrawPage:()=>{const ph=doc.internal.pageSize.getHeight();doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text("Dokumen dibuat dari RML Sales Visit",pageWidth-margin,ph-5,{align:"right"});}});
   const filename=`Laporan-Kunjungan-${safeName(previewData.salesLabel)||"Semua-Sales"}-${new Date().toISOString().slice(0,10)}.pdf`;
   if(window.AndroidBridge?.saveBase64File){const base64=doc.output("datauristring").split(",")[1];window.AndroidBridge.saveBase64File(filename,"application/pdf",base64);alert("PDF berhasil disimpan ke folder Download");}else{doc.save(filename);}
 }catch(e){alert(`Gagal menyimpan PDF: ${e?.message||"Terjadi kesalahan"}`);}finally{btn.disabled=false;btn.textContent=old;}
}
document.addEventListener("DOMContentLoaded",loadPreview);
