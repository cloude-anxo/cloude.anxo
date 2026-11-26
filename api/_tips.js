// ALL ALERT WORDING LIVES HERE. Edit the text freely; the logic is elsewhere.
// Each entry: label (used when several alerts are combined) and make() -> [title, body].
// f = unit formatter (°F/mph/in for the Bay Area, °C/km/h/mm elsewhere). v = values from the forecast.

const { fmt } = require('./_profiles');

const nwsTip = (ev) =>
  /Heat/i.test(ev) ? 'Drink water, limit time outside and check on neighbours.'
  : /Fire|Red Flag/i.test(ev) ? 'Avoid anything that sparks and be ready to leave if told to.'
  : /Flood/i.test(ev) ? 'Avoid low roads and never drive through flood water.'
  : /Wind/i.test(ev) ? 'Secure loose items and take care outdoors.'
  : /Fog/i.test(ev) ? 'Drive slowly and keep your lights on.'
  : /Air Quality|Smoke/i.test(ev) ? 'Limit time outside and keep windows closed.'
  : 'Stay away from the water and the shoreline.';

const A = {
  rain: { label: () => 'rain soon', make: () => ['Rain within the hour', 'Carry an umbrella.'] },
  heavyrain: {
    label: () => 'heavy rain',
    make: (v, f, P) => ['Heavy rain expected',
      v.hr >= P.heavyHr ? 'Up to ' + f.r(v.hr) + ' an hour. Avoid flooded roads and drive slowly.'
        : 'About ' + f.r(v.day) + ' more rain today. Avoid flooded roads and drive slowly.']
  },
  thunder: { label: () => 'thunderstorm', make: () => ['Thunderstorm nearby', 'Stay indoors and away from open ground and tall trees.'] },
  hail: { label: () => 'hail', make: () => ['Hail in the forecast', 'Park under cover and stay indoors.'] },
  atmos: {
    label: () => 'a big storm tomorrow',
    make: (v, f) => ['Heavy storm tomorrow', 'About ' + f.r(v.mm) + ' of rain expected. Plan travel early and avoid flood-prone roads.']
  },
  heat: {
    label: (a) => (a.lvl >= 2 ? 'extreme heat' : 'hot'),
    make: (v, f, P, lvl) => lvl >= 2
      ? ['Extreme heat', f.t(v.temp) + ' outside. Stay indoors and drink water.']
      : ['It is very hot', 'Feels like ' + f.t(v.feels) + '. Drink water and avoid the midday sun.']
  },
  heat_eve: {
    label: () => 'hot tomorrow',
    make: (v, f) => ['Hot day tomorrow', 'Feels like ' + f.t(v.feels) + ' tomorrow. Keep outdoor work for the morning and drink water.']
  },
  cold: { label: () => 'cold', make: (v, f) => ['It is cold outside', 'Feels like ' + f.t(v.feels) + '. Wear warm layers.'] },
  coldwave: {
    label: () => 'a cold wave',
    make: (v, f) => ['Cold wave', f.t(v.temp) + ' outside. Wear layers and cover your head and ears.']
  },
  drop: {
    label: () => 'a big temperature drop',
    make: (v, f) => ['Temperature drop ahead', 'About ' + f.d(v.drop) + ' colder by this time tomorrow. Pack a warmer layer.']
  },
  wind: {
    label: () => 'windy',
    make: (v, f) => ['Strong winds', 'Gusts up to ' + f.s(v.gust) + '. Secure loose items and take care outdoors.']
  },
  fire: {
    label: () => 'fire danger',
    make: (v, f) => ['Fire danger', 'Windy and very dry (gusts ' + f.s(v.gust) + ', humidity ' + Math.round(v.rh) + '%). Avoid anything that sparks.']
  },
  fire_eve: {
    label: () => 'fire danger tomorrow',
    make: () => ['Fire danger tomorrow', 'Tomorrow looks windy and very dry. Avoid anything that sparks.']
  },
  uv: {
    label: (a) => (a.lvl >= 3 ? 'extreme UV' : 'high UV'),
    make: (v, f, P, lvl) => [lvl >= 3 ? 'Extreme UV' : 'High UV today', 'UV ' + v.uv + '. Wear sunscreen and a hat.']
  },
  aqi: {
    label: () => 'poor air',
    make: (v, f, P, lvl) => {
      if (P.air === 'us') {
        return [['Air quality is poor for sensitive people', 'Air quality is unhealthy', 'Air quality is very unhealthy'][lvl - 1],
          ['Sensitive people should limit time outside.', 'Limit outdoor exercise. A mask helps.', 'Stay indoors if you can. Wear an N95 mask outside.'][lvl - 1]];
      }
      return [['Air quality is poor', 'Air quality is very poor', 'Air quality is severe'][lvl - 1],
        ['Go easy on outdoor exercise. A mask helps.', 'Avoid outdoor exercise. Wear an N95 mask outside.', 'Stay indoors if you can. Wear an N95 mask if you must go out.'][lvl - 1]];
    }
  },
  smoke: {
    label: () => 'smoky air',
    make: () => ['Smoke in the air', 'Air quality is getting worse fast. Keep windows closed and limit time outside.']
  },
  ozone: { label: () => 'smog', make: () => ['Smog (ozone) is high', 'Limit hard outdoor exercise in the afternoon.'] },
  fog: {
    label: () => 'fog',
    make: (v, f, P) => [P.id === 'india' ? 'Dense fog' : 'Fog', 'Visibility ' + f.v(v.vis) + '. Drive slowly and keep your lights on.']
  },
  dust: {
    label: () => 'a dust storm',
    make: () => ['Dust storm', 'Stay indoors with windows closed. Cover your nose and mouth if you go out.']
  },
  flood: {
    label: () => 'flood risk',
    make: () => ['Flood risk', 'Rivers nearby are much higher than normal. Avoid low ground and river banks.']
  },
  nws: {
    label: (a) => a.v.event.toLowerCase(),
    make: (v) => [v.event, 'Official alert from the National Weather Service. ' + v.tip]
  }
};

const base = (type) => (type.indexOf('nws:') === 0 ? 'nws' : type);
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const joinNice = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

function make(a, P, f) {
  return A[base(a.type)].make(a.v || {}, f, P, a.lvl);
}

// One alert -> its own message. Several -> one combined message ("Hot and poor air today").
function composeAlert(list, P) {
  const f = fmt(P);
  if (list.length === 1) return make(list[0], P, f);
  const top = list.slice(0, 3);
  const labels = top.map((a) => A[base(a.type)].label(a));
  const suffix = labels.some((l) => /tomorrow/.test(l)) ? '' : ' today';
  return [cap1(joinNice(labels)) + suffix, top.map((a) => make(a, P, f)[1]).join(' ')];
}

module.exports = { composeAlert, nwsTip };
