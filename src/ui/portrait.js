// Cutesy chibi character portraits for the select grid and the lobby list.
// Drawn from the same `build` description the 3D rig uses, to the same chibi
// proportions (~3.3 heads tall, head ~30% of the figure), so a card on the
// select screen and the body on the court read as the same character.
//
// Everything is expressed as a fraction of the figure height `ch`, so the one
// routine covers the 110x140 grid cards and the 38x44 lobby avatars. Fine
// detail (brows, blush, trim strips) is gated on `fine`/`mid` so the tiny size
// stays crisp instead of turning to mud.

const INK = '#1e2230';                     // one dark outline colour for every character
const BLUSH = 'rgba(255,122,138,0.40)';
const SHADOW = 'rgba(16,24,32,0.20)';

const DEF_BUILD = { torso: 'tapered', head: 'round', crest: 'visor',
  shirt: 'band', scale: 1, bulk: 1 };
const DEF_COLORS = { primary: 0x2f9e6e, secondary: 0xf2f7f4, trim: 0x18412f,
  skin: 0xd8a074 };

// Vertical budget in fractions of the figure height, measured from the top of
// the head. Head 0.30, torso 0.33, legs 0.37 -> ~3.3 heads tall.
const HEAD_BOT = 0.30;
const TORSO_BOT = 0.635;
const ANKLE = 0.90;

// Optical centring, measured rather than guessed. The figure is deliberately
// off-centre in its own coordinates -- the raised paddle hangs out one side,
// and every crest sits differently -- so a fixed nudge centres one character
// and leaves the rest sitting crooked over their names. Draw it once, measure
// where the ink actually landed, and redraw shifted. The answer only depends
// on the character and the canvas size, so it is measured once each.
const shiftCache = new Map();

export function drawPortrait(g, W, H, def) {
  if (!g || !(W > 0) || !(H > 0)) return;
  const key = `${(def && def.id) || '?'}|${Math.round(W)}x${Math.round(H)}`;
  let dx = shiftCache.get(key);
  g.save();
  try {
    g.clearRect(0, 0, W, H);
    draw(g, W, H, def);
    if (dx === undefined) {
      dx = measureShift(g, W);
      shiftCache.set(key, dx);
    }
    if (dx) {
      g.clearRect(0, 0, W, H);
      g.translate(dx, 0);
      draw(g, W, H, def);
    }
  } finally {
    // Always unwind, so a half-finished draw can never leak canvas state.
    g.restore();
  }
}

