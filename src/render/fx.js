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

// Falling-height ring around the landing marker. Drawn at unit radius and
// scaled. It stays close to the size of the marker it collapses onto: this is
// a read on the ball, not a spotlight on the court, so even with the ball at
// the top of its arc it is only a little wider than the landing spot itself.
const MARKER_RING_INNER = 0.94;  // fraction of the outer radius -- a thin hoop
const MARKER_MIN_R = 0.18;       // matches the landing marker's own radius
const MARKER_MAX_R = 0.78;       // barely wider than the marker, even up high
const MARKER_CEIL_Y = 7.0;       // height at which the ring stops growing

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
      new THREE.RingGeometry(0.115, 0.175, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffe066, transparent: true, opacity: 0.0,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 3;
    scene.add(this.marker);

    // A second ring around the first, sized by how high the ball currently
    // is, so it closes onto the marker as the ball falls. A high ball is a
    // wide ring and a ball on the way down is a ring visibly shrinking --
    // which is the only altitude cue you get once the ball leaves the top of
    // the screen, and its closing rate reads directly as descent speed.
    // Built at unit radius and scaled, so there is one buffer for every size.
    this.markerFall = new THREE.Mesh(
      new THREE.RingGeometry(MARKER_RING_INNER, 1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffe066, transparent: true, opacity: 0.0,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.markerFall.rotation.x = -Math.PI / 2;
    this.markerFall.renderOrder = 3;
    this.markerFall.visible = false;
    scene.add(this.markerFall);

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

  hitEffect(pos, quality, power, color = 0xffffff) {
    const c = new THREE.Color(
      quality === 'perfect' ? 0xe4ef3f : quality === 'weak' ? 0x8899aa : color
    );
    this.burst(pos.x, pos.y, pos.z, 12 + power * 22, {
      color: c, spread: 2.0 + power * 3.4, life: 0.34, gravity: -7, up: 0.8,
    });
    this.ring(pos.x, pos.y, pos.z, {
      color: c.getHex(), flat: false,
      from: 0.1, to: 0.85 + power * 0.9, life: 0.3, opacity: 0.85,
    });
    if (quality === 'perfect') {
      this.popText('PERFECT', pos.x, pos.y + 0.75, pos.z, '#e4ef3f', 58);
    }
    this.addShake(0.18 + power * 0.42);
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

  // `height` is how high the ball is right now, or null when the marker is
  // showing an aim point rather than a falling ball.
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

  // The height ring is driven separately from the marker above, because it
  // tracks the ball whatever the player is doing -- including mid-swing, when
  // the marker itself switches over to showing where you are aiming.
  setFallRing(x, z, visible, urgency = 0, height = 0) {
    if (!visible || !this.settings.get('showLanding')) {
      this.markerFall.visible = false;
      return;
    }
    // Radius tracks height directly rather than time-to-land, so the ring
    // shrinks at whatever speed the ball is actually dropping: a smash slams
    // it shut, a lob leaves it hanging almost still at the apex.
    const k = Math.max(0, Math.min(1, height / MARKER_CEIL_Y));
    this.markerFall.visible = true;
    this.markerFall.position.set(x, 0.024, z);
    this.markerFall.scale.setScalar(MARKER_MIN_R + (MARKER_MAX_R - MARKER_MIN_R) * k);
    // Fades up as it closes, so the moment of contact is the brightest.
    this.markerFall.material.opacity = (0.30 + (1 - k) * 0.45) * (0.85 + urgency * 0.15);
    this.markerFall.material.color.setHSL(0.14 - urgency * 0.13, 0.95, 0.62);
  }

  // ---- per-frame ---------------------------------------------------------

  updateTrail(ball, dt, enabled, color) {
    // Hiding the mesh is both cheaper than writing 26 zero-scale matrices and
    // safer: a zero matrix still leaves a degenerate instance in the buffer.
    this.trail.visible = enabled;
    if (!enabled) {
      // Expire everything, so switching trails back on (or starting the next
      // rally) cannot resurrect a frozen segment from the last one.
      for (const p of this.trailPts) p.age = 99;
      return;
    }
    this.trailTimer += dt;
    if (this.trailTimer > 0.012) {
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
      const s = k * 0.055;
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

  // Everything above is added straight to the shared scene, which outlives any
  // one match. Without this the meshes of a finished game stay in the scene
  // and keep rendering the last frame they were given -- a trail segment
  // frozen mid-flight reads as a white blob stuck over the court and the
  // menus, and every match since start-up leaves another one behind.
  dispose() {
    const objs = [this.points, this.trail, this.marker, this.markerFall];
    for (const r of this.rings) objs.push(r.mesh);
    for (const t of this.texts) objs.push(t.spr);
    for (const o of objs) {
      if (!o) continue;
      this.scene.remove(o);
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.map?.dispose();
        m.dispose();
      }
    }
    this.rings.length = 0;
    this.texts.length = 0;
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
