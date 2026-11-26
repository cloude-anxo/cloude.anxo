// The brain: pulls the forecast, decides which alerts trigger, and writes the 6am briefing.
const { fmt, hr12 } = require('./_profiles');
const { nwsTip } = require('./_tips');

const UA = 'Cloude/1.0 (' + (process.env.VAPID_SUBJECT || 'mailto:hello@example.com') + ')';

async function j(url, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 9000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const pad = (n) => String(n).padStart(2, '0');
const nums = (a) => (a || []).filter((v) => v != null);
const mx = (a) => { a = nums(a); return a.length ? Math.max.apply(null, a) : null; };
const mn = (a) => { a = nums(a); return a.length ? Math.min.apply(null, a) : null; };
const sum = (a) => nums(a).reduce((x, y) => x + y, 0);

const HOURLY = 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m,visibility,uv_index';
const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum';

// Everything we need for one place. Forecast is required; the rest may be missing.
async function getContext(lat, lon, P) {
  const p = 'latitude=' + lat + '&longitude=' + lon;
  const [W, A, FL, NWS] = await Promise.all([
    j('https://api.open-meteo.com/v1/forecast?' + p + '&timezone=auto&past_days=1&forecast_days=2&hourly=' + HOURLY + '&daily=' + DAILY),
    j('https://air-quality-api.open-meteo.com/v1/air-quality?' + p + '&timezone=auto&current=us_aqi,pm2_5,us_aqi_ozone,dust&hourly=pm2_5&past_hours=4&forecast_hours=1').catch(() => null),
    P.on.indexOf('flood') >= 0 ? j('https://flood-api.open-meteo.com/v1/flood?' + p + '&daily=river_discharge,river_discharge_mean&forecast_days=3').catch(() => null) : null,
    P.on.indexOf('nws') >= 0 ? j('https://api.weather.gov/alerts/active?point=' + lat + ',' + lon).catch(() => null) : null
  ]);
  return { W, A, FL, NWS };
}

// The person's local clock, taken from the forecast's timezone offset.
function clock(W) {
  const d = new Date(Date.now() + (W.utc_offset_seconds || 0) * 1000);
  const today = d.toISOString().slice(0, 10);
  const hour = d.getUTCHours();
  return {
    today, hour, minute: d.getUTCMinutes(), dow: d.getUTCDay(),
    tomorrow: new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10),
    quiet: hour >= 22 || hour < 6                       // quiet hours: 10pm to 6am
  };
}

