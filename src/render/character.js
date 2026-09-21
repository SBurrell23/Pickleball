import * as THREE from '../../vendor/three.module.js';
import { PLAY } from '../game/constants.js';
import { SWINGSTATE } from '../game/sim.js';

// Characters are chibi: ~1.25 units tall, roughly 3.3 heads, with an oversized
// head, mitt hands and big rounded shoes. They stay small on purpose -- the
// court is only 6.1 x 13.4m and four of them have to share it.
//
// Everything is assembled from primitives at runtime. The `build` block on each
// roster entry picks the silhouette so the six read differently from the play
// camera, which sits behind and above at ~12m.

const HEAD_R = 0.19;       // head radius -- the face layout is measured off this
const HEAD_Y = 1.05;       // head centre; crown lands at 1.24
const HIP_Y = 0.47;        // waist: torso pivot and top of the legs
const SHOULDER_Y = 0.82;
const THIGH = 0.22;
const SHIN = 0.19;
const UPPER_ARM = 0.18;
const FOREARM = 0.17;

const GLOVE = 0xf4f2ea;    // white mitts on everyone, cartoon-style
const EYE_WHITE = 0xfcfcfc;
const EYE_DARK = 0x20212a;
const BLUSH = 0xe8817e;
const GRIP = 0x24282e;

function m(color, flat = true, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.78, metalness: 0.03, flatShading: flat, ...extra,
  });
}

// ---------------------------------------------------------------- torso ----

// Lathe profiles, [radius, y] from the waist up to the shoulders. All three are
// wider at the shoulder than the waist so the silhouette reads as a chunky
// little barrel instead of a tube. Low segment counts keep the blocky build
// faceted on purpose.
const TORSO_PROFILES = {
  tapered: {
    seg: 12,
    pts: [[0, 0], [0.125, 0.006], [0.150, 0.055], [0.144, 0.15],
      [0.170, 0.28], [0.176, 0.345], [0.140, 0.40], [0.055, 0.414], [0, 0.418]],
  },
  blocky: {
    seg: 6,
    pts: [[0, 0], [0.165, 0.010], [0.190, 0.060], [0.194, 0.20],
      [0.205, 0.33], [0.190, 0.385], [0.115, 0.410], [0, 0.415]],
  },
  slim: {
    seg: 10,
    pts: [[0, 0], [0.104, 0.006], [0.128, 0.050], [0.119, 0.16],
      [0.146, 0.29], [0.151, 0.35], [0.118, 0.40], [0.050, 0.412], [0, 0.416]],
  },
};

function profileRadius(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1], [r1, y1] = pts[i];
    if (y <= y1) return y1 === y0 ? r1 : r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
  }
  return pts[pts.length - 1][0];
}

// Torso trim rings (collar, belt). The mesh scale has to undo the rotation:
// after rotating the torus flat, its local +Y is the world +Z axis.
function ring(radius, tube, color, wide, deep) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 16), m(color, false));
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.set(wide, deep, 1);
  return mesh;
}

function buildTorso(b, c) {
  const prof = TORSO_PROFILES[b.torso] || TORSO_PROFILES.tapered;
  const wide = b.bulk;
  const deep = 0.78 + 0.16 * b.bulk;   // chests stay shallower than they are wide
  const g = new THREE.Group();
  g.position.y = HIP_Y;                // pivot at the waist: animateCharacter twists this

  const geo = new THREE.LatheGeometry(
    prof.pts.map(([r, y]) => new THREE.Vector2(r, y)), prof.seg
  );
  // Rotate the geometry (not the mesh) so a flat facet faces forward without
  // the non-uniform mesh scale skewing the silhouette.
  if (prof.seg <= 8) geo.rotateY(Math.PI / prof.seg);
  const shell = new THREE.Mesh(geo, m(c.primary));
  shell.scale.set(wide, 1, deep);
  shell.castShadow = true;
  g.add(shell);

  const rAt = (y) => profileRadius(prof.pts, y);

  // Front bib and back plate in the secondary colour. The back one matters most:
  // the play camera is behind the player almost all the time.
  const bib = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), m(c.secondary, false));
  bib.scale.set(1.05 * wide, 1.35, 0.42 * deep);
  bib.position.set(0, 0.185, rAt(0.185) * deep * 0.72);
  g.add(bib);

  const back = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), m(c.secondary, false));
  back.scale.set(1.15 * wide, 1.25, 0.40 * deep);
  back.position.set(0, 0.235, -rAt(0.235) * deep * 0.72);
  g.add(back);

  const belt = ring(rAt(0.05) + 0.012, 0.026, c.trim, wide, deep);
  belt.position.y = 0.05;
  const collar = ring(rAt(0.385) + 0.010, 0.022, c.trim, wide, deep);
  collar.position.y = 0.385;
  g.add(belt, collar);

  return g;
}

