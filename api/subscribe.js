// Saves a phone's push address + place. Sends the one-time trial alert when asked.
const { db, push, MESSAGES } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { subscription, lat, lon, trial } = req.body || {};
    if (!subscription || !subscription.endpoint || typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'missing fields' });
    }
    const rows = await db('subscriptions?on_conflict=endpoint', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { endpoint: subscription.endpoint, sub: subscription, lat, lon, updated_at: new Date().toISOString() }
    });
    const row = rows[0];
    if (trial) {
      const [title, body] = MESSAGES.trial;
      try { await push(row, { title, body, type: 'trial' }); }
      catch (e) { console.error('trial push failed', e.statusCode, e.body); }
    }
    res.json({ uid: row.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
};
