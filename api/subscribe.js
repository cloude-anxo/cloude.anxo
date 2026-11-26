// Saves a phone's push address + place. Sends the one-time trial alert when asked.
const { db, push, MESSAGES } = require('./_lib');
const { detectProfile } = require('./_profiles');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { subscription, lat, lon, tz, trial } = req.body || {};
    if (!subscription || !subscription.endpoint || typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'missing fields' });
    }
    const body = {
      endpoint: subscription.endpoint, sub: subscription, lat, lon,
      profile: detectProfile(lat, lon), updated_at: new Date().toISOString()
    };
    if (typeof tz === 'string' && tz) body.tz = tz.slice(0, 60);
    const rows = await db('subscriptions?on_conflict=endpoint', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body
    });
    const row = rows[0];
    if (trial) {
      const [title, text] = MESSAGES.trial;
      try { await push(row, { title, body: text, type: 'trial', emergency: true }); }
      catch (e) { console.error('trial push failed', e.statusCode, e.body); }
    }
    res.json({ uid: row.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
};
