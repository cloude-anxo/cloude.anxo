// Runs every ~15 min (GitHub Actions calls it with the CRON_SECRET).
// For each saved person: 6am briefing, weather alerts, trip alerts, then trip reminders.
const { db, push } = require('./_lib');
const { PROFILES, detectProfile } = require('./_profiles');
const { getContext, clock, evaluate, briefing } = require('./_engine');
const { composeAlert } = require('./_tips');
const { tripAlert } = require('./_trips');

const COOLDOWN = 6 * 3600 * 1000;            // same alert not again within 6 hours, unless it gets worse
const REMIND_EVERY = 12 * 3600 * 1000;       // trip reminder gap
const MAX_REMINDERS = 4;                     // then we stop
// These still arrive during quiet hours (10pm to 6am) and ignore the daily cap.
const EMERGENCY = ['rain', 'heavyrain', 'thunder', 'hail', 'wind', 'dust'];
const isEmergency = (a) => EMERGENCY.indexOf(a.type) >= 0 ||
  (a.type.indexOf('nws:') === 0 && a.lvl === 3 && /Flood|Wind/i.test(a.v.event));

// Old records were just a time string. New ones are {t, lvl, d}.
const norm = (p) => (!p ? null : typeof p === 'string' ? { t: p, lvl: 1, d: null } : p);
const r2 = (x) => Math.round(x * 100) / 100;