// How far to slide what was just drawn so its ink is centred in the canvas,
// in CSS pixels. Returns 0 if the pixels cannot be read (a tainted or
// zero-sized canvas), which simply leaves the portrait as drawn.
function measureShift(g, W) {
  const cv = g.canvas;
  const cw = cv && cv.width, chh = cv && cv.height;
  if (!cw || !chh) return 0;
  let data;
  try {
    data = g.getImageData(0, 0, cw, chh).data;
  } catch {
    return 0;
  }
  let lo = cw, hi = -1;
  for (let y = 0; y < chh; y++) {
    const row = y * cw * 4;
    for (let x = 0; x < cw; x++) {
      if (data[row + x * 4 + 3] > 16) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
  }
  if (hi < lo) return 0;
  // Never push ink off an edge to satisfy the centring.
  let shift = (cw - 1) / 2 - (lo + hi) / 2;
  shift = Math.max(-lo, Math.min(cw - 1 - hi, shift));
  return (shift * W) / cw;
}

function draw(g, W, H, def) {
  const b = { ...DEF_BUILD, ...(def && def.build) };
  const col = { ...DEF_COLORS, ...(def && def.colors) };
  const scale = num(b.scale, 1, 0.5, 2);
  const bulk = num(b.bulk, 1, 0.4, 2.5);
  const crest = String(b.crest || 'none');

  // Tall crests need headroom or they clip the top of the card.
  const crestRoom = crest === 'mohawk' ? 0.11
    : crest === 'crown' ? 0.10
    : (crest === 'bun' || crest === 'beanie') ? 0.085 : 0.03;

  // `scale` is damped: the roster spans 0.90..1.14 and full range would make
  // the small characters look like a mistake next to the big ones.
  const sc = 0.94 + (scale - 1) * 0.45;
  const availH = H * 0.89;
  const ch = Math.min(availH / (1 + crestRoom), W * 1.08) * sc;

  const feetY = H - H * 0.06;
  const topY = feetY - ch;
  const cx = W * 0.44;                       // nudged left to balance the raised paddle
  const lw = Math.max(ch * 0.016, 0.7);
  const fine = ch >= 78;                     // grid-card detail
  const mid = ch >= 44;

  // Silhouette: bulk drives width, torso style drives the taper.
  const bulkF = 0.80 + (bulk - 0.8) * 0.45;
  let widthMul, taper, bulge;
  switch (b.torso) {
    case 'blocky': widthMul = 1.08; taper = 0.95; bulge = 1.05; break;
    case 'slim': widthMul = 0.86; taper = 0.88; bulge = 0.98; break;
    case 'tapered': widthMul = 1.00; taper = 0.76; bulge = 1.02; break;
    default: widthMul = 1.00; taper = 0.82; bulge = 1.01; break;
  }
  const hs = ch * 0.17 * bulkF * widthMul;   // half shoulder width
  const hw = hs * taper;                     // half waist width

  const m = {
    g, W, H, cx, topY, ch, lw, fine, mid, b, crest, bulkF, bulk, hs, hw, bulge,
    shirt: String(b.shirt || 'band'),
    C: {
      primary: hex(col.primary),
      primaryDark: hex(shade(col.primary, 0.22)),
      secondary: hex(col.secondary),
      trim: hex(col.trim),
      trimLight: hex(tint(col.trim, 0.22)),
      skin: hex(col.skin),
      skinDark: hex(shade(col.skin, 0.18)),
      // Falls back to the kit so every rival looks exactly as it always did.
      paddle: hex(col.paddle ?? col.primary),
      paddleDark: hex(shade(col.paddle ?? col.primary, 0.3)),
    },
    X: (f) => cx + f * ch,
    Y: (f) => topY + f * ch,
    U: (f) => f * ch,
  };
  m.hx = cx;
  m.hcy = m.Y(0.152);
  m.hrx = m.U(b.head === 'square' ? 0.158 : 0.166);
  m.hry = m.U(0.152);
  m.hTop = m.Y(0.005);

  g.lineJoin = 'round';
  g.lineCap = 'round';

  groundShadow(m, feetY);
  legs(m);
  shoes(m);
  shorts(m);
  torso(m);
  backArm(m);
  paddle(m);
  frontArm(m);
  crestBack(m);
  head(m);
  face(m);
  crestFront(m);
}

// ---- parts -----------------------------------------------------------------

function groundShadow(m, feetY) {
  const { g } = m;
  g.fillStyle = SHADOW;
  g.beginPath();
  g.ellipse(m.cx, feetY - m.U(0.01), m.U(0.26), m.U(0.05), 0, 0, Math.PI * 2);
  g.fill();
}

function legs(m) {
  const w = m.U(0.098 + 0.062 * m.bulkF);
  const lx = m.hw * 0.52;
  for (const s of [-1, 1]) {
    limb(m, [[m.cx + s * lx, m.Y(0.58)], [m.cx + s * lx * 1.06, m.Y(ANKLE)]], w, m.C.skin);
  }
}

function shoes(m) {
  const { g } = m;
  const lx = m.hw * 0.52;
  const sw = m.U(0.175), sh = m.U(0.10);
  for (const s of [-1, 1]) {
    // Oversized rounded shoes, shifted outward so the toes splay a little.
    const x = m.cx + s * (lx * 1.06 + m.U(0.014)) - sw / 2;
    const y = m.Y(ANKLE) - sh * 0.45;
    roundRect(g, x, y, sw, sh, m.U(0.045));
    ink(m, m.C.trim);
    if (m.fine) {
      g.fillStyle = m.C.secondary;
      roundRect(g, x + m.lw, y + sh - m.U(0.033), sw - m.lw * 2, m.U(0.026), m.U(0.012));
      g.fill();
    }
  }
}

function shorts(m) {
  const { g } = m;
  const w = m.hw * 2.16, h = m.U(0.15);
  roundRect(g, m.cx - w / 2, m.Y(0.555), w, h, m.U(0.05));
  ink(m, m.C.secondary);
}

function torso(m) {
  const { g, hs, hw } = m;
  const sy = m.Y(HEAD_BOT), by = m.Y(TORSO_BOT);
  const midY = sy + (by - sy) * 0.45;
  const u = m.U(1);
  // Soft bean: domed shoulders, gentle chest bulge, rounded hem. No rectangles.
  g.beginPath();
  g.moveTo(m.cx - hs, sy + u * 0.03);
  g.quadraticCurveTo(m.cx - hs, sy - u * 0.018, m.cx - hs * 0.58, sy - u * 0.022);
  g.quadraticCurveTo(m.cx, sy - u * 0.05, m.cx + hs * 0.58, sy - u * 0.022);
  g.quadraticCurveTo(m.cx + hs, sy - u * 0.018, m.cx + hs, sy + u * 0.03);
  g.quadraticCurveTo(m.cx + hs * m.bulge, midY, m.cx + hw, by - u * 0.03);
  g.quadraticCurveTo(m.cx + hw, by + u * 0.022, m.cx + hw * 0.6, by + u * 0.025);
  g.quadraticCurveTo(m.cx, by + u * 0.05, m.cx - hw * 0.6, by + u * 0.025);
  g.quadraticCurveTo(m.cx - hw, by + u * 0.022, m.cx - hw, by - u * 0.03);
  g.quadraticCurveTo(m.cx - hs * m.bulge, midY, m.cx - hs, sy + u * 0.03);
  g.closePath();
  ink(m, m.C.primary, 1.15);

  if (m.fine) {
    // Collar, always.
    g.fillStyle = m.C.secondary;
    g.beginPath();
    g.moveTo(m.cx - hs * 0.42, m.Y(HEAD_BOT) - m.U(0.012));
    g.quadraticCurveTo(m.cx, m.Y(HEAD_BOT) + m.U(0.06), m.cx + hs * 0.42, m.Y(HEAD_BOT) - m.U(0.012));
    g.quadraticCurveTo(m.cx, m.Y(HEAD_BOT) + m.U(0.02), m.cx - hs * 0.42, m.Y(HEAD_BOT) - m.U(0.012));
    g.fill();
    shirtMarkings(m);
    // Waist band ties the shirt to the shorts.
    g.fillStyle = m.C.trim;
    roundRect(g, m.cx - hw * 0.94, m.Y(0.585), hw * 1.88, m.U(0.03), m.U(0.014));
    g.fill();
  }
}

// Kit markings, matching the 3D rig's shirtPieces(). The body is a bean, so
// every band is clipped to the torso silhouette rather than drawn as a
// floating rectangle -- otherwise a hoop hangs off the side of a slim figure.
function shirtMarkings(m) {
  const { g, hs, hw } = m;
  const wAt = (f) => hs + (hw - hs) * f;         // torso half-width, top to hem
  const bar = (y0, y1, color) => {
    const f0 = (y0 - HEAD_BOT) / (TORSO_BOT - HEAD_BOT);
    const w = wAt(Math.max(0, Math.min(1, f0))) * 1.02;
    g.fillStyle = color;
    roundRect(g, m.cx - w, m.Y(y0), w * 2, m.U(y1 - y0), m.U(0.012));
    g.fill();
  };
  const S = m.C.secondary;
  switch (m.shirt) {
    case 'plain':
      break;
    case 'hoops':
      bar(0.365, 0.395, S); bar(0.445, 0.475, S); bar(0.525, 0.555, S);
      break;
    case 'panel':
      bar(0.315, 0.425, S);
      break;
    case 'stripe':
      g.fillStyle = S;
      roundRect(g, m.cx - m.U(0.024), m.Y(0.33), m.U(0.048), m.U(0.24), m.U(0.02));
      g.fill();
      break;
    case 'trim':
      bar(0.325, 0.35, S); bar(0.55, 0.575, S);
      break;
    case 'sash': {
      g.save();
      g.translate(m.cx, m.Y(0.45));
      g.rotate(-0.55);
      g.fillStyle = S;
      roundRect(g, -hs * 1.5, -m.U(0.042), hs * 3.0, m.U(0.084), m.U(0.03));
      g.fill();
      g.restore();
      break;
    }
    case 'champion':
      bar(0.355, 0.375, '#d8a52a');
      bar(0.40, 0.47, S);
      bar(0.495, 0.515, '#d8a52a');
      break;
    default:
      bar(0.40, 0.47, S);
  }
}

function armGeom(m) {
  const w = m.U(0.055 + 0.026 * m.bulkF);
  const sy = m.Y(0.35);
  return {
    w,
    back: [[m.cx - m.hs * 0.9, sy], [m.cx - m.hs - m.U(0.05), m.Y(0.45)], [m.cx - m.hs - m.U(0.075), m.Y(0.55)]],
    front: [[m.cx + m.hs * 0.9, sy], [m.cx + m.hs + m.U(0.055), m.Y(0.42)], [m.cx + m.hs * 0.5 + m.U(0.13), m.Y(0.335)]],
  };
}

function backArm(m) {
  const a = armGeom(m);
  sleeve(m, a.back, a.w);
  limb(m, a.back, a.w, m.C.skin);
  mitt(m, a.back[2], a.w);
}

function frontArm(m) {
  const a = armGeom(m);
  sleeve(m, a.front, a.w);
  limb(m, a.front, a.w, m.C.skin);
  mitt(m, a.front[2], a.w);      // drawn last so it wraps the paddle grip
}

function sleeve(m, pts, w) {
  // Short cap sleeve: first third of the arm in shirt colour, a touch thicker.
  const a = pts[0], b = pts[1];
  const t = 0.55;
  limb(m, [a, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]], w * 1.5, m.C.primary);
}

