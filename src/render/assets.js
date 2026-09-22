import * as THREE from '../../vendor/three.module.js';
import { COURT, BALL, FENCE } from '../game/constants.js';
import { netHeightAt } from '../game/ballistics.js';
import { mulberry32 } from '../game/rng.js';
import { getVenue } from './venues.js';

// Everything visible in the game is built here out of primitives and
// canvas-drawn textures. No external art assets.

// The apron is the built surface inside the fence; both come from the same
// constants the ball collides against.
const APRON_X = FENCE.X;
const APRON_Z = FENCE.Z;

// A slightly lighter version of a colour, for the parts of a structure that
// catch the light -- rails against posts, that sort of thing.
function tintUp(hex, t) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const up = (c) => Math.round(c + (255 - c) * t);
  return (up(r) << 16) | (up(g) << 8) | up(b);
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0.02,
    flatShading: !!opts.flat, transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
}

// ---- textures --------------------------------------------------------------

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  // Canvas pixels are sRGB. Textures default to NoColorSpace, so without this
  // three feeds the sRGB values straight in as linear and every painted
  // surface comes out washed out and too bright.
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Drawing a feature near a tile edge leaves a seam, so anything large enough
// to notice is drawn nine times at every wrap offset. Positions are generated
// up front so all nine passes draw the identical thing.
function tiled(g, w, h, features, draw) {
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      g.save();
      g.translate(dx, dy);
      for (const f of features) draw(f);
      g.restore();
    }
  }
}

// Acrylic court paint is sand-filled, so it has a fine grain rather than a
// flat colour.
//
// The grit has to be sized in WORLD terms, not texture terms: at this camera a
// metre of court is only about 70 screen pixels, so anything finer than
// roughly a centimetre averages out to flat no matter how much of it there is.
// Hence a 512px tile covering about 1.5m -- large enough that the repeat is
// hard to spot, coarse enough that the grain survives to the screen.
function courtGrain(base, light, dark, repeat, density = 2600) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);

    const blobs = [];
    for (let i = 0; i < 26; i++) {
      blobs.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 26 + Math.random() * 70,
        c: Math.random() < 0.5 ? light : dark,
        a: 0.022 + Math.random() * 0.028,
      });
    }
    tiled(g, w, h, blobs, (f) => {
      g.globalAlpha = f.a;
      g.fillStyle = f.c;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.fill();
    });

    for (let i = 0; i < density; i++) {
      g.globalAlpha = 0.10 + Math.random() * 0.26;
      g.fillStyle = Math.random() < 0.5 ? light : dark;
      const r = 2 + Math.random() * 3.5;
      g.fillRect(Math.random() * w, Math.random() * h, r, r);
    }
    g.globalAlpha = 1;
  }, repeat);
}

// The apron is a laid sport surface: coarse aggregate grain and patchy wear.
// Every feature big enough to see is wrapped, because at this tile size an
// unwrapped blob reads as a grid of squares across the whole surround.
function apronTexture(pal) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = pal.base;
    g.fillRect(0, 0, w, h);

    const patches = [];
    for (let i = 0; i < 30; i++) {
      patches.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 40 + Math.random() * 100,
        c: Math.random() < 0.5 ? pal.light : pal.dark,
        a: 0.025 + Math.random() * 0.04,
      });
    }
    tiled(g, w, h, patches, (f) => {
      g.globalAlpha = f.a;
      g.fillStyle = f.c;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      g.fill();
    });

    const streaks = [];
    for (let i = 0; i < 80; i++) {
      streaks.push({
        x: Math.random() * w, y: Math.random() * h,
        len: 70 + Math.random() * 180, dy: (Math.random() - 0.5) * 10,
        c: Math.random() < 0.5 ? '#50664a' : '#303e33',
        wdt: 1.5 + Math.random() * 4,
        a: 0.022 + Math.random() * 0.035,
      });
    }
    g.lineCap = 'round';
    tiled(g, w, h, streaks, (f) => {
      g.globalAlpha = f.a;
      g.strokeStyle = f.c;
      g.lineWidth = f.wdt;
      g.beginPath();
      g.moveTo(f.x, f.y);
      g.lineTo(f.x + f.len, f.y + f.dy);
      g.stroke();
    });

    for (let i = 0; i < 3400; i++) {
      g.globalAlpha = 0.09 + Math.random() * 0.22;
      const t = Math.random();
      g.fillStyle = t < 0.45 ? '#4d6347' : t < 0.8 ? '#2b382d' : '#5a7052';
      const r = 2 + Math.random() * 3.5;
      g.fillRect(Math.random() * w, Math.random() * h, r, r);
    }
    g.globalAlpha = 1;
  }, [5, 8]);
}

function netTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(15,18,22,0.92)';
    g.lineWidth = 2.2;
    for (let i = 0; i <= 8; i++) {
      const p = (i / 8) * w;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
    }
  }, [22, 3]);
}

// A pickleball is a perforated plastic sphere -- the holes read clearly even
// at a distance, and they sell the spin.
function ballTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    // Indoor pickleballs are this slightly acid yellow-green.
    g.fillStyle = '#e8ee3a';
    g.fillRect(0, 0, w, h);

    // Holes. A real ball has 26 of them in offset rows; the exact count matters
    // less than them reading as holes rather than dots, so each gets a dark
    // interior with a lit lower rim.
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      const v = (r + 0.5) / rows;
      const y = v * h;
      const band = Math.sin(v * Math.PI);        // fewer holes near the poles
      const count = Math.max(3, Math.round(9 * band));
      const off = r % 2 ? 0.5 : 0;
      for (let i = 0; i < count; i++) {
        const x = ((i + off) / count) * w;
        const rad = (5 + 9 * band);
        g.fillStyle = 'rgba(92, 96, 16, 0.92)';
        g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(40, 42, 8, 0.8)';
        g.beginPath(); g.arc(x, y + rad * 0.12, rad * 0.72, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255, 255, 190, 0.5)';
        g.lineWidth = 1.6;
        g.beginPath(); g.arc(x, y, rad, 0.5, 2.2); g.stroke();
      }
    }

    // Moulding seam around the equator.
    g.strokeStyle = 'rgba(150, 156, 40, 0.5)';
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
}