// ----------------------------------------------------------------- head ----

// Parks a face feature on the head surface at (x, y) with its +Z along the
// outward normal, so flat bits (mouth arc, blush) hug the sphere instead of
// floating off it. `dist` is how far out from the head centre the feature's
// origin sits -- the mouth arc needs to be pulled in so its ends stay on the
// surface rather than hovering in front of the chin.
function faceAnchor(x, y, square, dist = HEAD_R) {
  const g = new THREE.Group();
  if (square) {
    g.position.set(x, y, 0.166 - (HEAD_R - dist));
    return g;
  }
  const z = Math.sqrt(Math.max(HEAD_R * HEAD_R - x * x - y * y, 0.0009));
  const k = dist / HEAD_R;
  g.position.set(x * k, y * k, z * k);
  g.rotation.y = Math.asin(x / HEAD_R);
  g.rotation.x = -Math.atan2(y, z);
  return g;
}

function buildFace(c, square) {
  const g = new THREE.Group();
  const white = m(EYE_WHITE, false, { roughness: 0.34 });
  const dark = m(EYE_DARK, false, { roughness: 0.42 });
  const browMat = m(c.trim, true);

  for (const sx of [-1, 1]) {
    const eye = faceAnchor(sx * 0.078, 0.018, square, HEAD_R * 0.86);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), white);
    ball.scale.set(0.92, 1.16, 0.80);
    eye.add(ball);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.027, 10, 8), dark);
    pupil.position.set(sx * -0.005, 0.002, 0.030);
    eye.add(pupil);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), white);
    spark.position.set(sx * 0.009, 0.019, 0.047);
    eye.add(spark);
    g.add(eye);

    // Square heads get angled, angry brows; round heads get soft ones. It is a
    // cheap way to give the six roster entries different attitudes.
    const brow = faceAnchor(sx * 0.080, 0.098, square, HEAD_R * 0.97);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.024, 0.030), browMat);
    bar.rotation.z = sx * (square ? 0.42 : 0.12);
    brow.add(bar);
    g.add(brow);

    const cheek = faceAnchor(sx * 0.122, -0.048, square, HEAD_R * 1.004);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.036, 10), m(BLUSH, false, {
      roughness: 0.95,
    }));
    cheek.add(blush);
    g.add(cheek);
  }

  // Little round nose, then a smile: a torus arc swept so it opens upward.
  const nose = faceAnchor(0, -0.020, square, HEAD_R * 0.93);
  const noseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), m(c.skin, false));
  nose.add(noseMesh);
  g.add(nose);

  const rc = 0.048;
  // Origin pulled to sqrt(R^2 - rc^2) so the whole arc lies on the head sphere.
  const mouth = faceAnchor(0, -0.074, square, Math.sqrt(HEAD_R * HEAD_R - rc * rc));
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(rc, 0.012, 5, 12, Math.PI * 0.8), m(EYE_DARK, false)
  );
  smile.rotation.z = -Math.PI * 0.9;  // centre the 0.8pi arc on straight down
  mouth.add(smile);
  g.add(mouth);

  return g;
}

