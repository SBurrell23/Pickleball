import * as THREE from '../../vendor/three.module.js';
import { COURT, BALL } from '../game/constants.js';
import { netHeightAt } from '../game/ballistics.js';
import { mulberry32 } from '../game/rng.js';

// Everything visible in the game is built here out of primitives and
// canvas-drawn textures. No external art assets.

const APRON_X = COURT.HALF_W + 3.4;
const APRON_Z = COURT.HALF_L + 3.6;

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
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f2ea38';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,112,20,0.85)';
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y = ((r + 0.5) / rows) * h;
      const count = 8;
      const off = r % 2 ? 0.5 : 0;
      for (let i = 0; i < count; i++) {
        const x = ((i + off) / count) * w;
        const rad = 5.5 * Math.sin((y / h) * Math.PI) + 1.5;
        g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      }
    }
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

  // Perimeter fence, drawn as a light wireframe so it frames the court
  // without blocking the view.
  const fenceMat = new THREE.LineBasicMaterial({ color: 0x2b4a41, transparent: true, opacity: 0.42 });
  const fh = 3.0;
  const pts = [];
  const corners = [
    [-APRON_X, -APRON_Z], [APRON_X, -APRON_Z], [APRON_X, APRON_Z], [-APRON_X, APRON_Z],
  ];
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = corners[i];
    const [x2, z2] = corners[(i + 1) % 4];
    const steps = 20;
    for (let s = 0; s <= steps; s++) {
      const x = x1 + (x2 - x1) * (s / steps);
      const z = z1 + (z2 - z1) * (s / steps);
      pts.push(x, 0, z, x, fh, z);
    }
    for (let r = 1; r <= 3; r++) {
      const y = (r / 3) * fh;
      pts.push(x1, y, z1, x2, y, z2);
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(fg, fenceMat));

  // Bleachers down both sides.
  const standMat = mat(0x404a55, { roughness: 0.9 });
  for (const s of [-1, 1]) {
    for (let r = 0; r < 4; r++) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.42, COURT.HALF_L * 1.7), standMat
      );
      bench.position.set(s * (APRON_X + 0.6 + r * 0.9), 0.21 + r * 0.42, 0);
      bench.receiveShadow = quality === 'high';
      g.add(bench);
    }
  }

  if (quality !== 'off') g.add(buildCrowd());
  g.add(buildLights(quality));
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
        seeds.push({ x, y, z, phase: Math.random() * 6.283, amp: 0.02 + Math.random() * 0.05 });
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

export function animateCrowd(group, time, excitement = 0) {
  const d = group.userData;
  if (!d) return;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  for (let i = 0; i < d.count; i++) {
    const s = d.seeds[i];
    const bob = Math.sin(time * (2.0 + excitement * 5) + s.phase) * s.amp * (1 + excitement * 3);
    v.set(s.x, s.y + 0.3 + Math.max(0, bob), s.z);
    m.compose(v, q, sc);
    d.bodies.setMatrixAt(i, m);
    v.set(s.x, s.y + 0.62 + Math.max(0, bob), s.z);
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
    new THREE.SphereGeometry(BALL.R, 18, 14),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, map: ballTexture(), roughness: 0.55, metalness: 0.02,
      emissive: 0x2a2600, emissiveIntensity: 0.25,
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
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5bb04f';
    g.fillRect(0, 0, w, h);
    // Broad mottling first, so the field is not one flat green.
    for (let i = 0; i < 40; i++) {
      const r = 18 + Math.random() * 46;
      g.globalAlpha = 0.05 + Math.random() * 0.07;
      g.fillStyle = Math.random() < 0.5 ? '#77c96a' : '#428f3a';
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
      g.fill();
    }
    // Then blade-scale speckle for close-up detail.
    for (let i = 0; i < 4200; i++) {
      g.globalAlpha = 0.10 + Math.random() * 0.26;
      g.fillStyle = Math.random() < 0.5 ? '#77cc66' : '#2f6f2c';
      const x = Math.random() * w, y = Math.random() * h;
      g.fillRect(x, y, 1, 1 + Math.random() * 2.5);
    }
    g.globalAlpha = 1;
  }, [180, 180]);
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