// ---- court -----------------------------------------------------------------

export function buildCourt(quality = 'high', venueId) {
  const v = getVenue(venueId);
  const root = new THREE.Group();
  root.name = 'court';
  root.userData.venue = v.id;

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(APRON_X * 2, 0.18, APRON_Z * 2),
    mat(0xffffff, { roughness: 0.97 })
  );
  apron.material.map = apronTexture(v.apron);
  apron.position.y = -0.09;
  apron.receiveShadow = quality !== 'off';
  root.add(apron);

  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(COURT.HALF_W * 2 + 0.02, 0.02, COURT.HALF_L * 2 + 0.02),
    mat(0xffffff, { roughness: 0.9 })
  );
  surface.material.map = courtGrain(v.court.surface, v.court.light, v.court.dark, [4, 9]);
  surface.position.y = 0.006;
  surface.receiveShadow = quality !== 'off';
  root.add(surface);

  // The kitchen gets its own shade so the shot-type boundary is readable
  // from the play camera at a glance.
  const kitchenMat = mat(0xffffff, { roughness: 0.9 });
  kitchenMat.map = courtGrain(v.kitchen.surface, v.kitchen.light, v.kitchen.dark, [4, 1.4]);
  for (const s of [-1, 1]) {
    const k = new THREE.Mesh(
      new THREE.BoxGeometry(COURT.HALF_W * 2, 0.02, COURT.KITCHEN),
      kitchenMat
    );
    k.position.set(0, 0.012, s * COURT.KITCHEN * 0.5);
    k.receiveShadow = quality !== 'off';
    root.add(k);
  }

  // Lines
  // The lines are painted on the same surface, so they carry the same grit.
  const lineMat = mat(0xffffff, { roughness: 0.7, emissive: 0x223344, emissiveIntensity: 0.10 });
  lineMat.map = courtGrain(v.line.surface, v.line.light, v.line.dark, [1, 26], 700);
  const line = (x, z, w, l) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, l), lineMat);
    m.position.set(x, 0.021, z);
    root.add(m);
  };
  const W = COURT.LINE_W;
  line(0, COURT.HALF_L, COURT.HALF_W * 2 + W, W);      // baselines
  line(0, -COURT.HALF_L, COURT.HALF_W * 2 + W, W);
  line(COURT.HALF_W, 0, W, COURT.HALF_L * 2 + W);      // sidelines
  line(-COURT.HALF_W, 0, W, COURT.HALF_L * 2 + W);
  line(0, COURT.KITCHEN, COURT.HALF_W * 2, W);         // kitchen lines
  line(0, -COURT.KITCHEN, COURT.HALF_W * 2, W);
  // Centre lines, from the kitchen back to the baseline on each side.
  const halfSeg = (COURT.HALF_L - COURT.KITCHEN) / 2;
  line(0, COURT.KITCHEN + halfSeg, W, halfSeg * 2);
  line(0, -(COURT.KITCHEN + halfSeg), W, halfSeg * 2);

  root.add(buildNet(quality));
  root.add(buildSurrounds(quality, v));
  return root;
}

function buildNet(quality) {
  const g = new THREE.Group();
  const SEG = 28;
  const halfW = COURT.HALF_W;

  // Mesh panel that follows the real sag between the posts.
  const pos = [];
  const uv = [];
  const idx = [];
  const rows = 6;
  for (let i = 0; i <= SEG; i++) {
    const x = -halfW + (i / SEG) * halfW * 2;
    const top = netHeightAt(x);
    for (let j = 0; j <= rows; j++) {
      const y = (j / rows) * top;
      pos.push(x, y, 0);
      uv.push(i / SEG, j / rows);
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const netMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d22, map: netTexture(), transparent: true,
    alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.9,
  });
  const net = new THREE.Mesh(geo, netMat);
  net.renderOrder = 2;
  g.add(net);

  // White tape along the top edge, following the same sag.
  const tapePts = [];
  for (let i = 0; i <= SEG; i++) {
    const x = -halfW + (i / SEG) * halfW * 2;
    tapePts.push(new THREE.Vector3(x, netHeightAt(x), 0));
  }
  const tape = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tapePts), SEG, 0.028, 6, false),
    mat(0xf2f5f8, { roughness: 0.6 })
  );
  tape.castShadow = quality === 'high';
  g.add(tape);

  const postMat = mat(0x232a33, { metalness: 0.55, roughness: 0.42 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.052, COURT.NET_H_POST + 0.12, 12), postMat
    );
    post.position.set(s * (halfW + 0.03), (COURT.NET_H_POST + 0.12) / 2, 0);
    post.castShadow = quality !== 'off';
    g.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), postMat);
    cap.position.set(s * (halfW + 0.03), COURT.NET_H_POST + 0.12, 0);
    g.add(cap);
  }
  return g;
}

function buildSurrounds(quality, v) {
  const g = new THREE.Group();
  g.add(buildBarrier(quality, v));

  // Bleachers down both sides and behind both baselines. The end banks are the
  // ones that matter: the play camera looks straight down the court, so the
  // side stands are out of frame for the whole match and a crowd only seated
  // there may as well not exist.
  const standMat = mat(v.stands.color, { roughness: 0.9 });
  for (const s of [-1, 1]) {
    for (let r = 0; r < SIDE_ROWS; r++) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.42, COURT.HALF_L * 1.7), standMat
      );
      bench.position.set(s * (APRON_X + 1.5 + r * 0.9), 0.21 + r * 0.42, 0);
      bench.receiveShadow = quality === 'high';
      g.add(bench);
    }
    for (let r = 0; r < END_ROWS; r++) {
      const h = endRowY(r);
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(APRON_X * END_SPAN, h, 0.9), standMat
      );
      bench.position.set(0, h * 0.5, s * (APRON_Z + END_NEAR + r * 0.9));
      bench.receiveShadow = quality === 'high';
      g.add(bench);
    }
  }

  if (quality !== 'off' && v.stands.crowd > 0) g.add(buildCrowd(v.stands.crowd));
  if (v.lights.show) g.add(buildLights(quality, v));
  return g;
}

