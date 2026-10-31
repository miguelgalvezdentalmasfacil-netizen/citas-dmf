// Dental Más Fácil - WhatsApp Web Extension v4.0.1
// MODO MANUAL: Botón "➕ Registrar Lead" en el header del chat
(() => {
  const VERSION = '4.0.1';
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';
  const ASSIGNED_ADVISOR = 'Miguel';

  const capturedPhonesCache = new Set();
  const savingInProgress = new Set();

  console.log(`[DMF v${VERSION}] Cargado. Botón manual activo.`);

  // ─── 1. Limpiar teléfonos ──────────────────────────────────────────────────
  function cleanPhoneNumber(str) {
    if (!str) return null;
    const s = String(str).replace(/[\u200e\u200f\u202a-\u202e\u202f\u00a0]/g, ' ').trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length < 10) return null;
    if (s.replace(/[^a-zA-Z]/g, '').length > 3) return null;
    let clean = digits;
    if (clean.startsWith('521') && clean.length === 13) clean = clean.slice(3);
    else if (clean.startsWith('52') && clean.length === 12) clean = clean.slice(2);
    else if (clean.startsWith('1') && clean.length === 11) clean = clean.slice(1);
    return clean.length === 10 ? clean : null;
  }

  // ─── 2. Cargar teléfonos existentes de Supabase ───────────────────────────
  async function syncExistingPhonesFromDB() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/citas?select=telefono`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      if (res.ok) {
        const rows = await res.json();
        rows.forEach(r => {
          const c = r.telefono ? cleanPhoneNumber(String(r.telefono)) : null;
          if (c) capturedPhonesCache.add(c);
        });
        console.log(`[DMF v${VERSION}] ${capturedPhonesCache.size} teléfonos en caché.`);
      }
    } catch (e) { console.warn('[DMF] Error sync:', e); }
  }
  syncExistingPhonesFromDB();

  // ─── 3. Guardar lead en Supabase ──────────────────────────────────────────
  async function saveLeadDirectly(cleanPhone, snippet) {
    if (!cleanPhone || cleanPhone.length < 10) return false;
    if (savingInProgress.has(cleanPhone)) return false;
    if (capturedPhonesCache.has(cleanPhone)) return false;

    savingInProgress.add(cleanPhone);
    capturedPhonesCache.add(cleanPhone);

    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 5);
    const leadId = 'c_' + cleanPhone + '_' + fecha;

    const record = {
      id: leadId,
      asesor_id: ASSIGNED_ADVISOR,
      fecha, hora,
      paciente: cleanPhone,
      telefono: cleanPhone,
      sucursal: '', tratamiento: '',
      tipo: 'Lead WhatsApp',
      origen: 'Meta Ads',
      notas: (snippet || 'Lead registrado manualmente').slice(0, 300),
      estatus: 'Lead',
      creado_el: now.toISOString(),
      creado_por: ASSIGNED_ADVISOR
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/citas`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(record)
      });

      if (res.ok) {
        console.log(`[DMF v${VERSION}] ✅ Lead guardado: ${cleanPhone}`);
        savingInProgress.delete(cleanPhone);
        return true;
      } else {
        console.warn(`[DMF v${VERSION}] Error Supabase: ${res.status}`);
        capturedPhonesCache.delete(cleanPhone);
      }
    } catch (e) {
      console.error(`[DMF v${VERSION}] Error:`, e);
      capturedPhonesCache.delete(cleanPhone);
    }
    savingInProgress.delete(cleanPhone);
    return false;
  }

  // ─── 4. Renderizar botón/badge en el header del chat ──────────────────────
  function renderHeaderUI(phone, isRegistered) {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) {
      document.getElementById('dmf-header-ui')?.remove();
      return;
    }

    let ui = document.getElementById('dmf-header-ui');
    if (!ui) {
      ui = document.createElement('div');
      ui.id = 'dmf-header-ui';
      ui.style.cssText = 'display:inline-flex;align-items:center;margin-left:12px;flex-shrink:0;';
      mainHeader.appendChild(ui);
    }

    if (!phone) {
      ui.innerHTML = '';
      return;
    }

    if (isRegistered) {
      // Círculo verde: ya registrado
      ui.innerHTML = `
        <div title="Lead registrado en DMF" style="
          width:14px;height:14px;border-radius:50%;
          background:#10b981;cursor:default;flex-shrink:0;
          box-shadow:0 0 0 2px rgba(16,185,129,.25);">
        </div>`;
    } else {
      // Círculo gris clicable: registrar
      ui.innerHTML = `
        <div id="dmf-register-btn" title="Clic para registrar como Lead" style="
          width:14px;height:14px;border-radius:50%;
          background:#9ca3af;cursor:pointer;flex-shrink:0;
          transition:background .2s;box-shadow:0 0 0 2px rgba(156,163,175,.25);">
        </div>`;

      document.getElementById('dmf-register-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dot = document.getElementById('dmf-register-btn');
        if (dot) { dot.style.background = '#f59e0b'; dot.style.cursor = 'wait'; } // Amarillo = guardando

        const firstIn = document.querySelector('#main .message-in');
        const snippet = firstIn ? (firstIn.textContent || '').slice(0, 250) : 'Lead registrado manualmente';

        const ok = await saveLeadDirectly(phone, snippet);
        if (ok || capturedPhonesCache.has(phone)) {
          renderHeaderUI(phone, true);
        } else {
          if (dot) { dot.style.background = '#ef4444'; dot.style.cursor = 'pointer'; } // Rojo = error
        }
      });
    }
  }

  // ─── 5. Actualizar UI al cambiar de chat ──────────────────────────────────
  let currentPhone = null;

  function updateChatUI() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) {
      document.getElementById('dmf-header-ui')?.remove();
      currentPhone = null;
      return;
    }

    const titleSpan = mainHeader.querySelector('span[title], span[dir="auto"]');
    const rawTitle = (titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent || '') : '').trim();
    const phone = cleanPhoneNumber(rawTitle);

    if (!phone) {
      renderHeaderUI(null, false);
      currentPhone = null;
      return;
    }

    // Mismo chat que antes → no re-renderizar
    if (phone === currentPhone) return;
    currentPhone = phone;

    const isRegistered = capturedPhonesCache.has(phone);
    renderHeaderUI(phone, isRegistered);
  }

  // ─── 6. Monitoreo del chat abierto (ligero, solo actualiza el botón) ───────
  // Corre cada 1s para detectar cambios de chat
  setInterval(updateChatUI, 1000);

  // También al hacer clic en la bandeja
  document.addEventListener('click', (e) => {
    const row = e.target?.closest?.('[role="row"], [data-testid="cell-frame-container"]');
    if (row?.closest('#pane-side')) {
      setTimeout(updateChatUI, 700);
    }
  }, { passive: true });

  // ─── 7. Botón manual del popup (escaneo de bandeja) ──────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'dmf_scan_now') {
      updateChatUI();
      sendResponse({ ok: true, count: capturedPhonesCache.size, newCount: 0 });
      return true;
    }
  });

  console.log(`[DMF v${VERSION}] Listo. Botón "➕ Registrar Lead" activo en cada chat.`);
})();
