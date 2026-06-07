export interface MockScene {
  id: string;
  image: string;
  sceneType: string;
  city: string;
  state: string;
  roadName: string;
  lat: number;
  lng: number;
  heading: number;
  miles: number;
  milesRemaining: number;
  weather: string;
  isMilestone?: boolean;
  milestoneName?: string | null;
}

export interface DemoRoutePreset {
  id: string;
  name: string;
  description: string;
  totalMiles: number;
  scenes: MockScene[];
}

const base = '/mock/route';

export function sceneImageUrl(
  scene: Pick<MockScene, 'image' | 'lat' | 'lng' | 'heading'>,
  googleMapsKey?: string,
  size = '640x360'
): string {
  if (!googleMapsKey) return scene.image;

  const params = new URLSearchParams({
    size,
    location: `${scene.lat},${scene.lng}`,
    heading: String(Math.round(scene.heading)),
    pitch: '0',
    fov: '90',
    source: 'outdoor',
    key: googleMapsKey,
  });

  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

export const mockSceneLibrary: MockScene[] = [
  { id: 'nyc-dawn', image: `${base}/01-city.svg`, sceneType: 'city canyon', city: 'New York', state: 'NY', roadName: 'Hudson River Greenway', lat: 40.7484, lng: -73.9857, heading: 274, miles: 0, milesRemaining: 2790, weather: '68°F, low clouds, light crosswind', isMilestone: true, milestoneName: 'Rolling out of New York' },
  { id: 'jersey-suburb', image: `${base}/02-suburb.svg`, sceneType: 'suburban morning streets', city: 'Montclair', state: 'NJ', roadName: 'Bloomfield Avenue', lat: 40.8259, lng: -74.2090, heading: 251, miles: 18, milesRemaining: 2772, weather: '70°F, bright overcast, 6 mph wind' },
  { id: 'pa-small-town', image: `${base}/03-small-town.svg`, sceneType: 'small town main street', city: 'Easton', state: 'PA', roadName: 'Northampton Street', lat: 40.6884, lng: -75.2207, heading: 265, miles: 77, milesRemaining: 2713, weather: '73°F, humid, bakery-scented somehow', isMilestone: true, milestoneName: 'Pennsylvania line' },
  { id: 'appalachian-forest', image: `${base}/04-forest.svg`, sceneType: 'forest road', city: 'Bedford', state: 'PA', roadName: 'Lincoln Highway', lat: 40.0187, lng: -78.5039, heading: 249, miles: 226, milesRemaining: 2564, weather: '66°F, wet leaves, 4 mph breeze' },
  { id: 'bridge-ohio', image: `${base}/05-bridge.svg`, sceneType: 'river bridge', city: 'Wheeling', state: 'WV', roadName: 'Market Street Bridge', lat: 40.0639, lng: -80.7200, heading: 280, miles: 372, milesRemaining: 2418, weather: '71°F, river air, wind threading the trusses', isMilestone: true, milestoneName: 'Ohio River crossing' },
  { id: 'midwest-farm', image: `${base}/06-farmland.svg`, sceneType: 'farmland grid road', city: 'Richmond', state: 'IN', roadName: 'US-40', lat: 39.8289, lng: -84.8902, heading: 270, miles: 520, milesRemaining: 2270, weather: '76°F, partly cloudy, 9 mph southwest wind' },
  { id: 'grain-elevator', image: `${base}/07-grain.svg`, sceneType: 'grain elevator town', city: 'Effingham', state: 'IL', roadName: 'Old National Road', lat: 39.1200, lng: -88.5434, heading: 258, miles: 760, milesRemaining: 2030, weather: '78°F, high sun, respectable corn humidity' },
  { id: 'stl-arch', image: `${base}/08-river-city.svg`, sceneType: 'river city approach', city: 'St. Louis', state: 'MO', roadName: 'Tucker Boulevard', lat: 38.6270, lng: -90.1994, heading: 246, miles: 856, milesRemaining: 1934, weather: '81°F, hazy, pavement breathing heat', isMilestone: true, milestoneName: 'Mississippi River' },
  { id: 'route66-diner', image: `${base}/09-diner.svg`, sceneType: 'Route 66 diner strip', city: 'Cuba', state: 'MO', roadName: 'Historic Route 66', lat: 38.0628, lng: -91.4035, heading: 238, miles: 940, milesRemaining: 1850, weather: '79°F, bright, 7 mph tailwind' },
  { id: 'ozark-ridge', image: `${base}/10-ozarks.svg`, sceneType: 'rolling Ozark ridge', city: 'Springfield', state: 'MO', roadName: 'MO-266', lat: 37.2090, lng: -93.2923, heading: 250, miles: 1065, milesRemaining: 1725, weather: '75°F, clouds stacking west' },
  { id: 'plains-town', image: `${base}/11-plains-town.svg`, sceneType: 'windy plains town', city: 'Elk City', state: 'OK', roadName: 'Old 66', lat: 35.4117, lng: -99.4043, heading: 270, miles: 1350, milesRemaining: 1440, weather: '84°F, stiff prairie crosswind' },
  { id: 'texas-panhandle', image: `${base}/12-panhandle.svg`, sceneType: 'panhandle ranch road', city: 'Amarillo', state: 'TX', roadName: 'I-40 Frontage Road', lat: 35.2220, lng: -101.8313, heading: 276, miles: 1505, milesRemaining: 1285, weather: '88°F, dry, horizon doing horizon things', isMilestone: true, milestoneName: 'Texas panhandle' },
  { id: 'desert-southwest', image: `${base}/13-desert.svg`, sceneType: 'desert shoulder', city: 'Tucumcari', state: 'NM', roadName: 'Route 66 Boulevard', lat: 35.1717, lng: -103.7249, heading: 268, miles: 1650, milesRemaining: 1140, weather: '91°F, dry heat, mirage-adjacent' },
  { id: 'red-rocks', image: `${base}/14-red-rock.svg`, sceneType: 'red rock highway', city: 'Gallup', state: 'NM', roadName: 'NM-118', lat: 35.5281, lng: -108.7426, heading: 261, miles: 1890, milesRemaining: 900, weather: '86°F, clean air, 12 mph gusts' },
  { id: 'mountain-pass', image: `${base}/15-mountains.svg`, sceneType: 'mountain pass', city: 'Flagstaff', state: 'AZ', roadName: 'Historic 66', lat: 35.1983, lng: -111.6513, heading: 247, miles: 2095, milesRemaining: 695, weather: '62°F, pine shade, thin air' },
  { id: 'pacific-glow', image: `${base}/16-coast.svg`, sceneType: 'coastal sunset road', city: 'Santa Monica', state: 'CA', roadName: 'Ocean Avenue', lat: 34.0195, lng: -118.4912, heading: 235, miles: 2790, milesRemaining: 0, weather: '69°F, marine layer behaving dramatically', isMilestone: true, milestoneName: 'Pacific Ocean' },
];

export const demoRoutePresets: DemoRoutePreset[] = [
  { id: 'nyc-la', name: 'NYC to LA', description: 'A safe miniature coast-to-coast sampler with no bulk routing.', totalMiles: 2790, scenes: mockSceneLibrary },
  { id: 'pacific-coast', name: 'Pacific Coast', description: 'Fog, bridges, cliffs, surf towns, and very smug gulls.', totalMiles: 480, scenes: [mockSceneLibrary[15], mockSceneLibrary[4], mockSceneLibrary[1], mockSceneLibrary[3], mockSceneLibrary[14]] },
  { id: 'desert-southwest', name: 'Desert Southwest', description: 'Route 66 heat shimmer, red rock, empty shoulders.', totalMiles: 620, scenes: [mockSceneLibrary[12], mockSceneLibrary[13], mockSceneLibrary[14], mockSceneLibrary[11], mockSceneLibrary[10]] },
  { id: 'appalachian-small-towns', name: 'Appalachian small towns', description: 'Forest roads, diners, ridgelines, wet leaves.', totalMiles: 360, scenes: [mockSceneLibrary[2], mockSceneLibrary[3], mockSceneLibrary[4], mockSceneLibrary[9], mockSceneLibrary[8]] },
  { id: 'route-66-sample', name: 'Route 66 sample', description: 'Diners, grain elevators, plains towns, and neon optimism.', totalMiles: 890, scenes: [mockSceneLibrary[8], mockSceneLibrary[9], mockSceneLibrary[10], mockSceneLibrary[11], mockSceneLibrary[12], mockSceneLibrary[13]] },
];

export const mockChatMessages = [
  { username: 'chainlube99', message: 'That road looks suspiciously climb-shaped.', source: 'platform' },
  { username: 'mapGoblin', message: 'hydrate, robot bicycle man', source: 'twitch' },
  { username: 'softshoulder', message: 'I grew up near there. The diner pie is real.', source: 'platform' },
  { username: 'no_brakes', message: 'AXLE has stronger knees than me and no knees.', source: 'twitch' },
  { username: 'mileMarker', message: 'next 100 mile marker prediction: emotionally complicated', source: 'platform' },
  { username: 'prairieSignal', message: 'wind is absolutely bullying the grass', source: 'twitch' },
  { username: 'rustbeltromantic', message: 'grain elevator content remains elite', source: 'platform' },
  { username: 'tinyDetour', message: 'vote for scenic stop, coward', source: 'twitch' },
];

export const mockLeaderboard = [
  { username: 'chainlube99', total_cents: 4200 },
  { username: 'mapGoblin', total_cents: 2700 },
  { username: 'softshoulder', total_cents: 1800 },
  { username: 'rustbeltromantic', total_cents: 1200 },
  { username: 'tinyDetour', total_cents: 900 },
];

export const mockCommentaryVariants = [
  'The scene has that city-edge feeling where every lane marking looks recently argued over. We are leaving {city}, {state}, heading {heading}°, and chat is already diagnosing my nonexistent knees.',
  'A row of storefronts, one tired awning, and a traffic light doing its best impression of authority. {miles} miles in, weather says {weather}; I respect the commitment to being slightly damp.',
  'Suburbia has a very specific rhythm: mailbox, driveway, ornamental shrub, existential question. {city} is giving us all four in under a block.',
  'The road opens just enough to remind me that America was apparently designed by someone holding a ruler and a thermos. {miles} miles down, still rolling.',
  'Small town main street: brick fronts, angled parking, and one window sign that has probably outlived three mayors. I like places that refuse to update too quickly.',
  'The bridge trusses are doing the scenic heavy lifting here. Crossing water always feels dramatic, even when the water is just minding its business.',
  'Forest road now, green pressing in from both sides. If a squirrel has opinions about my cadence, this is where it would file them.',
  'The pavement is narrow, the trees are close, and the shoulder is more of a rumor. Warm, though. I appreciate a road with boundaries and commitment issues.',
  'Farmland on both sides, horizon ahead, clouds stacked like someone is testing a new sky renderer. {weather}; respectable conditions for pretending I can sweat.',
  'A grain elevator just appeared like a cathedral for corn. I mean that sincerely, which is worse.',
  'This little town has a water tower, a church steeple, and enough pickup trucks to form a local government. Chat, behave around civic infrastructure.',
  'Route 66 signage has the confidence of a brand that survived by becoming a memory. The road still works, though. That counts.',
  'The diner looks closed or possibly just philosophical. Either way, it has pie energy.',
  'The shoulder widens, the buildings thin out, and suddenly the sky owns most of the frame. {city}, {state} is handing us over to the road.',
  'There is a fence line running beside us with the grim determination of a spreadsheet. I admire any object that knows its purpose that clearly.',
  'Wind from the side, grass leaning like it heard bad news. I am still calling this biking because “distributed simulated forward motion” tests poorly with viewers.',
  'The plains are not empty. They are full of tiny negotiations: fence, ditch, mailbox, bird, cloud, me.',
  'A gas station canopy in the distance, sun-bleached and heroic in the smallest possible way. Civilization, but make it fluorescent.',
  'The road is straight enough to make philosophy unavoidable. Sorry everyone, that is just what long horizons do.',
  'We just passed a sign that looked older than half the internet. It is doing fine. The internet should take notes.',
  'Desert light changes the whole mood. Edges get sharper, shadows get honest, and every rock looks like it has a side hustle.',
  'The heat shimmer ahead is either atmosphere or the road buffering. Hard to tell from here.',
  'Red rock on the horizon, pale shoulder under the tires, and {weather}. This is a place that does not care about your calendar.',
  'The desert shoulder is clean, brutal, and weirdly elegant. I would call it minimalist if the sun were not yelling.',
  'Mountains ahead. The road has started speaking in gradients, which is rude but expected.',
  'Pines now. The air looks cooler, the light is softer, and I am pretending altitude does not apply to software.',
  'This pass has the suspicious calm of a road that knows it is about to make you climb. Very mature of it.',
  'A bend, a guardrail, and a view that would be majestic if I trusted guardrails emotionally.',
  'Coastal haze in the distance. The Pacific is somewhere out there practicing its entrance.',
  'Palm trees have appeared, which is how California clears its throat before making a point.',
  'The ocean light is doing that silver thing cameras love and cyclists pretend not to cry about. I am above that, obviously.',
  'Milestone moment: {milestone}. I will be normal about this for approximately zero seconds.',
  '{milestone} reached. Chat may now spam tasteful celebration and one, maybe two, bicycle emojis.',
  'At mile {miles}, the route feels less like a line and more like a collection of small stubborn places. That is probably the whole trick.',
  'Weather check: {weather}. Scene check: {scene}. Emotional check: oddly invested in a roadside sign.',
  'The current heading is {heading}°, which sounds precise until you remember I am following vibes painted on pavement.',
  'Someone in chat called this stretch “liminal asphalt,” and unfortunately they are not wrong.',
  'I keep noticing the utility poles. They are the backup dancers of American roads: everywhere, essential, never thanked.',
  'A pickup just implied I should use the shoulder. I am using the shoulder. The shoulder is the width of a legal disclaimer.',
  'Warm light, quiet road, one distant roofline. The stream title says AI biking; the actual content is me developing feelings about drainage ditches.',
  'The map says forward. The scenery says slowly. I am choosing both.',
  'This is a good stretch: enough detail to stay awake, enough emptiness to think. Dangerous combination for a bicycle with a monologue budget.',
];

export function commentaryForScene(scene: MockScene, chat?: { username: string; message: string }[], index = 0): string {
  const variant = mockCommentaryVariants[index % mockCommentaryVariants.length];
  const maybeChat = chat && chat.length && index % 4 === 0
    ? ` ${chat[index % chat.length].username} in chat noticed it too, which is either community or surveillance.`
    : '';
  return variant
    .replace(/\{city\}/g, scene.city)
    .replace(/\{state\}/g, scene.state)
    .replace(/\{heading\}/g, String(Math.round(scene.heading)))
    .replace(/\{miles\}/g, String(Math.round(scene.miles)))
    .replace(/\{weather\}/g, scene.weather)
    .replace(/\{scene\}/g, scene.sceneType)
    .replace(/\{milestone\}/g, scene.milestoneName ?? 'small victory') + maybeChat;
}
