// A live 3D preview of a character, for the menus.
//
// This is the same rig the match builds -- render/character.js, the same
// function the sim's players go through -- turning slowly on its own little
// stage. A drawn portrait is a good likeness but it is still a drawing; when
// somebody is choosing a kit they should be looking at the thing that walks
// onto the court.
//
// One renderer, moved between hosts. Only one preview is ever on screen at a
// time (the menu tile and the editor are different screens), and a WebGL
// context per canvas would be wasteful for something this small.

import * as THREE from '../../vendor/three.module.js';
import { buildCharacter } from '../render/character.js';

const FPS = 30;                 // a turntable does not need sixty
const SPIN = 0.55;              // radians a second

export class CharacterPreview {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'preview-canvas';

    this.scene = new THREE.Scene();
    // Lit like the court at midday, so the kit colour reads the same here as
    // it will in a match.
    this.scene.add(new THREE.HemisphereLight(0xbfe0f2, 0x4a7a44, 1.15));
    const key = new THREE.DirectionalLight(0xfff6e2, 2.0);
    key.position.set(4, 7, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd9f0, 0.45);
    rim.position.set(-5, 3, -4);
    this.scene.add(rim);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);

    this.rig = null;
    this.defKey = null;
    this.running = false;
    this.last = 0;
    this.accum = 0;
    this._loop = this._loop.bind(this);
  }

  /** Put the preview inside `host`, sized to it, showing `def`. */
  attach(host, def) {
    if (!host) return;
    if (this.canvas.parentElement !== host) host.appendChild(this.canvas);
    this.setDef(def);
    this.resize(host);
    this.start();
  }

  setDef(def) {
    // Rebuilding a rig means new geometry and materials, so only do it when
    // the look has actually changed -- the editor re-renders on every click.
    const key = JSON.stringify(def.colors) + JSON.stringify(def.build);
    if (key === this.defKey && this.rig) return;
    this.defKey = key;
    if (this.rig) {
      this.turntable.remove(this.rig);
      disposeRig(this.rig);
    }
    this.rig = buildCharacter(def);
    // The rig is built around the player's feet; drop it so the figure is
    // centred in frame rather than sitting at the bottom of it.
    this.rig.position.y = -0.62;
    this.turntable.add(this.rig);
  }

  resize(host) {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Frame the figure whatever shape the slot is: a wide, short tile needs
    // the camera further back than a tall one or the head leaves the top.
    this.camera.position.set(0, 0.12, 3.4 / Math.min(1, this.camera.aspect * 1.25));
    this.camera.lookAt(0, 0.02, 0);
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
  }

  _loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    // A menu turntable has no business running at the display's refresh rate.
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.accum += dt;
    if (this.accum < 1 / FPS) return;
    this.accum = 0;
    if (!this.canvas.parentElement || !this.canvas.isConnected) return;
    this.turntable.rotation.y += dt * SPIN;
    if (this.rig) {
      // The same idle float the characters have on court.
      this.rig.position.y = -0.62 + Math.sin(now / 620) * 0.018;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    if (this.rig) disposeRig(this.rig);
    this.renderer.dispose();
  }
}

function disposeRig(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) m[k].dispose();
      m.dispose();
    }
  });
}
