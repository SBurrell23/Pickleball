import * as THREE from '../../vendor/three.module.js';
import { PLAY } from '../game/constants.js';
import { SWINGSTATE } from '../game/sim.js';

// Players are deliberately anonymous: a floating body and a head, like the
// spectators, with no face and no limbs. All the readability comes from
// silhouette, colour and how the body leans -- and from the paddle, which is
// attached to nothing. It hovers beside the player and does the acting.

function m(color, flat = true, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.78, metalness: 0.03, flatShading: flat, ...extra,
  });
}

// Body silhouettes. Each is a single floating volume -- no shoulders, no waist.
function bodyGeo(kind, bulk) {
  const r = 0.225 * bulk;
  switch (kind) {
    case 'blocky':
      return new THREE.CylinderGeometry(r * 1.02, r * 0.94, 0.60, 6);
    case 'slim':
      return new THREE.CapsuleGeometry(r * 0.82, 0.44, 4, 12);
    default: // tapered
      return new THREE.CylinderGeometry(r * 0.80, r * 1.06, 0.62, 14);
  }
}

function headGeo(kind) {
  return kind === 'square'
    ? new THREE.BoxGeometry(0.30, 0.30, 0.30)
    : new THREE.SphereGeometry(0.175, 16, 12);
}

// Headwear is the only individuating detail left, so it has to carry the
// character's identity on its own.
function buildCrest(kind, colors) {
  const g = new THREE.Group();
  const trim = m(colors.trim);
  const prim = m(colors.primary);
  switch (kind) {
    case 'mohawk':
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(
          new THREE.ConeGeometry(0.045, 0.15 + (i === 2 ? 0.08 : 0), 5), trim);
        s.position.set(0, 0.16, 0.09 - i * 0.045);
        s.castShadow = true;
        g.add(s);
      }
      break;
    case 'ponytail': {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 3, 8), trim);
      tail.position.set(0, 0.02, -0.21);
      tail.rotation.x = 0.8;
      tail.castShadow = true;
      g.add(tail);
      break;
    }
    case 'bun': {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), trim);
      bun.position.set(0, 0.17, -0.06);
      bun.castShadow = true;
      g.add(bun);
      break;
    }
    case 'cap': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(
        0.185, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.52), prim);
      dome.position.y = 0.015;
      dome.castShadow = true;
      g.add(dome);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.025, 0.16), prim);
      brim.position.set(0, 0.03, 0.17);
      g.add(brim);
      break;
    }
    case 'headband': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.03, 6, 18), trim);
      band.position.y = 0.055;
      band.rotation.x = Math.PI / 2;
      g.add(band);
      break;
    }
    default: { // visor
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.026, 6, 18), prim);
      band.position.y = 0.065;
      band.rotation.x = Math.PI / 2;
      g.add(band);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.022, 0.15), prim);
      brim.position.set(0, 0.065, 0.16);
      brim.rotation.x = -0.14;
      g.add(brim);
    }
  }
  return g;
}

function buildPaddle(colors) {
  const g = new THREE.Group();
  const faceMat = m(colors.primary, false, {
    roughness: 0.5, emissive: new THREE.Color(colors.primary), emissiveIntensity: 0,
  });
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.285, 0.022), faceMat);
  face.position.y = 0.21;
  face.castShadow = true;
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(0.235, 0.305, 0.014), m(colors.trim, false));
  edge.position.set(0, 0.21, -0.008);
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.029, 0.15, 8), m(0x24282e, false));
  grip.position.y = 0.035;
  g.add(edge, face, grip);
  g.userData.face = face;
  g.userData.faceMat = faceMat;
  return g;
}

export function buildCharacter(def) {
  const c = def.colors;
  const b = def.build;
  const root = new THREE.Group();
  root.scale.setScalar(b.scale);

  const body = new THREE.Group();
  root.add(body);

  // The floating shell. Its centre is the pivot, so leaning tips the whole
  // figure rather than bending it.
  const shell = new THREE.Mesh(bodyGeo(b.torso, b.bulk), m(c.primary));
  shell.position.y = 0.50;
  shell.castShadow = true;
  body.add(shell);

  // Colour band so the character is identifiable from behind, which is the
  // angle the play camera almost always sees.
  const bandR = 0.228 * b.bulk;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(bandR, bandR, 0.13, b.torso === 'blocky' ? 6 : 14),
    m(c.secondary)
  );
  band.position.y = 0.42;
  body.add(band);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(bandR * 0.62, bandR * 0.72, 0.06, 12), m(c.trim));
  collar.position.y = 0.80;
  body.add(collar);

  const head = new THREE.Group();
  head.position.y = 0.99;
  const headMesh = new THREE.Mesh(headGeo(b.head), m(c.skin, b.head === 'square'));
  headMesh.castShadow = true;
  head.add(headMesh);
  head.add(buildCrest(b.crest, c));
  body.add(head);

  // The paddle hangs off the root rather than the body, so the body's lean
  // does not drag it around -- it keeps its own float.
  const paddle = buildPaddle(c);
  root.add(paddle);

  root.userData = {
    def, body, head, shell, paddle,
    bob: Math.random() * 6.283,
    glide: 0,
  };
  return root;
}

