import * as THREE from '../../vendor/three.module.js';
import { PLAY } from '../game/constants.js';
import { SWINGSTATE } from '../game/sim.js';

// Characters are assembled from primitives at runtime. The `build` block on
// each roster entry picks the silhouette so the six of them read differently
// from the play camera.

function m(color, flat = true, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.78, metalness: 0.03, flatShading: flat, ...extra,
  });
}

function torsoGeo(kind, bulk) {
  switch (kind) {
    case 'blocky':
      return new THREE.BoxGeometry(0.50 * bulk, 0.58, 0.32 * bulk);
    case 'slim':
      return new THREE.CylinderGeometry(0.17 * bulk, 0.21 * bulk, 0.58, 8);
    default: // tapered
      return new THREE.CylinderGeometry(0.19 * bulk, 0.24 * bulk, 0.58, 10);
  }
}

function headGeo(kind) {
  return kind === 'square'
    ? new THREE.BoxGeometry(0.28, 0.30, 0.28)
    : new THREE.SphereGeometry(0.155, 14, 12);
}

function buildCrest(kind, colors) {
  const g = new THREE.Group();
  const trim = m(colors.trim);
  const prim = m(colors.primary);
  switch (kind) {
    case 'mohawk': {
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.13 + (i === 2 ? 0.07 : 0), 5), trim);
        s.position.set(0, 0.16, 0.08 - i * 0.04);
        g.add(s);
      }
      break;
    }
    case 'ponytail': {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 3, 7), trim);
      tail.position.set(0, 0.03, -0.20);
      tail.rotation.x = 0.75;
      g.add(tail);
      break;
    }
    case 'bun': {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), trim);
      bun.position.set(0, 0.15, -0.10);
      g.add(bun);
      break;
    }
    case 'cap': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.163, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), prim);
      cap.position.y = 0.02;
      g.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.13), prim);
      brim.position.set(0, 0.03, 0.15);
      g.add(brim);
      break;
    }
    case 'headband': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.024, 6, 16), trim);
      band.position.y = 0.05;
      band.rotation.x = Math.PI / 2;
      g.add(band);
      break;
    }
    default: { // visor
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.022, 6, 16), prim);
      band.position.y = 0.06;
      band.rotation.x = Math.PI / 2;
      g.add(band);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.018, 0.12), prim);
      brim.position.set(0, 0.06, 0.15);
      brim.rotation.x = -0.12;
      g.add(brim);
    }
  }
  return g;
}

function buildPaddle(colors) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.27, 0.018),
    m(colors.primary, false, { roughness: 0.55 })
  );
  face.position.y = 0.20;
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(0.215, 0.285, 0.012),
    m(colors.trim, false)
  );
  edge.position.y = 0.20;
  edge.position.z = -0.006;
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.023, 0.026, 0.14, 8),
    m(0x24282e, false)
  );
  grip.position.y = 0.035;
  g.add(edge, face, grip);
  g.userData.face = face;
  return g;
}

function limb(len, r1, r2, color) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r1, len - r1 * 2, 3, 8), m(color));
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

export function buildCharacter(def) {
  const c = def.colors;
  const b = def.build;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const s = b.scale;
  root.scale.setScalar(s);

  const hips = new THREE.Mesh(
    new THREE.BoxGeometry(0.34 * b.bulk, 0.20, 0.26 * b.bulk), m(c.secondary)
  );
  hips.position.y = 0.90;
  hips.castShadow = true;
  body.add(hips);

  const torso = new THREE.Mesh(torsoGeo(b.torso, b.bulk), m(c.primary));
  torso.position.y = 1.24;
  torso.castShadow = true;
  body.add(torso);

  // A contrasting stripe so the character is identifiable from behind.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.58, 0.30 * b.bulk), m(c.secondary)
  );
  stripe.position.set(0, 1.24, 0.02);
  body.add(stripe);

  const head = new THREE.Group();
  head.position.y = 1.62;
  const headMesh = new THREE.Mesh(headGeo(b.head), m(c.skin, b.head === 'square'));
  headMesh.castShadow = true;
  head.add(headMesh);
  head.add(buildCrest(b.crest, c));
  body.add(head);

  const arms = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.245 * b.bulk, 1.42, 0);
    const upper = limb(0.30, 0.058, 0.05, c.skin);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.30;
    const fore = limb(0.27, 0.05, 0.045, c.skin);
    elbow.add(fore);
    upper.add(elbow);
    body.add(shoulder);
    arms[side] = { shoulder, upper, elbow };
  }

  const paddle = buildPaddle(c);
  paddle.position.y = -0.27;
  paddle.rotation.x = -0.35;
  arms.R.elbow.add(paddle);

  const legs = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const hip = new THREE.Group();
    hip.position.set(sx * 0.115 * b.bulk, 0.86, 0);
    const thigh = limb(0.44, 0.075, 0.062, c.secondary);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    const shin = limb(0.40, 0.06, 0.05, c.secondary);
    knee.add(shin);
    thigh.add(knee);
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.075, 0.24), m(c.trim, false)
    );
    shoe.position.set(0, -0.415, 0.045);
    knee.add(shoe);
    body.add(hip);
    legs[side] = { hip, thigh, knee };
  }

  root.userData = {
    def, body, head, torso, arms, legs, paddle,
    runPhase: Math.random() * 6.283,
    stepFlag: false,
  };
  return root;
}

