// Dental Más Fácil - WhatsApp Web Extension (Modo Automático de Captura - Ultra Ligero)
(() => {
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';

  let autoCaptureEnabled = true;
  let assignmentMode = 'Miguel'; // Asignar 100% a Miguel
  let capturedPhonesCache = new Set();
  let lastCheckedChatKey = '';
  let isCapturing = false;

  // Load preferences and sync cache from storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['dmf_auto_capture', 'dmf_assign_mode', 'dmf_captured_cache'], (res) => {
      if (res.dmf_auto_capture !== undefined) autoCaptureEnabled = res.dmf_auto_capture;
      if (res.dmf_assign_mode && res.dmf_assign_mode !== 'turnos') {
        assignmentMode = res.dmf_assign_mode;
      } else {
        assignmentMode = 'Miguel';
        chrome.storage.local.set({ dmf_assign_mode: 'Miguel' });
      }
      if (Array.isArray(res.dmf_captured_cache)) {
        capturedPhonesCache = new Set(res.dmf_captured_cache);
      }
    });
  }

  // Pre-load existing phones from Supabase to prevent any duplicate
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
        saveCache();
      }
    } catch (e) {
      console.warn('DMF: Error sincronizando teléfonos existentes:', e);
    }
  }
  syncExistingPhonesFromDB();

  function saveCache() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ dmf_captured_cache: Array.from(capturedPhonesCache) });
    }
  }

  // Non-intrusive Toast Notification in WhatsApp Web
  function showToast(message, isSuccess = true) {
    const existing = document.querySelector('.dmf-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'dmf-toast' + (isSuccess ? '' : ' dmf-toast-error');
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // Fast text extraction WITHOUT layout reflow (.textContent instead of .innerText)
  function extractConversationInfo() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return null;

    // Contact name or phone in header title
    const titleSpan = mainHeader.querySelector('span[dir="auto"], span[title]');
    const name = (titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent || '') : '').trim();
    if (!name) return null;

    // Fast phone search in header text
    let phone = '';
    const headerText = mainHeader.textContent || '';
    const phoneMatch = headerText.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
    if (phoneMatch) {
      const cleanP = phoneMatch[0].replace(/[^\d+]/g, '');
      if (cleanP.length >= 10) phone = cleanP;
    }

    if (!phone && /^\+?\d[\d\s\-]{8,}\d$/.test(name)) {
      phone = name.replace(/[^\d+]/g, '');
    }

    let cleanDigits = (phone || '').replace(/\D/g, '');
    if (cleanDigits.startsWith('521') && cleanDigits.length === 13) {
      cleanDigits = cleanDigits.slice(3);
    } else if (cleanDigits.startsWith('52') && cleanDigits.length === 12) {
      cleanDigits = cleanDigits.slice(2);
    }

    if (!cleanDigits || cleanDigits.length < 10) return null;

    // Check recent incoming messages using textContent (fast!)
    let latestMessage = '';
    let isAdLead = false;
    const adKeywords = [
      'anuncio', 'publicidad', 'facebook', 'fb.me', 'instagram', 'meta',
      'información', 'informes', 'promoción', 'promo', 'valoración',
      'precio', 'costo', 'cita', 'brackets', 'ortodoncia', 'limpieza',
      'implante', 'muela', 'dientes', 'soluciones dentales', 'recupera tus piezas',
      'facilidades de pago', 'vi su anuncio', 'vi este anuncio'
    ];

    const msgContainers = document.querySelectorAll('#main div[data-testid="msg-container"], #main .message-in');
    if (msgContainers && msgContainers.length > 0) {
      const maxMsgs = Math.min(msgContainers.length, 5);
      for (let i = 0; i < maxMsgs; i++) {
        const txt = msgContainers[i].textContent || '';
        if (txt) {
          if (!latestMessage) latestMessage = txt.trim().slice(0, 300);
          const lower = txt.toLowerCase();
          if (adKeywords.some(kw => lower.includes(kw))) {
            isAdLead = true;
          }
        }
      }
    }

    // Unsaved phone number with incoming messages is also treated as a prospect lead
    if (!isAdLead && cleanDigits && msgContainers.length > 0) {
      isAdLead = true;
    }

    return {
      name: name || 'Prospecto WhatsApp',
      phone: cleanDigits,
      latestMessage: latestMessage,
      origin: 'Meta Ads',
      isAdLead: isAdLead
    };
  }

  // Automatic Lead Capture
  async function checkAndAutoCapture() {
    if (!autoCaptureEnabled || isCapturing) return;

    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return;

    // Check if we are still on the same chat we already inspected
    const titleSpan = mainHeader.querySelector('span[dir="auto"], span[title]');
    const currentChatTitle = (titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent || '') : '').trim();
    if (!currentChatTitle) return;

    if (currentChatTitle === lastCheckedChatKey) {
      return; // Already checked this chat! Zero CPU cost.
    }
    lastCheckedChatKey = currentChatTitle;

    const data = extractConversationInfo();
    if (!data || !data.phone || data.phone.length < 10) return;

    // If phone is already in database/cache, don't re-insert
    if (capturedPhonesCache.has(data.phone)) {
      updateAutoStatusBadge(`Lead registrado (${data.phone})`);
      return;
    }

    if (!data.isAdLead) {
      return;
    }

    // Auto-capture new lead in Supabase!
    isCapturing = true;
    updateAutoStatusBadge('Registrando lead en DMF...');

    const assignedAdvisor = assignmentMode || 'Miguel';
    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 5);
    const leadId = 'c_' + data.phone + '_' + fecha + '_' + hora.replace(':', '');

    let detectedTreatment = 'Valoración Dental ($350)';
    const lowerMsg = (data.latestMessage || '').toLowerCase();
    if (lowerMsg.includes('bracket') || lowerMsg.includes('ortodoncia')) detectedTreatment = 'Ortodoncia / Brackets';
    else if (lowerMsg.includes('limpieza')) detectedTreatment = 'Limpieza Dental';
    else if (lowerMsg.includes('implante') || lowerMsg.includes('piezas faltantes')) detectedTreatment = 'Implantes Dentales';
    else if (lowerMsg.includes('prótesis') || lowerMsg.includes('placa')) detectedTreatment = 'Prótesis / Placas';

    const record = {
      id: leadId,
      asesor_id: assignedAdvisor,
      fecha: fecha,
      hora: hora,
      paciente: data.name,
      telefono: data.phone,
      sucursal: '',
      tratamiento: detectedTreatment,
      tipo: 'Lead WhatsApp',
      origen: data.origin,
      notas: data.latestMessage,
      estatus: 'Lead',
      creado_el: now.toISOString(),
      creado_por: assignedAdvisor,
      historial: [
        {
          tipo: 'lead_whatsapp_capture',
          modo: 'automatico',
          origen: data.origin,
          capturadoPor: assignedAdvisor,
          fecha: now.toISOString(),
          primerMensaje: data.latestMessage
        }
      ]
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
        capturedPhonesCache.add(data.phone);
        saveCache();

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['dmf_leads_today', 'dmf_leads_total', 'dmf_leads_date'], (resData) => {
            const todayIso = new Date().toISOString().slice(0, 10);
            let todayCount = (resData.dmf_leads_date === todayIso) ? (resData.dmf_leads_today || 0) : 0;
            todayCount++;
            let totalCount = (resData.dmf_leads_total || 0) + 1;
            chrome.storage.local.set({
              dmf_leads_today: todayCount,
              dmf_leads_total: totalCount,
              dmf_leads_date: todayIso
            });
          });
        }

        showToast(`Lead publicitario registrado en DMF: ${data.name} (${data.phone}) → Asignado a ${assignedAdvisor}`);
        updateAutoStatusBadge(`Auto-registrado (${assignedAdvisor})`);
      }
    } catch (err) {
      console.error('DMF: Error en captura automática:', err);
    } finally {
      isCapturing = false;
    }
  }

  // Safe, non-thrashing badge in WhatsApp Web header
  function updateAutoStatusBadge(text = 'Auto-Captura Activa') {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return;

    let pill = document.getElementById('dmf-auto-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'dmf-auto-pill';
      pill.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(16, 185, 129, 0.35);
        color: #10B981;
        font-size: 11.5px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 999px;
        margin-left: 10px;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      `;
      pill.innerHTML = `
        <span style="width:7px;height:7px;border-radius:50%;background:#10B981;box-shadow:0 0 6px #10B981;"></span>
        <span id="dmf-pill-txt">${text}</span>
      `;
      mainHeader.appendChild(pill);
    } else {
      const txtSpan = document.getElementById('dmf-pill-txt');
      if (txtSpan && txtSpan.textContent !== text) {
        txtSpan.textContent = text;
      }
    }
  }

  // Listen to chat switches safely using passive click (Zero main-thread blocking!)
  let clickDebounce = null;
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#pane-side, [role="row"], [data-testid="cell-frame-container"]')) {
      if (clickDebounce) clearTimeout(clickDebounce);
      clickDebounce = setTimeout(() => {
        updateAutoStatusBadge();
        checkAndAutoCapture();
      }, 350);
    }
  }, { passive: true });

  // Very gentle periodic sync (every 4 seconds, negligible CPU impact)
  setInterval(() => {
    updateAutoStatusBadge();
    checkAndAutoCapture();
  }, 4000);

  console.log('Dental Más Fácil: Extensión activa en modo ultra-ligero.');
})();
