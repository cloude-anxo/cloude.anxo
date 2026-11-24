// Runs every ~15 min (GitHub Actions calls it). Checks Open-Meteo for every saved place
// and sends an alert when something risky shows up.
const { db, push, MESSAGES } = require('./_lib');

const COOLDOWN_HOURS = 6;           // same kind of alert at most once per 6 hours per person
const LIMITS = { heat: 40, aqi: 150, uv: 8 };   // apparent temp °C, US AQI, UV index

// Index of the entry closest to "now" in Open-Meteo's local-time arrays.
function nowIndex(times, offsetSec) {
  const local = Date.now() + offsetSec * 1000;
  let best = 0, gap = Infinity;
  times.forEach((t, i) => {
    const g = Math.abs(Date.parse(t + 'Z') - local);
    if (g < gap) { gap = g; best = i; }
  });
  return best;
}

async function risks(lat, lon) {
  const w = await (await fetch(
    'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&current=apparent_temperature,precipitation&hourly=uv_index&minutely_15=precipitation' +
    '&forecast_days=1&timezone=auto'
  )).json();
  const a = await (await fetch(
    'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon + '&current=us_aqi'
  )).json();

  const found = [];
  const off = w.utc_offset_seconds || 0;

  // Rain: dry now, but 0.2 mm or more in one of the next four 15-minute slots.
  if (w.minutely_15 && w.current && !(w.current.precipitation > 0)) {
    const i = nowIndex(w.minutely_15.time, off);
    for (let k = 1; k <= 4; k++) {
      if ((w.minutely_15.precipitation[i + k] || 0) >= 0.2) { found.push({ type: 'rain', min: k * 15 }); break; }
    }
  }
  if (w.current && w.current.apparent_temperature >= LIMITS.heat) found.push({ type: 'heat' });
  if (w.hourly) {
    const uv = w.hourly.uv_index[nowIndex(w.hourly.time, off)];
    if (uv >= LIMITS.uv) found.push({ type: 'uv' });
  }
  if (a.current && a.current.us_aqi >= LIMITS.aqi) found.push({ type: 'aqi' });
  return found;
}

module.exports = async (req, res) => {
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).end();
  const subs = await db('subscriptions?select=*&lat=not.is.null');
  let sent = 0, removed = 0;

  for (const s of subs) {
    try {
      const last = s.last_sent || {};
      const list = (await risks(s.lat, s.lon)).filter((r) =>
        !last[r.type] || Date.now() - Date.parse(last[r.type]) > COOLDOWN_HOURS * 3600 * 1000);
      if (!list.length) continue;

      const r = list[0];                                   // one alert per run is enough
      const m = MESSAGES[r.type](r.min);
      await push(s, { title: m[0], body: m[1], type: r.type });
      last[r.type] = new Date().toISOString();
      await db('subscriptions?id=eq.' + s.id, { method: 'PATCH', body: { last_sent: last } });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {   // phone uninstalled or blocked us
        await db('subscriptions?id=eq.' + s.id, { method: 'DELETE' }).catch(() => {});
        removed++;
      } else console.error('user failed', s.id, e.message || e);
    }
  }
  res.json({ checked: subs.length, sent, removed });
};
