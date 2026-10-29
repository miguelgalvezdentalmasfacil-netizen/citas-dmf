// Dental Más Fácil - WhatsApp Web Extension v3.2 (AUTO-CAPTURA INTELIGENTE DE ANUNCIOS META ADS)
(() => {
  const VERSION = '3.2.0';
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';
  const APP_URL = 'https://miguelgalvezdentalmasfacil-netizen.github.io/citas-dmf/';

  const ASSIGNED_ADVISOR = 'Miguel';
  const capturedPhonesCache = new Set();
  const knownInitialPhones = new Set();
  let isSaving = false;

  console.log(`[DMF v${VERSION}] Extensión conectada. Auto-captura de Meta Ads activa (Bandeja + Chat abierto).`);

  // Limpiador y extractor de números telefónicos de WhatsApp
  function extractCleanPhone(text) {
    if (!text) return null;
    // Eliminar caracteres invisibles de dirección Unicode (LTR \u200e, RTL \u200f, espacios especiales)
    const sanitized = text.replace(/[\u200e\u200f\u202a-\u202e\u202f\u00a0]/g, ' ');
    const match = sanitized.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
    if (!match) return null;

    let clean = match[0].replace(/\D/g, '');
    if (clean.startsWith('521') && clean.length === 13) clean = clean.slice(3);
    else if (clean.startsWith('52') && clean.length === 12) clean = clean.slice(2);

    if (clean.length >= 10 && clean.length <= 11) {
      return clean;
    }
    return null;
  }

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
            let clean = extractCleanPhone(String(r.telefono));
            if (clean) {
              capturedPhonesCache.add(clean);
              knownInitialPhones.add(clean);
            }
          }
        });
        console.log(`[DMF v${VERSION}] Sincronizados ${capturedPhonesCache.size} teléfonos existentes desde Supabase.`);
      }
    } catch (e) {
      console.warn('[DMF] Error sincronizando teléfonos existentes:', e);
    }
  }
  syncExistingPhonesFromDB();

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
    showToast('Auto-captura activa. Mensajes de anuncios se registran solos.', '#10b981');
  }, 2000);

  // Palabras y frases clave exactas de Meta Ads (Facebook e Instagram)
  const META_AD_KEYWORDS = [
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
    'logo-facebook',
    'fb.me',
    'vi su anuncio',
    'vi este anuncio',
    'vi en facebook',
    'vi esto en facebook',
    'vi en instagram',
    'anuncio de facebook',
    'anuncio de instagram',
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
    'costos'
  ];

  // Comprobar si un texto o contenedor tiene contenido de Meta Ads
  function isMetaAdContent(container, text = '') {
    const t = (text || (container ? container.textContent : '') || '').toLowerCase();
    const html = (container ? container.innerHTML : '').toLowerCase();

    // 1. Iconos o atributos de Facebook / Instagram / Meta Ads
    if (html.includes('logo-facebook') ||
        html.includes('wds-ic-logo-facebook-fill') ||
        html.includes('logo-instagram') ||
        html.includes('forward-ad') ||
        html.includes('ad-bubble') ||
        html.includes('facebook') ||
        html.includes('instagram') ||
        html.includes('fb.me')) {
      return true;
    }

    // 2. Elementos DOM específicos de anuncios
    if (container && container.querySelector) {
      if (container.querySelector('[data-icon*="facebook"], [data-icon*="instagram"], [data-testid*="facebook"], [data-testid*="instagram"], a[href*="fb.me"], a[href*="facebook.com"]')) {
        return true;
      }
    }

    // 3. Frases clave de anuncios de Meta
    return META_AD_KEYWORDS.some(kw => t.includes(kw));
  }

  // Verificador de fecha de hoy (Descartar días anteriores como "ayer" o fechas pasadas)
  function isTimestampFromToday(text) {
    if (!text) return false;
    const lower = text.toLowerCase().replace(/[\u200e\u200f\u202a-\u202e\u202f\u00a0]/g, ' ');
    if (lower.includes('ayer') || lower.includes('yesterday') || /\d{1,2}\/\d{1,2}/.test(lower)) {
      return false;
    }
    if (/\b(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/i.test(lower)) {
      return false;
    }
    return /:\d{2}/.test(lower) || lower.includes('am') || lower.includes('pm') || lower.includes('a. m.') || lower.includes('p. m.') || lower.includes('ahora') || lower.includes('just now');
  }

  // Foto inicial de chats al arrancar (solo bloquea chats viejos o sin anuncio)
  function snapshotInitialChats() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (chatRows && chatRows.length > 0) {
      chatRows.forEach(row => {
        const text = row.textContent || '';
        const clean = extractCleanPhone(text);
        if (clean) {
          const isToday = isTimestampFromToday(text);
          const isAd = isMetaAdContent(row, text);
          // Si el chat NO es de hoy o NO parece anuncio, lo marcamos como conocido para no tocarlo jamás
          if (!isToday || !isAd) {
            knownInitialPhones.add(clean);
          }
        }
      });
    }
  }
  setTimeout(snapshotInitialChats, 1200);
  setTimeout(snapshotInitialChats, 3500);

  // MODO 1: Auto-captura en vivo en la bandeja (#pane-side)
  async function detectNewIncomingAdLeads() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (!chatRows || chatRows.length === 0) return;

    const rowsToCheck = Array.from(chatRows).slice(0, 12);
    for (const row of rowsToCheck) {
      const rowText = row.textContent || '';
      const clean = extractCleanPhone(rowText);
      if (!clean) continue;

      // Si ya está guardado en Supabase, omitir
      if (capturedPhonesCache.has(clean)) continue;

      // Si es un chat viejo previo bloqueado, omitir
      if (knownInitialPhones.has(clean)) continue;

      // Debe ser de HOY
      if (!isTimestampFromToday(rowText)) {
        knownInitialPhones.add(clean);
        continue;
      }

      // Debe ser anuncio de Meta Ads
      if (!isMetaAdContent(row, rowText)) continue;

      // ¡CUMPLE TODAS LAS CONDICIONES! Auto-registrar
      console.log(`[DMF v${VERSION}] ¡Lead de Meta Ads detectado en bandeja!:`, clean);
      capturedPhonesCache.add(clean);
      knownInitialPhones.add(clean);

      await saveLeadDirectly(clean, rowText.slice(0, 250));
    }
  }

  // MODO 2: Auto-captura al abrir el chat activo (#main)
  async function checkActiveChatAndAutoRegister() {
    const active = extractActiveChat();
    if (!active) {
      const container = document.getElementById('dmf-header-container');
      if (container) container.remove();
      return;
    }

    const phone = active.phone;

    // Si ya está registrado en Supabase / memoria: mostrar insignia
    if (capturedPhonesCache.has(phone)) {
      updateHeaderUI(phone, true);
      return;
    }

    const mainEl = document.querySelector('#main');
    if (!mainEl) {
      updateHeaderUI(phone, false);
      return;
    }

    // CANDADO DE SEGURIDAD 1: Verificar si es un chat viejo
    const fullMainText = (mainEl.textContent || '').toLowerCase().replace(/[\u200e\u200f\u202a-\u202e\u202f\u00a0]/g, ' ');
    const hasPastDates = fullMainText.includes('ayer') || fullMainText.includes('yesterday') || /\d{1,2}\/\d{1,2}/.test(fullMainText);
    const msgContainers = mainEl.querySelectorAll('div[data-testid="msg-container"], .message-in, .message-out');

    // Si tiene fechas de días pasados o más de 6 mensajes, es un chat viejo existente: BLOQUEAR
    if (hasPastDates || msgContainers.length > 6) {
      knownInitialPhones.add(phone);
      updateHeaderUI(phone, false);
      return;
    }

    // CANDADO DE SEGURIDAD 2: Verificar si viene de Meta Ads
    const isAd = isMetaAdContent(mainEl, fullMainText) || isMetaAdContent(null, active.latestMessage);

    if (isAd) {
      // ¡ES UN LEAD NUEVO DE ANUNCIO DE HOY! Auto-registrar inmediatamente
      console.log(`[DMF v${VERSION}] Lead de anuncio nuevo abierto hoy. Auto-registrando:`, phone);
      capturedPhonesCache.add(phone);
      knownInitialPhones.add(phone);
      updateHeaderUI(phone, true);
      await saveLeadDirectly(phone, active.latestMessage || 'Lead Meta Ads WhatsApp');
    } else {
      updateHeaderUI(phone, false);
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
      paciente: cleanPhone,
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
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(record)
      });

      if (res.ok) {
        showToast(`🔥 Lead de anuncio auto-registrado: ${cleanPhone}`, '#10b981');
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

  // Extraer información del chat activo en #main
  function extractActiveChat() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return null;

    const titleSpan = mainHeader.querySelector('span[dir="auto"], span[title]');
    const nameOrTitle = (titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent || '') : '').trim();

    let cleanDigits = extractCleanPhone(mainHeader.textContent || '');
    if (!cleanDigits && nameOrTitle) {
      cleanDigits = extractCleanPhone(nameOrTitle);
    }

    if (!cleanDigits || cleanDigits.length < 10) return null;

    let latestMessage = '';
    const msgContainers = document.querySelectorAll('#main div[data-testid="msg-container"], #main .message-in');
    if (msgContainers && msgContainers.length > 0) {
      const firstMsg = msgContainers[0];
      const lastMsg = msgContainers[msgContainers.length - 1];
      latestMessage = (firstMsg.textContent || lastMsg.textContent || '').trim().slice(0, 300);
    }

    return {
      phone: cleanDigits,
      name: nameOrTitle || cleanDigits,
      latestMessage: latestMessage
    };
  }

  // Guardado manual con el botón "+ Registrar Lead en DMF"
  async function saveLeadManual(chat) {
    if (isSaving || !chat || !chat.phone) return;
    isSaving = true;

    const btn = document.getElementById('dmf-manual-lead-btn');
    if (btn) {
      btn.textContent = 'Guardando...';
      btn.style.opacity = '0.7';
    }

    await saveLeadDirectly(chat.phone, chat.latestMessage || '');
    capturedPhonesCache.add(chat.phone);
    knownInitialPhones.add(chat.phone);
    updateHeaderUI(chat.phone, true);
    isSaving = false;
  }

  // Cabecera del chat activo
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

  // Evento clic en chats
  let clickTimeout = null;
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#pane-side, [role="row"], [data-testid="cell-frame-container"]')) {
      if (clickTimeout) clearTimeout(clickTimeout);
      clickTimeout = setTimeout(checkActiveChatAndAutoRegister, 300);
    }
  }, { passive: true });

  // Intervalo periódico en segundo plano (cada 2.5s)
  setInterval(() => {
    detectNewIncomingAdLeads();
    checkActiveChatAndAutoRegister();
  }, 2500);

  // Escuchar mensaje para escaneo forzado desde el Popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'dmf_scan_now') {
      detectNewIncomingAdLeads();
      checkActiveChatAndAutoRegister();
      sendResponse({ ok: true, count: capturedPhonesCache.size });
    }
  });

  console.log(`[DMF v${VERSION}] 3 candados de seguridad listos. Chats viejos blindados.`);
})();
