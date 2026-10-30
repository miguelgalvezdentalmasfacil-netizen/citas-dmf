// Dental Más Fácil - WhatsApp Web Extension v3.3.2 (AUTO-CAPTURA INTELIGENTE DE ANUNCIOS META ADS)
(() => {
  const VERSION = '3.3.2';
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';

  const ASSIGNED_ADVISOR = 'Miguel';
  const capturedPhonesCache = new Set();
  const savingInProgress = new Set();

  console.log(`[DMF v${VERSION}] Extensión conectada. Auto-captura activa en segundo plano.`);

  // 1. Limpiador y normalizador de teléfonos (10 dígitos limpios)
  function cleanPhoneNumber(str) {
    if (!str) return null;
    const s = String(str).replace(/[\u200e\u200f\u202a-\u202e\u202f\u00a0]/g, ' ').trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length < 10) return null;

    // Si tiene más de 3 letras, es un nombre guardado de contacto (ej. "Carlos Perez"), no un prospecto nuevo
    const letters = s.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 3) return null;

    let clean = digits;
    if (clean.startsWith('521') && clean.length === 13) clean = clean.slice(3);
    else if (clean.startsWith('52') && clean.length === 12) clean = clean.slice(2);
    else if (clean.startsWith('1') && clean.length === 11) clean = clean.slice(1);

    if (clean.length === 10) {
      return clean;
    }
    return null;
  }

  // 2. Extraer teléfono de una fila de la bandeja (#pane-side)
  function extractPhoneFromRow(row) {
    if (!row) return null;
    const titleEl = row.querySelector('div[data-testid="cell-frame-title"] span, span[title], span[dir="auto"]');
    if (titleEl) {
      const rawTitle = titleEl.getAttribute('title') || titleEl.textContent || '';
      const clean = cleanPhoneNumber(rawTitle);
      if (clean) return clean;
    }
    return null;
  }

  // 3. Sincronizar todos los teléfonos existentes en Supabase a memoria
  async function syncExistingPhonesFromDB() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/citas?select=telefono`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        rows.forEach(r => {
          if (r.telefono) {
            const clean = cleanPhoneNumber(String(r.telefono));
            if (clean) {
              capturedPhonesCache.add(clean);
            }
          }
        });
        console.log(`[DMF v${VERSION}] Sincronizados ${capturedPhonesCache.size} teléfonos registrados desde Supabase.`);
      }
    } catch (e) {
      console.warn('[DMF] Error sincronizando con Supabase:', e);
    }
  }
  syncExistingPhonesFromDB();

  // Palabras clave de Meta Ads (tanto del prospecto como del bot de bienvenida)
  const AD_AND_BOT_KEYWORDS = [
    'quiero más información',
    'quiero mas informacion',
    'quiero más inf',
    'quiero mas inf',
    'más información',
    'mas informacion',
    'me gustaría conseguir más información',
    'me gustaria conseguir mas informacion',
    'me gustaría más información',
    'me gustaria mas informacion',
    'soluciones dentales',
    'recupera tus piezas',
    'facilidades de pago',
    'vi su anuncio',
    'vi este anuncio',
    'vi en facebook',
    'vi esto en facebook',
    'vi en instagram',
    'anuncio de facebook',
    'anuncio de instagram',
    'facebook',
    'instagram',
    'fb.me',
    'información sobre',
    'informacion sobre',
    'informes sobre',
    'información',
    'informacion',
    'informes',
    'me interesa',
    'precio',
    'precios',
    'costo',
    'costos',
    // Mensajes del bot automático de bienvenida de Dental Más Fácil
    'dental más fácil',
    'dental mas facil',
    'dental + fácil',
    'saludamos de dental',
    'bienvenido a dental',
    'hola! le saludamos',
    '¡hola! le saludamos',
    'asesor dental'
  ];

  // Comprobar si el contenido corresponde a un anuncio o lead publicitario
  function isMetaAdOrLead(container, text = '') {
    const t = (text || (container ? container.textContent : '') || '').toLowerCase();
    const html = (container ? container.innerHTML : '').toLowerCase();

    // Iconos de anuncio de Facebook / Meta
    if (html.includes('logo-facebook') ||
        html.includes('wds-ic-logo-facebook-fill') ||
        html.includes('logo-instagram') ||
        html.includes('forward-ad') ||
        html.includes('ad-bubble') ||
        html.includes('facebook') ||
        html.includes('instagram')) {
      return true;
    }

    if (container && container.querySelector) {
      if (container.querySelector('[data-icon*="facebook"], [data-icon*="instagram"], [data-testid*="facebook"], [data-testid*="instagram"]')) {
        return true;
      }
    }

    // Texto de anuncio o respuesta del bot
    return AD_AND_BOT_KEYWORDS.some(kw => t.includes(kw));
  }

  // Extraer el texto exclusivo de la hora de la fila de WhatsApp Web
  function getRowTimestampText(row) {
    if (!row) return '';
    const smallLeaves = Array.from(row.querySelectorAll('span, div')).filter(el => {
      const t = (el.textContent || '').trim();
      return t.length > 0 && t.length <= 15 && el.children.length === 0;
    });

    for (const el of smallLeaves) {
      const t = el.textContent.trim().toLowerCase();
      if (/:\d{2}/.test(t) || t === 'ayer' || t === 'yesterday' || /\d{1,2}\/\d{1,2}/.test(t) || t === 'ahora') {
        return t;
      }
    }
    return '';
  }

  // Comprobar si una fila en la bandeja es de HOY
  function isRowFromToday(row) {
    const timeStr = getRowTimestampText(row);
    if (!timeStr) return false; // Sin timestamp claro, descartar por seguridad
    if (timeStr.includes('ayer') || timeStr.includes('yesterday') || /\d{1,2}\/\d{1,2}/.test(timeStr)) {
      return false; // Es de ayer o fecha anterior
    }
    return /:\d{2}/.test(timeStr) || timeStr.includes('ahora') || timeStr.includes('just now');
  }

  // Guardar lead directamente en Supabase
  async function saveLeadDirectly(cleanPhone, snippet) {
    if (!cleanPhone || cleanPhone.length < 10) return false;
    if (savingInProgress.has(cleanPhone)) return false;

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
        console.log(`[DMF v${VERSION}] 🔥 ¡LEAD REGISTRADO CON ÉXITO EN SUPABASE!: ${cleanPhone}`);
        updateHeaderBadge(cleanPhone, true);
        savingInProgress.delete(cleanPhone);
        return true;
      } else {
        console.warn(`[DMF v${VERSION}] Supabase respondió status ${res.status}`);
      }
    } catch (e) {
      console.error(`[DMF v${VERSION}] Error guardando lead en Supabase:`, e);
    }

    savingInProgress.delete(cleanPhone);
    return false;
  }

  // MODO 1: Auto-captura en la bandeja lateral (#pane-side)
  async function scanSidebarChats() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (!chatRows || chatRows.length === 0) return 0;

    let registeredCount = 0;
    const topChats = Array.from(chatRows).slice(0, 15);

    for (const row of topChats) {
      const phone = extractPhoneFromRow(row);
      if (!phone) continue;

      // Si ya está registrado en Supabase, omitir
      if (capturedPhonesCache.has(phone)) continue;

      // Verificar que sea de hoy
      if (!isRowFromToday(row)) continue;

      // Verificar si es de anuncio o trae saludo del bot
      const rowText = row.textContent || '';
      if (!isMetaAdOrLead(row, rowText)) continue;

      // ¡CUMPLE TODO! Auto-registrar
      console.log(`[DMF v${VERSION}] Lead de anuncio detectado en bandeja:`, phone);
      const ok = await saveLeadDirectly(phone, rowText);
      if (ok) registeredCount++;
    }

    return registeredCount;
  }

  // MODO 2: Auto-captura al abrir cualquier chat (#main)
  async function checkOpenChat() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) {
      const badge = document.getElementById('dmf-header-badge');
      if (badge) badge.remove();
      return;
    }

    const titleSpan = mainHeader.querySelector('span[title], span[dir="auto"]');
    const rawTitle = (titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent || '') : '').trim();
    const phone = cleanPhoneNumber(rawTitle);

    if (!phone) {
      updateHeaderBadge(null, false);
      return;
    }

    // Si ya está registrado en Supabase: mostrar insignia verde
    if (capturedPhonesCache.has(phone)) {
      updateHeaderBadge(phone, true);
      return;
    }

    const mainEl = document.querySelector('#main');
    if (!mainEl) return;

    // Verificar si el chat tiene mensajes de HOY
    // 1. Buscar separadores de fecha de WhatsApp ("Hoy" / "Today")
    const dateSeps = document.querySelectorAll('#main [data-testid="msg-dateseparator"]');
    let hasToday = false;
    let hasSeps = dateSeps.length > 0;
    for (const sep of dateSeps) {
      const t = (sep.textContent || '').toLowerCase().trim();
      if (t === 'hoy' || t === 'today') { hasToday = true; break; }
    }
    // 2. Si hay separadores pero ninguno dice "Hoy", es chat de otro día → saltar
    if (hasSeps && !hasToday) {
      updateHeaderBadge(phone, false);
      return;
    }
    // 3. Si no hay separadores, verificar data-pre-plain-text con fecha de hoy
    if (!hasSeps) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2,'0');
      const mm = String(now.getMonth()+1).padStart(2,'0');
      const yyyy = now.getFullYear();
      const todayFmt = `${dd}/${mm}/${yyyy}`;
      const msgs = document.querySelectorAll('#main .copyable-text[data-pre-plain-text]');
      if (msgs.length > 0) {
        const lastPre = msgs[msgs.length-1].getAttribute('data-pre-plain-text') || '';
        if (!lastPre.includes(todayFmt)) {
          updateHeaderBadge(phone, false);
          return;
        }
      } else {
        // Sin mensajes visibles, no registrar
        updateHeaderBadge(phone, false);
        return;
      }
    }

    // Verificar si tiene mensajes de anuncio o respuesta del bot
    const mainText = (mainEl.textContent || '').toLowerCase();
    if (isMetaAdOrLead(mainEl, mainText)) {
      console.log(`[DMF v${VERSION}] Lead nuevo de Meta Ads abierto hoy:`, phone);
      const firstIn = document.querySelector('#main .message-in, #main div[data-testid="msg-container"]');
      const snippet = firstIn ? (firstIn.textContent || '').slice(0, 250) : 'Lead Meta Ads';
      await saveLeadDirectly(phone, snippet);
      updateHeaderBadge(phone, true);
    } else {
      updateHeaderBadge(phone, false);
    }
  }

  // Insignia discreta en la cabecera del chat abierto
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

    if (isRegistered) {
      badge.innerHTML = `
        <span style="font-size:12px;color:#10b981;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);user-select:none">
          ✓ Lead en DMF
        </span>
      `;
    } else {
      badge.innerHTML = '';
    }
  }

  // Evento al dar clic en cualquier chat
  let clickTimeout = null;
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#pane-side, [role="row"], [data-testid="cell-frame-container"]')) {
      if (clickTimeout) clearTimeout(clickTimeout);
      clickTimeout = setTimeout(checkOpenChat, 300);
    }
  }, { passive: true });

  // Monitoreo continuo cada 2.5 segundos
  setInterval(() => {
    scanSidebarChats();
    checkOpenChat();
  }, 2500);

  // Escuchar botón de escaneo forzado desde el Popup de la extensión
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'dmf_scan_now') {
      scanSidebarChats().then(count => {
        checkOpenChat();
        sendResponse({ ok: true, count: capturedPhonesCache.size, newCount: count });
      });
      return true;
    }
  });

  console.log(`[DMF v${VERSION}] Listo. Captura de anuncios activada en silencio.`);
})();
