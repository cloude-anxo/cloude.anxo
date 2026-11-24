// Shared helpers: Supabase (plain REST calls) and web-push setup.
const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:hello@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function db(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + (await r.text()));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// What each alert says. Same wording as the check-in page.
const MESSAGES = {
  trial: ['Trial alert: rain in about 40 min. Windy.', 'Cloude suggests keeping your inhaler in your bag. Did you?'],
  rain:  (min) => ['Rain in about ' + min + ' min', 'Carry your inhaler and an umbrella. Did you?'],
  heat:  () => ['It is very hot outside', 'Drink water and stay out of the sun. Did you?'],
  aqi:   () => ['The air is unhealthy right now', 'Wear a mask or stay indoors. Did you?'],
  uv:    () => ['UV is very high', 'Cover up or wear sunscreen. Did you?']
};

async function push(sub, payload) {
  return webpush.sendNotification(sub.sub, JSON.stringify({ ...payload, uid: sub.id }), { TTL: 3600, urgency: 'high' });
}

module.exports = { db, push, MESSAGES };
