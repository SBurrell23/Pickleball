// The player's own character. There is exactly one set of player stats now --
// everybody on the human side of the net is mechanically identical, and the
// only thing that varies is how you look. That is the point: a match is
// decided by how you play it, not by which card you picked on the menu.
//
// The body silhouette is fixed too, and deliberately so: `build.scale` feeds
// the paddle's reach height in sim.stepPlayer, so letting people choose how
// tall they are would be a stat dressed up as a cosmetic.

import { mixHex, shadeHex, tintHex } from './color.js';

// What the human side always plays with. Dead centre on every axis.
export const PLAYER_STATS = Object.freeze({
  speed: 1.00, reach: 1.00, control: 1.00, drive: 1.00, dink: 1.00,
});

const PLAYER_BUILD = Object.freeze({
  torso: 'tapered', head: 'round', scale: 0.92, bulk: 1.0,
});

// `unlock` names the season difficulty that has to be completed to earn the
// item. Everything without one is available from the first launch.
export const SKIN_TONES = [
  { id: 'porcelain', name: 'Porcelain', hex: 0xf3d3b5 },
  { id: 'sand', name: 'Sand', hex: 0xe8b98c },
  { id: 'honey', name: 'Honey', hex: 0xd8a074 },
  { id: 'amber', name: 'Amber', hex: 0xbe8455 },
  { id: 'clay', name: 'Clay', hex: 0xa06a43 },
  { id: 'umber', name: 'Umber', hex: 0x8d5a3b },
  { id: 'cocoa', name: 'Cocoa', hex: 0x6b4a33 },
  { id: 'espresso', name: 'Espresso', hex: 0x4a3425 },
];

export const SHIRT_COLORS = [
  { id: 'court', name: 'Court Blue', hex: 0x2c7bc8 },
  { id: 'kitchen', name: 'Kitchen Teal', hex: 0x16988a },
  { id: 'fern', name: 'Fern', hex: 0x2f9e6e },
  { id: 'flag', name: 'Flag Red', hex: 0xd0453a },
  { id: 'tangerine', name: 'Tangerine', hex: 0xf07d22 },
  { id: 'plum', name: 'Plum', hex: 0x8e4a9e },
  { id: 'slate', name: 'Slate', hex: 0x44525e },
  { id: 'cream', name: 'Cream', hex: 0xf2e7cc },
  { id: 'rose', name: 'Rose', hex: 0xe4738f },
  { id: 'ink', name: 'Ink', hex: 0x1e2734 },
  { id: 'ball', name: 'Ball Yellow', hex: 0xd7e034, unlock: 'easy' },
  { id: 'surf', name: 'Surf', hex: 0x35c4d8, unlock: 'normal' },
  { id: 'ember', name: 'Ember', hex: 0xb5232f, unlock: 'hard' },
  { id: 'gold', name: 'Champion Gold', hex: 0xd8a52a, unlock: 'extreme' },
];

export const PADDLE_COLORS = [
  { id: 'maple', name: 'Maple', hex: 0xd2a763 },
  { id: 'charcoal', name: 'Charcoal', hex: 0x2b3038 },
  { id: 'court', name: 'Court Blue', hex: 0x2c7bc8 },
  { id: 'kitchen', name: 'Kitchen Teal', hex: 0x16988a },
  { id: 'flag', name: 'Flag Red', hex: 0xd0453a },
  { id: 'tangerine', name: 'Tangerine', hex: 0xf07d22 },
  { id: 'plum', name: 'Plum', hex: 0x8e4a9e },
  { id: 'bone', name: 'Bone', hex: 0xf0e6d2 },
  { id: 'lime', name: 'Lime', hex: 0x9ad42e, unlock: 'easy' },
  { id: 'ice', name: 'Ice', hex: 0x8fd8ef, unlock: 'normal' },
  { id: 'obsidian', name: 'Obsidian', hex: 0x11141c, unlock: 'hard' },
  { id: 'gold', name: 'Champion Gold', hex: 0xd8a52a, unlock: 'extreme' },
];

// Shirt styles change how the kit colour is laid out on the body. Both the 3D
// rig and the 2D portrait read these ids, so anything added here has to be
// handled in render/character.js and ui/portrait.js.
export const SHIRTS = [
  { id: 'band', name: 'Classic', note: 'One broad band across the middle.' },
  { id: 'plain', name: 'Plain', note: 'No markings at all. Let the colour do it.' },
  { id: 'hoops', name: 'Hoops', note: 'Three thin rings.' },
  { id: 'panel', name: 'Panel', note: 'Light across the chest, dark below.' },
  { id: 'stripe', name: 'Racer', note: 'A single stripe straight down the front.' },
  { id: 'trim', name: 'Trim', note: 'Piping at the collar and the hem only.' },
  { id: 'sash', name: 'Sash', note: 'A band worn across one shoulder.', unlock: 'normal' },
  { id: 'champion', name: 'Champion', note: 'Gold piping. Earned, not picked.', unlock: 'extreme' },
];

