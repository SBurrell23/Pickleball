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

// Body silhouettes, lathed from a profile so every one is genuinely round --
// the shape varies, the roundness does not. Profile points are (radius, height)
// in the rig's own space, bottom to top.
function bodyProfile(kind, bulk) {
  const r = 0.235 * bulk;
  switch (kind) {
    case 'blocky': // wide barrel
      return [[0, 0.06], [r * 0.80, 0.07], [r * 1.05, 0.22], [r * 1.08, 0.60],
        [r * 0.96, 0.78], [r * 0.62, 0.87], [0, 0.90]];
    case 'slim': // narrow and tall
      return [[0, 0.06], [r * 0.58, 0.07], [r * 0.74, 0.24], [r * 0.70, 0.62],
        [r * 0.60, 0.80], [r * 0.38, 0.88], [0, 0.90]];
    default: // tapered: broad base, narrow shoulders
      return [[0, 0.06], [r * 0.74, 0.07], [r * 1.00, 0.24], [r * 0.86, 0.58],
        [r * 0.66, 0.78], [r * 0.42, 0.87], [0, 0.90]];
  }
}

function bodyGeo(kind, bulk) {
  const pts = bodyProfile(kind, bulk).map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 20);
}

// Radius of the body at a given height, so trim rings sit flush on the surface.
function radiusAt(kind, bulk, y) {
  const pts = bodyProfile(kind, bulk);
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    if (y >= y0 && y <= y1) {
      const t = (y - y0) / Math.max(1e-5, y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return pts[pts.length - 2][0];
}

// Both head types are round; they differ in proportion, not in facet count.
function headGeo(kind) {
  const g = new THREE.SphereGeometry(kind === 'square' ? 0.188 : 0.176, 18, 14);
  if (kind === 'square') g.scale(1.0, 0.92, 0.96);
  return g;
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
    case 'beanie': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(
        0.188, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), trim);
      dome.position.y = -0.01;
      dome.castShadow = true;
      g.add(dome);
      const roll = new THREE.Mesh(new THREE.TorusGeometry(0.176, 0.032, 6, 18), prim);
      roll.position.y = 0.04;
      roll.rotation.x = Math.PI / 2;
      g.add(roll);
      const bobble = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), prim);
      bobble.position.y = 0.185;
      g.add(bobble);
      break;
    }
    case 'bucket': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(
        0.182, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.46), prim);
      dome.position.y = 0.02;
      dome.castShadow = true;
      g.add(dome);
      // Brim all the way round, which is what separates it from a cap.
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.255, 0.028, 18), trim);
      brim.position.y = 0.045;
      g.add(brim);
      break;
    }
    case 'headphones': {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(
        0.182, 0.026, 6, 16, Math.PI), trim);
      bow.position.y = 0.03;
      bow.rotation.y = Math.PI / 2;
      g.add(bow);
      for (const sx of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.05, 12), prim);
        cup.position.set(sx * 0.178, 0.025, 0);
        cup.rotation.z = Math.PI / 2;
        g.add(cup);
      }
      break;
    }
    case 'shades': {
      // Worn on the brow, not over the eyes -- there is no face to cover.
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.055, 0.035), trim);
      band.position.set(0, 0.052, 0.152);
      band.rotation.x = -0.12;
      g.add(band);
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.17), trim);
        arm.position.set(sx * 0.142, 0.055, 0.06);
        g.add(arm);
      }
      break;
    }
    case 'crown': {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.16, 0.06, 14), prim);
      band.position.y = 0.135;
      band.castShadow = true;
      g.add(band);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.085, 4), prim);
        spike.position.set(Math.cos(a) * 0.148, 0.195, Math.sin(a) * 0.148);
        g.add(spike);
      }
      break;
    }
    case 'none':
      break;
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

// A pickleball paddle is a rounded slab, not a rectangle. Built from a shape
// with quadratic corners and extruded with a bevel so the rim catches light.
function paddleShape(w, h, r) {
  const sh = new THREE.Shape();
  const hw = w / 2, hh = h / 2;
  sh.moveTo(-hw + r, -hh);
  sh.lineTo(hw - r, -hh);
  sh.quadraticCurveTo(hw, -hh, hw, -hh + r);
  sh.lineTo(hw, hh - r);
  sh.quadraticCurveTo(hw, hh, hw - r, hh);
  sh.lineTo(-hw + r, hh);
  sh.quadraticCurveTo(-hw, hh, -hw, hh - r);
  sh.lineTo(-hw, -hh + r);
  sh.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return sh;
}

