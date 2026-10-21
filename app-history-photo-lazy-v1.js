/* RML v2.0.5 — Photo history on-demand loader
 * Load AFTER app-v1-8-3.js and admin photo scripts.
 * Photos are uploaded to a separate table; history only receives boolean metadata.
 */
(function () {
  "use strict";

  const PHOTO_CACHE = new Map();
  let loadingFlags = false;
  let lastFlagAttemptAt = 0;
  const FLAG_RETRY_MS = 60_000;

  function sessionToken() {
    try { return typeof getSbSession === "function" ? getSbSession()?.session_token : null; }
    catch (_) { return null; }
  }
  function role() {
    try { return typeof currentUser !== "undefined" ? currentUser?.role : null; }
    catch (_) { return null; }
  }
  function ownerEmail() {
    try { return typeof currentUser !== "undefined" ? String(currentUser?.email || "").toLowerCase() : ""; }
    catch (_) { return ""; }
  }
  function photoFreeLocal(v) {
    const out = { ...(v || {}) };
    if (out.checkInPhoto || out.hasCheckInPhoto === true) out.hasCheckInPhoto = true;
    delete out.checkInPhoto;
    return out;
  }
  function getResultObject(data) {
    if (Array.isArray(data)) return data[0] || {};
    return data && typeof data === "object" ? data : {};
  }
  function getPhotoValue(data) {
    const obj = getResultObject(data);
    return obj.checkInPhoto || obj.photo_data || obj.photo || null;
  }
  function isDataImage(value) {
    return typeof value === "string" && /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value);
  }

  // Override the existing sync loop only to add an idempotent photo-upload call.
  // The visit payload remains photo-free, so standard visit pulls stay lightweight.
  async function syncPendingVisitsPhotoAware(options = {}) {
    const { silent = false, autoRetry = false } = options || {};
    if (syncInProgress) return false;
    if (!navigator.onLine) {
      if (!silent) toast("Tidak ada internet. Data tetap aman di HP.");
      return false;
    }
    const session = getSbSession();
    if (!session?.session_token) {
      if (!silent) toast("Silakan login kembali untuk menyinkronkan data");
      return false;
    }
    const all = await getVisitsOffline();
    const pending = all.filter(v => v.syncStatus !== "synced");
    if (!pending.length) {
      await updatePendingSyncCount();
      if (!silent) toast("Semua data sudah sinkron");
      return true;
    }

    syncInProgress = true;
    let successCount = 0;
    try {
      const batchSize = 3;
      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);
        const results = await Promise.allSettled(batch.map(async v => {
          // Existing visit RPC still receives a payload with no image bytes.
          await rpc("app_upsert_visit", {
            p_token: session.session_token,
            p_visit: visitToRemote(v)
          });

          // Upload only when this device still has the actual image data.
          // Updating an existing visit with only hasCheckInPhoto=true never re-uploads
          // or overwrites the separately stored photo.
          if (isDataImage(v.checkInPhoto)) {
            await rpc("app_upsert_visit_photo", {
              p_token: session.session_token,
              p_visit_id: String(v.id),
              p_sales_email: String(v.salesEmail || ownerEmail()).toLowerCase(),
              p_photo: v.checkInPhoto
            });
            PHOTO_CACHE.set(String(v.id), v.checkInPhoto);
          }

          await idbPut(STORE_VISITS, {
            ...photoFreeLocal(v),
            syncStatus: "synced",
            updatedAt: new Date().toISOString()
          });
          return v.id;
        }));

        for (let j = 0; j < results.length; j++) {
          if (results[j].status === "fulfilled") successCount++;
          else await idbPut(STORE_VISITS, { ...batch[j], syncStatus: "failed" });
        }
      }

      await pullRemoteVisits();
      await refreshVisitCache();
      await updatePendingSyncCount();
      const failedCount = pending.length - successCount;
      if (!silent) {
        toast(failedCount
          ? `${successCount} data sinkron, ${failedCount} data belum berhasil`
          : `${successCount} data berhasil disinkronkan`);
      }
      if (failedCount && autoRetry) {
        clearTimeout(autoSyncRetryTimer);
        autoSyncRetryTimer = setTimeout(() => scheduleAutoSync(0), 10000);
      }
      return failedCount === 0;
    } catch (e) {
      console.error("Sinkronisasi gagal", e);
      await updatePendingSyncCount();
      if (!silent) toast(`Sinkronisasi gagal: ${e.message}`);
      if (autoRetry) {
        clearTimeout(autoSyncRetryTimer);
        autoSyncRetryTimer = setTimeout(() => scheduleAutoSync(0), 10000);
      }
      return false;
    } finally {
      syncInProgress = false;
    }
  }

  async function loadMissingPhotoFlags() {
    if (loadingFlags || !navigator.onLine || !sessionToken()) return;
    const now = Date.now();
    if (now - lastFlagAttemptAt < FLAG_RETRY_MS) return;
    const rows = await getVisitsOffline();
    const visibleIds = new Set(
      [...document.querySelectorAll(".history-card[data-visit-id]")]
        .map(card => String(card.getAttribute("data-visit-id") || ""))
        .filter(Boolean)
    );
    const unknown = rows.filter(v =>
      v && visibleIds.has(String(v.id)) &&
      v.syncStatus === "synced" &&
      typeof v.hasCheckInPhoto !== "boolean" &&
      !v.checkInPhoto
    );
    if (!unknown.length) return;

    loadingFlags = true;
    lastFlagAttemptAt = now;
    try {
      // Send only IDs. The RPC response contains only {id, hasCheckInPhoto} flags.
      // No photo data is returned by this metadata call.
      const ids = unknown.map(v => String(v.id)).slice(0, 1000);
      const result = await rpc("app_pull_visit_photo_flags", {
        p_token: sessionToken(),
        p_visit_ids: ids
      });
      const obj = getResultObject(result);
      const flags = Array.isArray(result) ? result : (Array.isArray(obj.flags) ? obj.flags : []);
      const byId = new Map(flags.map(x => [String(x.id), x.hasCheckInPhoto === true]));
      for (const row of unknown) {
        const id = String(row.id);
        if (!byId.has(id)) continue; // not visible to this role or not found remotely
        await idbPut(STORE_VISITS, { ...row, hasCheckInPhoto: byId.get(id) });
      }
    } catch (e) {
      console.warn("Metadata foto riwayat belum tersedia", e);
    } finally {
      loadingFlags = false;
    }
  }

  function renderPhotoInSlot(slot, visitId, source) {
    slot.replaceChildren();
    const img = document.createElement("img");
    img.className = "history-photo";
    img.alt = "Foto check-in";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = source;
    img.addEventListener("click", () => {
      if (typeof openPhotoModal === "function") openPhotoModal(source);
    });
    slot.appendChild(img);

    if (role() === "admin") {
      const actions = slot.closest(".history-card")?.querySelector(".history-card-actions");
      if (actions && !actions.querySelector(`[data-lazy-photo-delete="${CSS.escape(visitId)}"]`)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "danger compact";
        btn.textContent = "Hapus Foto";
        btn.setAttribute("data-lazy-photo-delete", visitId);
        btn.addEventListener("click", () => deleteHistoryPhoto(visitId, slot, btn));
        actions.insertBefore(btn, actions.firstChild);
      }
    }
  }

  async function loadHistoryPhoto(visitId, button) {
    const id = String(visitId || "");
    if (!id || !button) return;
    const slot = button.closest(".history-photo-slot");
    if (!slot) return;

    const cached = PHOTO_CACHE.get(id);
    if (cached) {
      renderPhotoInSlot(slot, id, cached);
      return;
    }
    if (!navigator.onLine) {
      toast("Foto perlu koneksi internet. Riwayat tetap tersedia.");
      return;
    }
    const token = sessionToken();
    if (!token) {
      toast("Sesi login tidak tersedia. Silakan login kembali.");
      return;
    }

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Memuat foto...";
    try {
      const response = await rpc("app_pull_visit_photo", {
        p_token: token,
        p_visit_id: id
      });
      const obj = getResultObject(response);
      const photo = getPhotoValue(obj);
      if (!photo || obj.found === false) {
        const msg = "Foto check-in tidak tersedia di server.";
        button.textContent = msg;
        button.disabled = true;
        toast(msg);
        return;
      }
      PHOTO_CACHE.set(id, photo);
      renderPhotoInSlot(slot, id, photo);
    } catch (e) {
      console.error("Muat foto check-in gagal", e);
      button.disabled = false;
      button.textContent = oldText;
      toast(e?.message || "Gagal memuat foto check-in");
    }
  }

  async function deleteHistoryPhoto(visitId, slot, button) {
    if (role() !== "admin") return toast("Hanya admin yang dapat menghapus foto");
    if (!confirm("Hapus foto check-in ini? Data kunjungan tetap disimpan.")) return;
    const token = sessionToken();
    if (!token) return toast("Sesi login tidak tersedia");
    button.disabled = true;
    button.textContent = "Menghapus...";
    try {
      await rpc("app_admin_delete_visit_photo_v2", {
        p_token: token,
        p_visit_id: String(visitId)
      });
      PHOTO_CACHE.delete(String(visitId));
      const row = await idbGet(STORE_VISITS, String(visitId));
      if (row) {
        const next = { ...row, hasCheckInPhoto: false };
        delete next.checkInPhoto;
        await idbPut(STORE_VISITS, next);
      }
      slot.remove();
      button.remove();
      toast("Foto check-in berhasil dihapus");
    } catch (e) {
      console.error("Hapus foto gagal", e);
      button.disabled = false;
      button.textContent = "Hapus Foto";
      toast(e?.message || "Gagal menghapus foto");
    }
  }

  async function decorateHistoryPhotos() {
    try {
      await loadMissingPhotoFlags();
      const rows = await getVisitsOffline();
      const byId = new Map(rows.map(v => [String(v.id), v]));
      document.querySelectorAll(".history-card[data-visit-id]").forEach(card => {
        const id = String(card.getAttribute("data-visit-id") || "");
        if (!id) return;
        if (card.querySelector(".history-photo")) return;
        if (card.querySelector(".history-photo-load")) return;
        const visit = byId.get(id);
        if (!visit || visit.hasCheckInPhoto !== true) return;

        const slot = document.createElement("div");
        slot.className = "history-photo-slot";
        slot.setAttribute("data-history-photo-slot", id);
        const cached = PHOTO_CACHE.get(id);
        if (cached) {
          renderPhotoInSlot(slot, id, cached);
        } else {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "history-photo-load";
          btn.textContent = "📷 Lihat Foto Check-in";
          btn.addEventListener("click", () => loadHistoryPhoto(id, btn));
          slot.appendChild(btn);
        }

        const pills = card.querySelector(".pills");
        if (pills) pills.insertAdjacentElement("afterend", slot);
        else card.prepend(slot);
      });
    } catch (e) {
      console.warn("Tampilan foto riwayat belum siap", e);
    }
  }

  function addCss() {
    if (document.getElementById("rmlHistoryPhotoLazyCss")) return;
    const style = document.createElement("style");
    style.id = "rmlHistoryPhotoLazyCss";
    style.textContent = `
      .history-photo-slot{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:10px 0;width:100%;min-width:0}
      .history-photo-load{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:9px 13px;border:1px solid #cfe3e2;border-radius:12px;background:#f0faf9;color:#096f68;font-size:12px;font-weight:800;cursor:pointer;max-width:100%}
      .history-photo-load:hover{background:#e2f5f2;border-color:#9fcfca}
      .history-photo-load:disabled{opacity:.7;cursor:wait}
      .history-photo-slot .history-photo{display:block;width:min(100%,320px);height:auto;max-height:260px;object-fit:contain;object-position:left center;border-radius:12px;border:1px solid #dbe6e5;background:#f6f9fa;cursor:zoom-in}
      @media(max-width:560px){.history-photo-load{width:100%;justify-content:center}.history-photo-slot .history-photo{width:100%;max-height:280px}}
    `;
    document.head.appendChild(style);
  }

  // Wrap renderHistory after the original/admin plugin has installed its handler.
  const originalRenderHistory = window.renderHistory;
  if (typeof originalRenderHistory === "function") {
    window.renderHistory = async function () {
      const result = await originalRenderHistory.apply(this, arguments);
      await decorateHistoryPhotos();
      return result;
    };
  }

  // The global function is replaceable in classic script mode; scheduleAutoSync will
  // resolve the updated global binding. Other call sites and options stay compatible.
  window.syncPendingVisits = syncPendingVisitsPhotoAware;

  // Admin delete button from the legacy photo extension should use the new photo table
  // only when it refers to a lazily loaded photo.
  window.loadHistoryPhoto = loadHistoryPhoto;
  window.RML_PHOTO_HISTORY_MODE = "on-demand-v1";

  addCss();
  document.addEventListener("DOMContentLoaded", addCss);
})();