export const ACCESSORIES = [
  { id: 'visor', name: 'Visor' },
  { id: 'cap', name: 'Cap' },
  { id: 'headband', name: 'Headband' },
  { id: 'ponytail', name: 'Ponytail' },
  { id: 'bun', name: 'Top Knot' },
  { id: 'none', name: 'Bare Head' },
  { id: 'beanie', name: 'Beanie' },
  { id: 'shades', name: 'Shades' },
  { id: 'mohawk', name: 'Mohawk', unlock: 'easy' },
  { id: 'bucket', name: 'Bucket Hat', unlock: 'normal' },
  { id: 'headphones', name: 'Headphones', unlock: 'hard' },
  { id: 'crown', name: 'Crown', unlock: 'extreme' },
];

export const DEFAULT_LOOK = Object.freeze({
  name: 'Player',
  shirtColor: 'court',
  paddleColor: 'maple',
  skin: 'honey',
  shirt: 'band',
  accessory: 'visor',
});

const CATALOGUE = {
  shirtColor: SHIRT_COLORS,
  paddleColor: PADDLE_COLORS,
  skin: SKIN_TONES,
  shirt: SHIRTS,
  accessory: ACCESSORIES,
};

export function optionsFor(slot) { return CATALOGUE[slot] || []; }

export function findOption(slot, id) {
  const list = CATALOGUE[slot] || [];
  return list.find((o) => o.id === id) || list[0];
}

// An item is available if it has no unlock requirement, or if the named
// season difficulty is among the ones this player has completed.
export function isUnlocked(option, completed) {
  if (!option || !option.unlock) return true;
  return !!(completed && completed.includes(option.unlock));
}

// Names are shown to other players over the network, so they are trimmed to
// something that fits a lobby row and stripped of characters that would let
// one player's label rearrange somebody else's screen.
export function cleanName(raw) {
  const s = String(raw ?? '').replace(/[<>&"'`\r\n\t]/g, '').trim().slice(0, 14);
  return s || 'Player';
}

// Coerce anything -- old saves, a peer's claim about themselves, a hand-edited
// localStorage blob -- into a look this renderer can actually draw. Locked
// items fall back to the default rather than being honoured, so the unlock
// gate cannot be walked around by editing storage.
export function sanitizeLook(raw, completed = []) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = { name: cleanName(src.name || DEFAULT_LOOK.name) };
  for (const slot of Object.keys(CATALOGUE)) {
    const want = CATALOGUE[slot].find((o) => o.id === src[slot]);
    out[slot] = (want && isUnlocked(want, completed)) ? want.id : DEFAULT_LOOK[slot];
  }
  return out;
}

// A peer's look is theirs to choose and we cannot audit their unlocks, so it
// is accepted as-is apart from being made safe to render and display.
export function sanitizeRemoteLook(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = { name: cleanName(src.name || 'Player') };
  for (const slot of Object.keys(CATALOGUE)) {
    const want = CATALOGUE[slot].find((o) => o.id === src[slot]);
    out[slot] = want ? want.id : DEFAULT_LOOK[slot];
  }
  return out;
}

// Turn a look into the definition the renderers and the sim consume. Secondary
// and trim are derived from the kit colour rather than being picked
// separately: two free colour choices on one garment is how you get a kit that
// looks like a mistake, and one well-chosen hue reads better at this size.
export function avatarDef(look) {
  const l = sanitizeRemoteLook(look);
  const kit = findOption('shirtColor', l.shirtColor).hex;
  const light = tintHex(kit, 0.62);
  const dark = shadeHex(kit, 0.42);
  // A very pale kit needs its accents to go darker, or the collar and the
  // crest vanish into the shirt.
  const pale = luminance(kit) > 0.62;
  return {
    id: 'you',
    name: l.name,
    title: 'You',
    stats: PLAYER_STATS,
    colors: {
      primary: kit,
      secondary: pale ? shadeHex(kit, 0.22) : light,
      trim: pale ? shadeHex(kit, 0.62) : dark,
      skin: findOption('skin', l.skin).hex,
      paddle: findOption('paddleColor', l.paddleColor).hex,
    },
    build: {
      ...PLAYER_BUILD,
      crest: l.accessory,
      shirt: l.shirt,
    },
    look: l,
  };
}

function luminance(n) {
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export { mixHex, shadeHex, tintHex };

// ---- persistence -----------------------------------------------------------

const LOOK_KEY = 'pickleball.look.v1';

/**
 * The player's saved appearance. Locked items are dropped on load, so a
 * cosmetic earned on one machine does not follow a copied storage blob.
 */
export function loadLook(completed = []) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'); } catch { raw = null; }
  return sanitizeLook(raw, completed);
}

export function saveLook(look, completed = []) {
  const clean = sanitizeLook(look, completed);
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(clean)); } catch { /* see season.js */ }
  return clean;
}

/** True once the saved look differs from the one everybody starts with. */
export function lookIsCustom(look) {
  return Object.keys(DEFAULT_LOOK).some((k) => look[k] !== DEFAULT_LOOK[k]);
}

/** Every cosmetic slot has been unlocked. Used by the wardrobe achievement. */
export function allUnlocked(completed = []) {
  return Object.values(CATALOGUE)
    .every((list) => list.every((o) => isUnlocked(o, completed)));
}