// Which alerts trigger right now. Returns [{type, lvl, sev, v}] (sev = how serious, for ordering).
function evaluate(P, ctx, k) {
  const { W, A, FL, NWS } = ctx;
  const H = W.hourly, D = W.daily;
  const hi = H.time.indexOf(k.today + 'T' + pad(k.hour) + ':00');
  const di = D.time.indexOf(k.today);
  const ti = H.time.indexOf(k.today + 'T00:00');
  if (hi < 0 || di < 0 || ti < 0) return null;
  const tm = ti + 24;                                   // start of tomorrow in the hourly arrays
  const col = (key, a, b) => (H[key] || []).slice(hi + a, hi + b + 1);
  const has = (t) => P.on.indexOf(t) >= 0;
  const evening = k.hour >= 18 && k.hour <= 19;         // evening heads-up window
  const out = [];
  const add = (type, lvl, sev, v) => out.push({ type, lvl, sev, v: v || {} });

  if (has('rain')) {
    const pr = H.precipitation_probability[hi + 1], pp = H.precipitation[hi + 1], now = H.precipitation[hi];
    if (pr >= P.rainSoon && pp >= 0.2 && !(now >= 0.5)) add('rain', 1, 3);
  }
  if (has('heavyrain')) {
    const hr = mx(col('precipitation', 1, 6)) || 0;
    const rest = sum((H.precipitation || []).slice(hi + 1, ti + 24));
    if (hr >= P.heavyHr || rest >= P.heavyDay) add('heavyrain', hr >= P.heavyHr * 2 ? 2 : 1, 5, { hr, day: rest });
  }
  if (has('thunder') && col('weather_code', 0, 3).some((c) => c === 95 || c === 96 || c === 99)) add('thunder', 1, 5);
  if (has('hail') && col('weather_code', 0, 6).some((c) => c === 96 || c === 99)) add('hail', 1, 4);
  if (has('atmos') && evening) {
    const mm = D.precipitation_sum[di + 1];
    if (mm >= P.atmos) add('atmos', 1, 4, { mm });
  }
  if (has('heat')) {
    const feels = mx(col('apparent_temperature', 0, 6)), temp = mx(col('temperature_2m', 0, 6));
    if (temp != null && temp >= P.extreme) add('heat', 2, 5, { temp, feels });
    else if (feels != null && feels >= P.heat) add('heat', 1, 4, { temp, feels });
    if (evening) {
      const f2 = mx(H.apparent_temperature.slice(tm, tm + 24));
      if (f2 != null && f2 >= P.heat) add('heat_eve', 1, 3, { feels: f2 });
    }
  }
  if (has('cold')) {
    const f = mn(col('apparent_temperature', 0, 6));
    if (f != null && f <= P.cold) add('cold', 1, 3, { feels: f });
  }
  if (has('coldwave')) {
    const t = mn(col('temperature_2m', 0, 6));
    if (t != null && t <= P.coldWave) add('coldwave', t <= P.coldWave - 2 ? 2 : 1, 4, { temp: t });
  }
  if (has('drop')) {                                    // same hour tomorrow vs now (ignores the normal day/night swing)
    const a = H.temperature_2m[hi], b = H.temperature_2m[hi + 24];
    if (a != null && b != null && a - b >= P.drop) add('drop', 1, 2, { drop: a - b });
  }
  if (has('wind')) {
    const g = mx(col('wind_gusts_10m', 0, 6));
    if (g != null && g >= P.gust) add('wind', g >= P.gust + 25 ? 2 : 1, 4, { gust: g });
  }
  if (has('fire')) {
    const dry = (i) => H.wind_gusts_10m[i] >= P.fireGust && H.relative_humidity_2m[i] <= P.fireRh;
    for (let i = hi; i <= hi + 6; i++) if (dry(i)) { add('fire', 1, 4, { gust: H.wind_gusts_10m[i], rh: H.relative_humidity_2m[i] }); break; }
    if (evening) for (let i = tm; i < tm + 24; i++) if (dry(i)) { add('fire_eve', 1, 3); break; }
  }
  if (has('uv')) {
    const u = mx(col('uv_index', 0, 6));
    const l = u == null ? 0 : P.uv.filter((x) => u >= x).length;
    if (l) add('uv', l, 2, { uv: Math.round(u) });
  }
  const c = A && A.current;
  if (has('aqi') && c) {
    const v = P.air === 'us' ? c.us_aqi : c.pm2_5;
    const l = v == null ? 0 : (P.air === 'us' ? [101, 151, 201] : [91, 121, 251]).filter((x) => v >= x).length;
    if (l) add('aqi', l, 2 + l, { v: Math.round(v) });
  }
  if (has('smoke') && A && A.hourly && A.hourly.pm2_5) {
    const s = nums(A.hourly.pm2_5);
    if (s.length >= 4 && s[s.length - 1] - s[s.length - 4] >= 40 && s[s.length - 1] >= 55) add('smoke', 1, 4);
  }
  if (has('ozone') && c && c.us_aqi_ozone >= 101) add('ozone', c.us_aqi_ozone >= 151 ? 2 : 1, 3);
  if (has('fog')) {
    const v = mn(col('visibility', 0, 6));
    if (v != null && v < P.fog) add('fog', 1, 3, { vis: v });
  }
  if (has('dust') && c && c.dust >= P.dustPm && (mx(col('wind_gusts_10m', 0, 3)) || 0) >= P.dustGust) add('dust', 1, 4);
  if (has('flood') && FL && FL.daily) {
    const q = FL.daily.river_discharge || [], m = FL.daily.river_discharge_mean || [];
    if (q.some((x, i) => x != null && m[i] > 0 && x >= 3 * m[i] && x >= 100)) add('flood', 1, 4);
  }
  if (has('nws') && NWS && NWS.features) {
    NWS.features.forEach((ft) => {
      const ev = (ft.properties && ft.properties.event) || '';
      const m = ev.match(/(Watch|Warning|Advisory|Alert)$/);
      if (!m || !/(Heat|Fire|Flood|Wind|Fog|Air Quality|Smoke|Coastal|Surf|Rip|Beach)/i.test(ev)) return;   // no minor "statements"
      const l = m[1] === 'Warning' ? 3 : m[1] === 'Advisory' ? 1 : 2;
      add('nws:' + ev, l, 3 + l, { event: ev, tip: nwsTip(ev) });
    });
  }
  return out;
}

