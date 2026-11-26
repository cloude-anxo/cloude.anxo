// Owner-only test tool (needs the CRON_SECRET). Used by test.html.
// kinds: setup | trip_bay | trip_india | brief_bay | brief_india | alert | start_me | start_all
const { db, push } = require('./_lib');
const { PROFILES, fmt } = require('./_profiles');
const { composeAlert } = require('./_tips');

// Made-up forecast values, so each alert can be shown without waiting for real weather.
const SAMPLE = {
  rain: {}, thunder: {}, hail: {}, smoke: {}, ozone: {}, dust: {}, flood: {},
  heavyrain: { hr: 12, day: 30 }, atmos: { mm: 55 },
  heat: { temp: 36, feels: 41 }, cold: { feels: 1 }, coldwave: { temp: 3 }, drop: { drop: 9 },
  wind: { gust: 62 }, fire: { gust: 50, rh: 18 }, uv: { uv: 9 }, aqi: { v: 180 }, fog: { vis: 150 }
};
const EMERGENCY = ['rain', 'heavyrain', 'thunder', 'hail', 'wind', 'dust'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).end();
  try {
    const b = req.body || {};
    const kind = String(b.kind || '');

    if (kind === 'start_all') {                                  // begin trip reminders for everyone who has not started
      const rows = await db('subscriptions?trip_reminders=is.null', { method: 'PATCH', prefer: 'return=representation', body: { trip_reminders: 0 } });
      return res.json({ ok: true, started: (rows || []).length });
    }

    if (typeof b.endpoint !== 'string' || b.endpoint.indexOf('https://') !== 0) return res.status(400).json({ error: 'no endpoint' });
    const rows = await db('subscriptions?select=*&endpoint=eq.' + encodeURIComponent(b.endpoint));
    const me = rows && rows[0];
    if (!me) return res.status(404).json({ error: 'This phone is not subscribed to alerts yet.' });

    if (kind === 'start_me') {                                   // this phone gets reminder #1 on the next scheduler run
      await db('subscriptions?id=eq.' + me.id, { method: 'PATCH', body: { trip_reminders: 0, trip_reminder_at: null, trips_skip: false } });
      return res.json({ ok: true });
    }

    let p = null;
    if (kind === 'setup') {
      p = { title: 'Update your location and regular trips', body: 'Tap to share your location and add trips, so alerts fit your day.', type: 'trips', url: '/trips.html' };
    } else if (kind === 'trip_bay') {
      p = { title: 'Oakland to SF trip', body: 'SF is windier than Oakland today, gusts up to ' + fmt(PROFILES.bay).s(45) + '. Carry a jacket.', type: 'trip', url: '/trips.html' };
    } else if (kind === 'trip_india') {
      p = { title: 'Jalalabad to Ferozepur trip', body: 'Dense fog on your trip, visibility ' + fmt(PROFILES.india).v(150) + '. Drive slowly and use fog lights.', type: 'trip', url: '/trips.html' };
    } else if (kind === 'brief_bay') {
      p = { title: 'Good morning', body: 'High 72°F, low 51°F. Rain around 3pm. Carry an umbrella. UV 7 around 12pm. Wear sunscreen. Air is good.', type: 'brief', url: '/' };
    } else if (kind === 'brief_india') {
      p = { title: 'Good morning', body: 'High 43°C, low 29°C. Feels like 41°C by 2pm. Carry water and avoid the midday sun. UV 9 around 1pm. Wear sunscreen. Air is poor. Go easy on outdoor exercise.', type: 'brief', url: '/' };
    } else if (kind === 'alert') {
      const P = PROFILES[b.profile];
      const type = String(b.type || '');
      if (!P || !(type in SAMPLE)) return res.status(400).json({ error: 'unknown profile or alert' });
      const lvl = Math.min(3, Math.max(1, parseInt(b.lvl, 10) || 1));
      const m = composeAlert([{ type, lvl, sev: 1, v: SAMPLE[type] }], P);
      p = { title: m[0], body: m[1], type, url: '/', emergency: EMERGENCY.indexOf(type) >= 0 };
    }
    if (!p) return res.status(400).json({ error: 'unknown kind' });

    p.title = 'Test: ' + p.title;
    await push(me, p);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
};