function buildCrest(kind, colors) {
  const g = new THREE.Group();
  const trim = m(colors.trim);
  const prim = m(colors.primary);
  switch (kind) {
    case 'mohawk': {
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(
          new THREE.ConeGeometry(0.052, 0.13 + (i === 2 ? 0.02 : 0), 5), trim
        );
        s.position.set(0, 0.135 + (i === 2 ? 0.01 : 0), 0.10 - i * 0.05);
        g.add(s);
      }
      break;
    }
    case 'ponytail': {
      const band = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), trim);
      band.position.set(0, 0.075, -0.155);
      g.add(band);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.20, 3, 7), trim);
      tail.position.set(0, 0.015, -0.235);
      tail.rotation.x = 0.85;
      tail.castShadow = true;
      g.add(tail);
      break;
    }
    case 'bun': {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.098, 10, 8), trim);
      bun.position.set(0, 0.155, -0.085);
      bun.castShadow = true;
      g.add(bun);
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 12), trim);
      wrap.position.set(0, 0.085, -0.055);
      wrap.rotation.x = Math.PI / 2 - 0.5;
      g.add(wrap);
      break;
    }
    case 'cap': {
      // Concentric with the head so the dome never swallows the eyes.
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.197, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), prim
      );
      cap.castShadow = true;
      g.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.026, 0.15), prim);
      brim.position.set(0, 0.062, 0.185);
      brim.rotation.x = -0.14;
      g.add(brim);
      const nub = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), trim);
      nub.position.y = 0.198;
      g.add(nub);
      break;
    }
    case 'headband': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.177, 0.028, 6, 16), trim);
      band.position.y = 0.072;
      band.rotation.x = Math.PI / 2;
      g.add(band);
      const knot = new THREE.Mesh(new THREE.CapsuleGeometry(0.020, 0.10, 2, 6), trim);
      knot.position.set(-0.05, 0.035, -0.175);
      knot.rotation.set(0.7, 0, 0.5);
      g.add(knot);
      break;
    }
    default: { // visor
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.183, 0.026, 6, 16), prim);
      band.position.y = 0.055;
      band.rotation.x = Math.PI / 2;
      g.add(band);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.022, 0.14), prim);
      brim.position.set(0, 0.058, 0.185);
      brim.rotation.x = -0.16;
      g.add(brim);
    }
  }
  return g;
}

function buildHead(b, c) {
  const head = new THREE.Group();
  const square = b.head === 'square';
  const skin = m(c.skin, square);   // round heads stay smooth so they read soft

  const mesh = square
    ? new THREE.Mesh(new THREE.BoxGeometry(0.355, 0.355, 0.332), skin)
    : new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 16, 12), skin);
  mesh.castShadow = true;
  head.add(mesh);

  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 6), skin);
    ear.position.set(sx * (square ? 0.172 : 0.178), -0.012, 0);
    ear.scale.set(0.7, 1.05, 0.75);
    head.add(ear);
  }

  head.add(buildFace(c, square));
  head.add(buildCrest(b.crest, c));
  return head;
}

// ------------------------------------------------------------- limbs -------

// A capsule limb hanging down -Y from its group origin, which is the joint.
function limb(len, r, color) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(len - r * 2, 0.01), 3, 8), m(color));
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

// Big rounded shoe: ~0.19 long x 0.15 wide x 0.10 tall. The capsule is scaled
// in geometry space before the rotation lays it down along +Z.
function buildShoe(color) {
  const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.085, 3, 10), m(color, false));
  shoe.rotation.x = Math.PI / 2;
  shoe.scale.set(1.36, 1.0, 0.91);
  shoe.castShadow = true;
  return shoe;
}

function buildPaddle(colors) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.215, 0.016),
    m(colors.primary, false, { roughness: 0.55 })
  );
  face.position.y = 0.155;
  face.castShadow = true;
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(0.185, 0.232, 0.010), m(colors.trim, false)
  );
  edge.position.set(0, 0.155, -0.006);
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.020, 0.023, 0.11, 8), m(GRIP, false)
  );
  grip.position.y = 0.045;
  g.add(edge, face, grip);
  g.userData.face = face;
  return g;
}

