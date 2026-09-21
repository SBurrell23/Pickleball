import * as THREE from '../../vendor/three.module.js';
import { COURT } from '../game/constants.js';

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
    this.scene.background = new THREE.Color(0x0e1a24);
    this.scene.fog = new THREE.Fog(0x0e1a24, 34, 74);

    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.1, 200);
    this.camPos = new THREE.Vector3(0, 5, -12);
    this.camLook = new THREE.Vector3(0, 0.8, 0);
    this.side = -1;
    this._shake = new THREE.Vector3();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02);
    this._ray = new THREE.Raycaster();
    this._v = new THREE.Vector3();

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
    const hemi = new THREE.HemisphereLight(0x9fc7e8, 0x2b4a38, 1.05);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff3dc, 2.0);
    key.position.set(9, 15, -7);
    key.castShadow = true;
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 46;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.022;
    this.scene.add(key);
    this.key = key;

    const fill = new THREE.DirectionalLight(0x7fb6e0, 0.55);
    fill.position.set(-8, 9, 10);
    this.scene.add(fill);
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
    renderer.setClearColor(0x0e1a24, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
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
    this.camera.fov = this.settings.get('fov');
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
    if (key === 'renderScale' || key === 'fov') this.resize();
    if (key === 'fpsCap') this.lastFrame = 0;
    return false;
  }

  // ---- camera ------------------------------------------------------------

  setSide(side) { this.side = side; }

  updateCamera(focusX, focusZ, dt, fx) {
    const mode = this.settings.get('cameraMode');
    const s = this.side;
    let px, py, pz, lx, ly, lz;

    if (mode === 'broadcast') {
      px = 0; py = 9.4; pz = s * (COURT.HALF_L + 7.4);
      lx = 0; ly = 0.6; lz = -s * 0.6;
    } else if (mode === 'fixed') {
      px = 0; py = 4.9; pz = s * (COURT.HALF_L + 5.6);
      lx = 0; ly = 0.9; lz = -s * 1.6;
    } else {
      // Follow: drifts with the player so the near court never leaves frame.
      px = focusX * 0.42; py = 4.5; pz = s * (COURT.HALF_L + 5.0) + focusZ * 0.12;
      lx = focusX * 0.20; ly = 0.95; lz = -s * 1.9;
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

  // Project a world point to screen pixels, for HUD anchors.
  toScreen(v3, out) {
    this._v.copy(v3).project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    out.x = (this._v.x * 0.5 + 0.5) * w;
    out.y = (-this._v.y * 0.5 + 0.5) * h;
    out.visible = this._v.z < 1;
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
