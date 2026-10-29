// Dental Más Fácil - WhatsApp Web Extension v2.0 (MODO SEGURO - SIN AUTO-REGISTRO AL DAR CLIC)
(() => {
  const VERSION = '2.0.0';
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';
  const APP_URL = 'https://miguelgalvezdentalmasfacil-netizen.github.io/citas-dmf/';

  const ASSIGNED_ADVISOR = 'Miguel';
  const capturedPhonesCache = new Set();
  let isSaving = false;

  console.log(`[DMF v${VERSION}] Inicializando extensión en WhatsApp Web...`);

  // 1. Sincronizar teléfonos existentes de Supabase para saber quién ya está registrado
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
            if (clean) capturedPhonesCache.add(clean);
          }
        });
      }
    } catch (e) {
      console.warn('[DMF] Error sincronizando teléfonos:', e);
    }
  }
  syncExistingPhonesFromDB();

  // 2. Notificación flotante (Toast)
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

  // Notificar al usuario visiblemente que la v2.0 segura está activa
  setTimeout(() => {
    showToast('Modo Seguro Activo: Ningún chat se registrará al dar clic.', '#10b981');
  }, 2000);

  // 3. Extraer información del chat activo en #main
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

  // 4. Guardar Lead en Supabase - ÚNICA Y EXCLUSIVAMENTE cuando el usuario pulsa "+ Registrar Lead"
  async function saveLeadToDMF(chat) {
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
      paciente: chat.phone, // Puro número
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
        updateHeaderUI(chat.phone, true);
        showToast(`Lead ${chat.phone} registrado con éxito en DMF`, '#10b981');
      } else {
        throw new Error('Supabase error: ' + res.status);
      }
    } catch (e) {
      console.error('[DMF] Error guardando lead:', e);
      showToast('Error al guardar lead. Intenta de nuevo.', '#ef4444');
      if (btn) {
        btn.textContent = '+ Registrar Lead en DMF';
        btn.style.opacity = '1';
      }
    } finally {
      isSaving = false;
    }
  }

  // 5. Renderizar interfaz en la cabecera
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
          if (chat) saveLeadToDMF(chat);
        };
      }
    }
  }

  // 6. Verificar conversación abierta (SOLO ACTUALIZA LA CABECERA - NUNCA GUARDA NADA)
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

  // 7. Evento clic en chats: SOLO refresca la cabecera, NUNCA registra
  let clickTimeout = null;
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#pane-side, [role="row"], [data-testid="cell-frame-container"]')) {
      if (clickTimeout) clearTimeout(clickTimeout);
      clickTimeout = setTimeout(checkConversation, 250);
    }
  }, { passive: true });

  // 8. Intervalo pasivo: SOLO para mantener la cabecera sincronizada
  setInterval(checkConversation, 3000);

  console.log(`[DMF v${VERSION}] Modo seguro listo. Auto-registro al dar clic: DESACTIVADO.`);
})();
