import * as THREE from '../../vendor/three.module.js';
import { COURT, BALL, FENCE } from '../game/constants.js';
import { netHeightAt } from '../game/ballistics.js';
import { mulberry32 } from '../game/rng.js';

// Everything visible in the game is built here out of primitives and
// canvas-drawn textures. No external art assets.

// The apron is the built surface inside the fence; both come from the same
// constants the ball collides against.
const APRON_X = FENCE.X;
const APRON_Z = FENCE.Z;

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
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Fine speckle so the court surface is not a flat colour field.
function surfaceTexture(base, speck) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = speck;
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.globalAlpha = 0.05 + Math.random() * 0.14;
      g.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
    }
    g.globalAlpha = 1;
  }, [6, 6]);
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

export function buildCourt(quality = 'high') {
  const root = new THREE.Group();
  root.name = 'court';

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(APRON_X * 2, 0.18, APRON_Z * 2),
    mat(0x3f7f63, { roughness: 0.95 })
  );
  apron.material.map = surfaceTexture('#3f7f63', '#24564180');
  apron.position.y = -0.09;
  apron.receiveShadow = quality !== 'off';
  root.add(apron);

  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(COURT.HALF_W * 2 + 0.02, 0.02, COURT.HALF_L * 2 + 0.02),
    mat(0x2f7fc4, { roughness: 0.9 })
  );
  surface.material.map = surfaceTexture('#2f7fc4', '#1d568e');
  surface.position.y = 0.006;
  surface.receiveShadow = quality !== 'off';
  root.add(surface);

  // The kitchen gets its own shade so the shot-type boundary is readable
  // from the play camera at a glance.
  const kitchenMat = mat(0x1fa091, { roughness: 0.9 });
  kitchenMat.map = surfaceTexture('#1fa091', '#12665c');
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
  const lineMat = mat(0xf4f7fb, { roughness: 0.7, emissive: 0x223344, emissiveIntensity: 0.12 });
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
  root.add(buildSurrounds(quality));
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

function buildSurrounds(quality) {
  const g = new THREE.Group();
  g.add(buildFence(quality));

  // Bleachers down both sides.
  const standMat = mat(0x404a55, { roughness: 0.9 });
  for (const s of [-1, 1]) {
    for (let r = 0; r < 4; r++) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.42, COURT.HALF_L * 1.7), standMat
      );
      bench.position.set(s * (APRON_X + 1.5 + r * 0.9), 0.21 + r * 0.42, 0);
      bench.receiveShadow = quality === 'high';
      g.add(bench);
    }
  }

  if (quality !== 'off') g.add(buildCrowd());
  g.add(buildLights(quality));
  return g;
}

// Chain-link mesh, drawn once and tiled along the rails.
function chainLinkTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(206, 218, 224, 0.95)';
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
function buildFence(quality) {
  const g = new THREE.Group();
  const H = FENCE.H;
  const postMat = mat(0x39474e, { metalness: 0.4, roughness: 0.5 });
  const railMat = mat(0x46565e, { metalness: 0.4, roughness: 0.5 });

  const meshTex = chainLinkTexture();
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

  for (const run of runs) {
    const tex = meshTex.clone();
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
function buildCrowd() {
  const group = new THREE.Group();
  group.name = 'crowd';
  const rows = 4, perRow = 26;
  const count = rows * perRow * 2;
  const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.26, 3, 6);
  const headGeo = new THREE.SphereGeometry(0.135, 7, 6);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat(0xffffff, { flat: true }), count);
  const heads = new THREE.InstancedMesh(headGeo, mat(0xffffff, { flat: true }), count);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const shirt = [0xd9534f, 0x5bc0de, 0xf0ad4e, 0x5cb85c, 0x9b59b6, 0xecf0f1, 0x34495e];
  const skin = [0xf0c8a0, 0xd8a074, 0xb5764d, 0x8d5a3b, 0x66422a];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  const seeds = [];
  let i = 0;
  for (const s of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < perRow; k++) {
        const x = s * (APRON_X + 0.6 + r * 0.9);
        const z = (k / (perRow - 1) - 0.5) * COURT.HALF_L * 1.7;
        const y = 0.42 + r * 0.42;
        seeds.push({
          x, y, z,
          phase: Math.random() * 6.283,
          amp: 0.05 + Math.random() * 0.09,
          // Everyone has their own jump rhythm and their own starting point in
          // it, so a cheering crowd ripples instead of pulsing in unison.
          period: 0.62 + Math.random() * 0.36,
          offset: Math.random(),
          sway: 0.7 + Math.random() * 0.7,
        });
        m.compose(new THREE.Vector3(x, y + 0.3, z), q, sc);
        bodies.setMatrixAt(i, m);
        bodies.setColorAt(i, new THREE.Color(shirt[(Math.random() * shirt.length) | 0]));
        m.compose(new THREE.Vector3(x, y + 0.62, z), q, sc);
        heads.setMatrixAt(i, m);
        heads.setColorAt(i, new THREE.Color(skin[(Math.random() * skin.length) | 0]));
        i++;
      }
    }
  }
  bodies.instanceColor.needsUpdate = true;
  heads.instanceColor.needsUpdate = true;
  group.add(bodies, heads);
  group.userData = { bodies, heads, seeds, count };
  return group;
}

