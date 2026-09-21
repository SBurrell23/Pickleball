// Character roster. Stats are multipliers applied to the base tuning in
// constants.js. Every character has exactly one thing they are good at, so the
// pick is a question about how you want to play rather than which numbers are
// biggest. What each stat actually drives, verified against the code:
//
//   speed    top running speed and dash speed (sim.stepPlayer)
//   reach    how far the paddle can meet the ball, sideways AND overhead
//            (sim.canReach -- both the horizontal radius and the height cap)
//   control  how far a mistimed shot scatters from where you aimed (sim.launch)
//   drive    width of the sweet spot on the full power bar (swing.sweetZone)
//   dink     width of the sweet spot on the kitchen needle and the short bar
//
// Shot power and wind-up speed are deliberately NOT stats: they are identical
// for everyone. Power in particular was an obvious pick rather than a choice.
//
// Ranges are kept modest because these compound. Measured against an identical
// twin over 40 games (tools/roster.mjs), a 25% advantage in a single stat is
// already worth a large swing in win rate.

export const CHARACTERS = [
  {
    id: 'volley',
    name: 'Volley',
    title: 'All-Rounder',
    blurb: 'No weaknesses, no gimmicks. The honest pick.',
    stats: { speed: 1.00, reach: 1.00, control: 1.00, drive: 1.00, dink: 1.00 },
    colors: { primary: 0x2f9e6e, secondary: 0xf2f7f4, trim: 0x18412f, skin: 0xd8a074 },
    build: { torso: 'tapered', head: 'round', crest: 'visor', scale: 0.92, bulk: 1.0 },
  },
  {
    id: 'spot',
    name: 'Spot',
    title: 'Placement',
    blurb: 'Puts it where they said they would, even off a scrappy touch.',
    stats: { speed: 0.96, reach: 0.98, control: 1.30, drive: 0.96, dink: 0.96 },
    colors: { primary: 0xc0392b, secondary: 0x2b2b30, trim: 0xf0a030, skin: 0xb5764d },
    build: { torso: 'tapered', head: 'round', crest: 'headband', scale: 0.94, bulk: 1.06 },
  },
  {
    id: 'zip',
    name: 'Zip',
    title: 'Speed',
    blurb: 'Gets to everything. Getting it back is the hard part.',
    stats: { speed: 1.22, reach: 0.96, control: 0.96, drive: 0.97, dink: 1.00 },
    colors: { primary: 0x33b6e0, secondary: 0xfdfdfd, trim: 0x1a5f7a, skin: 0xf0c9a0 },
    build: { torso: 'slim', head: 'round', crest: 'ponytail', scale: 0.86, bulk: 0.8 },
  },
  {
    id: 'stretch',
    name: 'Stretch',
    title: 'Reach',
    blurb: 'Covers balls nobody else is getting a paddle to, high or wide.',
    stats: { speed: 0.94, reach: 1.14, control: 0.98, drive: 0.97, dink: 0.98 },
    colors: { primary: 0x9b59b6, secondary: 0xf7e7ff, trim: 0x4a2159, skin: 0x8d5a3b },
    build: { torso: 'slim', head: 'round', crest: 'bun', scale: 1.04, bulk: 0.82 },
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    title: 'Kitchen',
    blurb: 'Owns the net. Wins the dink exchange and dares you to speed it up.',
    stats: { speed: 0.94, reach: 1.02, control: 0.98, drive: 0.92, dink: 1.30 },
    colors: { primary: 0x37474f, secondary: 0xffc857, trim: 0x11181c, skin: 0x6b4a33 },
    build: { torso: 'blocky', head: 'square', crest: 'cap', scale: 1.02, bulk: 1.32 },
  },
  {
    id: 'ace',
    name: 'Ace',
    title: 'Drive',
    blurb: 'Lives on the big swing. A wide sweet spot where the pace lives.',
    stats: { speed: 0.98, reach: 0.96, control: 0.94, drive: 1.30, dink: 0.92 },
    colors: { primary: 0xf39c12, secondary: 0x1c1c22, trim: 0xffe066, skin: 0xe8b98c },
    build: { torso: 'tapered', head: 'round', crest: 'mohawk', scale: 0.93, bulk: 0.98 },
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

export function getCharacter(id) {
  return CHAR_BY_ID[id] || CHARACTERS[0];
}

// Per-character tuning applied to the timing mini-games. Wind-up speed and
// shot power are fixed across the roster; only the sweet-spot widths and the
// scatter on a mistimed shot vary.
export function swingTuning(char) {
  const s = char.stats;
  return {
    chargeRate: 1,
    powerScale: 1,
    // ~1.0 at a stat of 1.0, so a plain character is exactly the baseline.
    // The coefficient is steep enough that a specialist's sweet spot is
    // visibly wider on the meter, not a difference only a spreadsheet sees.
    driveSweet: 0.34 + s.drive * 0.68,
    dinkSweet: 0.34 + s.dink * 0.68,
    scatterScale: 1.78 - s.control * 0.80,
  };
}
