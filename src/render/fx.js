import * as THREE from '../../vendor/three.module.js';

// Pooled effects: nothing is allocated during play, so the particle density
// setting can be turned up without generating garbage every rally.

function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// PointsMaterial has no per-point size, so every effect's `size` option was
// silently doing nothing. This is the same thing three does internally, plus
// the size attribute.
const POINT_VERT = `
attribute float size;
uniform float uScale;
varying vec3 vCol;
void main() {
  vCol = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (uScale / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG = `
uniform sampler2D map;
varying vec3 vCol;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  if (t.a < 0.01) discard;
  gl_FragColor = vec4(vCol, 1.0) * t;
}`;

const MAX_PARTICLES = 520;
const TRAIL_SEGMENTS = 26;
const MAX_RINGS = 14;
const MAX_TEXTS = 8;

export class Effects {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.time = 0;

    // ---- particles ----
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    const siz = new Float32Array(MAX_PARTICLES);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    this.pMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: sparkTexture() },
        uScale: { value: 400 },
      },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    this.points = new THREE.Points(geo, this.pMat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ life: 0, max: 1, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, g: -9, size: 1 });
    }
    this.pHead = 0;

    // ---- ball trail ----
    const tGeo = new THREE.SphereGeometry(1, 8, 6);
    this.trail = new THREE.InstancedMesh(
      tGeo,
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      TRAIL_SEGMENTS
    );
    this.trail.frustumCulled = false;
    this.trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.trail);
    this.trailPts = [];
    for (let i = 0; i < TRAIL_SEGMENTS; i++) this.trailPts.push({ x: 0, y: -50, z: 0, age: 99 });
    this.trailHead = 0;
    this.trailTimer = 0;

    // ---- impact rings ----
    this.rings = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.5, 28),
        new THREE.MeshBasicMaterial({
          transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        })
      );
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1, from: 0.2, to: 2, flat: true });
    }
    this.ringHead = 0;

    // ---- landing marker ----
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.20, 0.30, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffe066, transparent: true, opacity: 0.0,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 3;
    scene.add(this.marker);

    // ---- floating callouts ----
    this.texts = [];
    for (let i = 0; i < MAX_TEXTS; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 384; canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false,
      }));
      spr.visible = false;
      spr.renderOrder = 10;
      scene.add(spr);
      this.texts.push({ spr, canvas, tex, life: 0, max: 1, x: 0, y: 0, z: 0 });
    }
    this.textHead = 0;

    this.shake = 0;
  }

  get density() { return this.settings.get('particles'); }

  // ---- spawning ----------------------------------------------------------

  burst(x, y, z, count, opts = {}) {
    const n = Math.round(count * this.density);
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.pHead];
      this.pHead = (this.pHead + 1) % MAX_PARTICLES;
      const spread = opts.spread ?? 3.2;
      const dir = opts.dir;
      let vx = (Math.random() * 2 - 1) * spread;
      let vy = (opts.up ?? 1) * (Math.random() * spread * 0.8 + 0.5);
      let vz = (Math.random() * 2 - 1) * spread;
      if (dir) {
        vx = dir.x * (opts.speed ?? 3) * (0.4 + Math.random()) + vx * 0.35;
        vy = dir.y * (opts.speed ?? 3) * (0.4 + Math.random()) + vy * 0.35;
        vz = dir.z * (opts.speed ?? 3) * (0.4 + Math.random()) + vz * 0.35;
      }
      p.x = x; p.y = y; p.z = z;
      p.vx = vx; p.vy = vy; p.vz = vz;
      p.g = opts.gravity ?? -11;
      p.life = 0;
      p.max = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.7);
      p.size = 0.15 * (opts.size ?? 1) * (0.6 + Math.random() * 0.8);
      const c = opts.color ?? new THREE.Color(0xffffff);
      p.r = c.r; p.gg = c.g; p.b = c.b;
    }
  }

  ring(x, y, z, opts = {}) {
    if (this.density <= 0) return;
    const r = this.rings[this.ringHead];
    this.ringHead = (this.ringHead + 1) % MAX_RINGS;
    r.mesh.visible = true;
    r.mesh.position.set(x, y, z);
    r.flat = opts.flat ?? true;
    if (r.flat) r.mesh.rotation.set(-Math.PI / 2, 0, 0);
    else r.mesh.rotation.set(0, 0, 0);
    r.mesh.material.color.set(opts.color ?? 0xffffff);
    r.life = 0;
    r.max = opts.life ?? 0.42;
    r.from = opts.from ?? 0.15;
    r.to = opts.to ?? 1.4;
    r.billboard = !r.flat;
    r.opacity = opts.opacity ?? 0.9;
  }

  popText(text, x, y, z, color = '#ffffff', size = 64) {
    const t = this.texts[this.textHead];
    this.textHead = (this.textHead + 1) % MAX_TEXTS;
    const g = t.canvas.getContext('2d');
    g.clearRect(0, 0, t.canvas.width, t.canvas.height);
    g.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(8,10,14,0.92)';
    g.strokeText(text, 192, 64);
    g.fillStyle = color;
    g.fillText(text, 192, 64);
    t.tex.needsUpdate = true;
    t.spr.visible = true;
    t.spr.position.set(x, y, z);
    t.spr.scale.set(1.9, 0.63, 1);
    t.life = 0;
    t.max = 1.05;
    t.x = x; t.y = y; t.z = z;
  }

  // ---- high-level game hooks --------------------------------------------

  hitEffect(pos, quality, power, star, color = 0xffffff) {
    const c = new THREE.Color(
      quality === 'perfect' ? 0xffe066 : quality === 'weak' ? 0x8899aa : color
    );
    this.burst(pos.x, pos.y, pos.z, star ? 46 : 12 + power * 22, {
      color: c, spread: 2.0 + power * 3.4, life: 0.34, size: star ? 1.5 : 1,
      gravity: -7, up: 0.8,
    });
    this.ring(pos.x, pos.y, pos.z, {
      color: star ? 0xffd24a : c.getHex(), flat: false,
      from: 0.1, to: star ? 2.6 : 0.85 + power * 0.9, life: 0.3, opacity: 0.85,
    });
    if (quality === 'perfect' || star) {
      this.popText(star ? 'STAR!' : 'PERFECT', pos.x, pos.y + 0.75, pos.z,
        star ? '#ffd24a' : '#ffe066', star ? 74 : 58);
    }
    this.addShake(star ? 1.0 : 0.18 + power * 0.42);
  }

  bounceEffect(pos, speed, inBounds) {
    const v = Math.min(1, speed / 20);
    this.burst(pos.x, 0.04, pos.z, 4 + v * 10, {
      color: new THREE.Color(inBounds ? 0xcfe4ff : 0xff8877),
      spread: 1.1 + v * 1.8, life: 0.3, gravity: -9, up: 1, size: 0.75,
    });
    this.ring(pos.x, 0.03, pos.z, {
      color: inBounds ? 0x9fd0ff : 0xff6655,
      from: 0.06, to: 0.5 + v * 0.8, life: 0.36, opacity: 0.65,
    });
    this.addShake(v * 0.12);
  }

  netEffect(pos) {
    this.burst(pos.x, pos.y, 0, 10, {
      color: new THREE.Color(0xdddddd), spread: 1.2, life: 0.35, gravity: -8, size: 0.7,
    });
  }

  dustPuff(x, z, amount = 1) {
    this.burst(x, 0.05, z, 5 * amount, {
      color: new THREE.Color(0xbfd8c9), spread: 0.9, life: 0.35,
      gravity: -4, up: 0.7, size: 0.8,
    });
  }

  addShake(amount) {
    const s = this.settings.get('shake');
    this.shake = Math.min(1.6, this.shake + amount * s);
  }

  setLanding(x, z, visible, urgency = 0) {
    if (!visible || !this.settings.get('showLanding')) {
      this.marker.material.opacity = 0;
      return;
    }
    this.marker.position.set(x, 0.026, z);
    const pulse = 1 + Math.sin(this.time * 14) * 0.12 * (0.4 + urgency);
    this.marker.scale.setScalar(pulse);
    this.marker.material.opacity = 0.42 + urgency * 0.4;
    this.marker.material.color.setHSL(0.14 - urgency * 0.13, 0.95, 0.58);
  }

  // ---- per-frame ---------------------------------------------------------

  updateTrail(ball, dt, enabled, color) {
    this.trailTimer += dt;
    if (enabled && this.trailTimer > 0.012) {
      this.trailTimer = 0;
      const p = this.trailPts[this.trailHead];
      this.trailHead = (this.trailHead + 1) % TRAIL_SEGMENTS;
      p.x = ball.x; p.y = ball.y; p.z = ball.z; p.age = 0;
    }
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const p = this.trailPts[i];
      p.age += dt;
      const k = Math.max(0, 1 - p.age / 0.28);
      const s = enabled ? k * 0.055 : 0;
      v.set(p.x, p.y, p.z);
      scl.setScalar(s);
      mtx.compose(v, q, scl);
      this.trail.setMatrixAt(i, mtx);
    }
    this.trail.instanceMatrix.needsUpdate = true;
    this.trail.material.color.set(color);
    this.trail.material.opacity = 0.55;
  }

  // `viewportH` is the drawing-buffer height; point size in pixels depends on
  // it, so a resolution-scale change must not change how big sparks look.
  update(dt, camera, viewportH) {
    this.time += dt;
    if (viewportH) this.pMat.uniforms.uScale.value = viewportH * 0.5;
    const geo = this.points.geometry;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    const siz = geo.attributes.size.array;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life >= p.max) {
        pos[i * 3 + 1] = -500;
        siz[i] = 0;
        continue;
      }
      p.life += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.32; p.vx *= 0.7; p.vz *= 0.7; }
      const k = Math.max(0, 1 - p.life / p.max);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = (p.r ?? 1) * k;
      col[i * 3 + 1] = (p.gg ?? 1) * k;
      col[i * 3 + 2] = (p.b ?? 1) * k;
      // Shrink as they die, so they wink out instead of vanishing mid-size.
      siz[i] = p.size * (0.45 + k * 0.55);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.life += dt;
      const k = r.life / r.max;
      if (k >= 1) { r.mesh.visible = false; continue; }
      const s = r.from + (r.to - r.from) * (1 - Math.pow(1 - k, 2.2));
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = (r.opacity ?? 0.9) * (1 - k);
      if (r.billboard && camera) r.mesh.quaternion.copy(camera.quaternion);
    }

    for (const t of this.texts) {
      if (!t.spr.visible) continue;
      t.life += dt;
      const k = t.life / t.max;
      if (k >= 1) { t.spr.visible = false; continue; }
      t.spr.position.set(t.x, t.y + k * 1.15, t.z);
      const pop = k < 0.16 ? 0.6 + (k / 0.16) * 0.55 : 1.15 - (k - 0.16) * 0.14;
      t.spr.scale.set(1.9 * pop, 0.63 * pop, 1);
      t.spr.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }

    this.shake = Math.max(0, this.shake - dt * 3.4);
  }

  // Current camera offset from screen shake.
  shakeOffset(out) {
    const s = this.shake * this.shake * 0.11;
    out.set(
      (Math.random() * 2 - 1) * s,
      (Math.random() * 2 - 1) * s,
      (Math.random() * 2 - 1) * s * 0.4
    );
    return out;
  }
}