// Takes dt, not absolute time, and advances its own clock. Driving the phase
// as `time * frequency` looks fine until the frequency changes: the argument
// then jumps by `time * delta`, which after a few minutes of play is hundreds
// of radians, and the whole crowd teleports to a random point in its cycle.
// Excitement may now only scale amplitudes, never rates.
export function animateCrowd(group, dt, excitement = 0) {
  const d = group.userData;
  if (!d) return;
  d.clock = (d.clock || 0) + dt;
  const t = d.clock;
  const hype = Math.max(0, Math.min(1, excitement));

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();

  for (let i = 0; i < d.count; i++) {
    const s = d.seeds[i];
    // Always-on idle sway, at a rate that never changes.
    let lift = Math.sin(t * s.sway + s.phase) * 0.012;

    if (hype > 0.02) {
      // A real jump: leave the ground, arc, land. Parabola over each cycle.
      const u = (t / s.period + s.offset) % 1;
      lift += 4 * u * (1 - u) * s.amp * hype;
    }

    v.set(s.x, s.y + 0.3 + lift, s.z);
    m.compose(v, q, sc);
    d.bodies.setMatrixAt(i, m);
    v.set(s.x, s.y + 0.62 + lift, s.z);
    m.compose(v, q, sc);
    d.heads.setMatrixAt(i, m);
  }
  d.bodies.instanceMatrix.needsUpdate = true;
  d.heads.instanceMatrix.needsUpdate = true;
}

function buildLights(quality) {
  const g = new THREE.Group();
  const poleMat = mat(0x2b333c, { metalness: 0.5, roughness: 0.5 });
  const lampMat = mat(0xfff6d8, { emissive: 0xfff0c0, emissiveIntensity: 1.4, roughness: 0.3 });
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

function grassTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4e9f45';
    g.fillRect(0, 0, w, h);
    // Broad mottling: patches of lighter and darker turf.
    for (let i = 0; i < 70; i++) {
      const r = 30 + Math.random() * 90;
      g.globalAlpha = 0.05 + Math.random() * 0.08;
      g.fillStyle = Math.random() < 0.5 ? '#74c45f' : '#2f7a2f';
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
      g.fill();
    }
    // Individual blades, drawn as short tapered strokes at varied angles. This
    // is what stops the field reading as flat paint up close.
    g.lineCap = 'round';
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const len = 3 + Math.random() * 7;
      const lean = (Math.random() - 0.5) * 3.2;
      g.globalAlpha = 0.22 + Math.random() * 0.5;
      const t = Math.random();
      g.strokeStyle = t < 0.34 ? '#83d46c' : t < 0.68 ? '#3f8c37' : '#5cb04e';
      g.lineWidth = 0.8 + Math.random() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + lean, y - len);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, [260, 260]);
}

// Low-poly shrubs scattered outside the fence. One InstancedMesh for the whole
// ring keeps this to a single draw call no matter how many clumps there are.
function buildBrush(rand, count) {
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true }),
    count
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const greens = [0x3f8f3a, 0x4fa348, 0x336f30, 0x5cb054, 0x2d6b2f];

  for (let i = 0; i < count; i++) {
    // Ring around the court, thinning with distance so the near ground stays
    // clear and the horizon stays busy.
    const ang = rand() * Math.PI * 2;
    // Start well clear of the fence: anything close reads as a boulder from the
    // play camera and crowds the top of the frame.
    const dist = FENCE.Z + 11 + Math.pow(rand(), 0.55) * 95;
    pos.set(Math.cos(ang) * dist * 1.05, 0, Math.sin(ang) * dist);
    const s = 0.30 + rand() * 0.62;
    scl.set(s * (0.9 + rand() * 0.6), s * (0.6 + rand() * 0.45), s * (0.9 + rand() * 0.6));
    pos.y = scl.y * 0.5 - 0.22;
    e.set(rand() * 0.4, rand() * 6.283, rand() * 0.4);
    q.setFromEuler(e);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(greens[(rand() * greens.length) | 0]));
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return group;
}

// Cartoon cloud:// Cartoon cloud: a handful of overlapping squashed spheres.
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

// Sky dome, sun, clouds and the ground the court sits on. Everything here is
// far away and unlit by the court lights, so it is cheap.
export function buildSky(sunDirection) {
  const root = new THREE.Group();
  root.name = 'sky';

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(ZENITH) },
        bottom: { value: new THREE.Color(HORIZON) },
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

  // Ground plane large enough that its edge is well past the fog distance,
  // so it is never seen ending.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, map: grassTexture(), roughness: 1, metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  ground.receiveShadow = true;
  root.add(ground);

  const rand = mulberry32(90210);
  root.add(buildBrush(rand, 340));
  for (let i = 0; i < 11; i++) {
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
