/* RML v1.7.9 - Admin: Hapus Semua Foto Check-In
   Load AFTER app-v1-7-8 photo-delete addon and app-v1-7-7.js.
   Adds one admin-only button in Pengaturan Admin.
*/
(function(){
  "use strict";

  const ORIGINAL_SHOW_ASSIGNMENTS = window.showAreaAssignments;
  const CARD_ID = "rmlDeleteAllPhotosCard";
  const BUTTON_ID = "rmlDeleteAllPhotosBtn";

  function injectCard(){
    if(typeof currentUser === "undefined" || currentUser?.role !== "admin") return;
    const view = document.getElementById("assignmentView");
    if(!view || document.getElementById(CARD_ID)) return;

    const card = document.createElement("div");
    card.id = CARD_ID;
    card.className = "dashboard-card";
    card.style.border = "1px solid #fecaca";
    card.style.background = "#fff7f7";
    card.innerHTML = `
      <div class="title-row inner-title">
        <div>
          <h3>Foto Check-In</h3>
          <p>Hapus semua foto check-in dari Supabase. Data riwayat kunjungan tetap tersimpan.</p>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button id="${BUTTON_ID}" class="danger compact" type="button">Hapus Semua Foto</button>
        <span style="font-size:13px;color:#7f1d1d">Tindakan ini tidak dapat dibatalkan.</span>
      </div>`;

    const backup = view.querySelector(".backup-restore-card");
    if(backup) backup.parentNode.insertBefore(card, backup);
    else view.appendChild(card);

    document.getElementById(BUTTON_ID)?.addEventListener("click", window.deleteAllVisitPhotos);
  }

  async function clearLocalPhotos(){
    if(typeof idbGetAll !== "function" || typeof idbPut !== "function" || typeof STORE_VISITS === "undefined") return;
    const rows = await idbGetAll(STORE_VISITS);
    let changed = 0;
    for(const row of rows){
      if(row && row.checkInPhoto){
        const next = {...row};
        delete next.checkInPhoto;
        await idbPut(STORE_VISITS, next);
        changed++;
      }
    }
    return changed;
  }

  window.deleteAllVisitPhotos = async function(){
    if(typeof currentUser === "undefined" || currentUser?.role !== "admin"){
      return toast("Hanya admin yang dapat menghapus foto");
    }
    const session = typeof getSbSession === "function" ? getSbSession() : null;
    if(!session?.session_token) return toast("Sesi admin tidak tersedia. Silakan login ulang.");
    if(!navigator.onLine) return toast("Penghapusan foto memerlukan koneksi internet.");

    const ok = confirm(
      "HAPUS SEMUA FOTO CHECK-IN?\n\n" +
      "Semua foto check-in pada riwayat kunjungan akan dihapus dari Supabase.\n" +
      "Data kunjungan, customer, tanggal, status, catatan, dan data lainnya TETAP ADA.\n\n" +
      "Foto yang sudah dihapus TIDAK dapat dipulihkan.\n\n" +
      "Lanjutkan?"
    );
    if(!ok) return;

    const btn = document.getElementById(BUTTON_ID);
    if(btn){ btn.disabled = true; btn.textContent = "Menghapus Semua Foto..."; }

    try{
      const result = await rpc("app_admin_delete_all_visit_photos", {
        p_token: session.session_token
      });

      const localChanged = await clearLocalPhotos();
      if(typeof closePhotoModal === "function") closePhotoModal();
      if(typeof renderHistory === "function") await renderHistory();

      const deleted = Number(result?.deleted_count || 0);
      toast(`Selesai. ${deleted} foto dihapus dari Supabase${localChanged ? `, ${localChanged} data lokal dibersihkan` : ""}.`);
    }catch(e){
      console.error("Hapus semua foto gagal", e);
      toast(e?.message || "Gagal menghapus semua foto");
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = "Hapus Semua Foto"; }
    }
  };

  if(typeof ORIGINAL_SHOW_ASSIGNMENTS === "function"){
    window.showAreaAssignments = function(){
      const result = ORIGINAL_SHOW_ASSIGNMENTS.apply(this, arguments);
      setTimeout(injectCard, 0);
      return result;
    };
  }

  // Also expose a version marker for troubleshooting.
  window.RML_DELETE_ALL_PHOTOS_VERSION = "1.7.9";
})();
