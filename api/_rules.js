// Fixed, published thresholds (no AI). Levels: 0 comfortable ... 3 severe.
const T = {
  heat: { hot: ['Comfortable', 'Warm', 'Hot', 'Extreme heat'], cold: ['Comfortable', 'Chilly', 'Freezing', 'Dangerous cold'],
    body: ['', 'You may feel sticky or tired in the warmth, or a bit cold without layers.', 'Heavy sweating, headache and dizziness are possible, or numb fingers and toes in the cold.', 'Heat or cold stress can build fast, especially for children, elders and people with heart or lung conditions.'],
    todo: ['', 'Drink water and dress for the weather.', 'Limit time outside, rest in shade or warmth, and check on neighbours.', 'Stay indoors in a safe temperature and get medical help for confusion, fainting or numbness.'] },
  air: { lab: ['Good', 'Moderate', 'Unhealthy', 'Severe'],
    body: ['', 'Very sensitive people may notice a slight cough or itchy eyes.', 'Coughing, itchy eyes and a scratchy throat are likely for many people.', 'Burning eyes, coughing and a tight chest are likely, especially for sensitive people.'],
    todo: ['', 'Sensitive people can take it easy on long outdoor effort.', 'Cut back on outdoor exercise and keep windows closed on bad hours.', 'Stay in if you can, no outdoor exercise, and wear a well-fitted N95/FFP2 mask if you must go out.'] },
  uv: { lab: ['Low', 'Moderate', 'High', 'Very high'],
    body: ['', 'Skin can burn after a long time in the sun.', 'Skin can burn in under 30 minutes.', 'Skin can burn in minutes.'],
    todo: ['', 'Sunscreen helps if you are out for hours.', 'Use sunscreen, a hat and sunglasses, and seek shade at midday.', 'Avoid midday sun, cover up and use SPF 30+.'] }
};
const HEAD = ['A gentle day outside', 'Mostly fine, a few things to watch', 'Take some care today', 'Take this one seriously'];
const CALM = ['Nothing here asks anything of you today. Enjoy the sky.', 'Small steps are enough today. You are already doing them by checking.', 'You cannot change the sky today. What is yours: a few simple steps, and they are below.', 'You cannot change the sky today. What is yours: staying safe, and asking for help if you need it.'];
const cut = (v, c) => (v == null || isNaN(v) ? 0 : c.filter((x) => v >= x).length);
function interpret(feels, aqi, uv) {
  const cold = feels != null && feels <= 8;
  const hl = cold ? (feels <= -10 ? 3 : feels <= 0 ? 2 : 1) : cut(feels, [30, 35, 41]);
  const al = cut(aqi, [51, 101, 201]), ul = cut(uv, [3, 6, 8]);
  const lv = { heat: hl, air: al, uv: ul };
  const r = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const signals = {
    heat: { level: hl, label: (cold ? T.heat.cold : T.heat.hot)[hl], value: r(feels), unit: 'C feels-like' },
    air: { level: al, label: T.air.lab[al], value: r(aqi), unit: 'US AQI' },
    uv: { level: ul, label: T.uv.lab[ul], value: r(uv), unit: 'UV index' }
  };
  const vals = [hl, al, ul], max = Math.max.apply(null, vals), sum = vals.reduce((a, b) => a + b, 0);
  const body = [], todo = [];
  Object.keys(lv).forEach((k) => { if (lv[k] > 0) { body.push(T[k].body[lv[k]]); todo.push(T[k].todo[lv[k]]); } });
  if (!body.length) { body.push('Most people will feel fine today.'); todo.push('Nothing special needed. Water and a walk are always good.'); }
  return { signals, overall: { level: max, headline: HEAD[max], reality_score: Math.min(10, max * 3 + (sum - max)) }, body_may_notice: body, what_to_do: todo, calm_line: CALM[max] };
}
module.exports = { interpret };
