const SUPABASE_URL = 'https://hzdootsarxbawbwtsfyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vNm3-NzhO_zfBtrIUunSVQ_tD-Giufe';

document.addEventListener('DOMContentLoaded', async () => {
  const advisorSelect = document.getElementById('advisorSelect');
  const branchSelect = document.getElementById('branchSelect');
  const todayLeadsCount = document.getElementById('todayLeadsCount');
  const totalCapturedCount = document.getElementById('totalCapturedCount');
  const syncStatus = document.getElementById('syncStatus');
  const syncText = document.getElementById('syncText');
  const btnOpenDMF = document.getElementById('btnOpenDMF');

  // Load saved preferences
  chrome.storage.local.get(['dmf_advisor', 'dmf_branch', 'dmf_leads_today', 'dmf_leads_total', 'dmf_leads_date'], (res) => {
    if (res.dmf_advisor) advisorSelect.value = res.dmf_advisor;
    if (res.dmf_branch) branchSelect.value = res.dmf_branch;

    const todayIso = new Date().toISOString().slice(0, 10);
    const todayCount = (res.dmf_leads_date === todayIso) ? (res.dmf_leads_today || 0) : 0;
    todayLeadsCount.textContent = todayCount;
    totalCapturedCount.textContent = res.dmf_leads_total || 0;
  });

  // Save changes
  advisorSelect.addEventListener('change', () => {
    chrome.storage.local.set({ dmf_advisor: advisorSelect.value });
  });

  branchSelect.addEventListener('change', () => {
    chrome.storage.local.set({ dmf_branch: branchSelect.value });
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
      syncText.textContent = 'En la nube (Conectado)';
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
    // Open the local or web version of DMF
    chrome.tabs.create({ url: 'https://hzdootsarxbawbwtsfyp.supabase.co' });
  });
});