function paddleFaceGeo(w, h, r, depth) {
  const geo = new THREE.ExtrudeGeometry(paddleShape(w, h, r), {
    depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.007,
    bevelSegments: 2, curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

function buildPaddle(colors) {
  const g = new THREE.Group();
  // ExtrudeGeometry emits two groups: 0 is the flat caps, 1 is the extruded
  // rim. Giving them separate materials paints the face in the character's
  // colour on BOTH sides with a trim edge around it -- a stacked slab left the
  // paddle looking black whenever the camera was behind it.
  // The paddle is its own colour when one was chosen, falling back to the kit
  // so every rival on the ladder looks exactly as it always did.
  const face = colors.paddle ?? colors.primary;
  const faceMat = m(face, false, {
    roughness: 0.5, emissive: new THREE.Color(face), emissiveIntensity: 0,
  });
  const rimMat = m(colors.trim, false, { roughness: 0.6 });
  const slab = new THREE.Mesh(paddleFaceGeo(0.225, 0.295, 0.078, 0.026),
    [faceMat, rimMat]);
  slab.position.y = 0.21;
  slab.castShadow = true;

  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.030, 0.15, 10), m(0x24282e, false));
  grip.position.y = 0.035;
  const collarRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.031, 0.011, 6, 14), rimMat);
  collarRing.position.y = 0.107;
  collarRing.rotation.x = Math.PI / 2;

  g.add(slab, grip, collarRing);
  g.userData.face = slab;
  g.userData.faceMat = faceMat;
  return g;
}

// A ring that sits flush on the lathed body at height `y`.
function hoop(b, y, h, color, grow = 1.02) {
  const r = radiusAt(b.torso, b.bulk, y) * grow;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.02, h, 20), m(color, false));
  mesh.position.y = y;
  return mesh;
}