// Chain-link mesh, drawn once and tiled along the rails.
function chainLinkTexture(stroke) {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = stroke;
    g.lineWidth = 3;
    g.lineCap = 'square';
    for (let i = -1; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * w, 0); g.lineTo(i * w + w, h); g.stroke();
      g.beginPath();
      g.moveTo(i * w, h); g.lineTo(i * w + w, 0); g.stroke();
    }
  }, [1, 1]);
}

// A waist-high perimeter fence rather than a full cage: it reads as a real
// court surround, and it is low enough that the ball can clear it.
// The perimeter. Chain-link at the public courts, solid boards at the arena
// -- the ball bounces off it either way (FENCE is a simulation constant), so
// a venue can change what it looks like but never whether it is there.
function buildBarrier(quality, v) {
  return v.fence.style === 'wall' ? buildWall(v) : buildFence(quality, v);
}

// Advertising boards: a solid run at fence height with a lighter capping
// rail, which is what a televised court has instead of chain-link.
function buildWall(v) {
  const g = new THREE.Group();
  const H = FENCE.H;
  const face = mat(v.fence.post, { roughness: 0.62, metalness: 0.05 });
  const cap = mat(tintUp(v.fence.post, 0.5), { roughness: 0.4, metalness: 0.2 });
  const runs = [
    { w: FENCE.X * 2 + 0.3, d: 0.16, x: 0, z: -FENCE.Z },
    { w: FENCE.X * 2 + 0.3, d: 0.16, x: 0, z: FENCE.Z },
    { w: 0.16, d: FENCE.Z * 2, x: -FENCE.X, z: 0 },
    { w: 0.16, d: FENCE.Z * 2, x: FENCE.X, z: 0 },
  ];
  for (const r of runs) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(r.w, H, r.d), face);
    board.position.set(r.x, H / 2, r.z);
    board.receiveShadow = true;
    g.add(board);
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(r.w + 0.05, 0.07, r.d + 0.05), cap);
    rail.position.set(r.x, H + 0.03, r.z);
    g.add(rail);
  }
  return g;
}

function buildFence(quality, v) {
  const g = new THREE.Group();
  const H = FENCE.H;
  const postMat = mat(v.fence.post, { metalness: 0.4, roughness: 0.5 });
  const railMat = mat(tintUp(v.fence.post, 0.14), { metalness: 0.4, roughness: 0.5 });

  const meshTex = chainLinkTexture(v.fence.mesh);
  const meshMat = new THREE.MeshStandardMaterial({
    color: 0xd8e2e8, map: meshTex, transparent: true, alphaTest: 0.35,
    side: THREE.DoubleSide, roughness: 0.85, metalness: 0.15,
  });

  // Four runs, each a tiled mesh panel with a top rail and posts.
  const runs = [
    { x: 0, z: -FENCE.Z, len: FENCE.X * 2, rotY: 0 },
    { x: 0, z: FENCE.Z, len: FENCE.X * 2, rotY: 0 },
    { x: -FENCE.X, z: 0, len: FENCE.Z * 2, rotY: Math.PI / 2 },
    { x: FENCE.X, z: 0, len: FENCE.Z * 2, rotY: Math.PI / 2 },
  ];

  // The first run takes the original rather than a fifth clone: an unused
  // original is a texture nothing ever disposes, because disposal walks the
  // materials in the scene and it is not attached to one.
  let first = true;
  for (const run of runs) {
    const tex = first ? meshTex : meshTex.clone();
    first = false;
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(run.len / 0.34, H / 0.34);
    const panelMat = meshMat.clone();
    panelMat.map = tex;

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(run.len, H), panelMat);
    panel.position.set(run.x, H / 2, run.z);
    panel.rotation.y = run.rotY;
    g.add(panel);
  }

  // Top rails, built per axis so each gets the right orientation.
  const railGeoX = new THREE.CylinderGeometry(0.045, 0.045, FENCE.X * 2, 8);
  const railGeoZ = new THREE.CylinderGeometry(0.045, 0.045, FENCE.Z * 2, 8);
  for (const sz of [-1, 1]) {
    const r = new THREE.Mesh(railGeoX, railMat);
    r.rotation.z = Math.PI / 2;
    r.position.set(0, H, sz * FENCE.Z);
    g.add(r);
  }
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(railGeoZ, railMat);
    r.rotation.x = Math.PI / 2;
    r.position.set(sx * FENCE.X, H, 0);
    g.add(r);
  }

  // Posts every few metres.
  const postGeo = new THREE.CylinderGeometry(0.052, 0.058, H + 0.06, 8);
  const addPost = (x, z) => {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(x, (H + 0.06) / 2, z);
    p.castShadow = quality === 'high';
    g.add(p);
  };
  const stepX = (FENCE.X * 2) / Math.round((FENCE.X * 2) / 2.6);
  for (let x = -FENCE.X; x <= FENCE.X + 0.01; x += stepX) {
    addPost(x, -FENCE.Z); addPost(x, FENCE.Z);
  }
  const stepZ = (FENCE.Z * 2) / Math.round((FENCE.Z * 2) / 2.6);
  for (let z = -FENCE.Z + stepZ; z < FENCE.Z - 0.01; z += stepZ) {
    addPost(-FENCE.X, z); addPost(FENCE.X, z);
  }
  return g;
}

