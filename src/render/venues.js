// Five places to play, each with a day, dusk and night lighting mode.
//
// A venue is pure data. Everything that varies between them -- the court
// paint, the ground it sits on, what is scattered outside the fence, the
// stands, the floodlights, the sky -- is a value here, and assets.js has one
// set of builders that read it. That is deliberate: fifteen hand-built scenes
// would drift apart, and a new venue should be a table entry rather than a
// new module.
//
// None of this touches the simulation. A court is a court: the same size,
// the same bounce, the same net. Only the paint changes.

export const VENUES = [
  {
    id: 'rec',
    name: 'Rec Play Courts',
    blurb: 'Municipal blue and a chain-link fence. Where everybody starts.',
    court: { surface: '#2f7fc4', light: '#5ba3dd', dark: '#1d568e' },
    kitchen: { surface: '#1d9c74', light: '#43c095', dark: '#11634a' },
    line: { surface: '#f4f7fb', light: '#ffffff', dark: '#ccd6e0' },
    apron: { base: '#3d4f41', light: '#4a6040', dark: '#2e3c31' },
    ground: {
      base: '#4e9f45', blades: ['#83d46c', '#3f8c37', '#5cb04e'],
      patches: ['#74c45f', '#2f7a2f'], bladeCount: 9000,
    },
    scatter: { kind: 'shrub', count: 340, colors: [0x3f8f3a, 0x4fa348, 0x336f30, 0x5cb054, 0x2d6b2f] },
    fence: { post: 0x2f3a42, mesh: 'rgba(206, 218, 224, 0.95)' },
    // Rec play: a few people who happened to be passing, not a crowd.
    stands: { color: 0x404a55, crowd: 0.13 },
    lights: { show: true, pole: 0x2b333c, lamp: 0xfff6d8 },
    sky: { zenith: 0x2f7fd0, horizon: 0xbfe0f2 },
    clouds: 11,
  },
  {
    id: 'forest',
    name: 'Hollow Pines',
    blurb: 'A clearing somebody paved. The trees lean in and the mist sits low.',
    court: { surface: '#35585f', light: '#4a7a83', dark: '#1e3940' },
    kitchen: { surface: '#4a3f6b', light: '#6b5a8f', dark: '#2d2543' },
    line: { surface: '#dfe7e4', light: '#ffffff', dark: '#a8b6b2' },
    apron: { base: '#31352e', light: '#3d4437', dark: '#22261f' },
    ground: {
      base: '#2c3a2b', blades: ['#3f6b3c', '#24341f', '#4a7a3f'],
      patches: ['#405c38', '#1c2a1b'], bladeCount: 6500,
    },
    scatter: { kind: 'pine', count: 260, colors: [0x24422a, 0x1b3320, 0x2e5233, 0x152a1a] },
    fence: { post: 0x23282a, mesh: 'rgba(150, 165, 160, 0.75)' },
    stands: { color: 0x2a2f2c, crowd: 0.16 },
    lights: { show: true, pole: 0x1d2220, lamp: 0xd8ffc8 },
    sky: { zenith: 0x1d3347, horizon: 0x6f8a84 },
    clouds: 5,
    fog: [80, 420],
  },
  {
    id: 'desert',
    name: 'Dust Bowl',
    blurb: 'Hard court, harder sun. The wind keeps redecorating.',
    court: { surface: '#b5643a', light: '#d4875a', dark: '#7d3f22' },
    kitchen: { surface: '#c99a3e', light: '#e6bb62', dark: '#8d6821' },
    line: { surface: '#fdf6e6', light: '#ffffff', dark: '#d8c9a8' },
    apron: { base: '#6b5540', light: '#7d6750', dark: '#544231' },
    ground: {
      base: '#c8a875', blades: ['#dcc08e', '#a88a5c', '#e0c795'],
      patches: ['#dbc190', '#a98d62'], bladeCount: 2200,
    },
    scatter: { kind: 'cactus', count: 200, colors: [0x5f8a4a, 0x4c7040, 0x6f9a55, 0x8a7a52] },
    fence: { post: 0x6a5a48, mesh: 'rgba(222, 208, 180, 0.9)' },
    stands: { color: 0x7a6650, crowd: 0.26 },
    lights: { show: true, pole: 0x5a4c3c, lamp: 0xfff0c8 },
    sky: { zenith: 0x3f8ecb, horizon: 0xe8d4a8 },
    clouds: 3,
    fog: [180, 760],
  },
  {
    id: 'marsh',
    name: 'Tidewater',
    blurb: 'Built on a boardwalk over the reeds. Do not go looking for the ball.',
    court: { surface: '#2f6e6b', light: '#48908c', dark: '#1a4745' },
    kitchen: { surface: '#7d6a3e', light: '#9e8a58', dark: '#544425' },
    line: { surface: '#f0f4ee', light: '#ffffff', dark: '#c3cfc4' },
    apron: { base: '#6b5a42', light: '#7d6b50', dark: '#4e4131' },
    // Silt, not turf: this only shows at the banks, the rest is under water.
    ground: {
      base: '#3f4a34', blades: ['#55663f', '#333c28', '#68794c'],
      patches: ['#4a5638', '#2c3424'], bladeCount: 5000,
    },
    scatter: { kind: 'reed', count: 420, colors: [0x6f8a4a, 0x59743d, 0x84a05a, 0x46603a] },
    // The court is a boardwalk island; everything past the apron is water.
    water: {
      deep: '#2b4a4c', shallow: '#3e6f6a', silt: '#4a5a42', glint: '#8fc4b4',
      bank: 0x4a4432,
    },
    fence: { post: 0x4a4032, mesh: 'rgba(190, 200, 190, 0.8)' },
    stands: { color: 0x5a4c3a, crowd: 0.22 },
    lights: { show: true, pole: 0x3d352a, lamp: 0xfff4d0 },
    sky: { zenith: 0x3a80a8, horizon: 0xc2d8cf },
    clouds: 14,
    fog: [110, 520],
  },
  {
    id: 'championship',
    name: 'Centre Court',
    blurb: 'Deep blue, full house, every seat sold. This is the one that counts.',
    court: { surface: '#1d3a7a', light: '#2f55a8', dark: '#122452' },
    kitchen: { surface: '#7a1d34', light: '#a32f4c', dark: '#4e1121' },
    line: { surface: '#ffffff', light: '#ffffff', dark: '#dbe2ee' },
    apron: { base: '#26304a', light: '#313d5c', dark: '#1a2134' },
    ground: {
      base: '#2a3450', blades: ['#3c4a6e', '#222a42', '#46557c'],
      patches: ['#354061', '#1e2538'], bladeCount: 1200,
    },
    scatter: { kind: 'none', count: 0, colors: [0x2a3450] },
    // Downtown. The windows light up after dark, which is most of what makes
    // the night version of this court worth playing on.
    skyline: {
      wall: '#6d7691', dark: '#39415c', lit: '#eaf2ff', litWarm: '#ffd9a0',
    },
    // The bowl wall just behind the stands -- the only piece of this venue
    // the play camera is close enough to see.
    arena: { wall: 0x1c2438, fascia: 0x3f63b8 },
    fence: { style: 'wall', post: 0x1b2440, mesh: 'rgba(150,170,200,0.5)' },
    // The one court that is genuinely sold out.
    stands: { color: 0x232c44, crowd: 1, tall: true },
    lights: { show: true, pole: 0x1a2134, lamp: 0xffffff },
    sky: { zenith: 0x2c5290, horizon: 0x9db6cf },
    clouds: 0,
    fog: [140, 600],
  },
];