function damp(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

// Paddle pose per swing phase. The rig's local +z is the way the player faces,
// and for a figure facing +z their right hand is world -x -- so local -x is the
// player's right, which is also screen-right from behind them. `s` is therefore
// the negated forehand side.
function paddlePose(p, side) {
  const s = side;
  if (p.swingState === SWINGSTATE.WINDUP) {
    const t = Math.min(1, p.swingT / PLAY.SWING_WINDUP);
    return { x: s * (0.68 + 0.10 * t), y: 1.06 + 0.06 * t, z: -0.30 - 0.10 * t,
      rx: -0.55, ry: -s * (1.0 + 0.3 * t), rz: s * 0.40, k: 26 };
  }
  if (p.swingState === SWINGSTATE.ACTIVE) {
    const t = Math.min(1, p.swingT / PLAY.SWING_ACTIVE);
    const e = t * t * (3 - 2 * t); // smoothstep through contact
    return { x: s * (0.76 - e * 1.24), y: 1.10 - e * 0.34, z: -0.40 + e * 1.20,
      rx: -0.30 + e * 0.55, ry: -s * (1.3 - e * 2.5), rz: s * (0.40 - e * 0.9), k: 44 };
  }
  if (p.swingState === SWINGSTATE.RECOVER) {
    return { x: s * -0.30, y: 0.80, z: 0.56,
      rx: 0.22, ry: s * 1.0, rz: -s * 0.45, k: 14 };
  }
  if (p.charging) {
    // Wind up and back as the meter fills.
    const t = Math.min(1, p.chargeVis);
    return { x: s * (0.56 + t * 0.16), y: 0.76 + t * 0.32, z: -0.04 - t * 0.26,
      rx: -0.18 - t * 0.38, ry: -s * (0.35 + t * 0.75), rz: s * (0.14 + t * 0.28), k: 16 };
  }
  // Idle: floats out to the side, face turned toward the net.
  return { x: s * 0.52, y: 0.74, z: 0.10, rx: 0.02, ry: -s * 0.32, rz: s * 0.12, k: 10 };
}

// Returns true on frames where a moving player should kick up dust.
export function animateCharacter(rig, p, dt, time) {
  const u = rig.userData;
  const speed = Math.hypot(p.vx, p.vz);
  const moving = speed > 0.25;

  // --- floating body ---
  u.bob += dt * (1.6 + speed * 0.5);
  const hover = 0.05 + Math.sin(u.bob) * (moving ? 0.035 : 0.022);
  u.body.position.y = damp(u.body.position.y, hover, 12, dt);

  // Lean into the direction of travel. With no limbs this is the entire read
  // on where a player is going, so it is pushed further than a walk cycle.
  const cos = Math.cos(p.facing), sin = Math.sin(p.facing);
  const localF = p.vz * cos + p.vx * sin;
  const localR = p.vx * cos - p.vz * sin;
  const dash = p.dashT > 0 ? 0.22 : 0;
  u.body.rotation.x = damp(u.body.rotation.x, -localF * 0.055 - dash, 9, dt);
  u.body.rotation.z = damp(u.body.rotation.z, -localR * 0.060, 9, dt);

  // The head trails the lean slightly, which reads as weight.
  u.head.rotation.x = damp(u.head.rotation.x, localF * 0.022, 7, dt);
  u.head.rotation.z = damp(u.head.rotation.z, localR * 0.026, 7, dt);

  // --- floating paddle ---
  // Forehand (swingSide 1) puts the paddle on the player's right, which is
  // local -x. See the note on paddlePose.
  const side = p.swingSide >= 0 ? -1 : 1;
  const pose = paddlePose(p, side);
  const pad = u.paddle;
  const k = pose.k;
  // A slow drift keeps the idle paddle from looking pinned in place.
  const idle = p.swingState === SWINGSTATE.IDLE && !p.charging;
  const driftX = idle ? Math.sin(u.bob * 0.8) * 0.02 : 0;
  const driftY = idle ? Math.sin(u.bob * 1.15 + 1.3) * 0.03 : 0;

  pad.position.x = damp(pad.position.x, pose.x + driftX, k, dt);
  pad.position.y = damp(pad.position.y, pose.y + driftY, k, dt);
  pad.position.z = damp(pad.position.z, pose.z, k, dt);
  pad.rotation.x = damp(pad.rotation.x, pose.rx, k, dt);
  pad.rotation.y = damp(pad.rotation.y, pose.ry, k, dt);
  pad.rotation.z = damp(pad.rotation.z, pose.rz, k, dt);

  // Charging swells and lights the paddle, so a wind-up is legible from the
  // play camera even when the meter is not being watched.
  const charge = p.charging ? Math.min(1, p.chargeVis) : 0;
  const sc = damp(pad.scale.x, 1 + charge * 0.16, 12, dt);
  pad.scale.setScalar(sc);
  const mat = pad.userData.faceMat;
  if (mat) mat.emissiveIntensity = damp(mat.emissiveIntensity, charge * 0.85, 12, dt);

  // --- dust pulse ---
  u.glide += dt * speed;
  let pulse = false;
  if (moving && u.glide > 0.85) { u.glide = 0; pulse = true; }
  return pulse;
}

// World-space position of the paddle face, for spawning charge sparkles.
export function paddleWorldPos(rig, out = new THREE.Vector3()) {
  return rig.userData.paddle.userData.face.getWorldPosition(out);
}