// ------------------------------------------------------------- assembly ----

export function buildCharacter(def) {
  const c = def.colors;
  const b = def.build;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(b.scale);

  const torso = buildTorso(b, c);
  body.add(torso);

  // Head and arms ride the torso so a swing twist carries the whole upper body.
  const head = buildHead(b, c);
  head.position.y = HEAD_Y - HIP_Y;
  torso.add(head);

  const arms = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.21 * b.bulk, SHOULDER_Y - HIP_Y, 0);

    const upper = limb(UPPER_ARM, 0.065, c.skin);
    // Baked-in splay: animateCharacter never touches `upper`, so this keeps the
    // arms clear of the chunky torso without fighting the swing animation.
    upper.rotation.z = sx * 0.28;
    const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.083, 10, 8), m(c.primary));
    sleeve.scale.set(1, 0.85, 1);
    sleeve.position.y = -0.025;
    sleeve.castShadow = true;
    upper.add(sleeve);
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM;
    elbow.add(limb(FOREARM, 0.060, c.skin));
    const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), m(GLOVE, false));
    mitt.scale.set(1, 0.95, 0.90);
    mitt.position.y = -FOREARM - 0.012;
    mitt.castShadow = true;
    elbow.add(mitt);
    upper.add(elbow);

    torso.add(shoulder);
    arms[side] = { shoulder, upper, elbow };
  }

  const paddle = buildPaddle(c);
  paddle.position.y = -FOREARM - 0.015;
  paddle.rotation.x = -0.30;
  arms.R.elbow.add(paddle);

  const legs = {};
  const hipX = Math.max(0.092, 0.105 * b.bulk);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const hip = new THREE.Group();
    hip.position.set(sx * hipX, HIP_Y, 0);

    const thigh = limb(THIGH, 0.075, c.secondary);
    thigh.rotation.z = sx * 0.05;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    knee.add(limb(SHIN, 0.068, c.skin));
    const shoe = buildShoe(c.trim);
    shoe.position.set(0, -SHIN - 0.01, 0.035);   // sole lands on y = 0
    knee.add(shoe);
    thigh.add(knee);

    body.add(hip);
    legs[side] = { hip, thigh, knee };
  }

  root.userData = {
    def, body, head, torso, arms, legs, paddle,
    runPhase: Math.random() * 6.283,
  };
  return root;
}

