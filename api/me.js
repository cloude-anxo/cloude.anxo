// Used by trips.html. The person is identified by their phone's push address.
// Actions: get, location, history, addTrip, updTrip, pauseTrip, delTrip, skip.
const { db } = require('./_lib');
const { detectProfile } = require('./_profiles');

const UUID = /^[0-9a-f-]{36}$/i;
const MODES = ['driving', 'twowheeler', 'cycling', 'walking', 'transit'];
const MAX_TRIPS = 10;
const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
const place = (p) => p && typeof p.name === 'string' && p.name.trim() && num(p.lat, -90, 90) && num(p.lon, -180, 180);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const b = req.body || {};
    let q = null;
    if (typeof b.endpoint === 'string' && b.endpoint.indexOf('https://') === 0) q = 'endpoint=eq.' + encodeURIComponent(b.endpoint);
    else if (b.action === 'skip' && UUID.test(b.uid || '')) q = 'id=eq.' + b.uid;   // the "Not now" button on the notification
    if (!q) return res.status(400).json({ error: 'bad request' });

    const rows = await db('subscriptions?select=id,lat,lon,profile,tz,trips_skip&' + q);
    const me = rows && rows[0];
    if (!me) return res.status(404).json({ error: 'not_subscribed' });

    if (b.action === 'get') {
      const trips = await db('trips?select=id,from_name,from_lat,from_lon,to_name,to_lat,to_lon,modes,days,depart_time,notes,paused&order=created_at.asc&sub_id=eq.' + me.id);
      return res.json({ profile: me.profile, lat: me.lat, lon: me.lon, tz: me.tz, skipped: !!me.trips_skip, trips: trips || [] });
    }

    if (b.action === 'location') {
      if (!num(b.lat, -90, 90) || !num(b.lon, -180, 180)) return res.status(400).json({ error: 'bad location' });
      const profile = detectProfile(b.lat, b.lon);
      const patch = { lat: b.lat, lon: b.lon, profile, updated_at: new Date().toISOString() };
      if (typeof b.tz === 'string' && b.tz) patch.tz = b.tz.slice(0, 60);
      await db('subscriptions?id=eq.' + me.id, { method: 'PATCH', body: patch });
      return res.json({ ok: true, profile });
    }

    // Shared check for adding and editing a trip.
    const readTrip = () => {
      const modes = Array.isArray(b.modes) ? b.modes.filter((m, i, a) => MODES.indexOf(m) >= 0 && a.indexOf(m) === i) : [];
      const days = Array.isArray(b.days) ? b.days.filter((d, i, a) => Number.isInteger(d) && d >= 0 && d <= 6 && a.indexOf(d) === i) : [];
      if (!place(b.from) || !place(b.to) || !modes.length || !days.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.depart || '')) return null;
      return {
        from_name: b.from.name.slice(0, 80), from_lat: b.from.lat, from_lon: b.from.lon,
        to_name: b.to.name.slice(0, 80), to_lat: b.to.lat, to_lon: b.to.lon,
        modes, days, depart_time: b.depart, notes: String(b.notes || '').slice(0, 500)
      };
    };

    if (b.action === 'addTrip') {
      const t = readTrip();
      if (!t) return res.status(400).json({ error: 'missing or wrong fields' });
      const have = await db('trips?select=id&sub_id=eq.' + me.id);
      if ((have || []).length >= MAX_TRIPS) return res.status(400).json({ error: 'You can save up to ' + MAX_TRIPS + ' trips.' });
      await db('trips', { method: 'POST', body: Object.assign({ sub_id: me.id }, t) });
      return res.json({ ok: true });
    }

    if (b.action === 'updTrip') {
      if (!UUID.test(b.id || '')) return res.status(400).json({ error: 'bad request' });
      const t = readTrip();
      if (!t) return res.status(400).json({ error: 'missing or wrong fields' });
      t.last_alert = null;                       // a changed trip can alert again today
      await db('trips?id=eq.' + b.id + '&sub_id=eq.' + me.id, { method: 'PATCH', body: t });
      return res.json({ ok: true });
    }

    if (b.action === 'pauseTrip') {
      if (!UUID.test(b.id || '') || typeof b.paused !== 'boolean') return res.status(400).json({ error: 'bad request' });
      await db('trips?id=eq.' + b.id + '&sub_id=eq.' + me.id, { method: 'PATCH', body: { paused: b.paused } });
      return res.json({ ok: true });
    }

    if (b.action === 'delTrip') {
      if (!UUID.test(b.id || '')) return res.status(400).json({ error: 'bad request' });
      await db('trips?id=eq.' + b.id + '&sub_id=eq.' + me.id, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    if (b.action === 'history') {
      const rows = await db('alert_log?select=type,title,body,sent_at&order=sent_at.desc&limit=40&sub_id=eq.' + me.id);
      return res.json({ items: rows || [] });
    }

    if (b.action === 'skip') {
      await db('subscriptions?id=eq.' + me.id, { method: 'PATCH', body: { trips_skip: true } });
      return res.json({ ok: true });
    }

    res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
};
