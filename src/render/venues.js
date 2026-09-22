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
    // Rec play: a scattering of people, not a crowd.
    stands: { color: 0x404a55, crowd: 0.26 },
    lights: { show: true, pole: 0x2b333c, lamp: 0xfff6d8 },
    sky: { zenith: 0x2f7fd0, horizon: 0xbfe0f2 },
    clouds: 11,
  },
  {
    id: 'forest',
    unlock: 'easy',
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
    // `near` places some inside the play camera's cone, where the ring on
    // the horizon never reaches.
    scatter: { kind: 'pine', count: 260, near: 26,
      colors: [0x24422a, 0x1b3320, 0x2e5233, 0x152a1a] },
    fence: { post: 0x23282a, mesh: 'rgba(150, 165, 160, 0.75)' },
    stands: { color: 0x2a2f2c, crowd: 0.32 },
    lights: { show: true, pole: 0x1d2220, lamp: 0xd8ffc8 },
    sky: { zenith: 0x1d3347, horizon: 0x6f8a84 },
    clouds: 5,
    fog: [80, 420],
  },
  {
    id: 'desert',
    unlock: 'normal',
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
    scatter: { kind: 'cactus', count: 200, near: 22,
      colors: [0x5f8a4a, 0x4c7040, 0x6f9a55, 0x8a7a52] },
    fence: { post: 0x6a5a48, mesh: 'rgba(222, 208, 180, 0.9)' },
    stands: { color: 0x7a6650, crowd: 0.52 },
    lights: { show: true, pole: 0x5a4c3c, lamp: 0xfff0c8 },
    sky: { zenith: 0x3f8ecb, horizon: 0xe8d4a8 },
    clouds: 3,
    fog: [180, 760],
  },
  {
    id: 'marsh',
    unlock: 'hard',
    name: 'Tidewater',
    blurb: 'Built on a boardwalk over the reeds. Do not go looking for the ball.',
    court: { surface: '#2f6e6b', light: '#48908c', dark: '#1a4745' },
    kitchen: { surface: '#7d6a3e', light: '#9e8a58', dark: '#544425' },
    line: { surface: '#f0f4ee', light: '#ffffff', dark: '#c3cfc4' },
    apron: { base: '#6b5a42', light: '#7d6b50', dark: '#4e4131' },
    ground: {
      base: '#4a6b4a', blades: ['#6f9a5f', '#3a5a3c', '#84a86a'],
      patches: ['#5e8557', '#33513a'], bladeCount: 11000,
    },
    scatter: { kind: 'reed', count: 420, colors: [0x6f8a4a, 0x59743d, 0x84a05a, 0x46603a] },
    // A few standing pools out in the reeds. Not a flood -- just enough that
    // the ground reads as wet.
    ponds: {
      count: 9, near: 8, color: 0x2f6f8c, rim: 0x4a4a32,
      size: [3.5, 7],        // out on the horizon
      nearSize: [1.3, 1.4],  // in the strip beside the stands
    },
    fence: { post: 0x4a4032, mesh: 'rgba(190, 200, 190, 0.8)' },
    stands: { color: 0x5a4c3a, crowd: 0.44 },
    lights: { show: true, pole: 0x3d352a, lamp: 0xfff4d0 },
    sky: { zenith: 0x3a80a8, horizon: 0xc2d8cf },
    clouds: 14,
    fog: [110, 520],
  },
  {
    id: 'championship',
    unlock: 'extreme',
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
    // Honours hung round the bowl. The past champions are the ladder's own
    // roster, which is a nicer joke than inventing names.
    banners: {
      cloth: '#16234a', trim: '#d8a52a', text: '#e8eeff', trimHex: 0xd8a52a,
      firstYear: 2014, perSide: 6, boardCount: 7,
      champions: ['Sovereign', 'Obelisk', 'Kestrel', 'Echo', 'Bulwark',
        'Ace', 'Stretch', 'Moss', 'Zip', 'Spot', 'Pip', 'Sovereign'],
    },
    trophies: { cloth: 0x2a1d3f, gold: 0xd8a52a, silver: 0xc8d2dd },
    fence: { style: 'wall', post: 0x1b2440, mesh: 'rgba(150,170,200,0.5)' },
    // Near enough sold out -- a handful of empty seats, which reads as a
    // real crowd where a perfectly solid block reads as wallpaper.
    stands: { color: 0x232c44, crowd: 0.92, tall: true },
    lights: { show: true, pole: 0x1a2134, lamp: 0xffffff },
    sky: { zenith: 0x2c5290, horizon: 0x9db6cf },
    clouds: 0,
    fog: [140, 600],
  },
];

export const VENUE_BY_ID = Object.fromEntries(VENUES.map((v) => [v.id, v]));
export const DEFAULT_VENUE = 'rec';

export function getVenue(id) { return VENUE_BY_ID[id] || VENUE_BY_ID[DEFAULT_VENUE]; }

// ---- who can play where ----------------------------------------------------
//
// Only the rec courts are open at the start. The other four are earned by
// clearing a season, and clearing one opens its court AND everything below
// it -- somebody who walks straight into Extreme and wins gets all five,
// rather than being sent back to tick off the easy ones they have plainly
// outgrown.
//
// This gates the courts you CHOOSE: exhibition and the online lobby. A season
// sends you where the ladder says, unlocked or not, which is the point -- the
// first time you see Centre Court should be the final of a season, and then
// you know what you are playing for.
//
// The order lives here rather than coming from season.js because a venue is
// pure data and importing the season would make a cycle out of it.
const UNLOCK_ORDER = ['easy', 'normal', 'hard', 'extreme'];

export function venueUnlocked(id, completed = []) {
  const v = VENUE_BY_ID[id];
  if (!v || !v.unlock) return true;
  const need = UNLOCK_ORDER.indexOf(v.unlock);
  return completed.some((d) => UNLOCK_ORDER.indexOf(d) >= need);
}

/**
 * `id` if it can be played right now, the rec courts if it cannot. Unknown
 * ids fall back too: this is what saved settings and a peer's lobby message
 * both go through, and neither is trusted to name a court that exists.
 */
export function playableVenue(id, completed = []) {
  return venueUnlocked(id, completed) ? getVenue(id).id : DEFAULT_VENUE;
}

// ---- light -----------------------------------------------------------------
//
// One profile. There were three -- day, dusk and night -- and the two dark
// ones simply did not look good enough to be worth choosing between, so the
// courts are all played in daylight and the sun's elevation is a constant
// again. Its azimuth still drifts, so shadows swing round over a long match.

export const DAYLIGHT = Object.freeze({
  elevation: 0.95,               // radians above the horizon
  key: { color: 0xfff6e2, intensity: 2.2 },
  hemi: { sky: 0xbfe0f2, ground: 0x4a7a44, intensity: 1.05 },
  fill: { color: 0xbcd9f0, intensity: 0.32 },
});