// Instanced spectators: two coloured capsules each, bobbing slightly.
// Celebration shape, in seconds: how long the cheer takes to sweep from one
// end of the stand to the other, how fast a single seat gets to its feet, and
// how long it takes to settle back down.
const PARTY_SWEEP = 0.55;
const PARTY_RISE = 0.22;
const PARTY_FALL = 1.55;
const ARM_LEN = 0.26;
const ARM_UP = 2.85;     // radians from hanging to raised. Near-vertical on
                         // purpose: at this size an arm held out at 45 looks
                         // like a stick beside the body, and only a narrow V
                         // above the head reads as somebody cheering
const ARM_OUT = 0.185;   // shoulder offset -- must clear the 0.17 body radius,
                         // or the arms sit inside the torso and never show
const IDENT_Q = new THREE.Quaternion();

const SIDE_ROWS = 4, SIDE_PER = 26;
const END_ROWS = 3, END_PER = 22;
const END_SPAN = 2.2;    // end bank width, in apron half-widths
const END_NEAR = 1.1;    // first end row, measured out from the apron edge

// Apron height, like the side banks. Raking the end stand pushed the crowd up
// and straight out of the top of the frame: the play camera looks down the
// court, so higher seats read as further away, not more prominent.
function endRowY(r) { return 0.42 + r * 0.42; }

// Every seat in the arena, with `along` saying how far down its own bank it
// sits (0..1). That is what a celebration sweeps across, so it has to be the
// position along the stand rather than a world axis -- the end banks run
// across x, the side banks down z.
function seatingPlan() {
  const out = [];
  for (const s of [-1, 1]) {
    for (let r = 0; r < SIDE_ROWS; r++) {
      for (let k = 0; k < SIDE_PER; k++) {
        const along = k / (SIDE_PER - 1);
        out.push({
          x: s * (APRON_X + 1.5 + r * 0.9),
          y: 0.42 + r * 0.42,
          z: (along - 0.5) * COURT.HALF_L * 1.7,
          along: s > 0 ? along : 1 - along,
          // Side banks look across the court, so their shoulders run down z.
          shoulderZ: true,
        });
      }
    }
    for (let r = 0; r < END_ROWS; r++) {
      for (let k = 0; k < END_PER; k++) {
        const along = k / (END_PER - 1);
        out.push({
          x: (along - 0.5) * APRON_X * END_SPAN,
          y: endRowY(r),
          z: s * (APRON_Z + END_NEAR + r * 0.9),
          along: s > 0 ? along : 1 - along,
          // End banks look up the court, so their shoulders run across x.
          shoulderZ: false,
        });
      }
    }
  }
  return out;
}

// A stable, evenly spread 0..1 per seat, so a half-full stand is scattered
// rather than one solid block with an empty half beside it.
function hashFill(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function seatCount() {
  return (SIDE_ROWS * SIDE_PER + END_ROWS * END_PER) * 2;
}

// `fill` is how much of the seating is actually occupied. A clearing in the
// woods should not draw the same full house as a championship final, and
// leaving gaps is cheaper and reads better than shrinking the stands.
function buildCrowd(fill = 1) {
  const group = new THREE.Group();
  group.name = 'crowd';
  const plan = seatingPlan().filter((_, i) => fill >= 1 || hashFill(i) < fill);
  const count = plan.length;
  const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.26, 3, 6);
  const headGeo = new THREE.SphereGeometry(0.135, 7, 6);
  // Arms pivot at the shoulder, so the geometry is shifted to hang below its
  // own origin. One rotation then swings an arm from hanging to raised with no
  // extra bookkeeping.
  const armGeo = new THREE.CapsuleGeometry(0.042, ARM_LEN - 0.084, 3, 5);
  armGeo.translate(0, -ARM_LEN * 0.5, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat(0xffffff, { flat: true }), count);
  const heads = new THREE.InstancedMesh(headGeo, mat(0xffffff, { flat: true }), count);
  const arms = new THREE.InstancedMesh(armGeo, mat(0xffffff, { flat: true }), count * 2);
  for (const im of [bodies, heads, arms]) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const shirt = [0xd9534f, 0x5bc0de, 0xf0ad4e, 0x5cb85c, 0x9b59b6, 0xecf0f1, 0x34495e];
  const skin = [0xf0c8a0, 0xd8a074, 0xb5764d, 0x8d5a3b, 0x66422a];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  const seeds = [];
  let i = 0;
  for (const { x, y, z, along, shoulderZ } of plan) {
    seeds.push({
      x, y, z,
      phase: Math.random() * 6.283,
      amp: 0.07 + Math.random() * 0.12,
      // Everyone has their own jump rhythm and their own starting point in
      // it, so a cheering crowd ripples instead of pulsing in unison.
      period: 0.62 + Math.random() * 0.36,
      offset: Math.random(),
      sway: 0.7 + Math.random() * 0.7,
      // How much this one bounces when nothing in particular is happening.
      // Skewed low so a few people are always up and most are not.
      eager: Math.pow(Math.random(), 1.8),
      lean: 0.5 + Math.random() * 1.1,
      // Where in the sweep of a celebration this seat comes alight, taken
      // from how far along its own bank it sits so the cheer travels like
      // a real one -- plus scatter, so the leading edge is ragged rather
      // than a marching line.
      wave: along + Math.random() * 0.22,
      shoulderZ,
      // Not everyone gets out of their seat, and those who do are not
      // equally demonstrative.
      zeal: 0.55 + Math.random() * 0.45,
      armBias: Math.random() < 0.72 ? 1 : 0.3,
    });
    const shirtCol = new THREE.Color(shirt[(Math.random() * shirt.length) | 0]);
    const skinCol = new THREE.Color(skin[(Math.random() * skin.length) | 0]);
    m.compose(new THREE.Vector3(x, y + 0.3, z), q, sc);
    bodies.setMatrixAt(i, m);
    bodies.setColorAt(i, shirtCol);
    m.compose(new THREE.Vector3(x, y + 0.62, z), q, sc);
    heads.setMatrixAt(i, m);
    heads.setColorAt(i, skinCol);
    // Arms need their rest pose written here too, not just on the first
    // animation frame: an InstancedMesh derives its bounding sphere from
    // whatever matrices it has when the renderer first asks, and a set of
    // identity matrices puts that sphere at the origin -- so the whole mesh
    // gets frustum-culled the moment the camera looks away from centre court.
    for (let a = 0; a < 2; a++) {
      const off = a ? ARM_OUT : -ARM_OUT;
      m.compose(new THREE.Vector3(
        x + (shoulderZ ? 0 : off), y + 0.48, z + (shoulderZ ? off : 0)
      ), q, sc);
      arms.setMatrixAt(i * 2 + a, m);
      arms.setColorAt(i * 2 + a, skinCol);
    }
    i++;
  }

  bodies.instanceColor.needsUpdate = true;
  heads.instanceColor.needsUpdate = true;
  arms.instanceColor.needsUpdate = true;
  group.add(bodies, heads, arms);
  group.userData = { bodies, heads, arms, seeds, count, party: 0, partyT: 0 };
  return group;
}

