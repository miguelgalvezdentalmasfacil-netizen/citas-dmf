// Dental Más Fácil - WhatsApp Web Extension (Control Preciso de Leads)
(() => {
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';

  const ASSIGNED_ADVISOR = 'Miguel';
  const capturedPhonesCache = new Set();
  const existingInboxPhones = new Set();
  let isSaving = false;
  let activePhone = '';

  // 1. Load existing appointments/leads from Supabase into cache
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
              existingInboxPhones.add(clean);
            }
          }
        });
      }
    } catch (e) {
      console.warn('DMF: Error sincronizando teléfonos:', e);
    }
  }
  syncExistingPhonesFromDB();

  // 2. Snapshot all conversations currently visible in WhatsApp inbox as ALREADY EXISTING
  function snapshotInboxChats() {
    const chatRows = document.querySelectorAll('#pane-side [role="row"], #pane-side div[data-testid="cell-frame-container"]');
    if (chatRows && chatRows.length > 0) {
      chatRows.forEach(row => {
        const text = row.textContent || '';
        const match = text.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
        if (match) {
          const clean = match[0].replace(/\D/g, '');
          if (clean.length >= 10) existingInboxPhones.add(clean);
        }
      });
    }
  }
  // Run snapshot after WhatsApp loads
  setTimeout(snapshotInboxChats, 1200);
  setTimeout(snapshotInboxChats, 3500);

  // Toast notification
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
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(16,185,129,0.4);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    toast.innerHTML = `<span style="color:#10b981;font-weight:700">DMF</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Extract info from active chat header
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

    // Get latest incoming message text
    let latestMessage = '';
    const msgContainers = document.querySelectorAll('#main div[data-testid="msg-container"], #main .message-in');
    if (msgContainers && msgContainers.length > 0) {
      latestMessage = (msgContainers[msgContainers.length - 1].textContent || '').trim().slice(0, 300);
    }

    // Check if conversation originated from a Meta Ad
    let isMetaAd = false;
    const adKeywords = [
      'anuncio', 'publicidad', 'facebook', 'fb.me', 'instagram', 'meta',
      'información', 'informes', 'promoción', 'promo', 'valoración',
      'vi su anuncio', 'vi este anuncio'
    ];
    if (msgContainers && msgContainers.length > 0) {
      const maxCheck = Math.min(msgContainers.length, 5);
      for (let i = 0; i < maxCheck; i++) {
        const txt = (msgContainers[i].textContent || '').toLowerCase();
        if (adKeywords.some(kw => txt.includes(kw))) {
          isMetaAd = true;
          break;
        }
      }
    }

    return {
      phone: cleanDigits,
      name: nameOrTitle || cleanDigits,
      latestMessage: latestMessage,
      isMetaAd: isMetaAd
    };
  }

  // Save Lead to Supabase with PURE PHONE, DATE AND TIME (Nothing extra)
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
      paciente: chat.name || chat.phone,
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
        existingInboxPhones.add(chat.phone);
        updateHeaderUI(chat.phone, true);
        showToast(`Lead registrado con número ${chat.phone}`);
      }
    } catch (e) {
      console.error('DMF: Error guardando lead:', e);
    } finally {
      isSaving = false;
    }
  }

  // Header UI: shows status badge or button to register
  function updateHeaderUI(phone, isRegistered) {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return;

    let container = document.getElementById('dmf-header-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'dmf-header-container';
      container.style.cssText = 'display:inline-flex;align-items:center;margin-left:12px;';
      mainHeader.appendChild(container);
    }

    if (isRegistered) {
      container.innerHTML = `
        <span style="font-size:12px;color:#10b981;font-weight:600;padding:4px 10px;border-radius:999px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);user-select:none">
          Lead en DMF
        </span>
      `;
    } else {
      container.innerHTML = `
        <button id="dmf-manual-lead-btn" style="font-size:12px;color:#0097a7;font-weight:600;padding:4px 12px;border-radius:999px;background:rgba(0,151,167,.1);border:1px solid rgba(0,151,167,.35);cursor:pointer;transition:all .15s">
          + Registrar Lead en DMF
        </button>
      `;
      const btn = document.getElementById('dmf-manual-lead-btn');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const chat = extractActiveChat();
          if (chat) saveLeadToDMF(chat);
        });
      }
    }
  }

  // Check active conversation safely
  function checkConversation() {
    const chat = extractActiveChat();
    if (!chat) {
      const container = document.getElementById('dmf-header-container');
      if (container) container.remove();
      return;
    }

    activePhone = chat.phone;

    // 1. If already in database or cache:
    if (capturedPhonesCache.has(chat.phone)) {
      updateHeaderUI(chat.phone, true);
      return;
    }

    // 2. If it's an existing chat from before, DO NOT auto-register it!
    // Just show the manual button in header in case Miguel wants to register it.
    if (existingInboxPhones.has(chat.phone)) {
      updateHeaderUI(chat.phone, false);
      return;
    }

    // 3. It's a BRAND NEW conversation that was NOT in the initial inbox!
    // If it's from a Meta Ad, auto-capture it with pure phone and date:
    if (chat.isMetaAd) {
      saveLeadToDMF(chat);
    } else {
      updateHeaderUI(chat.phone, false);
    }
  }

  // Handle click on chat list
  let clickTimeout = null;
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#pane-side, [role="row"], [data-testid="cell-frame-container"]')) {
      if (clickTimeout) clearTimeout(clickTimeout);
      clickTimeout = setTimeout(checkConversation, 400);
    }
  }, { passive: true });

  // Fallback gentle interval
  setInterval(checkConversation, 3500);

  console.log('Dental Más Fácil: Extensión conectada.');
})();
