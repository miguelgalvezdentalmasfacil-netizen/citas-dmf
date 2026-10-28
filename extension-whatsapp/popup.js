const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';

document.addEventListener('DOMContentLoaded', async () => {
  const assignMode = document.getElementById('assignMode');
  const todayLeadsCount = document.getElementById('todayLeadsCount');
  const totalCapturedCount = document.getElementById('totalCapturedCount');
  const syncStatus = document.getElementById('syncStatus');
  const syncText = document.getElementById('syncText');
  const btnOpenDMF = document.getElementById('btnOpenDMF');

  // Load saved preferences
  chrome.storage.local.get(['dmf_assign_mode', 'dmf_leads_today', 'dmf_leads_total', 'dmf_leads_date'], (res) => {
    if (res.dmf_assign_mode) assignMode.value = res.dmf_assign_mode;

    const todayIso = new Date().toISOString().slice(0, 10);
    const todayCount = (res.dmf_leads_date === todayIso) ? (res.dmf_leads_today || 0) : 0;
    todayLeadsCount.textContent = todayCount;
    totalCapturedCount.textContent = res.dmf_leads_total || 0;
  });

  // Save changes
  assignMode.addEventListener('change', () => {
    chrome.storage.local.set({ dmf_assign_mode: assignMode.value });
  });

  // Test Supabase connection
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/citas?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (res.ok) {
      syncText.textContent = 'Automático Activo (En la nube)';
      syncStatus.style.background = 'rgba(16, 185, 129, 0.15)';
      syncStatus.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      throw new Error('Supabase no respondió OK');
    }
  } catch (err) {
    syncText.textContent = 'Sin conexión';
    syncStatus.style.background = 'rgba(239, 68, 68, 0.15)';
    syncStatus.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    syncStatus.querySelector('.status-dot').style.background = '#EF4444';
  }

  // Open DMF
  btnOpenDMF.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://hzdootsarxbawbwtsfyp.supabase.co' });
  });
});