function mitt(m, p, w) {
  const { g } = m;
  g.beginPath();
  g.arc(p[0], p[1], w * 0.74, 0, Math.PI * 2);
  ink(m, m.C.skin);
}

function paddle(m) {
  const a = armGeom(m);
  const h = a.front[2];
  withTransform(m.g, h[0], h[1], 0.38, () => {
    const { g } = m;
    // Grip runs through the hand so the paddle reads as held, not floating.
    roundRect(g, -m.U(0.025), -m.U(0.075), m.U(0.05), m.U(0.155), m.U(0.02));
    ink(m, m.C.trim);
    // Rounded-rectangle face: a paddle silhouette, not a lollipop.
    roundRect(g, -m.U(0.095), -m.U(0.255), m.U(0.19), m.U(0.205), m.U(0.072));
    ink(m, m.C.paddle, 1.35);
    if (m.mid) {
      g.fillStyle = m.C.paddleDark;
      roundRect(g, -m.U(0.072), -m.U(0.235), m.U(0.144), m.U(0.038), m.U(0.017));
      g.fill();
    }
  });
}

function head(m) {
  const { g } = m;
  if (m.b.head === 'square') {
    // Squarish, but with fat corner radii so it stays cute.
    roundRect(g, m.hx - m.hrx, m.hTop, m.hrx * 2, m.hry * 2 - m.U(0.005), m.U(0.085));
  } else {
    g.beginPath();
    g.ellipse(m.hx, m.hcy, m.hrx, m.hry, 0, 0, Math.PI * 2);
  }
  ink(m, m.C.skin, 1.2);
}

