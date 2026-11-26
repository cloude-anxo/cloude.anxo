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

// The original one-time trial alert (used by subscribe.js).
const MESSAGES = {
  trial: ['Trial alert: rain in about 40 min. Windy.', 'Cloude suggests keeping your inhaler in your bag. Did you?']
};

// payload: { title, body, type, url?, emergency?, ask?, ttl? }
async function push(sub, payload) {
  return webpush.sendNotification(sub.sub, JSON.stringify({ ...payload, uid: sub.id }), {
    TTL: payload.ttl || 3600,
    urgency: payload.emergency ? 'high' : 'normal'
  });
}

module.exports = { db, push, MESSAGES };