function damp(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

// Returns true on the frame a footfall lands, so the caller can fire a step sound.
export function animateCharacter(rig, p, dt, time) {
  const u = rig.userData;
  const speed = Math.hypot(p.vx, p.vz);
  const moving = speed > 0.25;

  // --- locomotion ---
  const stride = moving ? 1.6 + speed * 0.95 : 2.2;
  const prevPhase = u.runPhase;
  u.runPhase += dt * stride * (moving ? Math.PI : 0.55);
  const ph = u.runPhase;
  // Stubby legs need a bigger swing angle to cover the same ground visually.
  const swingAmt = moving ? Math.min(1.00, 0.28 + speed * 0.13) : 0.0;

  u.legs.L.hip.rotation.x = Math.sin(ph) * swingAmt;
  u.legs.R.hip.rotation.x = Math.sin(ph + Math.PI) * swingAmt;
  u.legs.L.knee.rotation.x = Math.max(0, -Math.sin(ph - 0.6)) * swingAmt * 1.15;
  u.legs.R.knee.rotation.x = Math.max(0, -Math.sin(ph + Math.PI - 0.6)) * swingAmt * 1.15;

  // Ready-stance crouch, deeper when moving fast. Scaled down from the old
  // proportions -- there is a lot less leg to fold now.
  const crouch = moving ? 0.020 + speed * 0.006 : 0.012 + Math.sin(time * 2.1) * 0.005;
  u.body.position.y = -crouch + Math.abs(Math.sin(ph)) * (moving ? 0.022 : 0.003);

  // Lean into the direction of travel, in the rig's local frame.
  const cos = Math.cos(p.facing), sin = Math.sin(p.facing);
  const localF = p.vz * cos + p.vx * sin;
  const localR = p.vx * cos - p.vz * sin;
  u.body.rotation.x = damp(u.body.rotation.x, -localF * 0.026 - (p.dashT > 0 ? 0.24 : 0), 12, dt);
  u.body.rotation.z = damp(u.body.rotation.z, -localR * 0.030, 12, dt);

  // --- arms: swing takes priority over the run cycle ---
  // The arms hang off the torso now, so the torso twist adds to the shoulder
  // yaw; the raw arm angles below are correspondingly smaller than they look.
  const fh = p.swingSide >= 0 ? 1 : -1;   // forehand or backhand
  let armY = 0, armX = 0, armZ = 0, torsoY = 0;

  if (p.swingState === SWINGSTATE.WINDUP) {
    const t = Math.min(1, p.swingT / PLAY.SWING_WINDUP);
    armY = -fh * (1.15 + 0.22 * t);
    armX = -0.70 - 0.28 * t;
    torsoY = -fh * 0.40 * t;
  } else if (p.swingState === SWINGSTATE.ACTIVE) {
    const t = Math.min(1, p.swingT / PLAY.SWING_ACTIVE);
    const e = t * t * (3 - 2 * t); // smoothstep through contact
    armY = -fh * (1.37 - e * 2.45);
    armX = -0.98 + e * 1.25;
    armZ = fh * e * 0.45;
    torsoY = -fh * (0.40 - e * 0.82);
  } else if (p.swingState === SWINGSTATE.RECOVER) {
    const t = Math.min(1, p.swingT / PLAY.SWING_RECOVER);
    armY = fh * 1.08 * (1 - t);
    armX = 0.27 * (1 - t);
    armZ = fh * 0.45 * (1 - t);
    torsoY = fh * 0.42 * (1 - t);
  } else if (p.charging) {
    // Coil up while the power bar fills.
    const t = Math.min(1, p.chargeVis);
    armY = -fh * (0.45 + t * 0.78);
    armX = -0.38 - t * 0.40;
    torsoY = -fh * t * 0.32;
  } else {
    // Paddle up, ready, with a light counter-swing from running.
    armY = -fh * 0.38;
    armX = -0.70 + Math.sin(ph + Math.PI) * swingAmt * 0.30;
  }

  const lam = p.swingState === SWINGSTATE.IDLE ? 14 : 34;
  const R = u.arms.R.shoulder;
  R.rotation.y = damp(R.rotation.y, armY, lam, dt);
  R.rotation.x = damp(R.rotation.x, armX, lam, dt);
  R.rotation.z = damp(R.rotation.z, armZ, lam, dt);
  u.arms.R.elbow.rotation.x = damp(u.arms.R.elbow.rotation.x,
    p.swingState === SWINGSTATE.IDLE ? -1.00 : -0.40, lam, dt);

  const L = u.arms.L.shoulder;
  L.rotation.x = damp(L.rotation.x,
    -0.35 + Math.sin(ph) * swingAmt * 0.5 - torsoY * 0.4, 14, dt);
  L.rotation.z = damp(L.rotation.z, -0.08, 14, dt);
  u.arms.L.elbow.rotation.x = damp(u.arms.L.elbow.rotation.x, -0.70, 14, dt);

  u.torso.rotation.y = damp(u.torso.rotation.y, torsoY, lam, dt);
  u.head.rotation.y = damp(u.head.rotation.y, -torsoY * 0.5, 10, dt);

  // Footfall detection for step sounds.
  let step = false;
  if (moving) {
    const a = Math.sin(prevPhase), b2 = Math.sin(ph);
    if (a * b2 < 0) step = true;
  }
  return step;
}
