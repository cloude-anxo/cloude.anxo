// Alert limits for each kind of place. Change the numbers here and nowhere else.
// "on" = which alerts exist for that profile. "daily" = alerts that go out at most once a day
// (they also live inside the 6am briefing, and only come again later if they get worse).

const inBox = (b, lat, lon) => lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3];
const BAY_BOX = [36.9, 38.6, -123.1, -121.2];   // south, north, west, east
const INDIA_BOX = [6, 36, 68, 98];

const bay = {
  id: 'bay', label: 'Bay Area', units: 'us', cap: 5,
  rainSoon: 50, heavyHr: 4, heavyDay: 25, atmos: 50,
  heat: 32, extreme: 38, hotter: 8, cold: 3, drop: 6, swing: 12,
  gust: 45, fireGust: 40, fireRh: 25,
  uv: [6, 8, 11], air: 'us', fog: 1000,
  on: ['rain', 'heavyrain', 'thunder', 'atmos', 'heat', 'cold', 'drop', 'wind', 'fire', 'uv', 'aqi', 'smoke', 'ozone', 'fog', 'nws'],
  daily: ['uv', 'fog', 'aqi']
};

const india = {
  id: 'india', label: 'India', units: 'metric', cap: 3,
  rainSoon: 60, heavyHr: 10, heavyDay: 65,
  heat: 40, extreme: 45, coldWave: 4, drop: 8,
  gust: 55, dustGust: 40, dustPm: 300,
  uv: [8, 11], air: 'in', fog: 200,
  on: ['rain', 'heavyrain', 'thunder', 'hail', 'heat', 'coldwave', 'drop', 'wind', 'uv', 'aqi', 'fog', 'dust', 'flood'],
  daily: ['uv', 'fog', 'aqi', 'thunder']
};

// Everywhere else: the basics, at the India limits.
const global = Object.assign({}, india, {
  id: 'global', label: 'Global',
  on: ['rain', 'heavyrain', 'thunder', 'heat', 'wind', 'uv', 'aqi'],
  daily: ['uv', 'aqi', 'thunder']
});

const PROFILES = { bay, india, global };

function detectProfile(lat, lon) {
  if (inBox(BAY_BOX, lat, lon)) return 'bay';
  if (inBox(INDIA_BOX, lat, lon)) return 'india';
  return 'global';
}

// Text helpers. t = temperature, d = temperature difference, s = speed, r = rain, v = visibility.
function fmt(P) {
  if (P.units === 'us') {
    return {
      t: (c) => Math.round(c * 9 / 5 + 32) + '°F',
      d: (c) => Math.round(c * 9 / 5) + '°F',
      s: (k) => Math.round(k * 0.621371) + ' mph',
      r: (mm) => (Math.round(mm / 25.4 * 10) / 10) + ' in',
      v: (m) => (Math.round(m / 1609.34 * 10) / 10) + ' mi'
    };
  }
  return {
    t: (c) => Math.round(c) + '°C',
    d: (c) => Math.round(c) + '°C',
    s: (k) => Math.round(k) + ' km/h',
    r: (mm) => Math.round(mm) + ' mm',
    v: (m) => (m >= 1000 ? (Math.round(m / 100) / 10) + ' km' : Math.round(m) + ' m')
  };
}

const hr12 = (h) => ((h % 12) || 12) + (h < 12 ? 'am' : 'pm');

module.exports = { PROFILES, detectProfile, fmt, hr12 };
