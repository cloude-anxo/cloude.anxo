// Cloude PWA helper: install button, notification permission, test alert, Yes/No check-in.
(function () {
  const $ = (id) => document.getElementById(id);
  let installPrompt = null;

  // 1. Register the background helper (service worker)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW failed', e));
  }

  // 2. Install button (Android/desktop Chrome). iPhone: Share > Add to Home Screen.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); installPrompt = e;
    if ($('cloude-install')) $('cloude-install').hidden = false;
  });
  window.cloudeInstall = async () => {
    if (!installPrompt) return alert('On iPhone: tap Share, then "Add to Home Screen".');
    installPrompt.prompt(); installPrompt = null; $('cloude-install').hidden = true;
  };

  // 3. Ask permission, then show a test alert (no backend needed yet)
  window.cloudeTestAlert = async () => {
    if (!('Notification' in window)) return alert('Notifications are not supported here.');
    const p = await Notification.requestPermission();
    if (p !== 'granted') return alert('Please allow notifications to try Cloude alerts.');
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('Rain in about 40 min. Windy.', {
      body: 'Cloude suggests keeping your inhaler in your bag. Did you?',
      icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      data: { id: 'demo' },
      actions: [{ action: 'yes', title: 'Yes' }, { action: 'no', title: 'No' }]
    });
  };

  // 4. Handle the answer when the app opens from a notification
  function saveAnswer(answer, id) {
    try {
      const log = JSON.parse(localStorage.getItem('cloude_checkins') || '[]');
      log.push({ id, answer, at: new Date().toISOString() });
      localStorage.setItem('cloude_checkins', JSON.stringify(log));
    } catch (e) {}
    // LATER: fetch('https://YOUR-API/checkins', { method: 'POST', body: JSON.stringify({ id, answer }) })
    toast('Thanks, logged: ' + answer.toUpperCase());
  }
  function toast(html) {
    const t = document.createElement('div');
    t.className = 'cloude-toast'; t.innerHTML = html; document.body.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }
  const q = new URLSearchParams(location.search);
  const c = q.get('checkin'), id = q.get('id') || 'demo';
  if (c === 'yes' || c === 'no') saveAnswer(c, id);
  if (c === 'ask') {
    toast('Did you do it? <button onclick="cloudeAnswer(\'yes\')">Yes</button> <button onclick="cloudeAnswer(\'no\')">No</button>');
  }
  window.cloudeAnswer = (a) => { document.querySelectorAll('.cloude-toast').forEach((t) => t.remove()); saveAnswer(a, id); };
})();