// A celebration is a one-shot envelope rather than a level, so the crowd gets
// up, makes its noise and sits back down on its own -- which is the difference
// between a stand that reacts and one that is permanently going berserk.
// Retriggering mid-rise only ever raises it; a second cheer never cuts the
// first one short.
export function cheerCrowd(group, strength = 1) {
  const d = group && group.userData;
  if (!d) return;
  const s = Math.max(0, Math.min(1, strength));
  if (d.party > 0 && d.partyT < PARTY_SWEEP + PARTY_RISE) {
    d.party = Math.max(d.party, s);
    return;
  }
  d.party = s;
  d.partyT = 0;
}

// How far into the celebration one seat is, 0..1: up fast, then a smooth
// settle, starting a beat after the seat beside it.
function partyEnv(t, wave) {
  const local = t - wave * PARTY_SWEEP;
  if (local <= 0) return 0;
  if (local < PARTY_RISE) return local / PARTY_RISE;
  const fall = (local - PARTY_RISE) / PARTY_FALL;
  if (fall >= 1) return 0;
  const k = 1 - fall;
  return k * k * (3 - 2 * k);
}

// Takes dt, not absolute time, and advances its own clock. Driving the phase
// as `time * frequency` looks fine until the frequency changes: the argument
// then jumps by `time * delta`, which after a few minutes of play is hundreds
// of radians, and the whole crowd teleports to a random point in its cycle.
// Excitement and celebrations may therefore only scale amplitudes, never rates.
export function animateCrowd(group, dt, excitement = 0) {
  const d = group.userData;
  if (!d) return;
  d.clock = (d.clock || 0) + dt;
  const t = d.clock;
  const hype = Math.max(0, Math.min(1, excitement));
  if (d.party > 0) {
    d.partyT += dt;
    if (d.partyT > PARTY_SWEEP + PARTY_RISE + PARTY_FALL + 0.3) d.party = 0;
  }
  const party = d.party;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  // A spectator leans and throws their arms up in the plane across their own
  // shoulders. Those shoulders point down z in the side banks and across x in
  // the end banks, so the two sets of stands rotate about different axes --
  // use one for both and half the arena cheers side-on to the court.
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i < d.count; i++) {
    const s = d.seeds[i];
    // Idle fidget: everyone shifts their weight, all the time.
    const lift0 = Math.sin(t * s.sway + s.phase) * 0.030;
    const sway = Math.sin(t * s.lean + s.phase * 1.7) * 0.022;

    // A crowd is never completely still, so there is always some bounce --
    // skewed per person, so a handful are up while most are not. Excitement
    // raises everyone to the same full jump.
    const ambient = 0.12 + s.eager * 0.30;
    const cheer = party > 0 ? partyEnv(d.partyT, s.wave) * party * s.zeal : 0;
    const drive = Math.max(ambient, hype, cheer);
    const u = (t / s.period + s.offset) % 1;
    const hop = 4 * u * (1 - u);
    // Two parts to a celebration: getting out of the seat, which is a sustained
    // rise, and the jumping, which is the hop scaled well past anything
    // excitement alone produces. Together they read as "they just won" rather
    // than "the crowd is into this".
    const lift = lift0 + cheer * 0.22 + hop * s.amp * (drive + cheer * 2.1);

    // Sideways movement runs along the shoulder line, whichever way this seat
    // is turned. `sh` is 1 on the axis the shoulders lie on, 0 on the other.
    const shx = s.shoulderZ ? 0 : 1;
    const shz = s.shoulderZ ? 1 : 0;
    const bx = s.x + sway * shx;
    const bz = s.z + sway * shz;
    const by = s.y + 0.3 + lift;

    if (cheer <= 0.02) {
      // Nothing happening: skip the pose maths entirely. This is the path the
      // crowd is on for all but a few seconds of a match.
      v.set(bx, by, bz);
      m.compose(v, IDENT_Q, one);
      d.bodies.setMatrixAt(i, m);
      v.set(s.x + sway * 1.25 * shx, s.y + 0.62 + lift, s.z + sway * 1.25 * shz);
      m.compose(v, IDENT_Q, one);
      d.heads.setMatrixAt(i, m);
      for (let a = 0; a < 2; a++) {
        const off = a ? ARM_OUT : -ARM_OUT;
        v.set(bx + off * shx, by + 0.18, bz + off * shz);
        m.compose(v, IDENT_Q, one);
        d.arms.setMatrixAt(i * 2 + a, m);
      }
      continue;
    }

    // Squash and stretch, read off the same hop: stretched through the fast
    // part of the arc, compressed at the top and on the landing. Without it a
    // jump reads as a capsule sliding up and down a rail.
    const stretch = 1 + cheer * 0.30 * (Math.abs(1 - 2 * u) - 0.45);
    const tilt = Math.sin(t * s.lean * 1.6 + s.phase) * cheer * 0.17;
    // Rotating about z swings toward +x; about x, toward +z -- hence the
    // opposite sign, so both banks throw their arms out across their own
    // shoulders instead of one of them waving at the car park.
    const axis = s.shoulderZ ? X : Z;
    const armDir = s.shoulderZ ? -1 : 1;
    q.setFromAxisAngle(axis, tilt);
    sc.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

    v.set(bx, by, bz);
    m.compose(v, q, sc);
    d.bodies.setMatrixAt(i, m);

    // The head rides the top of the body, so it has to follow the stretch and
    // the lean rather than sitting at a fixed offset.
    const neck = 0.32 * stretch;
    const leanOut = Math.sin(tilt) * neck * (s.shoulderZ ? 1 : -1);
    v.set(
      bx + sway * 0.25 * shx + leanOut * shx,
      by + Math.cos(tilt) * neck,
      bz + sway * 0.25 * shz + leanOut * shz
    );
    m.compose(v, q, one);
    d.heads.setMatrixAt(i, m);

    // Arms hang at rest and swing up and out as the cheer takes hold.
    const raise = Math.min(1, cheer * s.armBias * 1.3);
    const shoulderY = by + 0.18 * stretch;
    for (let a = 0; a < 2; a++) {
      const sgn = a ? 1 : -1;
      qa.setFromAxisAngle(axis, tilt + armDir * sgn * raise * ARM_UP);
      v.set(bx + sgn * ARM_OUT * shx, shoulderY, bz + sgn * ARM_OUT * shz);
      m.compose(v, qa, one);
      d.arms.setMatrixAt(i * 2 + a, m);
    }
  }
  d.bodies.instanceMatrix.needsUpdate = true;
  d.heads.instanceMatrix.needsUpdate = true;
  d.arms.instanceMatrix.needsUpdate = true;
}

