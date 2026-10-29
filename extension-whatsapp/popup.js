const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';
const APP_URL = 'https://miguelgalvezdentalmasfacil-netizen.github.io/citas-dmf/';

document.addEventListener('DOMContentLoaded', async () => {
  const syncStatus = document.getElementById('syncStatus');
  const syncText = document.getElementById('syncText');
  const btnOpenDMF = document.getElementById('btnOpenDMF');

  // Test Supabase connection
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/citas?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (res.ok) {
      syncText.textContent = 'Conectado a la nube';
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

  // Open DMF
  if (btnOpenDMF) {
    btnOpenDMF.addEventListener('click', () => {
      chrome.tabs.create({ url: APP_URL });
    });
  }
});