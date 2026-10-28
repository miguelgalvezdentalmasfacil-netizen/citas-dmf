// Dental Más Fácil - WhatsApp Web Extension Content Script
(() => {
  const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';

  let currentAdvisor = 'Miguel';
  let currentBranch = 'Plaza San Pedro';

  // Load advisor preferences from storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['dmf_advisor', 'dmf_branch'], (res) => {
      if (res.dmf_advisor) currentAdvisor = res.dmf_advisor;
      if (res.dmf_branch) currentBranch = res.dmf_branch;
    });
  }

  // Toast Notification
  function showToast(message, isError = false) {
    const existing = document.querySelector('.dmf-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'dmf-toast' + (isError ? ' dmf-toast-error' : '');
    toast.innerHTML = `
      <span>${isError ? '⚠️' : '✅'}</span>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Extract contact info from active conversation in WhatsApp Web
  function extractConversationInfo() {
    let name = '';
    let phone = '';
    let latestMessage = '';
    let origin = 'Facebook Ads';

    const mainHeader = document.querySelector('#main header');
    if (mainHeader) {
      // 1. Contact Name or Phone in Title
      const titleSpan = mainHeader.querySelector('span[dir="auto"], div[role="button"] span[title]');
      if (titleSpan) {
        name = (titleSpan.getAttribute('title') || titleSpan.textContent || '').trim();
      }

      // Check if header text contains phone number
      const allHeaderText = mainHeader.innerText || '';
      const phoneMatch = allHeaderText.match(/(\+?\d[\d\s\-\(\)]{8,}\d)/);
      if (phoneMatch) {
        const cleanP = phoneMatch[0].replace(/[^\d+]/g, '');
        if (cleanP.length >= 10) phone = cleanP;
      }

      // If name itself looks like a phone number (+52 1 656...)
      if (!phone && /^\+?\d[\d\s\-]{8,}\d$/.test(name)) {
        phone = name.replace(/[^\d+]/g, '');
        name = 'Prospecto WhatsApp';
      }
    }

    // 2. Extract recent ad text or incoming message
    const msgContainers = document.querySelectorAll('#main div[data-testid="msg-container"], #main .message-in');
    if (msgContainers && msgContainers.length > 0) {
      // Check first 3 messages for ad referrals
      for (let i = 0; i < Math.min(msgContainers.length, 4); i++) {
        const txt = msgContainers[i].innerText || '';
        if (txt) {
          if (!latestMessage) latestMessage = txt.trim().slice(0, 300);
          const lower = txt.toLowerCase();
          if (lower.includes('tiktok')) origin = 'TikTok Ads';
          else if (lower.includes('instagram') || lower.includes('ig')) origin = 'Instagram Ads';
          else if (lower.includes('facebook') || lower.includes('fb') || lower.includes('anuncio') || lower.includes('publicidad')) origin = 'Facebook Ads';
        }
      }
    }

    // Sanitize phone (if Mexican number starting with +52 1 or 521, normalize to standard 10 digits or clean international)
    let cleanDigits = (phone || '').replace(/\D/g, '');
    if (cleanDigits.startsWith('521') && cleanDigits.length === 13) {
      cleanDigits = cleanDigits.slice(3);
    } else if (cleanDigits.startsWith('52') && cleanDigits.length === 12) {
      cleanDigits = cleanDigits.slice(2);
    }

    return {
      name: name || 'Prospecto WhatsApp',
      phone: cleanDigits || phone,
      latestMessage: latestMessage,
      origin: origin
    };
  }

  // Inject or update action buttons
  function injectDMFButtons() {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) {
      const floating = document.getElementById('dmf-floating-btn');
      if (floating) floating.remove();
      return;
    }

    // 1. Header Button
    if (!document.getElementById('dmf-header-btn')) {
      const btn = document.createElement('button');
      btn.id = 'dmf-header-btn';
      btn.className = 'dmf-header-btn';
      btn.innerHTML = `🦷 Registrar en DMF`;
      btn.title = 'Registrar lead publicitario o cita en Dental Más Fácil';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDMFModal();
      });

      // Insert right after contact title or before action icons in header
      const rightIcons = mainHeader.querySelector('div:last-child');
      if (rightIcons && rightIcons.parentNode === mainHeader) {
        mainHeader.insertBefore(btn, rightIcons);
      } else {
        mainHeader.appendChild(btn);
      }
    }

    // 2. Floating Action Button
    if (!document.getElementById('dmf-floating-btn')) {
      const floatBtn = document.createElement('div');
      floatBtn.id = 'dmf-floating-btn';
      floatBtn.className = 'dmf-floating-btn';
      floatBtn.innerHTML = `
        <span class="dmf-pill-dot"></span>
        <span>🦷 Registrar Lead DMF</span>
      `;
      floatBtn.title = 'Capturar Lead de Publicidad en DMF';
      floatBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDMFModal();
      });
      document.body.appendChild(floatBtn);
    }
  }

  // Open Lead Registration Modal
  function openDMFModal() {
    const existing = document.getElementById('dmf-modal-root');
    if (existing) existing.remove();

    const data = extractConversationInfo();
    const todayIso = new Date().toISOString().slice(0, 10);
    const defaultTime = '11:00';

    const backdrop = document.createElement('div');
    backdrop.id = 'dmf-modal-root';
    backdrop.className = 'dmf-modal-backdrop';

    backdrop.innerHTML = `
      <div class="dmf-modal-box">
        <div class="dmf-modal-header">
          <div class="dmf-modal-title">
            <div class="dmf-modal-title-icon">🦷</div>
            <div>
              <div>Registrar Lead en Dental Más Fácil</div>
              <div style="font-size:11px;font-weight:400;color:#94A3B8;">Captura publicitaria sincronizada en tiempo real</div>
            </div>
          </div>
          <button class="dmf-modal-close" id="dmf-btn-close">&times;</button>
        </div>

        <div class="dmf-grid-2">
          <div class="dmf-form-group">
            <label for="dmf-in-paciente">Nombre del Paciente / Lead *</label>
            <input type="text" id="dmf-in-paciente" value="${escapeHtml(data.name)}" placeholder="Nombre completo" required>
          </div>
          <div class="dmf-form-group">
            <label for="dmf-in-telefono">Teléfono WhatsApp *</label>
            <input type="tel" id="dmf-in-telefono" value="${escapeHtml(data.phone)}" placeholder="Ej. 6561234567" required>
          </div>
        </div>

        <div class="dmf-grid-2">
          <div class="dmf-form-group">
            <label for="dmf-in-origen">Canal Publicitario (Origen)</label>
            <select id="dmf-in-origen">
              <option value="Facebook Ads" ${data.origin === 'Facebook Ads' ? 'selected' : ''}>Facebook Ads (Meta)</option>
              <option value="Instagram Ads" ${data.origin === 'Instagram Ads' ? 'selected' : ''}>Instagram Ads (Meta)</option>
              <option value="TikTok Ads" ${data.origin === 'TikTok Ads' ? 'selected' : ''}>TikTok Ads</option>
              <option value="WhatsApp Directo">WhatsApp Directo</option>
              <option value="Recomendación">Recomendación</option>
            </select>
          </div>
          <div class="dmf-form-group">
            <label for="dmf-in-asesor">Asesor Responsable</label>
            <select id="dmf-in-asesor">
              <option value="Miguel" ${currentAdvisor === 'Miguel' ? 'selected' : ''}>Miguel</option>
              <option value="Edgar" ${currentAdvisor === 'Edgar' ? 'selected' : ''}>Edgar</option>
            </select>
          </div>
        </div>

        <div class="dmf-grid-2">
          <div class="dmf-form-group">
            <label for="dmf-in-sucursal">Sucursal de Preferencia</label>
            <select id="dmf-in-sucursal">
              <option value="Plaza San Pedro" ${currentBranch === 'Plaza San Pedro' ? 'selected' : ''}>Plaza San Pedro</option>
              <option value="Las Misiones" ${currentBranch === 'Las Misiones' ? 'selected' : ''}>Las Misiones</option>
              <option value="Por definir">Por definir</option>
            </select>
          </div>
          <div class="dmf-form-group">
            <label for="dmf-in-tratamiento">Tratamiento de Interés</label>
            <select id="dmf-in-tratamiento">
              <option value="Valoración Dental ($350)">Valoración Dental ($350)</option>
              <option value="Ortodoncia / Brackets">Ortodoncia / Brackets</option>
              <option value="Limpieza Dental">Limpieza Dental</option>
              <option value="Implantes Dentales">Implantes Dentales</option>
              <option value="Prótesis / Placas">Prótesis / Placas</option>
              <option value="Extracción / Muelas del Juicio">Extracción / Muelas del Juicio</option>
              <option value="Dolor / Urgencia">Dolor / Urgencia</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
        </div>

        <div class="dmf-form-group">
          <label for="dmf-in-notas">Mensaje del Anuncio / Notas</label>
          <textarea id="dmf-in-notas" rows="2" placeholder="Primer mensaje o detalles del lead publicitario">${escapeHtml(data.latestMessage)}</textarea>
        </div>

        <!-- Checkbox para agendar cita directa -->
        <div class="dmf-toggle-box">
          <label class="dmf-toggle-label">
            <input type="checkbox" id="dmf-check-agendar">
            <span>📅 ¿Agendar cita directa de inmediato para este paciente?</span>
          </label>
          
          <div id="dmf-box-cita-fields" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);">
            <div class="dmf-grid-2">
              <div class="dmf-form-group">
                <label for="dmf-in-fecha">Fecha de Cita</label>
                <input type="date" id="dmf-in-fecha" value="${todayIso}">
              </div>
              <div class="dmf-form-group">
                <label for="dmf-in-hora">Hora de Cita</label>
                <input type="time" id="dmf-in-hora" value="${defaultTime}">
              </div>
            </div>
          </div>
        </div>

        <div class="dmf-modal-actions">
          <button type="button" class="dmf-btn dmf-btn-secondary" id="dmf-btn-cancel">Cancelar</button>
          <button type="button" class="dmf-btn dmf-btn-primary" id="dmf-btn-save-lead">
            💬 Guardar como Lead
          </button>
          <button type="button" class="dmf-btn dmf-btn-green" id="dmf-btn-save-cita" style="display:none;">
            📅 Guardar Cita Agendada
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    // Wire up events
    const closeBtn = document.getElementById('dmf-btn-close');
    const cancelBtn = document.getElementById('dmf-btn-cancel');
    const checkAgendar = document.getElementById('dmf-check-agendar');
    const boxCitaFields = document.getElementById('dmf-box-cita-fields');
    const btnSaveLead = document.getElementById('dmf-btn-save-lead');
    const btnSaveCita = document.getElementById('dmf-btn-save-cita');

    const closeModal = () => backdrop.remove();

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    checkAgendar.addEventListener('change', () => {
      if (checkAgendar.checked) {
        boxCitaFields.style.display = 'block';
        btnSaveLead.style.display = 'none';
        btnSaveCita.style.display = 'inline-flex';
      } else {
        boxCitaFields.style.display = 'none';
        btnSaveLead.style.display = 'inline-flex';
        btnSaveCita.style.display = 'none';
      }
    });

    btnSaveLead.addEventListener('click', () => submitDMFLead(false, backdrop));
    btnSaveCita.addEventListener('click', () => submitDMFLead(true, backdrop));
  }

  // Submit Lead or Cita to Supabase Cloud
  async function submitDMFLead(isDirectAppointment, modalElement) {
    const paciente = (document.getElementById('dmf-in-paciente').value || '').trim();
    const telefono = (document.getElementById('dmf-in-telefono').value || '').trim();
    const origen = document.getElementById('dmf-in-origen').value;
    const asesor = document.getElementById('dmf-in-asesor').value;
    const sucursal = document.getElementById('dmf-in-sucursal').value;
    const tratamiento = document.getElementById('dmf-in-tratamiento').value;
    const notas = (document.getElementById('dmf-in-notas').value || '').trim();

    if (!paciente) {
      alert('Por favor introduce el nombre del paciente o lead.');
      return;
    }

    let fecha = new Date().toISOString().slice(0, 10);
    let hora = '10:00';
    let estatus = 'Lead';
    let tipo = 'Lead WhatsApp';

    if (isDirectAppointment) {
      fecha = document.getElementById('dmf-in-fecha').value || fecha;
      hora = document.getElementById('dmf-in-hora').value || hora;
      estatus = 'Pendiente';
      tipo = 'Nueva';
    }

    const leadId = 'c_' + (telefono ? telefono.replace(/\D/g, '') : Date.now()) + '_' + fecha + '_' + hora.replace(':', '');

    const record = {
      id: leadId,
      asesor_id: asesor,
      fecha: fecha,
      hora: hora,
      paciente: paciente,
      telefono: telefono,
      sucursal: sucursal,
      tratamiento: tratamiento,
      tipo: tipo,
      origen: origen,
      notas: notas,
      estatus: estatus,
      creado_el: new Date().toISOString(),
      creado_por: asesor,
      historial: [
        {
          tipo: 'lead_whatsapp_capture',
          origen: origen,
          capturadoPor: asesor,
          fecha: new Date().toISOString(),
          primerMensaje: notas,
          esCitaDirecta: isDirectAppointment
        }
      ]
    };

    // Update button state to saving
    const activeBtn = isDirectAppointment
      ? document.getElementById('dmf-btn-save-cita')
      : document.getElementById('dmf-btn-save-lead');
    const originalText = activeBtn.innerHTML;
    activeBtn.disabled = true;
    activeBtn.innerHTML = `Guardando en DMF...`;

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

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Error al guardar en Supabase');
      }

      // Save preference & stats
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          dmf_advisor: asesor,
          dmf_branch: sucursal
        });

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

      modalElement.remove();
      showToast(
        isDirectAppointment
          ? `📅 ¡Cita agendada para ${paciente} registrada en DMF!`
          : `💬 ¡Lead publicitario de ${paciente} registrado en DMF!`
      );
    } catch (err) {
      console.error('Error al registrar en DMF:', err);
      activeBtn.disabled = false;
      activeBtn.innerHTML = originalText;
      showToast('Error al conectar con la base de datos de DMF. Intenta de nuevo.', true);
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  // Observe DOM changes in WhatsApp Web
  const observer = new MutationObserver(() => {
    injectDMFButtons();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Fallback periodic check
  setInterval(injectDMFButtons, 2000);

  console.log('✅ Extensión Dental Más Fácil - WhatsApp Connect cargada correctamente.');
})();
