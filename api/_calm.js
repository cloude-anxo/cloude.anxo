// Calm translator: fixed keyword rules (no AI) that put a scary headline next to plain facts. Awareness only.
const RULES = [
  [/heat ?wave|heatstroke|scorching|sizzl|hottest|record heat/i, 'Heat', 'Heatwaves are real, but they are forecast days ahead, and shade, water and cooler hours protect most people.', 'heat'],
  [/flood|cloudburst|deluge|heavy rain|downpour|monsoon/i, 'Floods and rain', 'Heavy rain is local and usually short. Warnings come early; your own signals and local alerts show if it touches you.', null],
  [/wildfire|forest fire|bushfire|blaze/i, 'Wildfire', 'Fires are serious near where they burn. Far away, the main effect is smoke, which your Air signal shows.', 'air'],
  [/smog|air quality|aqi|pollution|stubble|haze|particulate/i, 'Air quality', 'Air quality changes hour to hour. Check your Air signal, and a well-fitted N95 mask helps on the worst days.', 'air'],
  [/cyclone|hurricane|typhoon|storm/i, 'Storms', 'Storms are tracked closely and warnings arrive early. Following local alerts is the best protection.', null],
  [/drought|water crisis|water scarcity|dry spell/i, 'Drought', 'Droughts build slowly, which gives communities time to plan. It is a long-term issue, not a danger today.', null],
  [/sea level|glacier|ice sheet|melting|arctic|antarctic/i, 'Ice and seas', 'These changes happen over years and decades. They matter, but they are not something that changes your day today.', null],
  [/cold wave|cold snap|freez|blizzard|snowstorm|frost/i, 'Cold', 'Cold spells are forecast ahead. Layers, covered hands and ears, and staying active keep most people comfortable.', 'heat'],
  [/\buv\b|sunburn|sun protection/i, 'Sun and UV', 'UV is predictable through the day. Your UV signal tells you when sun protection matters.', 'uv'],
  [/climate (crisis|change|emergency)|global warming|cop\d+|net.?zero|emission/i, 'Climate', 'Big climate stories describe long trends. What touches you today is your own heat, air and UV.', null]
];
const LOUD = /deadly|catastroph|apocalyp|doom|worst|killer|devastat|terrifying|unprecedented|collapse|nightmare|shock|horrifying/gi;
function translate(title) {
  const hit = RULES.find((r) => r[0].test(title)), loud = (title.match(LOUD) || []).length;
  return {
    topic: hit ? hit[1] : 'Climate',
    calm: hit ? hit[2] : 'Headlines pick the biggest, rarest events. Your own heat, air and UV right now are what touch your day.',
    loudness: loud > 1 ? 'high' : loud ? 'some' : 'low',
    loud_note: loud ? 'This headline uses strong words. The facts underneath are usually calmer.' : null,
    signal: hit ? hit[3] : null
  };
}
function compare(worry, reality) {
  const gap = worry - reality;
  return { worry, reality, gap, message: gap >= 3 ? "You feel more worried than today's conditions suggest. Your feeling is valid, and the sky is milder than the worry."
    : gap <= -3 ? 'Today is heavier than you feel. The simple steps in "what to do" are worth doing.' : "Your feeling and today's conditions are close. Good instincts." };
}
module.exports = { translate, compare };
