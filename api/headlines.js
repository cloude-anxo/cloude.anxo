// GET /api/headlines?region=india|world  ->  real climate headlines, each with a calm plain-words note
const { translate } = require('./_calm');
const Q = { india: 'climate OR heatwave OR "air pollution" OR flood India when:7d', world: 'climate change OR heatwave OR wildfire OR floods when:7d' };
const END = { india: '&hl=en-IN&gl=IN&ceid=IN:en', world: '&hl=en-US&gl=US&ceid=US:en' };
const dec = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
const tag = (x, t) => { const m = x.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>')); return m ? dec(m[1]) : ''; };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const region = (req.query && req.query.region) === 'world' ? 'world' : 'india';
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 7000);
    const xml = await (await fetch('https://news.google.com/rss/search?q=' + encodeURIComponent(Q[region]) + END[region], { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; CloudeBot)' } })).text();
    clearTimeout(timer);
    const items = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, 8).map((x) => {
      let title = tag(x, 'title'); const source = tag(x, 'source'), link = tag(x, 'link');
      if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
      return Object.assign({ title, source, link: /^https?:\/\//.test(link) ? link : null, published: tag(x, 'pubDate') }, translate(title));
    });
    if (!items.length) throw new Error('empty');
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({ region, items, attribution: 'Headlines via Google News RSS. Calm notes by Cloude. Awareness only, not medical advice.' });
  } catch (e) {
    res.status(502).json({ error: 'upstream_unavailable', message: 'Could not load headlines right now. Try again shortly.' });
  }
};
