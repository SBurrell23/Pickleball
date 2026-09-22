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
import { buildCharacter, animateCharacter } from '../render/character.js';
import { SWINGSTATE } from '../game/sim.js';

const FPS = 30;                 // a menu figure does not need sixty

// Turned a little off square, so the figure reads as three-quarter rather than
// as a mugshot. It does not spin: a rotating model means waiting for the front
// to come back round before you can judge a colour you just changed.
const FACING = 0.42;            // radians

// The sim state a character animates from. The preview has no match to read
// one out of, so it hands over a player who is standing still and not
// swinging -- which is exactly the pose the menu wants.
//
// `paddleLateral` is where the cursor would be, and it does two jobs at once:
// it swings the paddle out to one side of the body, and it twists the face by
// about the same angle. Leaving it out rests the paddle on the forehand side,
// which puts the face edge-on to a camera looking at a figure turned by
// FACING -- the paddle became a sliver, which is no use to somebody picking
// its colour. Aiming the other way instead turns the face back towards the
// camera, to within about fifteen degrees of square.
const STANDING = Object.freeze({
  vx: 0, vz: 0, facing: 0, dashT: 0,
  swingSide: 1, swingState: SWINGSTATE.IDLE, swingT: 0,
  charging: false, chargeVis: 0,
  paddleLateral: -0.72, paddleForward: 0.5,
});

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
    this.stage = new THREE.Group();
    this.stage.rotation.y = FACING;
    this.scene.add(this.stage);

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
      this.stage.remove(this.rig);
      disposeRig(this.rig);
    }
    this.rig = buildCharacter(def);
    // The rig is built around the player's feet; drop it so the figure is
    // centred in frame rather than sitting at the bottom of it.
    this.rig.position.y = -0.62;
    this.stage.add(this.rig);
    // A fresh paddle starts at the rig's origin -- down by the feet, looking
    // like the figure is mounted on a stick -- and only reaches the hand
    // because animateCharacter damps it there over about a second. Run that
    // settling before the first frame is drawn so nobody sees the journey.
    for (let i = 0; i < 90; i++) animateCharacter(this.rig, STANDING, 1 / 60, 0);
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
    // A menu figure has no business running at the display's refresh rate.
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.accum += dt;
    if (this.accum < 1 / FPS) return;
    const step = this.accum;
    this.accum = 0;
    if (!this.canvas.parentElement || !this.canvas.isConnected) return;
    // The same animation the match runs, so the idle bob, the paddle drift and
    // the grip are all the ones the player will actually see on court.
    if (this.rig) animateCharacter(this.rig, STANDING, step, now / 1000);
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