function buildLights(quality, v) {
  const g = new THREE.Group();
  g.name = 'floodlights';
  const poleMat = mat(v.lights.pole, { metalness: 0.5, roughness: 0.5 });
  // Kept on userData so the time of day can switch the lamps on without
  // hunting through the scene graph for them.
  const lampMat = mat(v.lights.lamp, {
    emissive: v.lights.lamp, emissiveIntensity: 1.4, roughness: 0.3,
  });
  g.userData.lampMat = lampMat;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 8, 8), poleMat);
      pole.position.set(sx * (APRON_X + 2.6), 4, sz * (APRON_Z - 1.5));
      g.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.7), lampMat);
      head.position.set(sx * (APRON_X + 2.2), 7.9, sz * (APRON_Z - 1.5));
      head.rotation.z = -sx * 0.28;
      g.add(head);
    }
  }
  return g;
}

// ---- ball ------------------------------------------------------------------

export function buildBall() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.R, 22, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, map: ballTexture(), roughness: 0.42, metalness: 0.0,
      emissive: 0x3a3a08, emissiveIntensity: 0.18,
    })
  );
  ball.castShadow = true;
  g.add(ball);
  g.userData.mesh = ball;
  return g;
}

// A soft blob under the ball so its height over the court is always readable.
export function buildBallShadow() {
  const tex = canvasTex(64, 64, (c, w, h) => {
    const grad = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

// ---- world backdrop --------------------------------------------------------

// Horizon colour. The fog is set to match it in view.js, so the ground plane
// fades into the sky instead of ending at a visible edge -- that is what sells
// the "infinite" grass without actually drawing infinite grass.
export const HORIZON = 0xbfe0f2;
const ZENITH = 0x2f7fd0;

const SKY_VERT = `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
precision mediump float;
uniform vec3 top;
uniform vec3 bottom;
uniform vec3 sunDir;
varying vec3 vWorld;

void main() {
  vec3 dir = normalize(vWorld);
  // Gradient by height, biased so most of the sky is blue and the pale band
  // stays close to the horizon.
  float t = pow(clamp(dir.y, 0.0, 1.0), 0.62);
  vec3 col = mix(bottom, top, t);

  // Sun: a hot core with a wide soft bloom around it.
  float d = max(dot(dir, normalize(sunDir)), 0.0);
  col += vec3(1.0, 0.96, 0.82) * pow(d, 900.0) * 1.1;
  col += vec3(1.0, 0.93, 0.72) * pow(d, 18.0) * 0.22;

  gl_FragColor = vec4(col, 1.0);
}`;

// The terrain the court sits in. Same routine for every venue -- mottling
// then blades -- with the palette and the blade count doing the work. Sand
// gets few, short strokes; marsh gets a great many long ones.
function groundTexture(ground) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = ground.base;
    g.fillRect(0, 0, w, h);
    // Broad mottling: patches of lighter and darker ground.
    for (let i = 0; i < 70; i++) {
      const r = 30 + Math.random() * 90;
      g.globalAlpha = 0.05 + Math.random() * 0.08;
      g.fillStyle = ground.patches[(Math.random() * ground.patches.length) | 0];
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
      g.fill();
    }
    // Individual blades, drawn as short tapered strokes at varied angles. This
    // is what stops the ground reading as flat paint up close.
    g.lineCap = 'round';
    const n = ground.bladeCount ?? 9000;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const len = 3 + Math.random() * 7;
      const lean = (Math.random() - 0.5) * 3.2;
      g.globalAlpha = 0.22 + Math.random() * 0.5;
      g.strokeStyle = ground.blades[(Math.random() * ground.blades.length) | 0];
      g.lineWidth = 0.8 + Math.random() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + lean, y - len);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, [260, 260]);
}

// What grows outside the fence. One InstancedMesh for the whole ring keeps
// this to a single draw call however many there are; the venue picks the
// shape and the proportions, so a pine forest and a cactus flat are the same
// code with a different geometry and a taller scale.
const SCATTER_SHAPES = {
  // [geometry, base scale, height multiplier, how much heights vary]
  shrub: () => new THREE.IcosahedronGeometry(1, 0),
  pine: () => new THREE.ConeGeometry(1, 2.6, 6),
  cactus: () => new THREE.CapsuleGeometry(0.55, 1.9, 3, 7),
  reed: () => new THREE.ConeGeometry(0.42, 2.2, 4),
};

