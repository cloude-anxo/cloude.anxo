// Cloude PWA helper: top banner, install, location + notification permission, push subscription.
(function () {
  // Public push key (safe to be public). The private half lives only in Vercel settings.
  const VAPID_PUBLIC = 'BBHQZVuBss97yigzuEJ2aUFVBBgtNo1Xl7GVwflTY1H13HsunA0IKAEywfG_-kkJGpjQf0mHeYs0jMaoZ0DE9co';

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let installPrompt = null;

  // Remove the old test buttons from the first version, if they are still in index.html.
  document.querySelectorAll('button[onclick="cloudeTestAlert()"], #cloude-install').forEach((b) => b.remove());

  // Banner styles live here, so index.html needs no extra CSS.
  const css = document.createElement('style');
  css.textContent = `
    #cloude-banner{position:fixed;top:0;left:0;right:0;z-index:99999;background:#0e2238;color:#fff;
      padding:max(12px,env(safe-area-inset-top)) 16px 12px;font:500 15px/1.4 system-ui,sans-serif;
      box-shadow:0 6px 24px rgba(0,0,0,.3);display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    #cloude-banner .t{flex:1 1 220px}
    #cloude-banner small{display:block;opacity:.8;font-weight:400;margin-top:2px}
    #cloude-banner button{padding:10px 16px;border:0;border-radius:10px;background:#8fc7ff;color:#0e2238;font:700 15px system-ui,sans-serif}
    #cloude-banner button.x{background:transparent;color:#fff;opacity:.7;padding:10px 8px}
    #cloude-banner button[disabled]{opacity:.6}`;
  document.head.appendChild(css);

  function banner(title, small, buttons) {
    let b = document.getElementById('cloude-banner');
    if (!b) { b = document.createElement('div'); b.id = 'cloude-banner'; document.body.appendChild(b); }
    b.innerHTML = '<div class="t">' + title + (small ? '<small>' + small + '</small>' : '') + '</div>';
    (buttons || []).forEach(([label, fn, cls]) => {
      const x = document.createElement('button');
      x.textContent = label; if (cls) x.className = cls; x.onclick = fn; b.appendChild(x);
    });
    return b;
  }
  const hideBanner = () => { const b = document.getElementById('cloude-banner'); if (b) b.remove(); };

  function urlB64ToUint8(s) {
    const p = '='.repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }
  const getPosition = () => new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }));

  async function send(sub, pos, trial) {
    const r = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, lat: pos.coords.latitude, lon: pos.coords.longitude, trial })
    });
    if (!r.ok) throw new Error('server said ' + r.status);
    return r.json();
  }

  // The main action: notifications first (needs the tap), then location, then subscribe.
  async function enable() {
    const b = banner('Setting up Cloude alerts...', '', []);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('unsupported');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return banner('Notifications are blocked', 'Allow them in your browser or phone settings, then tap again.', [['Try again', enable]]);

      let pos;
      try { pos = await getPosition(); }
      catch (e) { return banner('Cloude needs your location', 'It checks the weather where you are. Allow location, then tap again.', [['Try again', enable]]); }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) });
      const out = await send(sub.toJSON(), pos, true);
      localStorage.setItem('cloude_uid', out.uid);
      localStorage.setItem('cloude_loc_at', String(Date.now()));
      banner('Cloude alerts are on', 'A trial alert is on its way: rain in about 40 min.', [['OK', hideBanner]]);
      setTimeout(hideBanner, 8000);
    } catch (e) {
      banner('Something went wrong', 'Details: ' + (e && e.message ? e.message : e) + '. Send this to Claude.', [['Try again', enable]]);
    }
  }
  window.cloudeEnable = enable;

  function showStartBanner() {
    if (isIOS && !standalone) {
      return banner('Want Cloude alerts on iPhone?', 'Tap Share, then "Add to Home Screen", then open Cloude from your home screen.', [['Got it', hideBanner, 'x']]);
    }
    const btns = [['Turn on alerts', enable]];
    if (installPrompt) btns.push(['Install app', async () => { installPrompt.prompt(); installPrompt = null; showStartBanner(); }, 'x']);
    banner('Turn on Cloude alerts',
      'Cloude checks the weather where you are. When you turn this on, we send you one trial alert right away: "Rain in about 40 min".',
      btns);
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (document.getElementById('cloude-banner')) showStartBanner(); });

  async function init() {
    if (!('serviceWorker' in navigator)) return;
    await navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW failed', e));
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const on = sub && Notification.permission === 'granted' && localStorage.getItem('cloude_uid');
    if (!on) return showStartBanner();

    // Already on: refresh the saved place when the app opens (at most every 30 minutes).
    const last = Number(localStorage.getItem('cloude_loc_at') || 0);
    if (Date.now() - last > 30 * 60 * 1000 && navigator.geolocation) {
      try { await send(sub.toJSON(), await getPosition(), false); localStorage.setItem('cloude_loc_at', String(Date.now())); } catch (e) {}
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
