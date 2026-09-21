// Icons, drawn rather than shipped. Everything else in the project is
// generated in code, and a hand-written path blob would be the one asset
// nobody could adjust -- these take their shape from parameters instead.

// A cog: `teeth` tooth tops on an outer radius, roots on an inner one, with a
// bore punched through the middle. The bore is wound the other way so
// `evenodd` leaves it hollow.
export function gearIcon(teeth = 8, size = 24) {
  const c = size / 2;
  const rTip = size * 0.46;
  const rRoot = size * 0.335;
  const rBore = size * 0.15;
  const step = (Math.PI * 2) / teeth;
  // Fractions of one sector: root, rising flank, tooth top, falling flank.
  const edges = [0.10, 0.19, 0.31, 0.40];

  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    pts.push(polar(c, a + step * edges[0], rRoot));
    pts.push(polar(c, a + step * edges[1], rTip));
    pts.push(polar(c, a + step * edges[2], rTip));
    pts.push(polar(c, a + step * edges[3], rRoot));
  }
  const body = 'M' + pts.map((p) => `${p[0]} ${p[1]}`).join('L') + 'Z';
  // Bore: two half arcs, swept the opposite way to the body's winding.
  const bore = `M${r(c - rBore)} ${r(c)}`
    + `A${r(rBore)} ${r(rBore)} 0 0 0 ${r(c + rBore)} ${r(c)}`
    + `A${r(rBore)} ${r(rBore)} 0 0 0 ${r(c - rBore)} ${r(c)}Z`;

  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">`
    + `<path d="${body}${bore}" fill="currentColor" fill-rule="evenodd"/></svg>`;
}

function polar(c, a, rad) {
  return [r(c + Math.cos(a) * rad), r(c + Math.sin(a) * rad)];
}

function r(v) { return Math.round(v * 100) / 100; }