export const VENUE_BY_ID = Object.fromEntries(VENUES.map((v) => [v.id, v]));
export const DEFAULT_VENUE = 'rec';

export function getVenue(id) { return VENUE_BY_ID[id] || VENUE_BY_ID[DEFAULT_VENUE]; }

// ---- time of day -----------------------------------------------------------
//
// The sun's elevation is pinned per mode and only its azimuth drifts, so
// shadows still swing round over a long match without the light ever changing
// character mid-point. `skyMix` darkens the venue's own sky toward the mode's
// own colour rather than replacing it, which is what keeps a desert dusk
// looking like a desert.

export const TIMES = [
  {
    id: 'day',
    name: 'Day',
    elevation: 0.95,               // radians above the horizon
    key: { color: 0xfff6e2, intensity: 2.2 },
    hemi: { sky: 0xbfe0f2, ground: 0x4a7a44, intensity: 1.05 },
    fill: { color: 0xbcd9f0, intensity: 0.32 },
    tint: 0xffffff, skyMix: 0,
    lamps: false,
  },
  {
    id: 'dusk',
    name: 'Dusk',
    elevation: 0.16,
    key: { color: 0xff9c52, intensity: 2.6 },
    hemi: { sky: 0xf0a878, ground: 0x3a3048, intensity: 0.78 },
    fill: { color: 0x6a74b0, intensity: 0.40 },
    tint: 0xffb98a, skyMix: 0.55,
    duskSky: { zenith: 0x2b3a6e, horizon: 0xf09a5a },
    lamps: true,
    // The lights come on at dusk, as they would. Mostly this is atmosphere,
    // but on the darker venues it is the difference between a moody court and
    // one whose lines you cannot read.
    flood: { color: 0xfff0d8, intensity: 9 },
  },
  {
    id: 'night',
    name: 'Night',
    // Below the horizon: what is left is the moon and the floodlights.
    elevation: -0.22,
    // Moonlight only, and barely any of it. Anything more and the grass
    // outside the fence reads as daylight with a blue filter on it.
    key: { color: 0x9fb6e8, intensity: 0.22 },
    hemi: { sky: 0x1a2438, ground: 0x0c1118, intensity: 0.20 },
    fill: { color: 0x5a68a8, intensity: 0.10 },
    tint: 0x8fa4d8, skyMix: 0.94,
    duskSky: { zenith: 0x04081a, horizon: 0x101a2e },
    lamps: true,
    // The floodlights do the work: a cone over the court so the play area is
    // bright while everything past the fence falls away into the dark.
    // Tuned by eye against the night court: below about 12 the lines stop
    // being readable, above about 30 the grass outside the fence lights up
    // again and it stops being night.
    flood: { color: 0xeaf2ff, intensity: 22 },
  },
];

export const TIME_BY_ID = Object.fromEntries(TIMES.map((t) => [t.id, t]));
export const DEFAULT_TIME = 'day';

export function getTime(id) { return TIME_BY_ID[id] || TIME_BY_ID[DEFAULT_TIME]; }

export function randomTimeId() {
  return TIMES[(Math.random() * TIMES.length) | 0].id;
}