const SCATTER_FORM = {
  shrub: { size: [0.30, 0.62], tall: [0.60, 0.45], wide: [0.90, 0.60], lean: 0.40, near: 11, spread: 95 },
  pine: { size: [1.30, 1.70], tall: [1.60, 1.10], wide: [0.70, 0.35], lean: 0.10, near: 7, spread: 105 },
  cactus: { size: [0.70, 0.80], tall: [1.20, 0.90], wide: [0.55, 0.30], lean: 0.08, near: 13, spread: 120 },
  reed: { size: [0.55, 0.70], tall: [1.10, 0.90], wide: [0.50, 0.35], lean: 0.26, near: 5, spread: 80 },
};

function buildScatter(rand, scatter) {
  const group = new THREE.Group();
  const kind = scatter.kind;
  if (kind === 'none' || !scatter.count || !SCATTER_SHAPES[kind]) return group;
  const form = SCATTER_FORM[kind];
  const count = scatter.count;
  const mesh = new THREE.InstancedMesh(
    SCATTER_SHAPES[kind](),
    new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true }),
    count
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const palette = scatter.colors;

  for (let i = 0; i < count; i++) {
    // Ring around the court, thinning with distance so the near ground stays
    // clear and the horizon stays busy.
    const ang = rand() * Math.PI * 2;
    // Start well clear of the fence: anything close reads as a boulder from
    // the play camera and crowds the top of the frame.
    const dist = FENCE.Z + form.near + Math.pow(rand(), 0.55) * form.spread;
    pos.set(Math.cos(ang) * dist * 1.05, 0, Math.sin(ang) * dist);
    const sz = form.size[0] + rand() * form.size[1];
    scl.set(
      sz * (form.wide[0] + rand() * form.wide[1]),
      sz * (form.tall[0] + rand() * form.tall[1]),
      sz * (form.wide[0] + rand() * form.wide[1])
    );
    pos.y = scl.y * 0.5 - 0.22;
    e.set(rand() * form.lean, rand() * 6.283, rand() * form.lean);
    q.setFromEuler(e);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(palette[(rand() * palette.length) | 0]));
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return group;
}

// Open water, as a ring around the court rather than a full plane: the
// boardwalk the court sits on stays dry land, and everything past it floods.
// A ring is also a lot cheaper than cutting a hole in a plane.
function waterTexture(pal) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = pal.deep;
    g.fillRect(0, 0, w, h);
    // Broad slicks of lighter water, so the surface is not one flat colour.
    for (let i = 0; i < 40; i++) {
      g.globalAlpha = 0.05 + Math.random() * 0.1;
      g.fillStyle = Math.random() < 0.5 ? pal.shallow : pal.silt;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h,
        50 + Math.random() * 150, 20 + Math.random() * 60, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Ripple lines. Horizontal and long, so scrolling them reads as a drift
    // across the surface rather than as a texture sliding.
    g.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * h;
      const x = Math.random() * w;
      const len = 14 + Math.random() * 46;
      g.globalAlpha = 0.10 + Math.random() * 0.3;
      g.strokeStyle = Math.random() < 0.6 ? pal.glint : pal.shallow;
      g.lineWidth = 1 + Math.random() * 1.8;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len * 0.5, y - 2 - Math.random() * 3, x + len, y);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, [36, 36]);
}

function buildWater(v) {
  const g = new THREE.Group();
  const pal = v.water;
  const tex = waterTexture(pal);
  const mat2 = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex, transparent: true, opacity: 0.93,
    roughness: 0.16, metalness: 0.32,
  });
  // Starts just outside the apron so the boardwalk reads as an island, and
  // runs past the fog distance so its far edge is never seen.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(APRON_X, APRON_Z) + 1.6, 900, 96, 1), mat2);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.12;
  g.add(ring);

  // A muddy bank where the water meets the boardwalk, so the edge is not a
  // hard line between paving and open water.
  const bank = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(APRON_X, APRON_Z) + 0.2,
      Math.max(APRON_X, APRON_Z) + 3.4, 64, 1),
    mat(pal.bank, { roughness: 1 })
  );
  bank.rotation.x = -Math.PI / 2;
  bank.position.y = -0.17;
  g.add(bank);

  g.userData.water = tex;
  return g;
}

// The bowl the championship court sits inside. This is the only part of the
// downtown dressing the PLAY camera can actually see: it looks down the
// court, so nothing above ground level past about 35m is ever in frame and
// the towers are pure backdrop. A wall just behind the stands is inside that
// band, and it is what turns an open plaza into an arena.
function buildArena(v) {
  const g = new THREE.Group();
  const pal = v.arena;
  const inner = Math.max(APRON_X, APRON_Z) + 5.4;
  const H = 7.5;
  const wall = mat(pal.wall, { roughness: 0.85 });
  const fascia = mat(pal.fascia, {
    roughness: 0.5, emissive: pal.fascia, emissiveIntensity: 0.55,
  });
  const runs = [
    { w: inner * 2.2, d: 0.7, x: 0, z: -inner },
    { w: inner * 2.2, d: 0.7, x: 0, z: inner },
    { w: 0.7, d: inner * 2, x: -inner * 1.1, z: 0 },
    { w: 0.7, d: inner * 2, x: inner * 1.1, z: 0 },
  ];
  for (const r of runs) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(r.w, H, r.d), wall);
    b.position.set(r.x, H / 2 - 0.2, r.z);
    b.receiveShadow = true;
    g.add(b);
    // A lit band along the top, which is what reads as a stadium ring from
    // inside it.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(r.w + 0.08, 0.5, r.d + 0.08), fascia);
    band.position.set(r.x, H - 1.1, r.z);
    g.add(band);
  }
  g.userData.fascia = fascia;
  return g;
}

