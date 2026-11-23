// GET /api/signals?lat=30.9&lon=75.85   or   /api/signals?q=Ludhiana   (optional: &worry=1..10)
const { interpret } = require('./_rules');
const { compare } = require('./_calm');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const q = req.query || {};
  try {
    let lat = parseFloat(q.lat), lon = parseFloat(q.lon), name = null;
    if (q.q && !(isFinite(lat) && isFinite(lon))) {
      const g = await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=' + encodeURIComponent(String(q.q).slice(0, 80)))).json();
      const r = g.results && g.results[0];
      if (!r) return res.status(404).json({ error: 'place_not_found', message: 'Could not find that place. Try a bigger city or use lat and lon.' });
      lat = r.latitude; lon = r.longitude; name = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
    }
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      return res.status(400).json({ error: 'bad_request', message: 'Send lat and lon (numbers), or q (a place name).' });
    lat = Math.round(lat * 100) / 100; lon = Math.round(lon * 100) / 100; // ~1 km, so nearby calls share one cached answer
    const p = '&latitude=' + lat + '&longitude=' + lon;
    const [w, a] = await Promise.all([
      fetch('https://api.open-meteo.com/v1/forecast?current=temperature_2m,apparent_temperature' + p).then((r) => r.json()),
      fetch('https://air-quality-api.open-meteo.com/v1/air-quality?current=us_aqi,uv_index' + p).then((r) => r.json()).catch(() => ({}))
    ]);
    const c = (w && w.current) || {}, ac = (a && a.current) || {};
    const out = interpret(c.apparent_temperature != null ? c.apparent_temperature : c.temperature_2m, ac.us_aqi, ac.uv_index);
    const wv = parseInt(q.worry, 10), wr = wv >= 1 && wv <= 10 ? { worry_vs_reality: compare(wv, out.overall.reality_score) } : {};
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    res.status(200).json(Object.assign({ location: { lat: lat, lon: lon, name: name }, updated: new Date().toISOString() }, out, wr, {
      attribution: 'Weather data by Open-Meteo.com (https://open-meteo.com)',
      disclaimer: 'Awareness only, not medical advice.'
    }));
  } catch (e) {
    res.status(502).json({ error: 'upstream_unavailable', message: 'Data source did not respond. Try again shortly.' });
  }
};