module.exports = async (req, res) => {
  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).end();

  const [subs, trips] = await Promise.all([
    db('subscriptions?select=*&lat=not.is.null'),
    db('trips?select=*').catch(() => [])       // before the trips table exists, carry on without it
  ]);
  const byUser = {};
  trips.forEach((t) => { (byUser[t.sub_id] = byUser[t.sub_id] || []).push(t); });

  const stats = { checked: subs.length, sent: 0, removed: 0 };
  db('alert_log?sent_at=lt.' + new Date(Date.now() - 30 * 86400000).toISOString(), { method: 'DELETE' }).catch(() => {});   // history is kept for 30 days
  const cache = {};                            // one weather lookup per place, shared by everyone there
  const ctxFor = (s, P) => {
    const key = r2(s.lat) + ',' + r2(s.lon);
    return cache[key] || (cache[key] = getContext(r2(s.lat), r2(s.lon), P).catch((e) => { console.error('weather failed', key, e.message); return null; }));
  };

  async function handle(s) {
    const P = PROFILES[detectProfile(s.lat, s.lon)];
    const ctx = await ctxFor(s, P);
    if (!ctx) return;
    const k = clock(ctx.W);
    const last = s.last_sent || {};
    const patch = {};
    const iso = new Date().toISOString();
    const now = Date.now();
    const myTrips = byUser[s.id] || [];
    let dirty = false, dead = false, sentRun = false;

    if (s.profile !== P.id || s.tz !== ctx.W.timezone) { patch.profile = P.id; patch.tz = ctx.W.timezone; }

    const send = async (payload) => {
      try {
        await push(s, payload); stats.sent++; sentRun = true;
        db('alert_log', { method: 'POST', body: { sub_id: s.id, type: payload.type || null, title: String(payload.title || '').slice(0, 200), body: String(payload.body || '').slice(0, 500) } }).catch(() => {});   // history; never blocks sending
        return true;
      }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {      // phone uninstalled or blocked us
          await db('subscriptions?id=eq.' + s.id, { method: 'DELETE' }).catch(() => {});
          stats.removed++; dead = true;
        } else console.error('push failed', s.id, e.statusCode || e.message);
        return false;
      }
    };

    const alerts = evaluate(P, ctx, k) || [];

    // 1) Morning briefing, 6:00 local (we allow until 7:30 in case a run is late).
    if ((k.hour === 6 || (k.hour === 7 && k.minute < 30)) && last._brief !== k.today) {
      const b = briefing(P, ctx, k);
      if (b && await send({ title: b.title, body: b.body, type: 'brief', url: '/', ttl: 3 * 3600 })) {
        last._brief = k.today;
        // Whatever the briefing already covered will not be sent again unless it gets worse.
        alerts.forEach((a) => { last[a.type] = { t: iso, lvl: a.lvl, d: k.today }; });
        dirty = true;
      }
      if (dead) return;
    }

    // 2) Weather alerts.
    let list = alerts.filter((a) => {
      const p = norm(last[a.type]);
      if (!p) return true;
      if (P.daily.indexOf(a.type) >= 0) return p.d !== k.today || a.lvl > p.lvl;       // once a day, unless worse
      return a.lvl > p.lvl || now - Date.parse(p.t) > COOLDOWN;                         // 6h cooldown, unless worse
    }).map((a) => Object.assign({}, a, { em: isEmergency(a) }));
    if (k.quiet) list = list.filter((a) => a.em);
    list.sort((x, y) => y.sev - x.sev);
    const sentToday = last._cap && last._cap.d === k.today ? last._cap.n : 0;
    const room = Math.max(0, P.cap - sentToday);
    // A combined message shows at most 3 alerts; only those count as sent, the rest stay eligible.
    const pick = list.filter((a) => a.em).concat(list.filter((a) => !a.em).slice(0, room)).sort((x, y) => y.sev - x.sev).slice(0, 3);
    if (pick.length) {
      const m = composeAlert(pick, P);
      const first = pick[0].type.indexOf('nws:') === 0 ? 'nws' : pick[0].type;
      if (await send({ title: m[0], body: m[1], type: first, url: '/', emergency: pick.some((a) => a.em), ttl: 3600 })) {
        pick.forEach((a) => { last[a.type] = { t: iso, lvl: a.lvl, d: k.today }; });
        last._cap = { d: k.today, n: sentToday + pick.filter((a) => !a.em).length };
        dirty = true;
      }
      if (dead) return;
    }

    // 3) Trip alerts: about 30 minutes before each saved trip leaves.
    for (const t of myTrips) {
      if (t.paused || (t.days || []).indexOf(k.dow) < 0 || t.last_alert === k.today) continue;
      const hh = parseInt(String(t.depart_time).slice(0, 2), 10), mm = parseInt(String(t.depart_time).slice(3, 5), 10);
      const until = hh * 60 + mm - (k.hour * 60 + k.minute);
      if (until < 5 || until > 45) continue;
      let m = null;
      try { m = await tripAlert(t, P); } catch (e) { console.error('trip check failed', t.id, e.message); continue; }
      await db('trips?id=eq.' + t.id, { method: 'PATCH', body: { last_alert: k.today } }).catch(() => {});
      if (m) await send({ title: m.title, body: m.body, type: 'trip', url: '/trips.html', ttl: 1800 });
      if (dead) return;
    }

    // 4) Trip reminder: only for people we have started reminding, only if nothing else was just sent.
    if (!sentRun && s.trip_reminders != null && s.trip_reminders < MAX_REMINDERS && !s.trips_skip && !myTrips.length && !k.quiet &&
        (!s.trip_reminder_at || now - Date.parse(s.trip_reminder_at) >= REMIND_EVERY)) {
      const firstOne = s.trip_reminders === 0;
      const ok = await send({
        title: firstOne ? 'Add your regular trips' : 'Still want trip alerts?',
        body: firstOne ? 'Tap to add the trips you make often and how you travel, so we can warn you on the way.'
          : 'Tap to add your trips and how you travel, so we can warn you on the way.',
        type: 'trips', url: '/trips.html', ttl: 6 * 3600
      });
      if (ok) { patch.trip_reminders = s.trip_reminders + 1; patch.trip_reminder_at = iso; }
      if (dead) return;
    }

    if (dirty) patch.last_sent = last;
    if (Object.keys(patch).length) {
      await db('subscriptions?id=eq.' + s.id, { method: 'PATCH', body: patch }).catch((e) => console.error('save failed', s.id, e.message));
    }
  }

  // Work through people 8 at a time.
  let n = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (n < subs.length) {
      const s = subs[n++];
      try { await handle(s); } catch (e) { console.error('user failed', s.id, e.message || e); }
    }
  }));
  res.json(stats);
};