// How the kit colour is laid out on the body. The ids match avatar.js SHIRTS,
// and anything added there needs a case here and in ui/portrait.js -- an
// unknown style falls through to the classic band rather than to nothing.
function shirtPieces(b, c) {
  switch (b.shirt) {
    case 'plain':
      return [];
    case 'hoops':
      return [0.30, 0.44, 0.58].map((y) => hoop(b, y, 0.055, c.secondary));
    case 'panel': {
      // Upper body in the light tone: a lathe of just the top of the profile
      // would be ideal, but a tall ring reads the same and costs nothing.
      return [hoop(b, 0.60, 0.30, c.secondary, 1.015)];
    }
    case 'stripe': {
      const r = radiusAt(b.torso, b.bulk, 0.45);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, 0.62, 0.085), m(c.secondary, false));
      bar.position.set(0, 0.45, r * 0.94);
      return [bar];
    }
    case 'trim':
      return [hoop(b, 0.16, 0.045, c.secondary), hoop(b, 0.74, 0.045, c.secondary)];
    case 'sash': {
      const r = radiusAt(b.torso, b.bulk, 0.45) * 1.03;
      const sash = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.13, 20), m(c.secondary, false));
      sash.position.y = 0.45;
      sash.rotation.z = 0.42;                    // worn across one shoulder
      return [sash];
    }
    case 'champion': {
      const gold = 0xd8a52a;
      return [
        hoop(b, 0.30, 0.04, gold), hoop(b, 0.40, 0.11, c.secondary),
        hoop(b, 0.50, 0.04, gold),
      ];
    }
    default:
      return [hoop(b, 0.40, 0.14, c.secondary)];
  }
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
  // The lathe profile is in absolute rig heights, so the shell sits at origin.
  const shell = new THREE.Mesh(bodyGeo(b.torso, b.bulk), m(c.primary, false));
  shell.castShadow = true;
  body.add(shell);

  // Markings so the character is identifiable from behind, which is the angle
  // the play camera almost always sees. Every ring is sized to the body's own
  // radius at its height so it hugs the surface instead of floating off it.
  for (const piece of shirtPieces(b, c)) body.add(piece);

  const collarY = 0.82;
  const collarR = radiusAt(b.torso, b.bulk, collarY) * 1.06;
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(collarR * 0.86, collarR, 0.07, 18), m(c.trim, false));
  collar.position.y = collarY;
  body.add(collar);

  const head = new THREE.Group();
  head.position.y = 1.02;
  const headMesh = new THREE.Mesh(headGeo(b.head), m(c.skin, false));
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
    // From wind-up onward the paddle is locked to the swing side: the stroke
    // has to stay readable, and it must not follow the mouse mid-swing.
    return { x: s * (0.68 + 0.10 * t), y: 1.06 + 0.06 * t, z: -0.30 - 0.10 * t,
      rx: -0.55, ry: -s * (1.0 + 0.3 * t), rz: s * 0.40, k: 26, aim: 0 };
  }
  if (p.swingState === SWINGSTATE.ACTIVE) {
    const t = Math.min(1, p.swingT / PLAY.SWING_ACTIVE);
    const e = t * t * (3 - 2 * t); // smoothstep through contact
    return { x: s * (0.76 - e * 1.24), y: 1.10 - e * 0.34, z: -0.40 + e * 1.20,
      rx: -0.30 + e * 0.55, ry: -s * (1.3 - e * 2.5), rz: s * (0.40 - e * 0.9), k: 44, aim: 0 };
  }
  if (p.swingState === SWINGSTATE.RECOVER) {
    return { x: s * -0.30, y: 0.80, z: 0.56,
      rx: 0.22, ry: s * 1.0, rz: -s * 0.45, k: 14, aim: 0.3 };
  }
  if (p.charging) {
    // Winds back as the meter fills, and commits to the swing side as it goes:
    // early in the charge it still tracks the mouse, by full charge it is
    // loaded on the side the stroke will come from.
    const t = Math.min(1, p.chargeVis);
    return { x: s * (0.16 + t * 0.44), y: 0.76 + t * 0.32, z: -0.04 - t * 0.26,
      rx: -0.18 - t * 0.38, ry: -s * (0.10 + t * 0.85), rz: s * (0.14 + t * 0.28),
      k: 16, aim: 0.95 - t * 0.6 };
  }
  // Idle: no fixed side at all. Where the paddle sits is entirely the aim
  // sweep below, so it crosses the body as the mouse crosses the player.
  return { x: 0, y: 0.74, z: 0.10, rx: 0.02, ry: 0, rz: 0, k: 10, aim: 1 };
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

  // Where the paddle sits across the body is the aim, not the ball. `paddleAim`
  // is a world direction from the caller; rotated into the rig's frame, its x
  // says how far to the player's left or right they are pointing -- so the
  // paddle sweeps the whole way across, forehand to backhand, and keeps doing
  // it between points. A committed swing overrides it (pose.aim === 0).
  const aimW = pose.aim ?? 1;
  let slide = 0, reach = 0, twist = 0;
  if (aimW > 0) {
    let lateral, forward;
    if (p.paddleLateral === undefined) {
      // Bots and remote players have no cursor: rest on the forehand side.
      lateral = -side * 0.75;
      forward = 0.8;
    } else {
      lateral = p.paddleLateral;
      forward = p.paddleForward ?? 0.6;
    }
    // The rig's local +x is the player's LEFT, so a cursor to the right of
    // them puts the paddle at negative local x. Full range either way, so the
    // paddle genuinely crosses the body forehand to backhand.
    slide = -lateral * 0.74 * aimW;
    reach = forward * 0.34 * aimW;
    twist = lateral * 0.95 * aimW;
  }
  // A slow drift keeps the idle paddle from looking pinned in place.
  const idle = p.swingState === SWINGSTATE.IDLE && !p.charging;
  const driftX = idle ? Math.sin(u.bob * 0.8) * 0.02 : 0;
  const driftY = idle ? Math.sin(u.bob * 1.15 + 1.3) * 0.03 : 0;

  pad.position.x = damp(pad.position.x, pose.x + driftX + slide, k, dt);
  pad.position.y = damp(pad.position.y, pose.y + driftY, k, dt);
  pad.position.z = damp(pad.position.z, pose.z + reach, k, dt);
  pad.rotation.x = damp(pad.rotation.x, pose.rx, k, dt);
  pad.rotation.y = damp(pad.rotation.y, pose.ry + twist, k, dt);
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