// The 6am message: what to expect today and what to carry.
function briefing(P, ctx, k) {
  const f = fmt(P), H = ctx.W.hourly, D = ctx.W.daily;
  const di = D.time.indexOf(k.today), ti = H.time.indexOf(k.today + 'T00:00');
  if (di < 0 || ti < 0) return null;
  const at = (key, h) => H[key][ti + h];
  const win = (key, a, b) => H[key].slice(ti + a, ti + b + 1);
  const peak = (key, a, b) => { let h = a, v = -1e9; for (let i = a; i <= b; i++) { const x = at(key, i); if (x != null && x > v) { v = x; h = i; } } return { h, v }; };
  const hi = D.temperature_2m_max[di], lo = D.temperature_2m_min[di];
  const out = ['High ' + f.t(hi) + ', low ' + f.t(lo) + '.'];
  let flag = false;
  const note = (s) => { out.push(s); flag = true; };

  let rainH = -1, stormH = -1;
  for (let h = k.hour; h < 24; h++) {
    if (rainH < 0 && at('precipitation_probability', h) >= P.rainSoon && at('precipitation', h) >= 0.2) rainH = h;
    if (stormH < 0 && [95, 96, 99].indexOf(at('weather_code', h)) >= 0) stormH = h;
  }
  if (peak('precipitation', k.hour, 23).v >= P.heavyHr) note('Heavy rain likely today. Avoid low roads and drive slowly.');
  else if (rainH >= 0) note('Rain around ' + hr12(rainH) + '. Carry an umbrella.');
  if (stormH >= 0) note('Thunderstorms possible around ' + hr12(stormH) + '. Stay indoors when it starts.');

  const hot = peak('apparent_temperature', k.hour, 23);
  if (hot.v >= P.heat) note('Feels like ' + f.t(hot.v) + ' by ' + hr12(hot.h) + '. Carry water and avoid the midday sun.');
  if (P.cold != null) {
    const c = mn(win('apparent_temperature', k.hour, k.hour + 6));
    if (c != null && c <= P.cold) note('Feels like ' + f.t(c) + ' this morning. Wear warm layers.');
  }
  if (P.coldWave != null) {
    const c = mn(win('temperature_2m', k.hour, k.hour + 6));
    if (c != null && c <= P.coldWave) note('Cold wave today, ' + f.t(c) + '. Wear layers and cover your head and ears.');
  }
  const g = mx(win('wind_gusts_10m', k.hour, 23));
  if (g != null && g >= P.gust) note('Gusts up to ' + f.s(g) + '. Secure loose items.');
  const vis = mn(win('visibility', k.hour, k.hour + 4));
  if (vis != null && vis < P.fog) note((P.id === 'india' ? 'Dense fog' : 'Fog') + ' this morning, visibility ' + f.v(vis) + '. Drive slowly and keep your lights on.');

  const u = peak('uv_index', 0, 23);
  if (u.v >= 3) { out.push('UV ' + Math.round(u.v) + ' around ' + hr12(u.h) + '. Wear sunscreen.'); if (u.v >= P.uv[0]) flag = true; }
  if (P.hotter && di > 0 && hi - D.temperature_2m_max[di - 1] >= P.hotter) note('Much hotter than yesterday. Drink extra water.');
  if (P.swing && hi - lo >= P.swing) note('Big temperature swing today (' + f.d(hi - lo) + '). Carry a layer.');

  const c = ctx.A && ctx.A.current;
  if (c && P.air === 'us' && c.us_aqi != null) {
    const a = c.us_aqi;
    if (a <= 50) out.push('Air is good.');
    else if (a <= 100) out.push('Air is moderate.');
    else if (a <= 150) note('Air is unhealthy for sensitive people. Limit hard outdoor exercise.');
    else if (a <= 200) note('Air is unhealthy. Limit outdoor exercise.');
    else note('Air is very unhealthy. Stay indoors if you can.');
  } else if (c && P.air === 'in' && c.pm2_5 != null) {
    const p = c.pm2_5;
    if (p <= 30) out.push('Air is good.');
    else if (p <= 60) out.push('Air is satisfactory.');
    else if (p <= 90) out.push('Air is moderate. Sensitive people should take it easy outdoors.');
    else if (p <= 120) note('Air is poor. Go easy on outdoor exercise.');
    else if (p <= 250) note('Air is very poor. Avoid outdoor exercise.');
    else note('Air is severe. Stay indoors if you can.');
  }
  if (!flag) out.push('Calm day ahead, nothing to worry about.');
  return { title: 'Good morning', body: out.join(' ') };
}

module.exports = { getContext, clock, evaluate, briefing, j };
