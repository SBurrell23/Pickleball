import * as THREE from '../../vendor/three.module.js';
import { COURT } from '../game/constants.js';
import { getVenue, getTime } from './venues.js';
import { HORIZON } from './assets.js';

// Fixed: the camera framing and the mouse-to-court aim mapping are tuned
// around this, so it is not a setting. It is narrow on purpose -- a tighter
// lens from further back fills the screen with court without tipping the view
// so far over that depth stops reading.
const FOV = 38;

// The sun circles the court every ten minutes so shadows swing round over a
// long match. How HIGH it sits is the time of day's business, not this
// module's -- see venues.js -- so only the azimuth is animated here.
const SUN_PERIOD = 600;          // seconds for one full pass

// Renderer + scene + camera. Antialiasing mode is a context-creation choice,
// so switching it rebuilds the WebGL context; everything else applies live.

const FXAA_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Compact FXAA 3.11-style edge blend. Enough to clean up the court lines
// without the cost of MSAA on weaker GPUs.
const FXAA_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 resolution;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 px = 1.0 / resolution;
  vec3 rgbM = texture2D(tDiffuse, vUv).rgb;
  float lM  = luma(rgbM);
  float lNW = luma(texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * px).rgb);
  float lNE = luma(texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * px).rgb);
  float lSW = luma(texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * px).rgb);
  float lSE = luma(texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * px).rgb);

  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) {
    gl_FragColor = vec4(rgbM, 1.0);
    return;
  }

  vec2 dir = vec2(
    -((lNW + lNE) - (lSW + lSE)),
     ((lNW + lSW) - (lNE + lSE))
  );
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcpMin, -8.0, 8.0) * px;

  vec3 rgbA = 0.5 * (
    texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
    texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
    texture2D(tDiffuse, vUv - dir * 0.5).rgb +
    texture2D(tDiffuse, vUv + dir * 0.5).rgb);

  float lB = luma(rgbB);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
}`;

export class View {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;
    this.scene = new THREE.Scene();
    // Fog is the horizon colour so the ground plane dissolves into the sky
    // rather than ending at a visible edge.
    this.scene.background = new THREE.Color(HORIZON);
    this.scene.fog = new THREE.Fog(HORIZON, 150, 620);

    // Far enough to contain the sky dome.
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2200);
    this.camPos = new THREE.Vector3(0, 5, -12);
    this.camLook = new THREE.Vector3(0, 0.8, 0);
    this.side = -1;
    this._shake = new THREE.Vector3();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02);
    this._ray = new THREE.Raycaster();

    this.buildLights();
    this.createRenderer();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    // Frame pacing
    this.frameInterval = 0;
    this.lastFrame = 0;
    this.fpsSamples = [];
    this.fps = 0;
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(HORIZON, 0x4a7a44, 1.05);
    this.scene.add(hemi);
    this.hemi = hemi;

    const key = new THREE.DirectionalLight(0xfff6e2, 1.95);
    key.position.set(9, 15, -7);
    key.castShadow = true;
    // Wide enough that a low sun's long shadows still fall inside the map.
    key.shadow.camera.left = -22;
    key.shadow.camera.right = 22;
    key.shadow.camera.top = 24;
    key.shadow.camera.bottom = -24;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 90;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.022;
    this.scene.add(key);
    this.key = key;

    const fill = new THREE.DirectionalLight(0xbcd9f0, 0.32);
    fill.position.set(-8, 9, 10);
    this.scene.add(fill);
    this.fill = fill;

    // Straight down over the court, off during the day. At night this is what
    // you actually see by, and it has to be a SPOT rather than another
    // directional: a directional light reaches the horizon, which lit the
    // grass and the sky-line as brightly as the court and made midnight look
    // like an overcast afternoon. A cone stops at the fence.
    const flood = new THREE.SpotLight(0xeaf2ff, 0, 0, 0.62, 0.55, 0.9);
    flood.position.set(0, 24, 0);
    flood.target.position.set(0, 0, 0);
    flood.distance = 46;
    this.scene.add(flood);
    this.scene.add(flood.target);
    this.flood = flood;

    // Direction the sky shader should put the sun in, matching the key light.
    this.sunDirection = key.position.clone().normalize();
    this.sunPhase = Math.PI * 0.35;   // start mid-morning
    this.sky = null;
    this._sunDir = new THREE.Vector3();
    this.venue = getVenue();
    this.time = getTime();
    this._skyTop = new THREE.Color();
    this._skyBottom = new THREE.Color();
  }

  createRenderer() {
    const s = this.settings.all();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
    const useMSAA = s.antialias === 'msaa';
    const renderer = new THREE.WebGLRenderer({
      antialias: useMSAA,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    renderer.setClearColor(HORIZON, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    this.renderer = renderer;
    this.container.appendChild(renderer.domElement);
    renderer.domElement.classList.add('game-canvas');

    this.applyShadowSettings();
    this.setupPost();
    this.resize();
  }

  applyShadowSettings() {
    const mode = this.settings.get('shadows');
    const r = this.renderer;
    r.shadowMap.enabled = mode !== 'off';
    r.shadowMap.type = mode === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const size = mode === 'high' ? 2048 : 1024;
    if (this.key.shadow.mapSize.width !== size) {
      this.key.shadow.mapSize.set(size, size);
      if (this.key.shadow.map) {
        this.key.shadow.map.dispose();
        this.key.shadow.map = null;
      }
    }
    r.shadowMap.needsUpdate = true;
  }

  setupPost() {
    const wantFXAA = this.settings.get('antialias') === 'fxaa';
    if (this.fxaaTarget) { this.fxaaTarget.dispose(); this.fxaaTarget = null; }
    if (!wantFXAA) { this.fxaaPass = null; return; }

    this.fxaaTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.fxaaTarget.texture },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: FXAA_VERT,
      fragmentShader: FXAA_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    this.fxaaPass = {
      scene, mat,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    };
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const scale = this.settings.get('renderScale');
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.fov = FOV;
    this.camera.updateProjectionMatrix();
    if (this.fxaaTarget) {
      const pw = Math.max(1, Math.floor(w * dpr));
      const ph = Math.max(1, Math.floor(h * dpr));
      this.fxaaTarget.setSize(pw, ph);
      this.fxaaPass.mat.uniforms.resolution.value.set(pw, ph);
    }
  }

  // Called when a graphics setting changes.
  onSettingChanged(key) {
    if (key === 'antialias') { this.createRenderer(); return true; }
    if (key === 'shadows') this.applyShadowSettings();
    if (key === 'renderScale') this.resize();
    if (key === 'fpsCap') this.lastFrame = 0;
    return false;
  }

  setSky(sky) {
    this.sky = sky;
    this.updateSun(0);
  }

  /**
   * Point the scene at a venue and a time of day. The venue owns the colours
   * of the place; the time owns the light falling on it. Called whenever
   * either changes, which is once per match.
   */
  setScene(venueId, timeId) {
    this.venue = getVenue(venueId);
    this.time = getTime(timeId);
    const t = this.time;

    this.key.color.setHex(t.key.color);
    this.key.intensity = t.key.intensity;
    this.hemi.color.setHex(t.hemi.sky);
    this.hemi.groundColor.setHex(t.hemi.ground);
    this.hemi.intensity = t.hemi.intensity;
    this.fill.color.setHex(t.fill.color);
    this.fill.intensity = t.fill.intensity;
    this.flood.color.setHex(t.flood ? t.flood.color : 0xffffff);
    this.flood.intensity = t.flood ? t.flood.intensity : 0;

    // The sky is the venue's own, pulled toward the time's palette rather
    // than replaced by it -- that is what keeps a desert dusk looking like a
    // desert and not like every other dusk.
    const base = this.venue.sky;
    this._skyTop.setHex(base.zenith);
    this._skyBottom.setHex(base.horizon);
    if (t.duskSky) {
      this._skyTop.lerp(new THREE.Color(t.duskSky.zenith), t.skyMix);
      this._skyBottom.lerp(new THREE.Color(t.duskSky.horizon), t.skyMix);
    }
    if (this.sky && this.sky.userData.skyTop) {
      this.sky.userData.skyTop.value.copy(this._skyTop);
      this.sky.userData.skyBottom.value.copy(this._skyBottom);
    }
    // Fog and the clear colour follow the horizon, so the ground still
    // dissolves into the sky instead of ending at a visible edge.
    const [near, far] = this.venue.fog || [150, 620];
    this.scene.fog.color.copy(this._skyBottom);
    this.scene.fog.near = near;
    this.scene.fog.far = far;
    this.scene.background.copy(this._skyBottom);

    this.setLamps(!!t.lamps);
    this.setWindows(t.id);
    this.updateSun(0);
  }

  // Floodlamp heads glow when they are meant to be on. The bulb material is
  // shared across all four heads, so this is one assignment.
  setLamps(on) {
    const court = this.scene.getObjectByName('floodlights');
    const m = court && court.userData.lampMat;
    if (m) m.emissiveIntensity = on ? 1.9 : 0.05;
  }

  // Office windows. Barely on in daylight, half lit at dusk, and the reason
  // to play the night version of the downtown court.
  setWindows(timeId) {
    const mats = this.sky && this.sky.userData.windowMats;
    if (!mats) return;
    const lit = timeId === 'night' ? 1.35 : timeId === 'dusk' ? 0.55 : 0.06;
    for (const m of mats) m.emissiveIntensity = lit;
  }

  // Walk the sun around its arc and keep the key light and the sky's sun disc
  // pointing the same way. The elevation is pinned by the time of day -- only
  // the azimuth drifts -- so shadows still swing round over a long match
  // without the light changing character halfway through a point.
  updateSun(dt) {
    this.sunPhase = (this.sunPhase + (dt / SUN_PERIOD) * Math.PI * 2) % (Math.PI * 2);
    const az = this.sunPhase;
    const el = this.time.elevation;
    const ce = Math.cos(el);
    this._sunDir.set(ce * Math.sin(az), Math.sin(el), ce * Math.cos(az));

    this.key.position.copy(this._sunDir).multiplyScalar(34);
    this.sunDirection.copy(this._sunDir);
    if (this.sky && this.sky.userData.sunUniform) {
      this.sky.userData.sunUniform.value.copy(this._sunDir);
    }
  }

  // ---- camera ------------------------------------------------------------

  setSide(side) { this.side = side; }

  updateCamera(focusX, focusZ, dt, fx) {
    const mode = this.settings.get('cameraMode');
    const s = this.side;
    let px, py, pz, lx, ly, lz;

    if (mode === 'broadcast') {
      // Pulled well back: on the narrow lens this was framing less than the
      // follow camera, which is not what a broadcast view is for.
      px = 0; py = 15.0; pz = s * (COURT.HALF_L + 13.0);
      lx = 0; ly = 0.4; lz = 0;
    } else if (mode === 'fixed') {
      px = 0; py = 7.5; pz = s * (COURT.HALF_L + 7.9);
      lx = 0; ly = 0.5; lz = s * 3.2;
    } else {
      // Follow: drifts with the player so the near court never leaves frame.
      px = focusX * 0.34; py = 7.5; pz = s * (COURT.HALF_L + 7.9) + focusZ * 0.06;
      lx = focusX * 0.16; ly = 0.5; lz = s * 3.2;
    }

    const k = 1 - Math.exp(-7.5 * dt);
    this.camPos.x += (px - this.camPos.x) * k;
    this.camPos.y += (py - this.camPos.y) * k;
    this.camPos.z += (pz - this.camPos.z) * k;
    this.camLook.x += (lx - this.camLook.x) * k;
    this.camLook.y += (ly - this.camLook.y) * k;
    this.camLook.z += (lz - this.camLook.z) * k;

    if (fx) fx.shakeOffset(this._shake);
    else this._shake.set(0, 0, 0);

    this.camera.position.set(
      this.camPos.x + this._shake.x,
      this.camPos.y + this._shake.y,
      this.camPos.z + this._shake.z
    );
    this.camera.lookAt(this.camLook);
  }

  // Snap the camera to its target immediately (used when a match starts).
  snapCamera(focusX, focusZ) {
    for (let i = 0; i < 40; i++) this.updateCamera(focusX, focusZ, 1 / 30, null);
  }

  // Where the mouse points on the court surface.
  aimPoint(ndcX, ndcY, out = new THREE.Vector3()) {
    this._ray.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hit = this._ray.ray.intersectPlane(this._plane, out);
    if (!hit) {
      // Pointing at the sky: fall back to a deep target straight ahead.
      out.set(0, 0.02, -this.side * COURT.HALF_L * 0.8);
    }
    return out;
  }

  // ---- frame pacing ------------------------------------------------------

  // Returns true when this frame should be drawn under the current FPS cap.
  shouldRender(now) {
    const cap = this.settings.get('fpsCap');
    if (!cap) return true;
    const interval = 1000 / cap;
    // Allow a small slop so a 60Hz cap on a 60Hz display does not drop every
    // other frame to 30.
    if (now - this.lastFrame < interval - 1.5) return false;
    this.lastFrame = now;
    return true;
  }

  trackFps(dt) {
    if (dt <= 0) return;
    this.fpsSamples.push(1 / dt);
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();
    let sum = 0;
    for (const v of this.fpsSamples) sum += v;
    this.fps = sum / this.fpsSamples.length;
  }

  render() {
    if (this.fxaaPass && this.fxaaTarget) {
      this.renderer.setRenderTarget(this.fxaaTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.fxaaPass.scene, this.fxaaPass.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    if (this.fxaaTarget) this.fxaaTarget.dispose();
    this.renderer.dispose();
  }
}
