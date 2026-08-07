/* RML v1.7.8 - Admin delete check-in photo
   Load AFTER app-v1-7-7.js in index.html.
*/
(function(){
  "use strict";

  const ORIGINAL_RENDER_HISTORY = window.renderHistory;

  async function deleteVisitPhotoRemote(id){
    if((typeof currentUser === "undefined" || currentUser?.role !== "admin")){
      throw new Error("Hanya admin yang dapat menghapus foto");
    }
    const session = typeof getSbSession === "function" ? getSbSession() : null;
    if(!session?.session_token) throw new Error("Sesi login tidak tersedia. Silakan login ulang.");
    if(!navigator.onLine) throw new Error("Penghapusan foto memerlukan koneksi internet.");

    return rpc("app_admin_delete_visit_photo", {
      p_token: session.session_token,
      p_visit_id: String(id)
    });
  }

  async function removePhotoFromLocalVisit(id){
    const rows = await idbGetAll(STORE_VISITS);
    const row = rows.find(v => String(v.id) === String(id));
    if(!row) return;
    const next = {...row};
    delete next.checkInPhoto;
    await idbPut(STORE_VISITS, next);
  }

  window.deleteVisitPhoto = async function(id){
    if((typeof currentUser === "undefined" || currentUser?.role !== "admin")) return toast("Hanya admin yang dapat menghapus foto");
    if(!confirm("Hapus foto check-in dari Supabase?\n\nData kunjungan tetap ada. Hanya fotonya yang dihapus dan tidak dapat dipulihkan.")) return;

    const button = document.querySelector(`[data-photo-delete-id="${CSS.escape(String(id))}"]`);
    if(button){
      button.disabled = true;
      button.textContent = "Menghapus...";
    }

    try{
      const result = await deleteVisitPhotoRemote(id);
      await removePhotoFromLocalVisit(id);

      // Also clear any active photo modal.
      if(typeof closePhotoModal === "function") closePhotoModal();

      if(typeof renderHistory === "function") await renderHistory();

      toast(result?.photo_deleted === false
        ? "Foto sudah tidak ada di server"
        : "Foto check-in berhasil dihapus");
    }catch(e){
      console.error("Hapus foto gagal", e);
      toast(e?.message || "Gagal menghapus foto");
      if(button){
        button.disabled = false;
        button.textContent = "Hapus Foto";
      }
    }
  };

  if(typeof ORIGINAL_RENDER_HISTORY === "function"){
    window.renderHistory = async function(){
      const result = await ORIGINAL_RENDER_HISTORY.apply(this, arguments);

      if(typeof currentUser !== "undefined" && currentUser?.role === "admin"){
        document.querySelectorAll(".history-card[data-visit-id]").forEach(card => {
          if(card.querySelector("[data-photo-delete-id]")) return;

          const photo = card.querySelector(".history-photo");
          if(!photo) return;

          const id = card.getAttribute("data-visit-id");
          const actions = card.querySelector(".history-card-actions");
          if(!actions) return;

          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "danger compact";
          btn.textContent = "Hapus Foto";
          btn.setAttribute("data-photo-delete-id", id);
          btn.addEventListener("click", () => window.deleteVisitPhoto(id));
          actions.insertBefore(btn, actions.firstChild);
        });
      }

      return result;
    };
  }

  // Expose a small version marker for troubleshooting.
  window.RML_PHOTO_DELETE_VERSION = "1.7.8";
})();