// A city around the arena. Boxes of varied height in a loose ring, with a
// window grid that lights up after dark -- the windows are the whole point,
// so the texture doubles as the emissive map.
// Returns a matched pair: the facade, and an emissive mask where only the
// lit windows are bright. One texture used for both would make the concrete
// glow as hard as the glass, which at night turned the towers into pale
// slabs instead of dark buildings with lights on.
function windowTextures(pal) {
  const cols = 6, rows = 16;
  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    const lit = Math.random() < 0.38;
    cells.push(lit ? (Math.random() < 0.18 ? pal.litWarm : pal.lit) : null);
  }
  const paint = (background, litOnly) => canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = background;
    g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const col = cells[r * cols + c];
        if (litOnly && !col) continue;
        g.fillStyle = col || pal.dark;
        g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.24, cw * 0.56, ch * 0.5);
      }
    }
  });
  return { diffuse: paint(pal.wall, false), emissive: paint('#000000', true) };
}

function buildSkyline(v, rand) {
  const g = new THREE.Group();
  g.name = 'skyline';
  const pal = v.skyline;
  const mats = [];
  // A few materials rather than one, so not every tower has the same windows
  // lit -- one shared texture makes a city look like wallpaper.
  for (let i = 0; i < 4; i++) {
    const t = windowTextures(pal);
    // White base colour: the map already carries the wall tone, and tinting
    // on top of it multiplies the two and leaves the city black in daylight.
    mats.push(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: t.diffuse, emissive: 0xffffff, emissiveMap: t.emissive,
      emissiveIntensity: 0, roughness: 0.72, metalness: 0.12,
    }));
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  // Three ranks. The near one has to be close enough to loom over the stands
  // from the play camera -- pushed further out it reads as a low wall on the
  // horizon rather than as a city the court is standing in.
  const rings = [
    { dist: 46, count: 20, lo: 22, hi: 58, wide: 8 },
    { dist: 82, count: 26, lo: 44, hi: 118, wide: 13 },
    { dist: 138, count: 28, lo: 70, hi: 190, wide: 19 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + rand() * 0.18;
      const d = ring.dist * (0.82 + rand() * 0.42);
      const hgt = ring.lo + Math.pow(rand(), 1.4) * (ring.hi - ring.lo);
      const wide = ring.wide * (0.55 + rand() * 0.7);
      const deep = ring.wide * (0.55 + rand() * 0.7);
      const b = new THREE.Mesh(geo, mats[(rand() * mats.length) | 0]);
      b.position.set(Math.cos(a) * d, hgt / 2 - 0.3, Math.sin(a) * d);
      b.scale.set(wide, hgt, deep);
      b.rotation.y = rand() * 0.5;
      g.add(b);
      // Repeat the window grid up the tower rather than stretching six
      // storeys of glass over a hundred metres.
      b.material.map.repeat.set(1, 1);
    }
  }
  g.userData.windowMats = mats;
  return g;
}

// Cartoon cloud: a handful of overlapping squashed spheres.
function buildCloud(rand) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0,
    emissive: 0xdfeaf5, emissiveIntensity: 0.35,
    fog: false, flatShading: false,
  });
  const puffs = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < puffs; i++) {
    const r = 9 + rand() * 13;
    const p = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
    p.position.set((i - puffs / 2) * (r * 0.95), (rand() - 0.5) * r * 0.4, (rand() - 0.5) * r * 0.5);
    p.scale.y = 0.55 + rand() * 0.2;
    g.add(p);
  }
  return g;
}

/**
 * Per-frame life in the scenery. Only the water moves, and only on the venue
 * that has any -- everywhere else this is two property reads.
 */
export function animateVenue(sky, dt) {
  const tex = sky && sky.userData.water;
  if (!tex) return;
  // Two axes at different rates so the surface drifts rather than slides.
  tex.offset.x = (tex.offset.x + dt * 0.013) % 1;
  tex.offset.y = (tex.offset.y + dt * 0.031) % 1;
}

// Sky dome, sun, clouds and the ground the court sits on. Everything here is
// far away and unlit by the court lights, so it is cheap.
export function buildSky(sunDirection, venueId) {
  const v = getVenue(venueId);
  const root = new THREE.Group();
  root.name = 'sky';
  root.userData.venue = v.id;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(v.sky.zenith) },
        bottom: { value: new THREE.Color(v.sky.horizon) },
        sunDir: { value: sunDirection.clone().normalize() },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  dome.renderOrder = -1;
  root.add(dome);
  // The light drives this, so the disc in the sky and the direction shadows
  // fall from can never disagree.
  root.userData.sunUniform = dome.material.uniforms.sunDir;
  // The time of day tints these, so it needs them by name rather than by
  // walking the material.
  root.userData.skyTop = dome.material.uniforms.top;
  root.userData.skyBottom = dome.material.uniforms.bottom;
  root.userData.base = v.sky;

  // Ground plane large enough that its edge is well past the fog distance,
  // so it is never seen ending.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, map: groundTexture(v.ground), roughness: 1, metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  ground.receiveShadow = true;
  root.add(ground);

  const rand = mulberry32(90210);
  if (v.water) {
    const water = buildWater(v);
    root.add(water);
    root.userData.water = water.userData.water;
    // The ground under a flooded venue is silt, and it only shows at the
    // banks, so it is pushed down out of the way of the water surface.
    ground.position.y = -0.30;
  }
  if (v.arena) {
    const bowl = buildArena(v);
    root.add(bowl);
    root.userData.fascia = bowl.userData.fascia;
  }
  if (v.skyline) {
    const city = buildSkyline(v, rand);
    root.add(city);
    root.userData.windowMats = city.userData.windowMats;
  }
  root.add(buildScatter(rand, v.scatter));
  for (let i = 0; i < v.clouds; i++) {
    const cloud = buildCloud(rand);
    const ang = rand() * Math.PI * 2;
    // Far enough out and high enough that a cloud never crowds the top of the
    // play camera's frame.
    const dist = 320 + rand() * 260;
    cloud.position.set(Math.cos(ang) * dist, 105 + rand() * 90, Math.sin(ang) * dist);
    cloud.scale.setScalar(1.0 + rand() * 1.1);
    root.add(cloud);
  }
  return root;
}
