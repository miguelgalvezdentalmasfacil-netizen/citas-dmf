// Dental Más Fácil - WhatsApp Web Extension v3.5.0 (CAPTURA CONSERVADORA - SOLO LEADS REALES)
(() => {
  const VERSION = '3.5.0';
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';

  const ASSIGNED_ADVISOR = 'Miguel';
  const capturedPhonesCache = new Set();
  const savingInProgress = new Set();
  let lastCheckedPhone = null; // Para no re-verificar el mismo chat en cada tick

  console.log(`[DMF v${VERSION}] Extensión conectada. Modo conservador activo.`);

  // ─── 1. Limpiador de teléfonos ────────────────────────────────────────────
  function cleanPhoneNumber(str) {
    if (!str) return null;
    const s = String(str).replace(/[\u200e\u200f\u202a-\u202e\u202f\u00a0]/g, ' ').trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length < 10) return null;
    const letters = s.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 3) return null; // Es un nombre guardado, no número

    let clean = digits;
    if (clean.startsWith('521') && clean.length === 13) clean = clean.slice(3);
    else if (clean.startsWith('52') && clean.length === 12) clean = clean.slice(2);
    else if (clean.startsWith('1') && clean.length === 11) clean = clean.slice(1);

    return clean.length === 10 ? clean : null;
  }

  // ─── 2. Sincronizar teléfonos ya guardados en Supabase ───────────────────
  async function syncExistingPhonesFromDB() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/citas?select=telefono`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      if (res.ok) {
        const rows = await res.json();
        rows.forEach(r => {
          if (r.telefono) {
            const clean = cleanPhoneNumber(String(r.telefono));
            if (clean) capturedPhonesCache.add(clean);
          }
        });
        console.log(`[DMF v${VERSION}] ${capturedPhonesCache.size} teléfonos sincronizados desde Supabase.`);
      }
    } catch (e) {
      console.warn('[DMF] Error sincronizando:', e);
    }
  }
  syncExistingPhonesFromDB();

  // ─── 3. Keywords MUY ESPECÍFICAS de Meta Ads ─────────────────────────────
  // SOLO frases que ÚNICAMENTE aparecen en mensajes de anuncios de Meta/Facebook
  // NO palabras genéricas como "información", "precio", "costo"
  const META_ADS_KEYWORDS = [
    // Frases del prospecto que viene de un anuncio
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
    'facilidades de pago',
    // Mensajes exclusivos del bot de bienvenida de Dental Más Fácil
    'saludamos de dental',
    'bienvenido a dental',
    'hola! le saludamos',
    '¡hola! le saludamos',
    'asesor dental'
    // REMOVIDOS por ser demasiado genéricos:
    // 'información', 'informacion', 'precio', 'precios', 'costo', 'costos',
    // 'me interesa', 'más información', 'facebook', 'instagram'
  ];

  // Detectar si un chat es lead real de Meta Ads
  function isMetaAdOrLead(container, text = '') {
    const html = (container ? container.innerHTML : '').toLowerCase();

    // Iconos ESPECÍFICOS de anuncio de Meta en el HTML (los más confiables)
    if (html.includes('logo-facebook') ||
        html.includes('wds-ic-logo-facebook-fill') ||
        html.includes('logo-instagram') ||
        html.includes('forward-ad') ||
        html.includes('ad-bubble')) {
      return true;
    }
    if (container && container.querySelector) {
      if (container.querySelector('[data-icon*="facebook"], [data-icon*="instagram"], [data-testid*="ad-"]')) {
        return true;
      }
    }

    // Solo frases muy específicas de Meta Ads
    const t = (text || (container ? container.textContent : '') || '').toLowerCase();
    return META_ADS_KEYWORDS.some(kw => t.includes(kw));
  }

  // ─── 4. Verificar si un chat abierto tiene mensajes de HOY ───────────────
  function chatIsFromToday() {
    // Método A: separadores de fecha de WhatsApp ("Hoy" / "Today")
    const dateSeps = document.querySelectorAll('#main [data-testid="msg-dateseparator"]');
    if (dateSeps.length > 0) {
      for (const sep of dateSeps) {
        const t = (sep.textContent || '').toLowerCase().trim();
        if (t === 'hoy' || t === 'today') return true;
      }
      // Hay separadores pero ninguno es "Hoy" → chat de otro día
      return false;
    }

    // Método B: data-pre-plain-text contiene la fecha de hoy
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const todayFmt = `${dd}/${mm}/${yyyy}`;

    const msgs = document.querySelectorAll('#main .copyable-text[data-pre-plain-text]');
    if (msgs.length > 0) {
      // Revisar los últimos 3 mensajes para mayor seguridad
      const recent = Array.from(msgs).slice(-3);
      return recent.some(m => (m.getAttribute('data-pre-plain-text') || '').includes(todayFmt));
    }

    // Sin info de fecha disponible → NO registrar
    return false;
  }

  // ─── 5. Guardar lead en Supabase ─────────────────────────────────────────
  async function saveLeadDirectly(cleanPhone, snippet) {
    if (!cleanPhone || cleanPhone.length < 10) return false;
    if (savingInProgress.has(cleanPhone)) return false;
    if (capturedPhonesCache.has(cleanPhone)) return false;

    savingInProgress.add(cleanPhone);
    capturedPhonesCache.add(cleanPhone);

    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 5);
    const leadId = 'c_' + cleanPhone + '_' + fecha + '_' + hora.replace(':', '');

    const record = {
      id: leadId,
      asesor_id: ASSIGNED_ADVISOR,
      fecha: fecha,
      hora: hora,
      paciente: cleanPhone,
      telefono: cleanPhone,
      sucursal: '',
      tratamiento: '',
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
        console.log(`[DMF v${VERSION}] ✅ LEAD GUARDADO: ${cleanPhone}`);
        updateHeaderBadge(phone, true);
        savingInProgress.delete(cleanPhone);
        return true;
      } else {
        console.warn(`[DMF v${VERSION}] Supabase status ${res.status}`);
        capturedPhonesCache.delete(cleanPhone); // revertir cache si falló
      }
    } catch (e) {
      console.error(`[DMF v${VERSION}] Error:`, e);
      capturedPhonesCache.delete(cleanPhone);
    }

    savingInProgress.delete(cleanPhone);
    return false;
  }

  // ─── 6. Escaneo MANUAL de bandeja (solo botón popup) ─────────────────────
  async function scanSidebarChats() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (!chatRows || chatRows.length === 0) return 0;

    let registeredCount = 0;
    // Solo revisar los primeros 10 chats visibles
    const topChats = Array.from(chatRows).slice(0, 10);

    for (const row of topChats) {
      const phone = extractPhoneFromRow(row);
      if (!phone) continue;
      if (capturedPhonesCache.has(phone)) continue;

      // Verificar timestamp: SOLO aceptar si hay HH:MM de hoy ("ahora" o "##:##")
      const timeStr = getRowTimestampText(row);
      if (!timeStr) continue; // Sin hora visible = descartar
      const isToday = /^\d{1,2}:\d{2}$/.test(timeStr) || timeStr === 'ahora' || timeStr === 'just now';
      if (!isToday) continue; // Ayer, fecha, lunes, etc. = descartar

      // Verificar keywords Meta Ads
      const rowText = row.textContent || '';
      if (!isMetaAdOrLead(row, rowText)) continue;

      console.log(`[DMF v${VERSION}] Lead en bandeja:`, phone);
      const ok = await saveLeadDirectly(phone, rowText);
      if (ok) registeredCount++;
    }

    return registeredCount;
  }

  function extractPhoneFromRow(row) {
    if (!row) return null;
    const titleEl = row.querySelector('div[data-testid="cell-frame-title"] span, span[title], span[dir="auto"]');
    if (titleEl) {
      const rawTitle = titleEl.getAttribute('title') || titleEl.textContent || '';
      return cleanPhoneNumber(rawTitle);
    }
    return null;
  }

  function getRowTimestampText(row) {
    if (!row) return '';
    const smallLeaves = Array.from(row.querySelectorAll('span, div')).filter(el => {
      const t = (el.textContent || '').trim();
      return t.length > 0 && t.length <= 15 && el.children.length === 0;
    });
    for (const el of smallLeaves) {
      const t = el.textContent.trim().toLowerCase();
      if (/^\d{1,2}:\d{2}$/.test(t) || t === 'ayer' || t === 'yesterday' ||
          /^\d{1,2}\/\d{1,2}/.test(t) || t === 'ahora' || t === 'just now' ||
          /^(lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/.test(t)) {
        return t;
      }
    }
    return '';
  }

  // ─── 7. Verificar chat ABIERTO (solo al hacer clic, no en intervalo) ─────
  let lastOpenPhone = null;
  let lastOpenRegistered = false;

  async function checkOpenChat() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) {
      const badge = document.getElementById('dmf-header-badge');
      if (badge) badge.remove();
      lastOpenPhone = null;
      return;
    }

    const titleSpan = mainHeader.querySelector('span[title], span[dir="auto"]');
    const rawTitle = (titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent || '') : '').trim();
    const phone = cleanPhoneNumber(rawTitle);

    if (!phone) {
      updateHeaderBadge(null, false);
      lastOpenPhone = null;
      return;
    }

    // Si ya revisamos este teléfono y lo registramos, solo mostrar badge
    if (capturedPhonesCache.has(phone)) {
      updateHeaderBadge(phone, true);
      return;
    }

    // Si es el mismo chat que ya revisamos y no era lead, no volver a intentar
    if (phone === lastOpenPhone && !lastOpenRegistered) {
      updateHeaderBadge(phone, false);
      return;
    }

    lastOpenPhone = phone;
    lastOpenRegistered = false;

    const mainEl = document.querySelector('#main');
    if (!mainEl) return;

    // PRIMERO: ¿tiene mensajes de HOY?
    if (!chatIsFromToday()) {
      updateHeaderBadge(phone, false);
      return;
    }

    // SEGUNDO: ¿tiene keywords de Meta Ads?
    const mainText = (mainEl.textContent || '').toLowerCase();
    if (isMetaAdOrLead(mainEl, mainText)) {
      console.log(`[DMF v${VERSION}] Lead Meta Ads detectado:`, phone);
      const firstIn = document.querySelector('#main .message-in, #main div[data-testid="msg-container"]');
      const snippet = firstIn ? (firstIn.textContent || '').slice(0, 250) : 'Lead Meta Ads';
      const ok = await saveLeadDirectly(phone, snippet);
      lastOpenRegistered = ok;
      updateHeaderBadge(phone, ok || capturedPhonesCache.has(phone));
    } else {
      updateHeaderBadge(phone, false);
    }
  }

  // ─── 8. Badge en header ───────────────────────────────────────────────────
  function updateHeaderBadge(phone, isRegistered) {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader || !phone) {
      const existing = document.getElementById('dmf-header-badge');
      if (existing) existing.remove();
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

  // ─── 9. Solo disparar checkOpenChat al hacer CLIC en un chat ─────────────
  // NO hay setInterval con checkOpenChat — evita capturas falsas en scroll
  let clickTimeout = null;
  document.addEventListener('click', (e) => {
    const row = e.target && e.target.closest && e.target.closest('[role="row"], [data-testid="cell-frame-container"]');
    if (row && row.closest('#pane-side')) {
      if (clickTimeout) clearTimeout(clickTimeout);
      // Esperar 600ms para que WhatsApp cargue el chat antes de analizar
      clickTimeout = setTimeout(checkOpenChat, 600);
    }
  }, { passive: true });

  // ─── 10. Botón manual del popup ───────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'dmf_scan_now') {
      scanSidebarChats().then(count => {
        checkOpenChat();
        sendResponse({ ok: true, count: capturedPhonesCache.size, newCount: count });
      });
      return true;
    }
  });

  console.log(`[DMF v${VERSION}] Listo. Solo captura al hacer clic en un chat nuevo de HOY con anuncio de Meta.`);
})();
