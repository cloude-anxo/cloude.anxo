// Trip alerts. Checks the weather at 5 points along a straight line from start to end,
// for the departure hour and the next 2 hours, and writes ONE short message (or nothing).
const { fmt } = require('./_profiles');
const { j } = require('./_engine');

const EXPOSED = ['twowheeler', 'cycling', 'walking'];
const pad = (n) => String(n).padStart(2, '0');
const short = (n) => String(n || '').split(',')[0].trim();
const flat = (arr, key) => arr.reduce((a, s) => a.concat(s[key]), []);
const max = (a, d) => (a.length ? Math.max.apply(null, a) : d);
const min = (a, d) => (a.length ? Math.min.apply(null, a) : d);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

async function tripAlert(t, P) {
  const la = [], lo = [];
  for (let i = 0; i < 5; i++) {
    const x = i / 4;
    la.push((t.from_lat + (t.to_lat - t.from_lat) * x).toFixed(3));
    lo.push((t.from_lon + (t.to_lon - t.from_lon) * x).toFixed(3));
  }
  let R = await j('https://api.open-meteo.com/v1/forecast?latitude=' + la.join(',') + '&longitude=' + lo.join(',') +
    '&timezone=auto&forecast_days=1&hourly=apparent_temperature,precipitation,weather_code,wind_gusts_10m,visibility');
  if (!Array.isArray(R)) R = [R];
  const hh = parseInt(String(t.depart_time).slice(0, 2), 10);
  const keys = ['apparent_temperature', 'precipitation', 'weather_code', 'wind_gusts_10m', 'visibility'];
  const S = R.map((r) => keys.reduce((o, key) => { o[key] = (r.hourly[key] || []).slice(hh, hh + 3).filter((v) => v != null); return o; }, {}));
  const first = S[0], last = S[S.length - 1];

  const f = fmt(P), A = short(t.from_name), B = short(t.to_name), modes = t.modes || [];
  const exposed = modes.some((m) => EXPOSED.indexOf(m) >= 0);
  const drive = modes.indexOf('driving') >= 0 || modes.indexOf('twowheeler') >= 0;
  const vis = min(flat(S, 'visibility'), 99999);
  const gust = max(flat(S, 'wind_gusts_10m'), 0);
  const rain = max(flat(S, 'precipitation'), 0);
  const feels = max(flat(S, 'apparent_temperature'), 0);
  const storm = flat(S, 'weather_code').some((c) => c === 95 || c === 96 || c === 99);
  const dGust = max(last.wind_gusts_10m, 0) - max(first.wind_gusts_10m, 0);
  const dTemp = avg(last.apparent_temperature) - avg(first.apparent_temperature);

  const issues = [];
  if (storm) issues.push('Thunderstorm on your route. ' + (modes.indexOf('transit') >= 0 && !drive && !exposed ? 'Expect delays.' : 'Delay the trip if you can.'));
  if (vis < P.fog) {
    issues.push((P.id === 'india' ? 'Dense fog' : 'Fog') + ' on your trip, visibility ' + f.v(vis) + '. ' +
      (drive ? 'Drive slowly and use fog lights.' : exposed ? 'Wear bright clothes and stay visible.' : 'Expect delays.'));
  }
  if (rain >= P.heavyHr) {
    issues.push('Heavy rain on your route. ' + (drive ? 'Slow down and avoid flooded roads.' : exposed ? 'Wait it out if you can.' : 'Expect delays and carry an umbrella.'));
  } else if (exposed && rain >= 1) {
    issues.push('Rain on your route. Carry rain gear.');
  }
  if (gust >= (exposed ? P.gust * 0.75 : P.gust)) {
    issues.push('Strong gusts on your route, up to ' + f.s(gust) + '. ' + (exposed ? 'Take extra care.' : 'Grip the wheel and watch for debris.'));
  } else if (dGust >= 20 && max(last.wind_gusts_10m, 0) >= 30) {
    issues.push(B + ' is windier than ' + A + ' today, gusts up to ' + f.s(max(last.wind_gusts_10m, 0)) + '. Carry a jacket.');
  }
  if (dTemp <= -6) issues.push(B + ' is about ' + f.d(-dTemp) + ' colder than ' + A + '. Carry a jacket.');
  else if (dTemp >= 8) issues.push(B + ' is about ' + f.d(dTemp) + ' hotter than ' + A + '. Carry water.');
  if (exposed && feels >= P.heat) issues.push('Hot on your route (feels like ' + f.t(feels) + '). Carry water.');

  if (!issues.length) return null;
  return { title: A + ' to ' + B + ' trip', body: issues.slice(0, 2).join(' ') };
}

module.exports = { tripAlert };