function face(m) {
  const { g } = m;
  const ex = m.U(0.058), ey = m.Y(0.163);
  const tough = m.bulk >= 1.1;               // the heavies get a determined brow

  for (const s of [-1, 1]) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(m.hx + s * ex, ey, m.U(0.043), m.U(0.052), 0, 0, Math.PI * 2);
    g.fill();
    if (m.mid) { g.strokeStyle = INK; g.lineWidth = m.lw * 0.7; g.stroke(); }
    // Big pupils, barely offset: a low or small pupil reads as a sleepy squint.
    g.fillStyle = INK;
    g.beginPath();
    g.arc(m.hx + s * (ex - m.U(0.004)), ey + m.U(0.004), m.U(0.03), 0, Math.PI * 2);
    g.fill();
    if (m.fine) {
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.beginPath();
      g.arc(m.hx + s * (ex - m.U(0.014)), ey - m.U(0.012), m.U(0.01), 0, Math.PI * 2);
      g.fill();
    }
  }

  if (m.fine) {
    // Brows only on the bare-forehead crests; under a band they read as a squint.
    if (m.crest === 'mohawk' || m.crest === 'ponytail' || m.crest === 'bun'
      || m.crest === 'none' || m.crest === 'crown' || m.crest === 'headphones') {
      g.strokeStyle = m.C.trim;
      g.lineWidth = m.lw * 1.6;
      for (const s of [-1, 1]) {
        const inner = tough ? m.U(0.007) : -m.U(0.004);
        g.beginPath();
        g.moveTo(m.hx + s * m.U(0.03), ey - m.U(0.078) + inner);
        g.lineTo(m.hx + s * m.U(0.085), ey - m.U(0.084) - inner);
        g.stroke();
      }
    }
    g.fillStyle = BLUSH;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(m.hx + s * m.U(0.112), ey + m.U(0.05), m.U(0.032), m.U(0.02), 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Mouth: a plain smile, or an open grin on the big hitters.
  g.strokeStyle = INK;
  g.lineWidth = m.lw * (m.mid ? 1.7 : 1.2);
  g.beginPath();
  g.moveTo(m.hx - m.U(0.056), m.Y(0.226));
  g.quadraticCurveTo(m.hx, m.Y(0.226 + (tough ? 0.055 : 0.042)), m.hx + m.U(0.056), m.Y(0.226));
  if (tough && m.fine) {
    g.closePath();
    g.fillStyle = INK;
    g.fill();
  }
  g.stroke();
}

// ---- crests ----------------------------------------------------------------

// Pieces that sit behind the skull, drawn before the head.
function crestBack(m) {
  const { g } = m;
  switch (m.crest) {
    case 'mohawk': {
      const n = m.mid ? 5 : 3;                 // fewer, fatter spikes when tiny
      const step = m.U(m.mid ? 0.05 : 0.075);
      const half = (n - 1) / 2;
      for (let i = -half; i <= half; i++) {
        const t = Math.abs(i) / (half || 1);
        const hgt = m.U(0.105) * (1 - t * 0.45);
        const bx = m.hx + i * step;
        const by = m.hTop + m.U(0.02) + t * m.U(0.022);
        g.beginPath();
        g.moveTo(bx - step * 0.52, by);
        g.quadraticCurveTo(bx - step * 0.2, by - hgt, bx + step * 0.1, by - hgt);
        g.quadraticCurveTo(bx + step * 0.42, by - hgt * 0.55, bx + step * 0.52, by);
        g.closePath();
        ink(m, m.C.trim);
      }
      break;
    }
    case 'bun': {
      g.beginPath();
      g.arc(m.hx - m.U(0.01), m.hTop + m.U(0.012), m.U(0.075), 0, Math.PI * 2);
      ink(m, m.C.trim);
      break;
    }
    case 'ponytail': {
      // Tail swings out past the cheek so it reads from across the grid.
      g.beginPath();
      g.ellipse(m.hx - m.hrx * 1.12 - m.U(0.035), m.hcy + m.U(0.075),
        m.U(0.058), m.U(0.115), 0.42, 0, Math.PI * 2);
      ink(m, m.C.trim);
      if (m.mid) {
        roundRect(g, m.hx - m.hrx * 1.2, m.hcy - m.U(0.035), m.U(0.05), m.U(0.045), m.U(0.016));
        ink(m, m.C.secondary);
      }
      break;
    }
    case 'headphones': {
      // Far cup peeks out behind the head; the near one is drawn in front.
      g.beginPath();
      g.ellipse(m.hx - m.hrx * 1.02, m.hcy, m.U(0.042), m.U(0.058), 0, 0, Math.PI * 2);
      ink(m, m.C.primary);
      break;
    }
    case 'visor':
    case 'cap':
    case 'bucket':
    case 'beanie':
    case 'shades':
    case 'crown':
    case 'headband':
    case 'none':
    default:
      break;                                   // nothing sits behind the head
  }
}

// Pieces that sit on top of the face, drawn last.
function crestFront(m) {
  const { g } = m;
  switch (m.crest) {
    case 'visor': {
      // Sun visor: open-topped band with a wide brim over the brow.
      roundRect(g, m.hx - m.hrx * 1.0, m.Y(0.058), m.hrx * 2.0, m.U(0.05), m.U(0.022));
      ink(m, m.C.secondary);
      g.beginPath();
      g.ellipse(m.hx, m.Y(0.104), m.hrx * 1.3, m.U(0.07), 0, Math.PI, Math.PI * 2);
      g.closePath();
      ink(m, m.C.primary, 1.15);
      break;
    }
    case 'cap': {
      // Dome in the kit colour, brim in the accent so it pops on dark kits.
      g.beginPath();
      g.ellipse(m.hx, m.Y(0.112), m.hrx * 1.05, m.U(0.118), 0, Math.PI, Math.PI * 2);
      g.closePath();
      ink(m, m.C.primary, 1.15);
      g.beginPath();
      g.ellipse(m.hx + m.hrx * 0.78, m.Y(0.108), m.hrx * 0.95, m.U(0.045), 0, 0, Math.PI);
      g.closePath();
      ink(m, m.C.secondary);
      if (m.fine) {
        g.beginPath();
        g.arc(m.hx, m.Y(0.015), m.U(0.018), 0, Math.PI * 2);
        ink(m, m.C.trim);
      }
      break;
    }
    case 'headband': {
      hairCap(m);
      roundRect(g, m.hx - m.hrx * 1.04, m.Y(0.066), m.hrx * 2.08, m.U(0.055), m.U(0.024));
      ink(m, m.C.secondary);
      // Knot with two tails trailing down and back.
      g.beginPath();
      g.arc(m.hx - m.hrx * 1.02, m.Y(0.096), m.U(0.026), 0, Math.PI * 2);
      ink(m, m.C.secondary);
      if (m.mid) {
        g.strokeStyle = m.C.secondary;
        g.lineWidth = m.lw * 2.2;
        for (const d2 of [0, 0.05]) {
          g.beginPath();
          g.moveTo(m.hx - m.hrx * 1.02, m.Y(0.1));
          g.quadraticCurveTo(m.hx - m.hrx * 1.55, m.Y(0.13 + d2), m.hx - m.hrx * 1.5, m.Y(0.2 + d2));
          g.stroke();
        }
      }
      break;
    }
    case 'beanie': {
      // Knitted cap pulled down past the brow, with a turned-up roll.
      g.beginPath();
      g.ellipse(m.hx, m.Y(0.108), m.hrx * 1.08, m.U(0.125), 0, Math.PI, Math.PI * 2);
      g.closePath();
      ink(m, m.C.trim, 1.15);
      roundRect(g, m.hx - m.hrx * 1.1, m.Y(0.084), m.hrx * 2.2, m.U(0.05), m.U(0.022));
      ink(m, m.C.primary);
      if (m.fine) {
        g.beginPath();
        g.arc(m.hx, m.Y(-0.022), m.U(0.032), 0, Math.PI * 2);
        ink(m, m.C.primary);
      }
      break;
    }
    case 'bucket': {
      g.beginPath();
      g.ellipse(m.hx, m.Y(0.096), m.hrx * 0.98, m.U(0.096), 0, Math.PI, Math.PI * 2);
      g.closePath();
      ink(m, m.C.primary, 1.15);
      // Brim on both sides -- that is the whole point of a bucket hat.
      g.beginPath();
      g.ellipse(m.hx, m.Y(0.1), m.hrx * 1.52, m.U(0.038), 0, 0, Math.PI * 2);
      ink(m, m.C.trim);
      break;
    }
    case 'shades': {
      hairCap(m);
      // Pushed up onto the brow: there is no face under them to cover.
      roundRect(g, m.hx - m.hrx * 1.02, m.Y(0.062), m.hrx * 2.04, m.U(0.055), m.U(0.02));
      ink(m, m.C.trim);
      if (m.fine) {
        g.fillStyle = m.C.trimLight;
        roundRect(g, m.hx - m.hrx * 0.9, m.Y(0.072), m.hrx * 1.8, m.U(0.016), m.U(0.008));
        g.fill();
      }
      break;
    }
    case 'headphones': {
      hairCap(m);
      // Headband arcs over the skull, near cup over the ear.
      g.strokeStyle = m.C.trim;
      g.lineWidth = m.lw * 3.4;
      g.beginPath();
      g.arc(m.hx, m.hcy, m.hrx * 1.05, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
      g.beginPath();
      g.ellipse(m.hx + m.hrx * 1.02, m.hcy, m.U(0.042), m.U(0.058), 0, 0, Math.PI * 2);
      ink(m, m.C.primary);
      break;
    }
    case 'crown': {
      hairCap(m);
      const base = m.Y(0.03);
      const w = m.hrx * 1.9;
      const pts = 5;
      g.beginPath();
      g.moveTo(m.hx - w / 2, base);
      for (let i = 0; i < pts; i++) {
        const x0 = m.hx - w / 2 + (w * i) / pts;
        const x1 = m.hx - w / 2 + (w * (i + 0.5)) / pts;
        const x2 = m.hx - w / 2 + (w * (i + 1)) / pts;
        g.lineTo(x1, base - m.U(0.085));
        g.lineTo(x2, base);
        if (i === 0) g.lineTo(x0, base);
      }
      g.lineTo(m.hx + w / 2, base + m.U(0.042));
      g.lineTo(m.hx - w / 2, base + m.U(0.042));
      g.closePath();
      ink(m, '#d8a52a', 1.2);
      break;
    }
    case 'none':
      hairCap(m);
      break;
    case 'ponytail':
    case 'bun':
      hairCap(m);
      break;
    case 'mohawk':
      break;                                   // spikes already drawn behind
    default:
      hairCap(m);
      break;
  }
}

// Shared hair: skull cap with a two-lobe fringe across the brow.
function hairCap(m) {
  const { g } = m;
  const rx = m.hrx * 1.02, ry = m.hry * 1.02;
  g.beginPath();
  g.ellipse(m.hx, m.hcy, rx, ry, 0, Math.PI, Math.PI * 2);
  g.quadraticCurveTo(m.hx + rx * 0.55, m.hcy + m.U(0.035), m.hx + rx * 0.2, m.hcy - m.U(0.012));
  g.quadraticCurveTo(m.hx - rx * 0.3, m.hcy + m.U(0.04), m.hx - rx, m.hcy);
  g.closePath();
  ink(m, m.C.trim, 1.1);
}

// ---- drawing helpers -------------------------------------------------------

// Fill the current path and give it the shared dark outline.
function ink(m, fill, lwMul = 1) {
  const g = m.g;
  if (fill) { g.fillStyle = fill; g.fill(); }
  g.strokeStyle = INK;
  g.lineWidth = m.lw * lwMul;
  g.stroke();
}

// Chunky limb: an outline pass under a colour pass, so it reads as an outlined
// noodle without building a polygon for it.
function limb(m, pts, w, color) {
  const g = m.g;
  const trace = () => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = w + m.lw * 2;
  trace();
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = w;
  trace();
  g.stroke();
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

// save/restore in a finally, so a throw inside can't unbalance the context.
function withTransform(g, x, y, rot, fn) {
  g.save();
  try {
    g.translate(x, y);
    g.rotate(rot);
    fn();
  } finally {
    g.restore();
  }
}

// ---- colour helpers --------------------------------------------------------

function hex(n) {
  const v = (Number.isFinite(n) ? n : 0) >>> 0;
  return '#' + (v & 0xffffff).toString(16).padStart(6, '0');
}

function mix(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * k);
  const gg = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (gg << 8) | bl;
}

function shade(n, t) { return mix(Number.isFinite(n) ? n : 0, 0x141822, t); }
function tint(n, t) { return mix(Number.isFinite(n) ? n : 0, 0xffffff, t); }

function num(v, fallback, lo, hi) {
  const x = Number.isFinite(v) ? v : fallback;
  return Math.max(lo, Math.min(hi, x));
}
