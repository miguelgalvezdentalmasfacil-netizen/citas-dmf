// Dental Más Fácil - WhatsApp Web Extension (Control Preciso de Leads)
(() => {
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';
  const APP_URL = 'https://miguelgalvezdentalmasfacil-netizen.github.io/citas-dmf/';

  const ASSIGNED_ADVISOR = 'Miguel';
  const capturedPhonesCache = new Set();
  const initialKnownPhones = new Set();
  let isSaving = false;
  let activePhone = '';

  // 1. Sincronizar teléfonos existentes de Supabase a memoria
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
            const clean = String(r.telefono).replace(/\D/g, '');
            if (clean) {
              capturedPhonesCache.add(clean);
              initialKnownPhones.add(clean);
            }
          }
        });
      }
    } catch (e) {
      console.warn('DMF: Error sincronizando teléfonos:', e);
    }
  }
  syncExistingPhonesFromDB();

  // 2. Tomar foto de los chats visibles al inicio para NUNCA confundirlos con leads nuevos
  function snapshotInitialChats() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (chatRows && chatRows.length > 0) {
      chatRows.forEach(row => {
        const text = row.textContent || '';
        const match = text.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
        if (match) {
          const clean = match[0].replace(/\D/g, '');
          if (clean.length >= 10) initialKnownPhones.add(clean);
        }
      });
    }
  }
  setTimeout(snapshotInitialChats, 1500);
  setTimeout(snapshotInitialChats, 4000);

  // Notificación flotante (Toast)
  function showToast(message) {
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
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.4);
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(0, 151, 167, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    toast.innerHTML = `<span style="color:#0097a7;font-weight:700">DMF</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Extraer información del chat activo en #main
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

    // Último mensaje
    let latestMessage = '';
    const msgContainers = document.querySelectorAll('#main div[data-testid="msg-container"], #main .message-in');
    if (msgContainers && msgContainers.length > 0) {
      latestMessage = (msgContainers[msgContainers.length - 1].textContent || '').trim().slice(0, 300);
    }

    return {
      phone: cleanDigits,
      name: nameOrTitle || cleanDigits,
      latestMessage: latestMessage
    };
  }

  // Guardar Lead en Supabase con PURO NÚMERO Y FECHA
  async function saveLeadToDMF(chat) {
    if (isSaving || !chat || !chat.phone) return;
    isSaving = true;

    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 5);
    const leadId = 'c_' + chat.phone + '_' + fecha + '_' + hora.replace(':', '');

    const record = {
      id: leadId,
      asesor_id: ASSIGNED_ADVISOR,
      fecha: fecha,
      hora: hora,
      paciente: chat.phone, // Puro número como pidió Miguel
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
        initialKnownPhones.add(chat.phone);
        updateHeaderUI(chat.phone, true);
        showToast(`Lead registrado con número ${chat.phone}`);
      }
    } catch (e) {
      console.error('DMF: Error guardando lead:', e);
    } finally {
      isSaving = false;
    }
  }

  // Interfaz en la cabecera del chat activo
  function updateHeaderUI(phone, isRegistered) {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return;

    let container = document.getElementById('dmf-header-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'dmf-header-container';
      container.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:12px;';
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
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const chat = extractActiveChat();
          if (chat) saveLeadToDMF(chat);
        });
      }
    }
  }

  // Verificación de la conversación activa:
  // IMPORTANTE: Esta función NUNCA registra leads automáticamente al abrir o dar clic.
  // Solo actualiza los botones de la cabecera.
  function checkConversation() {
    const chat = extractActiveChat();
    if (!chat) {
      const container = document.getElementById('dmf-header-container');
      if (container) container.remove();
      return;
    }

    activePhone = chat.phone;

    // Verificar si ya está en la base de datos o capturado
    const isRegistered = capturedPhonesCache.has(chat.phone);
    updateHeaderUI(chat.phone, isRegistered);
  }

  // Al hacer clic en un chat: SOLO actualizar la cabecera, NUNCA registrar automáticamente
  let clickTimeout = null;
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#pane-side, [role="row"], [data-testid="cell-frame-container"]')) {
      if (clickTimeout) clearTimeout(clickTimeout);
      clickTimeout = setTimeout(checkConversation, 300);
    }
  }, { passive: true });

  // Detección automática en tiempo real de leads de Meta Ads que LLEGUEN de ahora en adelante
  // Se ejecuta en segundo plano SOLO sobre mensajes NO LEÍDOS que llegan en vivo
  function checkIncomingRealtimeLeads() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (!chatRows || chatRows.length === 0) return;

    // Solo revisar los 3 primeros chats de la lista (los más recientes)
    const topChats = Array.from(chatRows).slice(0, 3);
    for (const row of topChats) {
      // 1. Debe tener distintivo de mensaje no leído (insignia verde / contador)
      const hasUnread = row.querySelector('[data-testid="icon-unread-count"], span[aria-label*="no leído"], span[aria-label*="unread"]') ||
                        row.querySelector('span[class*="unread"]');
      if (!hasUnread) continue;

      // 2. Extraer número de teléfono si no es un contacto guardado
      const rowText = row.textContent || '';
      const phoneMatch = rowText.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
      if (!phoneMatch) continue;

      let clean = phoneMatch[0].replace(/\D/g, '');
      if (clean.startsWith('521') && clean.length === 13) clean = clean.slice(3);
      else if (clean.startsWith('52') && clean.length === 12) clean = clean.slice(2);
      if (clean.length < 10) continue;

      // 3. Si ya estaba en la base de datos o en los chats iniciales, ignorar
      if (capturedPhonesCache.has(clean) || initialKnownPhones.has(clean)) continue;

      // 4. Verificar si el texto del mensaje indica anuncio de Meta Ads
      const lower = rowText.toLowerCase();
      const isAdLead = lower.includes('vi su anuncio') ||
                       lower.includes('vi este anuncio') ||
                       lower.includes('vi en facebook') ||
                       lower.includes('vi esto en facebook') ||
                       lower.includes('vi en instagram') ||
                       lower.includes('anuncio de facebook') ||
                       lower.includes('anuncio de instagram');

      if (isAdLead) {
        // Lead nuevo genuino que llegó en tiempo real mientras WhatsApp estaba abierto
        const now = new Date();
        const fecha = now.toISOString().slice(0, 10);
        const hora = now.toTimeString().slice(0, 5);
        const leadId = 'c_' + clean + '_' + fecha + '_' + hora.replace(':', '');

        const record = {
          id: leadId,
          asesor_id: ASSIGNED_ADVISOR,
          fecha: fecha,
          hora: hora,
          paciente: clean,
          telefono: clean,
          sucursal: '',
          tratamiento: '',
          tipo: 'Lead WhatsApp',
          origen: 'Meta Ads',
          notas: rowText.slice(0, 200),
          estatus: 'Lead',
          creado_el: now.toISOString(),
          creado_por: ASSIGNED_ADVISOR
        };

        // Guardar automáticamente
        fetch(`${SUPABASE_URL}/rest/v1/citas`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(record)
        }).then(r => {
          if (r.ok) {
            capturedPhonesCache.add(clean);
            initialKnownPhones.add(clean);
            showToast(`Nuevo lead de anuncio detectado: ${clean}`);
            if (activePhone === clean) updateHeaderUI(clean, true);
          }
        }).catch(err => console.warn('DMF: Error auto-guardando lead nuevo:', err));
      }
    }
  }

  // Intervalo suave para actualización visual de cabecera y detección de nuevos
  setInterval(() => {
    checkConversation();
    checkIncomingRealtimeLeads();
  }, 4000);

  console.log('Dental Más Fácil: Extensión conectada.');
})();
