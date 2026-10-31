// Dental Más Fácil - WhatsApp Web Extension v3.6.1
// CAMBIO CLAVE: Solo analiza mensajes ENTRANTES (.message-in), ignora mensajes salientes del bot
(() => {
  const VERSION = '3.6.1';
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';
  const ASSIGNED_ADVISOR = 'Miguel';

  const capturedPhonesCache = new Set();
  const savingInProgress = new Set();
  let lastCheckedPhone = null;

  console.log(`[DMF v${VERSION}] Cargado. Solo captura mensajes ENTRANTES de Meta Ads.`);

  // ─── 1. Limpiar teléfonos ──────────────────────────────────────────────────
  function cleanPhoneNumber(str) {
    if (!str) return null;
    const s = String(str).replace(/[\u200e\u200f\u202a-\u202e\u202f\u00a0]/g, ' ').trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length < 10) return null;
    if (s.replace(/[^a-zA-Z]/g, '').length > 3) return null; // Es nombre, no número

    let clean = digits;
    if (clean.startsWith('521') && clean.length === 13) clean = clean.slice(3);
    else if (clean.startsWith('52') && clean.length === 12) clean = clean.slice(2);
    else if (clean.startsWith('1') && clean.length === 11) clean = clean.slice(1);
    return clean.length === 10 ? clean : null;
  }

  // ─── 2. Cargar todos los teléfonos de Supabase al iniciar ─────────────────
  async function syncExistingPhonesFromDB() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/citas?select=telefono`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      if (res.ok) {
        const rows = await res.json();
        rows.forEach(r => {
          const clean = r.telefono ? cleanPhoneNumber(String(r.telefono)) : null;
          if (clean) capturedPhonesCache.add(clean);
        });
        console.log(`[DMF v${VERSION}] ${capturedPhonesCache.size} teléfonos en caché.`);
      }
    } catch (e) { console.warn('[DMF] Error sync:', e); }
  }
  syncExistingPhonesFromDB();

  // ─── 3. Señales EXCLUSIVAS de Meta Ads (solo en mensajes ENTRANTES) ────────
  // REMOVIDO: mensajes del bot saliente ("asesor dental", "saludamos de dental", etc.)
  // SOLO frases que escribe el PROSPECTO al llegar de un anuncio
  const META_ADS_INCOMING_KEYWORDS = [
    'quiero más información',
    'quiero mas informacion',
    'quiero más inf',
    'quiero mas inf',
    'me gustaría conseguir más información',
    'me gustaria conseguir mas informacion',
    'me gustaría más información',
    'me gustaria mas informacion',
    'vi su anuncio',
    'vi este anuncio',
    'vi en facebook',
    'vi esto en facebook',
    'vi en instagram',
    'anuncio de facebook',
    'anuncio de instagram',
    'fb.me',
    'soluciones dentales',
    'recupera tus piezas',
    'facilidades de pago'
  ];

  // Señales de ícono Meta Ads en el HTML (las más confiables)
  const META_ADS_HTML_SIGNALS = [
    'logo-facebook',
    'wds-ic-logo-facebook-fill',
    'logo-instagram',
    'forward-ad',
    'ad-bubble'
  ];

  // Verificar si elementos ENTRANTES del chat son de Meta Ads
  function incomingMessagesAreMetaAd(incomingElements) {
    if (!incomingElements || incomingElements.length === 0) return false;

    for (const el of incomingElements) {
      const html = (el.innerHTML || '').toLowerCase();
      const text = (el.textContent || '').toLowerCase();

      // Ícono de Meta Ads (lo más confiable — solo aparece en mensajes de anuncios)
      if (META_ADS_HTML_SIGNALS.some(sig => html.includes(sig))) return true;

      // Frases específicas del prospecto
      if (META_ADS_INCOMING_KEYWORDS.some(kw => text.includes(kw))) return true;
    }
    return false;
  }

  // ─── 4. Verificar si el chat abierto tiene mensajes de HOY ────────────────
  function chatIsFromToday() {
    // Método A: separador de fecha "Hoy" / "Today"
    const dateSeps = document.querySelectorAll('#main [data-testid="msg-dateseparator"]');
    if (dateSeps.length > 0) {
      for (const sep of dateSeps) {
        const t = (sep.textContent || '').toLowerCase().trim();
        if (t === 'hoy' || t === 'today') return true;
      }
      return false; // Hay separadores pero ninguno es "Hoy"
    }

    // Método B: data-pre-plain-text con fecha de hoy
    const now = new Date();
    const todayFmt = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    const msgs = document.querySelectorAll('#main .copyable-text[data-pre-plain-text]');
    if (msgs.length > 0) {
      return Array.from(msgs).slice(-3).some(m =>
        (m.getAttribute('data-pre-plain-text') || '').includes(todayFmt)
      );
    }
    // Método C: chat muy nuevo (≤3 mensajes total) sin separador aún
    // Un lead recién llegado puede no tener separador "Hoy" todavía
    const totalMsgs = document.querySelectorAll('#main .message-in, #main .message-out');
    if (totalMsgs.length > 0 && totalMsgs.length <= 5) {
      return true; // Chat muy corto → asumir que es de hoy
    }
    return false; // Sin info de fecha y chat largo → no registrar
  }

  // ─── 5. Guardar lead en Supabase ──────────────────────────────────────────
  async function saveLeadDirectly(cleanPhone, snippet) {
    if (!cleanPhone || cleanPhone.length < 10) return false;
    if (savingInProgress.has(cleanPhone)) return false;
    if (capturedPhonesCache.has(cleanPhone)) return false;

    savingInProgress.add(cleanPhone);
    capturedPhonesCache.add(cleanPhone);

    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 5);
    // ID = telefono + fecha: mismo teléfono el mismo día siempre da el mismo ID → no duplicados
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
      notas: (snippet || 'Lead Meta Ads WhatsApp').slice(0, 300),
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
        console.warn(`[DMF v${VERSION}] Supabase status ${res.status}`);
        capturedPhonesCache.delete(cleanPhone);
      }
    } catch (e) {
      console.error(`[DMF v${VERSION}] Error:`, e);
      capturedPhonesCache.delete(cleanPhone);
    }

    savingInProgress.delete(cleanPhone);
    return false;
  }

  // ─── 6. Revisar chat ABIERTO (solo al hacer clic en un chat) ──────────────
  async function checkOpenChat() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) {
      document.getElementById('dmf-header-badge')?.remove();
      lastCheckedPhone = null;
      return;
    }

    const titleSpan = mainHeader.querySelector('span[title], span[dir="auto"]');
    const rawTitle = (titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent || '') : '').trim();
    const phone = cleanPhoneNumber(rawTitle);

    if (!phone) { updateHeaderBadge(null, false); return; }

    // Ya registrado → solo mostrar badge
    if (capturedPhonesCache.has(phone)) {
      updateHeaderBadge(phone, true);
      return;
    }

    // (Reintento permitido: el usuario puede hacer clic de nuevo para forzar verificación)

    // ¿Tiene mensajes de HOY?
    if (!chatIsFromToday()) {
      updateHeaderBadge(phone, false);
      return;
    }

    // ─── CLAVE: Solo revisar mensajes ENTRANTES (.message-in) ───────────────
    // Los mensajes salientes (.message-out) son del bot y NO deben activar el registro
    const incomingMsgs = Array.from(document.querySelectorAll('#main .message-in'));

    if (incomingMsgs.length === 0) {
      // Sin mensajes entrantes → no es un lead
      updateHeaderBadge(phone, false);
      return;
    }

    if (incomingMessagesAreMetaAd(incomingMsgs)) {
      console.log(`[DMF v${VERSION}] Lead Meta Ads detectado:`, phone);
      const snippet = incomingMsgs[0] ? (incomingMsgs[0].textContent || '').slice(0, 250) : 'Lead Meta Ads';
      const ok = await saveLeadDirectly(phone, snippet);
      updateHeaderBadge(phone, ok || capturedPhonesCache.has(phone));
    } else {
      updateHeaderBadge(phone, false);
    }
  }

  // ─── 7. Badge en header del chat ──────────────────────────────────────────
  function updateHeaderBadge(phone, isRegistered) {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader || !phone) {
      document.getElementById('dmf-header-badge')?.remove();
      return;
    }
    let badge = document.getElementById('dmf-header-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'dmf-header-badge';
      badge.style.cssText = 'display:inline-flex;align-items:center;margin-left:14px;';
      mainHeader.appendChild(badge);
    }
    badge.innerHTML = isRegistered
      ? `<span style="font-size:12px;color:#10b981;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);user-select:none">✓ Lead en DMF</span>`
      : '';
  }

  // ─── 8. Escaneo MANUAL de bandeja (solo botón popup) ──────────────────────
  function getRowTimestampText(row) {
    if (!row) return '';
    const leaves = Array.from(row.querySelectorAll('span, div')).filter(el => {
      const t = (el.textContent || '').trim();
      return t.length > 0 && t.length <= 15 && el.children.length === 0;
    });
    for (const el of leaves) {
      const t = el.textContent.trim().toLowerCase();
      if (/^\d{1,2}:\d{2}$/.test(t) || t === 'ayer' || t === 'yesterday' ||
          /^\d{1,2}\/\d{1,2}/.test(t) || t === 'ahora' || t === 'just now' ||
          /^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)$/.test(t)) {
        return t;
      }
    }
    return '';
  }

  function extractPhoneFromRow(row) {
    if (!row) return null;
    const titleEl = row.querySelector('div[data-testid="cell-frame-title"] span, span[title], span[dir="auto"]');
    if (titleEl) return cleanPhoneNumber(titleEl.getAttribute('title') || titleEl.textContent || '');
    return null;
  }

  async function scanSidebarChats() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (!chatRows || chatRows.length === 0) return 0;

    let count = 0;
    for (const row of Array.from(chatRows).slice(0, 10)) {
      const phone = extractPhoneFromRow(row);
      if (!phone || capturedPhonesCache.has(phone)) continue;

      // Solo chats con hora HH:MM (de hoy)
      const ts = getRowTimestampText(row);
      if (!ts || !/^\d{1,2}:\d{2}$/.test(ts) && ts !== 'ahora') continue;

      // Solo si el snippet de la fila tiene señal de Meta Ads
      const rowEl = row.querySelector('div[data-testid="last-msg-status"] ~ span, span[dir="ltr"]');
      const rowText = (rowEl ? rowEl.textContent : row.textContent) || '';
      const rowHtml = row.innerHTML || '';
      const hasIcon = META_ADS_HTML_SIGNALS.some(s => rowHtml.toLowerCase().includes(s));
      const hasKw = META_ADS_INCOMING_KEYWORDS.some(kw => rowText.toLowerCase().includes(kw));
      if (!hasIcon && !hasKw) continue;

      const ok = await saveLeadDirectly(phone, rowText);
      if (ok) count++;
    }
    return count;
  }

  // ─── 9. Disparar solo en clic real en un chat ─────────────────────────────
  let clickTimeout = null;
  document.addEventListener('click', (e) => {
    const row = e.target?.closest?.('[role="row"], [data-testid="cell-frame-container"]');
    if (row?.closest('#pane-side')) {
      if (clickTimeout) clearTimeout(clickTimeout);
      // Esperar 800ms para que WhatsApp cargue los mensajes del chat
      clickTimeout = setTimeout(checkOpenChat, 800);
    }
  }, { passive: true });

  // ─── 10. Botón manual del popup ───────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === 'dmf_scan_now') {
      scanSidebarChats().then(count => {
        checkOpenChat();
        sendResponse({ ok: true, count: capturedPhonesCache.size, newCount: count });
      });
      return true;
    }
  });

  console.log(`[DMF v${VERSION}] Listo. Captura solo mensajes entrantes de Meta Ads.`);
})();
