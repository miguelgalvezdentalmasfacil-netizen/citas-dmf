// Dental Más Fácil - WhatsApp Web Extension v3.0 (3 CANDADOS: AUTO-CAPTURA SOLO DE ANUNCIOS NUEVOS)
(() => {
  const VERSION = '3.0.0';
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';
  const APP_URL = 'https://miguelgalvezdentalmasfacil-netizen.github.io/citas-dmf/';

  const ASSIGNED_ADVISOR = 'Miguel';
  const capturedPhonesCache = new Set();
  const knownInitialPhones = new Set();
  let isSaving = false;

  console.log(`[DMF v${VERSION}] Extensión conectada con 3 candados de seguridad.`);

  // 1. Sincronizar todos los teléfonos existentes en Supabase a memoria
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
            let clean = String(r.telefono).replace(/\D/g, '');
            if (clean.startsWith('521') && clean.length === 13) clean = clean.slice(3);
            else if (clean.startsWith('52') && clean.length === 12) clean = clean.slice(2);
            if (clean) {
              capturedPhonesCache.add(clean);
              knownInitialPhones.add(clean);
            }
          }
        });
      }
    } catch (e) {
      console.warn('[DMF] Error sincronizando teléfonos existentes:', e);
    }
  }
  syncExistingPhonesFromDB();

  // 2. CANDADO 1: FOTO DE CHATS PREVIOS AL CARGAR LA PÁGINA
  // Todo chat que ya esté en la bandeja y no sea un anuncio nuevo no leído de hoy queda bloqueado como chat viejo.
  function snapshotInitialChats() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (chatRows && chatRows.length > 0) {
      chatRows.forEach(row => {
        const text = row.textContent || '';
        const match = text.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
        if (match) {
          let clean = match[0].replace(/\D/g, '');
          if (clean.startsWith('521') && clean.length === 13) clean = clean.slice(3);
          else if (clean.startsWith('52') && clean.length === 12) clean = clean.slice(2);
          if (clean.length >= 10) {
            // Si NO tiene insignia de no leído, es definitivamente un chat previo
            const hasUnread = row.querySelector('[data-testid="icon-unread-count"], span[aria-label*="no leído"], span[aria-label*="no leídos"], span[aria-label*="unread"]') ||
                              row.querySelector('span[class*="unread"]');
            if (!hasUnread) {
              knownInitialPhones.add(clean);
            }
          }
        }
      });
    }
  }
  setTimeout(snapshotInitialChats, 1200);
  setTimeout(snapshotInitialChats, 3000);
  setTimeout(snapshotInitialChats, 6000);

  // Notificación flotante (Toast)
  function showToast(message, color = '#0097a7') {
    const existing = document.querySelector('.dmf-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'dmf-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0f172a;
      color: #fff;
      padding: 12px 18px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid ${color};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    toast.innerHTML = `<span style="color:${color};font-weight:700">DMF v${VERSION}</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // Notificación visible al iniciar
  setTimeout(() => {
    showToast('Auto-captura activa con 3 candados de seguridad. Chats viejos blindados.', '#10b981');
  }, 2200);

  // Palabras y frases clave exactas de Meta Ads (Facebook e Instagram)
  const META_AD_KEYWORDS = [
    'quiero más información',
    'quiero mas informacion',
    'me gustaría conseguir más información',
    'me gustaria conseguir mas informacion',
    'soluciones dentales',
    'recupera tus piezas',
    'facilidades de pago',
    'logo-facebook',
    'fb.me',
    'vi su anuncio',
    'vi este anuncio',
    'vi en facebook',
    'vi esto en facebook',
    'vi en instagram',
    'anuncio de facebook',
    'anuncio de instagram'
  ];

  // CANDADO 2: VERIFICADOR DE FECHA DE HOY (Descartar días anteriores como "ayer" o fechas pasadas)
  function isTimestampFromToday(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    // Si contiene "ayer", "yesterday" o una fecha con barra (ej. 28/10/26), NO es de hoy
    if (lower.includes('ayer') || lower.includes('yesterday') || /\d{1,2}\/\d{1,2}/.test(lower)) {
      return false;
    }
    // Es de hoy si contiene hora con dos puntos (10:35), am/pm, o "ahora"
    return lower.includes(':') || lower.includes('am') || lower.includes('pm') || lower.includes('a. m.') || lower.includes('p. m.') || lower.includes('ahora') || lower.includes('just now');
  }

  // 3. CANDADO 3: AUTO-CAPTURA EN VIVO DE ANUNCIOS QUE LLEGUEN EN SEGUNDO PLANO
  async function detectNewIncomingAdLeads() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (!chatRows || chatRows.length === 0) return;

    // Solo revisar los 4 primeros chats de la lista (los más recientes)
    const topChats = Array.from(chatRows).slice(0, 4);
    for (const row of topChats) {
      // Candado A: Debe tener distintivo de mensaje NO LEÍDO
      const hasUnread = row.querySelector('[data-testid="icon-unread-count"], span[aria-label*="no leído"], span[aria-label*="no leídos"], span[aria-label*="unread"]') ||
                        row.querySelector('span[class*="unread"]');
      if (!hasUnread) continue;

      // Candado B: Debe ser número de teléfono (no un contacto personal guardado con nombre)
      const rowText = row.textContent || '';
      const phoneMatch = rowText.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
      if (!phoneMatch) continue;

      let clean = phoneMatch[0].replace(/\D/g, '');
      if (clean.startsWith('521') && clean.length === 13) clean = clean.slice(3);
      else if (clean.startsWith('52') && clean.length === 12) clean = clean.slice(2);
      if (clean.length < 10) continue;

      // Candado C: NO debe ser un chat previo de la sesión
      if (knownInitialPhones.has(clean)) continue;

      // Candado D: NO debe estar ya registrado en Supabase
      if (capturedPhonesCache.has(clean)) continue;

      // Candado E: La fecha debe ser de HOY (no de ayer ni semanas pasadas)
      if (!isTimestampFromToday(rowText)) continue;

      // Candado F: Debe contener texto de anuncio de Meta Ads
      const lower = rowText.toLowerCase();
      const isMetaAd = META_AD_KEYWORDS.some(kw => lower.includes(kw));
      if (!isMetaAd) continue;

      // ¡CUMPLE LOS 3 CANDADOS! Es un lead genuino que acaba de entrar por anuncio
      console.log(`[DMF v${VERSION}] ¡Nuevo lead de Meta Ads recibido en vivo!:`, clean);

      // Bloquear en memoria de inmediato para evitar duplicados
      capturedPhonesCache.add(clean);
      knownInitialPhones.add(clean);

      // Guardar automáticamente en Supabase con puro número y fecha
      await saveLeadDirectly(clean, rowText.slice(0, 250));
    }
  }

  // Guardado directo en Supabase (Puro número, fecha y hora)
  async function saveLeadDirectly(cleanPhone, snippet) {
    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 5);
    const leadId = 'c_' + cleanPhone + '_' + fecha + '_' + hora.replace(':', '');

    const record = {
      id: leadId,
      asesor_id: ASSIGNED_ADVISOR,
      fecha: fecha,
      hora: hora,
      paciente: cleanPhone, // Puro número como pidió Miguel
      telefono: cleanPhone,
      sucursal: '',
      tratamiento: '',
      tipo: 'Lead WhatsApp',
      origen: 'Meta Ads',
      notas: snippet || '',
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
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(record)
      });

      if (res.ok) {
        showToast(`🔥 Nuevo lead de anuncio registrado automáticamente: ${cleanPhone}`, '#10b981');
        const active = extractActiveChat();
        if (active && active.phone === cleanPhone) {
          updateHeaderUI(cleanPhone, true);
        }
      } else {
        console.warn('[DMF] Supabase respondió error:', res.status);
      }
    } catch (e) {
      console.error('[DMF] Error guardando lead en Supabase:', e);
    }
  }

  // 4. Extraer información del chat activo en #main
  function extractActiveChat() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return null;

    const titleSpan = mainHeader.querySelector('span[dir="auto"], span[title]');
    const nameOrTitle = (titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent || '') : '').trim();

    let phone = '';
    const headerText = mainHeader.textContent || '';
    const match = headerText.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
    if (match) {
      phone = match[0].replace(/[^\d+]/g, '');
    }
    if (!phone && /^\+?\d[\d\s\-]{8,}\d$/.test(nameOrTitle)) {
      phone = nameOrTitle.replace(/[^\d+]/g, '');
    }

    let cleanDigits = (phone || '').replace(/\D/g, '');
    if (cleanDigits.startsWith('521') && cleanDigits.length === 13) cleanDigits = cleanDigits.slice(3);
    else if (cleanDigits.startsWith('52') && cleanDigits.length === 12) cleanDigits = cleanDigits.slice(2);

    if (!cleanDigits || cleanDigits.length < 10) return null;

    let latestMessage = '';
    let isTodayInMain = true;
    const msgContainers = document.querySelectorAll('#main div[data-testid="msg-container"], #main .message-in');
    if (msgContainers && msgContainers.length > 0) {
      const firstMsg = msgContainers[0];
      const lastMsg = msgContainers[msgContainers.length - 1];
      latestMessage = (firstMsg.textContent || lastMsg.textContent || '').trim().slice(0, 300);

      // Revisar si los mensajes dentro del chat son de días viejos
      const fullMainText = document.querySelector('#main')?.textContent?.toLowerCase() || '';
      if (fullMainText.includes('ayer') || fullMainText.includes('yesterday')) {
        isTodayInMain = false;
      }
    }

    return {
      phone: cleanDigits,
      name: nameOrTitle || cleanDigits,
      latestMessage: latestMessage,
      isToday: isTodayInMain
    };
  }

  // 5. Guardado manual con el botón "+ Registrar Lead en DMF"
  async function saveLeadManual(chat) {
    if (isSaving || !chat || !chat.phone) return;
    isSaving = true;

    const btn = document.getElementById('dmf-manual-lead-btn');
    if (btn) {
      btn.textContent = 'Guardando...';
      btn.style.opacity = '0.7';
    }

    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 5);
    const leadId = 'c_' + chat.phone + '_' + fecha + '_' + hora.replace(':', '');

    const record = {
      id: leadId,
      asesor_id: ASSIGNED_ADVISOR,
      fecha: fecha,
      hora: hora,
      paciente: chat.phone,
      telefono: chat.phone,
      sucursal: '',
      tratamiento: '',
      tipo: 'Lead WhatsApp',
      origen: 'Meta Ads',
      notas: chat.latestMessage || '',
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
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(record)
      });

      if (res.ok) {
        capturedPhonesCache.add(chat.phone);
        knownInitialPhones.add(chat.phone);
        updateHeaderUI(chat.phone, true);
        showToast(`Lead ${chat.phone} registrado con éxito`, '#10b981');
      }
    } catch (e) {
      console.error('[DMF] Error guardando lead manual:', e);
      if (btn) {
        btn.textContent = '+ Registrar Lead en DMF';
        btn.style.opacity = '1';
      }
    } finally {
      isSaving = false;
    }
  }

  // 6. Cabecera del chat activo
  function updateHeaderUI(phone, isRegistered) {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return;

    let container = document.getElementById('dmf-header-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'dmf-header-container';
      container.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:14px;';
      mainHeader.appendChild(container);
    }

    if (isRegistered) {
      container.innerHTML = `
        <span style="font-size:12px;color:#10b981;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);user-select:none;display:inline-flex;align-items:center;gap:4px">
          ✓ Lead en DMF
        </span>
        <a href="${APP_URL}?tel=${phone}" target="_blank" title="Abrir en DMF para agendar cita" style="font-size:12px;color:#0097a7;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(0,151,167,.1);border:1px solid rgba(0,151,167,.35);text-decoration:none;display:inline-flex;align-items:center;gap:4px;cursor:pointer">
          📅 Agendar Cita
        </a>
      `;
    } else {
      container.innerHTML = `
        <button id="dmf-manual-lead-btn" style="font-size:12px;color:#0097a7;font-weight:600;padding:5px 12px;border-radius:999px;background:rgba(0,151,167,.1);border:1px solid rgba(0,151,167,.35);cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:4px">
          + Registrar Lead en DMF
        </button>
      `;
      const btn = document.getElementById('dmf-manual-lead-btn');
      if (btn) {
        btn.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          const chat = extractActiveChat();
          if (chat) saveLeadManual(chat);
        };
      }
    }
  }

  // 7. Verificación del chat activo:
  // IMPORTANTE: 100% DE LECTURA. NUNCA REGISTRA NADA AL ABRIR O DAR CLIC.
  // Solo actualiza la etiqueta de la cabecera según si ya está en DMF o no.
  function checkConversation() {
    const chat = extractActiveChat();
    if (!chat) {
      const container = document.getElementById('dmf-header-container');
      if (container) container.remove();
      return;
    }

    const isRegistered = capturedPhonesCache.has(chat.phone);
    updateHeaderUI(chat.phone, isRegistered);
  }

  // 8. Evento clic en chats: Refresca la cabecera pasando por los 3 candados
  let clickTimeout = null;
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#pane-side, [role="row"], [data-testid="cell-frame-container"]')) {
      if (clickTimeout) clearTimeout(clickTimeout);
      clickTimeout = setTimeout(checkConversation, 250);
    }
  }, { passive: true });

  // 9. Intervalo periódico en segundo plano:
  // - Detecta leads de Meta Ads que entren no leídos en vivo
  // - Sincroniza la cabecera
  setInterval(() => {
    detectNewIncomingAdLeads();
    checkConversation();
  }, 3000);

  console.log(`[DMF v${VERSION}] 3 candados de seguridad listos. Chats viejos blindados.`);
})();
