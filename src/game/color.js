// Integer-RGB colour helpers, shared by the avatar model and both renderers.
// Kept here rather than duplicated in portrait.js so a kit colour mixes the
// same way whether it is being drawn on a canvas card or lathed in 3D.

export function mixHex(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * k) << 16)
    | (Math.round(ag + (bg - ag) * k) << 8)
    | Math.round(ab + (bb - ab) * k);
}

export function shadeHex(n, t) { return mixHex(Number.isFinite(n) ? n : 0, 0x141822, t); }
export function tintHex(n, t) { return mixHex(Number.isFinite(n) ? n : 0, 0xffffff, t); }

export function cssHex(n) {
  const v = (Number.isFinite(n) ? n : 0) >>> 0;
  return '#' + (v & 0xffffff).toString(16).padStart(6, '0');
}
