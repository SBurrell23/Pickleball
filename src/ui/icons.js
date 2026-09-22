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

// ---- menu icons ------------------------------------------------------------
//
// Stroked rather than filled, with round caps and a heavy weight, because the
// rest of the game is drawn in thick outlines -- white court lines, four-pixel
// panel borders -- and a set of solid glyphs would read as borrowed from
// somewhere else. They take `currentColor`, so a tile inverting on hover
// takes its icon with it.
//
// Each entry is the inside of a 24x24 SVG. Deliberately blunt shapes: these
// are read at twenty pixels beside a word that already says what they mean,
// so the job is recognisability at a glance, not detail.

const MENU_ICONS = {
  // A cup with handles, on a stem and a plinth.
  trophy: `
    <path d="M7.5 3.5h9v4.6a4.5 4.5 0 0 1-9 0z"/>
    <path d="M7.5 4.8H5.2a2.9 2.9 0 0 0 2.9 3.4"/>
    <path d="M16.5 4.8h2.3a2.9 2.9 0 0 1-2.9 3.4"/>
    <path d="M12 12.7v3.4"/>
    <path d="M8.6 20.4h6.8l-.9-4.3H9.5z"/>`,

  // A paddle and a ball, which is the whole game in two shapes. The blade is
  // a rounded square rather than an oval on purpose: an oval on a stick reads
  // as a magnifying glass at this size, and the game already has a magnifier
  // elsewhere for scouting.
  paddle: `
    <rect x="4" y="2.8" width="10.8" height="13.2" rx="3.3"/>
    <path d="M9.4 16.1v4.2"/>
    <path d="M7.7 20.5h3.4"/>
    <circle cx="19.3" cy="17.6" r="2.6"/>`,

  // Broadcast: a point with signal coming off it.
  host: `
    <circle cx="12" cy="12" r="2.2"/>
    <path d="M7.9 7.9a5.8 5.8 0 0 0 0 8.2"/>
    <path d="M16.1 16.1a5.8 5.8 0 0 0 0-8.2"/>
    <path d="M5 5a9.9 9.9 0 0 0 0 14"/>
    <path d="M19 19a9.9 9.9 0 0 0 0-14"/>`,

  // Going in through a door.
  join: `
    <path d="M13.5 3.5h6.2v17h-6.2"/>
    <path d="M3.5 12h9.2"/>
    <path d="M9 7.8 13.2 12 9 16.2"/>`,

  // A rosette on its ribbons.
  medal: `
    <circle cx="12" cy="14.8" r="5.7"/>
    <path d="m12 11.7 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z"/>
    <path d="M8.3 9.6 5.6 3.5h12.8l-2.7 6.1"/>`,

  // A book, held open.
  book: `
    <path d="M12 6.6v13.1"/>
    <path d="M12 6.6C10.3 5 8 4.3 3.6 4.3v13.1c4.4 0 6.7.7 8.4 2.3"/>
    <path d="M12 6.6c1.7-1.6 4-2.3 8.4-2.3v13.1c-4.4 0-6.7.7-8.4 2.3"/>`,

  // A cog, as a ring with stubby teeth rather than the toolbar button's solid
  // profile. Spokes on their own read as a sunburst, so the teeth are short
  // and heavy and there is a rim behind them to sit on.
  cog: `
    <circle cx="12" cy="12" r="3"/>
    <circle cx="12" cy="12" r="7.2"/>
    <path stroke-width="3.1" d="${cogTeeth(8, 7.2, 9.5)}"/>`,
};

// Eight radial stubs around a rim, as one path.
function cogTeeth(n, inner, outer) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    out.push(`M${r(12 + c * inner)} ${r(12 + s * inner)}`
      + `L${r(12 + c * outer)} ${r(12 + s * outer)}`);
  }
  return out.join('');
}

/** One icon as inline SVG, sized by the CSS that holds it. */
export function icon(name) {
  const body = MENU_ICONS[name];
  if (!body) return '';
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" stroke-width="2.1"
    stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
