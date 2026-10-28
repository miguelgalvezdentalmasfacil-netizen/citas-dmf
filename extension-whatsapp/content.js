// Dental Más Fácil - WhatsApp Web Extension (Modo Automático de Captura)
(() => {
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';

  let autoCaptureEnabled = true;
  let assignmentMode = 'Miguel'; // Asignar 100% a Miguel
  let lastAssignedAdvisor = 'Miguel';
  let capturedPhonesCache = new Set();

  // Load preferences and sync cache from storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['dmf_auto_capture', 'dmf_assign_mode', 'dmf_last_advisor', 'dmf_captured_cache'], (res) => {
      if (res.dmf_auto_capture !== undefined) autoCaptureEnabled = res.dmf_auto_capture;
      if (res.dmf_assign_mode && res.dmf_assign_mode !== 'turnos') {
        assignmentMode = res.dmf_assign_mode;
      } else {
        assignmentMode = 'Miguel';
        chrome.storage.local.set({ dmf_assign_mode: 'Miguel' });
      }
      if (res.dmf_last_advisor) lastAssignedAdvisor = res.dmf_last_advisor;
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

  // Toast Notification in WhatsApp Web
  function showToast(message, isSuccess = true) {
    const existing = document.querySelector('.dmf-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'dmf-toast' + (isSuccess ? '' : ' dmf-toast-error');
    toast.innerHTML = `
      <span>${isSuccess ? '⚡' : '⚠️'}</span>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // Extract contact info from active conversation
  function extractConversationInfo() {
    let name = '';
    let phone = '';
    let latestMessage = '';
    let origin = 'Facebook Ads';
    let isAdLead = false;

    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return null;

    // Contact name or phone in header title
    const titleSpan = mainHeader.querySelector('span[dir="auto"], div[role="button"] span[title]');
    if (titleSpan) {
      name = (titleSpan.getAttribute('title') || titleSpan.textContent || '').trim();
    }

    // Phone in header
    const allHeaderText = mainHeader.innerText || '';
    const phoneMatch = allHeaderText.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
    if (phoneMatch) {
      const cleanP = phoneMatch[0].replace(/[^\d+]/g, '');
      if (cleanP.length >= 10) phone = cleanP;
    }

    if (!phone && /^\+?\d[\d\s\-]{8,}\d$/.test(name)) {
      phone = name.replace(/[^\d+]/g, '');
      name = 'Prospecto WhatsApp';
    }

    // Sanitize phone to 10 digits if Mexico
    let cleanDigits = (phone || '').replace(/\D/g, '');
    if (cleanDigits.startsWith('521') && cleanDigits.length === 13) {
      cleanDigits = cleanDigits.slice(3);
    } else if (cleanDigits.startsWith('52') && cleanDigits.length === 12) {
      cleanDigits = cleanDigits.slice(2);
    }

    // Inspect incoming messages
    const msgContainers = document.querySelectorAll('#main div[data-testid="msg-container"], #main .message-in');
    const adKeywords = [
      'anuncio', 'publicidad', 'facebook', 'fb.me', 'instagram', 'meta',
      'información', 'informes', 'promoción', 'promo', 'valoración',
      'precio', 'costo', 'cita', 'brackets', 'ortodoncia', 'limpieza',
      'implante', 'muela', 'dientes', 'soluciones dentales', 'recupera tus piezas',
      'facilidades de pago', 'vi su anuncio', 'vi este anuncio'
    ];

    if (msgContainers && msgContainers.length > 0) {
      for (let i = 0; i < Math.min(msgContainers.length, 6); i++) {
        const txt = msgContainers[i].innerText || '';
        if (txt) {
          if (!latestMessage) latestMessage = txt.trim().slice(0, 300);
          const lower = txt.toLowerCase();

          origin = 'Meta Ads';

          if (adKeywords.some(kw => lower.includes(kw))) {
            isAdLead = true;
          }
        }
      }
    }

    // If contact is an unsaved phone number and has messages, treat as potential lead
    if (!isAdLead && cleanDigits && cleanDigits.length >= 10 && msgContainers.length > 0) {
      isAdLead = true;
    }

    return {
      name: name || 'Prospecto WhatsApp',
      phone: cleanDigits || phone,
      latestMessage: latestMessage,
      origin: origin,
      isAdLead: isAdLead
    };
  }

  // Automatic Lead Capture
  let isCapturing = false;
  async function checkAndAutoCapture() {
    if (!autoCaptureEnabled || isCapturing) return;

    const data = extractConversationInfo();
    if (!data || !data.phone || data.phone.length < 10) return;

    // Check if phone was already captured
    if (capturedPhonesCache.has(data.phone)) {
      updateAutoStatusBadge(true, `Lead ya registrado (${data.phone})`);
      return;
    }

    if (!data.isAdLead) {
      return;
    }

    // Auto-capture this lead!
    isCapturing = true;
    updateAutoStatusBadge(false, 'Registrando lead en DMF...');

    // Determine advisor (turnos 50/50 or specific)
    let assignedAdvisor = 'Miguel';
    if (assignmentMode === 'turnos') {
      assignedAdvisor = (lastAssignedAdvisor === 'Miguel') ? 'Edgar' : 'Miguel';
      lastAssignedAdvisor = assignedAdvisor;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ dmf_last_advisor: assignedAdvisor });
      }
    } else {
      assignedAdvisor = assignmentMode;
    }

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

        // Update counts
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
        updateAutoStatusBadge(true, `Auto-registrado (${assignedAdvisor})`);
      }
    } catch (err) {
      console.error('DMF: Error en captura automática:', err);
    } finally {
      isCapturing = false;
    }
  }

  // Update or inject Auto-Status indicator badge in WhatsApp Web header
  function updateAutoStatusBadge(isDone = true, text = 'Auto-Captura Activa') {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) {
      const floating = document.getElementById('dmf-auto-pill');
      if (floating) floating.remove();
      return;
    }

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
      mainHeader.appendChild(pill);
    }

    pill.innerHTML = `
      <span style="width:7px;height:7px;border-radius:50%;background:#10B981;box-shadow:0 0 6px #10B981;"></span>
      <span>${text}</span>
    `;
  }

  // Observer on DOM changes in WhatsApp Web
  const observer = new MutationObserver(() => {
    updateAutoStatusBadge();
    checkAndAutoCapture();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(() => {
    updateAutoStatusBadge();
    checkAndAutoCapture();
  }, 2500);

  console.log('✅ Dental Más Fácil: Modo Automático de Captura Activo.');
})();
