// Saves a Yes/No answer. Called from the notification buttons or the check-in page.
const { db } = require('./_lib');
const UUID = /^[0-9a-f-]{36}$/i;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { uid, type, answer } = req.body || {};
    if (!['yes', 'no'].includes(answer) || !UUID.test(uid || '')) return res.status(400).json({ error: 'bad request' });
    await db('checkins', { method: 'POST', body: { uid, alert_type: String(type || 'trial').slice(0, 20), answer } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
};
