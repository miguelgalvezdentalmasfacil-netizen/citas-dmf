const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';
const APP_URL = 'https://miguelgalvezdentalmasfacil-netizen.github.io/citas-dmf/';

document.addEventListener('DOMContentLoaded', async () => {
  const syncStatus = document.getElementById('syncStatus');
  const syncText = document.getElementById('syncText');
  const btnOpenDMF = document.getElementById('btnOpenDMF');
  const btnScanNow = document.getElementById('btnScanNow');
  const scanFeedback = document.getElementById('scanFeedback');

  // Test Supabase connection
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/citas?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (res.ok) {
      syncText.textContent = 'Nube conectada';
      syncStatus.style.background = 'rgba(16, 185, 129, 0.15)';
      syncStatus.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      throw new Error('Supabase no respondió OK');
    }
  } catch (err) {
    syncText.textContent = 'Sin conexión';
    syncStatus.style.background = 'rgba(239, 68, 68, 0.15)';
    syncStatus.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    const dot = syncStatus.querySelector('.status-dot');
    if (dot) dot.style.background = '#EF4444';
  }

  // Scan WhatsApp chats button
  if (btnScanNow) {
    btnScanNow.addEventListener('click', () => {
      scanFeedback.textContent = 'Escaneando...';
      scanFeedback.style.color = '#0097a7';

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].url || !tabs[0].url.includes('web.whatsapp.com')) {
          scanFeedback.textContent = 'Debes estar en la pestaña de WhatsApp Web';
          scanFeedback.style.color = '#f59e0b';
          return;
        }

        chrome.tabs.sendMessage(tabs[0].id, { action: 'dmf_scan_now' }, (res) => {
          if (chrome.runtime.lastError || !res) {
            scanFeedback.textContent = 'Recarga la página de WhatsApp Web (F5)';
            scanFeedback.style.color = '#ef4444';
          } else {
            scanFeedback.textContent = `✓ Escaneo completado (${res.count} leads sincronizados)`;
            scanFeedback.style.color = '#10b981';
          }
        });
      });
    });
  }

  // Open DMF
  if (btnOpenDMF) {
    btnOpenDMF.addEventListener('click', () => {
      chrome.tabs.create({ url: APP_URL });
    });
  }
});