const EPS = 0.0001;
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
  const swingAmt = moving ? Math.min(0.85, 0.22 + speed * 0.11) : 0.0;

  u.legs.L.hip.rotation.x = Math.sin(ph) * swingAmt;
  u.legs.R.hip.rotation.x = Math.sin(ph + Math.PI) * swingAmt;
  u.legs.L.knee.rotation.x = Math.max(0, -Math.sin(ph - 0.6)) * swingAmt * 1.15;
  u.legs.R.knee.rotation.x = Math.max(0, -Math.sin(ph + Math.PI - 0.6)) * swingAmt * 1.15;

  // Ready-stance crouch, deeper when moving fast.
  const crouch = moving ? 0.035 + speed * 0.012 : 0.02 + Math.sin(time * 2.1) * 0.006;
  u.body.position.y = -crouch + Math.abs(Math.sin(ph)) * (moving ? 0.03 : 0.004);

  // Lean into the direction of travel, in the rig's local frame.
  const cos = Math.cos(p.facing), sin = Math.sin(p.facing);
  const localF = p.vz * cos + p.vx * sin;
  const localR = p.vx * cos - p.vz * sin;
  u.body.rotation.x = damp(u.body.rotation.x, -localF * 0.030 - (p.dashT > 0 ? 0.28 : 0), 12, dt);
  u.body.rotation.z = damp(u.body.rotation.z, -localR * 0.034, 12, dt);

  // --- arms: swing takes priority over the run cycle ---
  const fh = p.swingSide >= 0 ? 1 : -1;   // forehand or backhand
  let armY = 0, armX = 0, armZ = 0, torsoY = 0;

  if (p.swingState === SWINGSTATE.WINDUP) {
    const t = Math.min(1, p.swingT / PLAY.SWING_WINDUP);
    armY = -fh * (1.45 + 0.25 * t);
    armX = -0.75 - 0.3 * t;
    torsoY = -fh * 0.42 * t;
  } else if (p.swingState === SWINGSTATE.ACTIVE) {
    const t = Math.min(1, p.swingT / PLAY.SWING_ACTIVE);
    const e = t * t * (3 - 2 * t); // smoothstep through contact
    armY = -fh * (1.70 - e * 3.05);
    armX = -1.05 + e * 1.35;
    armZ = fh * e * 0.5;
    torsoY = -fh * (0.42 - e * 0.85);
  } else if (p.swingState === SWINGSTATE.RECOVER) {
    const t = Math.min(1, p.swingT / PLAY.SWING_RECOVER);
    armY = -fh * (-1.35) * (1 - t);
    armX = 0.30 * (1 - t);
    armZ = fh * 0.5 * (1 - t);
    torsoY = fh * 0.43 * (1 - t);
  } else if (p.charging) {
    // Coil up while the power bar fills.
    const t = Math.min(1, p.chargeVis);
    armY = -fh * (0.55 + t * 0.95);
    armX = -0.35 - t * 0.45;
    torsoY = -fh * t * 0.34;
  } else {
    // Paddle up, ready, with a light counter-swing from running.
    armY = -fh * 0.42;
    armX = -0.62 + Math.sin(ph + Math.PI) * swingAmt * 0.35;
  }

  const lam = p.swingState === SWINGSTATE.IDLE ? 14 : 34;
  const R = u.arms.R.shoulder;
  R.rotation.y = damp(R.rotation.y, armY, lam, dt);
  R.rotation.x = damp(R.rotation.x, armX, lam, dt);
  R.rotation.z = damp(R.rotation.z, armZ, lam, dt);
  u.arms.R.elbow.rotation.x = damp(u.arms.R.elbow.rotation.x,
    p.swingState === SWINGSTATE.IDLE ? -0.85 : -0.35, lam, dt);

  const L = u.arms.L.shoulder;
  L.rotation.x = damp(L.rotation.x,
    -0.25 + Math.sin(ph) * swingAmt * 0.5 - torsoY * 0.4, 14, dt);
  L.rotation.z = damp(L.rotation.z, -0.22, 14, dt);
  u.arms.L.elbow.rotation.x = damp(u.arms.L.elbow.rotation.x, -0.55, 14, dt);

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

// World-space position of the paddle face, used to spawn hit effects.
export function paddleWorldPos(rig, out = new THREE.Vector3()) {
  const face = rig.userData.paddle.userData.face;
  return face.getWorldPosition(out);
}
