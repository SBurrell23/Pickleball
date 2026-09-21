// Character roster. Stats are multipliers applied to the base tuning in
// constants.js. What each one actually drives, verified against the code:
//
//   speed    top running speed and dash speed (sim.stepPlayer)
//   power    pace of every shot, which shortens its flight time (sim.launch)
//   reach    how far the paddle can meet the ball, horizontally (sim.canReach)
//   control  width of the sweet spot AND how far mistimed shots scatter
//   charge   how fast both power bars fill, so how early the sweet spot lands
//
// Ranges are deliberately tighter on reach and control: measured against an
// identical twin over 40 games, a 25% reach advantage alone won 90% of them,
// so a wide spread there makes one character simply correct. See tools/roster.mjs.
// `build` describes the procedural mesh so render/assets.js can assemble a body
// without any external art.

export const CHARACTERS = [
  {
    id: 'volley',
    name: 'Volley',
    title: 'All-Rounder',
    blurb: 'No weaknesses, no gimmicks. The honest pick.',
    stats: { speed: 1.00, power: 1.00, reach: 1.00, control: 1.00, charge: 1.00 },
    colors: { primary: 0x2f9e6e, secondary: 0xf2f7f4, trim: 0x18412f, skin: 0xd8a074 },
    build: { torso: 'tapered', head: 'round', crest: 'visor', scale: 0.92, bulk: 1.0 },
  },
  {
    id: 'smash',
    name: 'Smash',
    title: 'Power',
    blurb: 'Hits like a truck, turns like one too.',
    stats: { speed: 0.90, power: 1.20, reach: 1.04, control: 0.94, charge: 1.00 },
    colors: { primary: 0xc0392b, secondary: 0x2b2b30, trim: 0xf0a030, skin: 0xb5764d },
    build: { torso: 'blocky', head: 'square', crest: 'mohawk', scale: 0.99, bulk: 1.28 },
  },
  {
    id: 'zip',
    name: 'Zip',
    title: 'Speed',
    blurb: 'Gets to everything. Getting it back is the hard part.',
    stats: { speed: 1.20, power: 0.90, reach: 0.98, control: 1.04, charge: 1.06 },
    colors: { primary: 0x33b6e0, secondary: 0xfdfdfd, trim: 0x1a5f7a, skin: 0xf0c9a0 },
    build: { torso: 'slim', head: 'round', crest: 'ponytail', scale: 0.86, bulk: 0.8 },
  },
  {
    id: 'pip',
    name: 'Pip',
    title: 'Technician',
    blurb: 'Dinks you to death from the kitchen line.',
    stats: { speed: 1.04, power: 0.90, reach: 0.98, control: 1.18, charge: 1.04 },
    colors: { primary: 0x9b59b6, secondary: 0xf7e7ff, trim: 0x4a2159, skin: 0x8d5a3b },
    build: { torso: 'slim', head: 'round', crest: 'bun', scale: 0.83, bulk: 0.86 },
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    title: 'Wall',
    blurb: 'Enormous reach. Blocks bombs back at you.',
    stats: { speed: 0.88, power: 1.04, reach: 1.11, control: 1.02, charge: 0.96 },
    colors: { primary: 0x37474f, secondary: 0xffc857, trim: 0x11181c, skin: 0x6b4a33 },
    build: { torso: 'blocky', head: 'square', crest: 'cap', scale: 1.05, bulk: 1.35 },
  },
  {
    id: 'ace',
    name: 'Ace',
    title: 'Glass Cannon',
    blurb: 'Perfect timing is rewarded. Anything else is punished.',
    stats: { speed: 1.06, power: 1.12, reach: 0.96, control: 0.88, charge: 1.08 },
    colors: { primary: 0xf39c12, secondary: 0x1c1c22, trim: 0xffe066, skin: 0xe8b98c },
    build: { torso: 'tapered', head: 'round', crest: 'headband', scale: 0.91, bulk: 0.95 },
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

export function getCharacter(id) {
  return CHAR_BY_ID[id] || CHARACTERS[0];
}

// Per-character tuning applied to the timing mini-game. Higher `charge` fills the
// power bar faster, higher `control` widens the sweet spot.
export function swingTuning(char) {
  const s = char.stats;
  return {
    chargeRate: s.charge,
    sweetScale: 0.72 + s.control * 0.42,  // ~1.0 at control 1.0
    powerScale: s.power,
    scatterScale: 1.35 - s.control * 0.42, // ~0.93 at control 1.0
  };
}
