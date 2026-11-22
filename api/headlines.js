// Cloude headlines server: fetches fresh climate news, caches it for 5 minutes for ALL visitors.
function decode(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

module.exports = async function handler(req, res) {
  const scope = req.query && req.query.scope === 'world' ? 'world' : 'india';
  const q = '(climate OR heatwave OR "air quality" OR AQI OR flood OR cyclone OR wildfire OR smog OR drought OR "cold wave") when:1d';
  const region = scope === 'india' ? '&hl=en-IN&gl=IN&ceid=IN:en' : '&hl=en-US&gl=US&ceid=US:en';
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + region;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CloudeBot/1.0)' } });
    if (!r.ok) throw new Error('feed ' + r.status);
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 50).map(function (m) {
      const b = m[1];
      const g = function (t) {
        const x = new RegExp('<' + t + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + t + '>').exec(b);
        return x ? x[1].trim() : '';
      };
      const source = decode(g('source'));
      let title = decode(g('title'));
      if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
      return { title: title, url: g('link'), domain: source, ts: Date.parse(g('pubDate')) || 0 };
    });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.status(200).json({ items: items, fetched: Date.now() });
  } catch (e) {
    res.status(502).json({ error: 'unavailable' });
  }
};
