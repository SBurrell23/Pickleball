import { BALL, COURT } from './constants.js';

// Net height with the usual sag: 34in at the centre, 36in at the posts.
export function netHeightAt(x) {
  const k = Math.min(1, Math.abs(x) / COURT.HALF_W);
  return COURT.NET_H_CENTER + (COURT.NET_H_POST - COURT.NET_H_CENTER) * k * k;
}

// Height of a ballistic path (ignoring drag) at a given time.
function heightAt(y0, vy, t) {
  return y0 + vy * t + 0.5 * BALL.GRAVITY * t * t;
}

// Solve the launch velocity that carries the ball from `from` to `target`
// (landing at ball radius height) in `T` seconds.
export function solveLaunch(from, target, T) {
  const vx = (target.x - from.x) / T;
  const vz = (target.z - from.z) / T;
  const vy = (BALL.R - from.y) / T - 0.5 * BALL.GRAVITY * T;
  return { x: vx, y: vy, z: vz };
}

// Time at which the path crosses the net plane (z = 0), or null if it doesn't.
function netCrossTime(from, v) {
  if (Math.abs(v.z) < 1e-5) return null;
  const t = -from.z / v.z;
  return t > 0 ? t : null;
}

// Find a flight time that both reaches the target and clears the net. Bad
// shots are allowed to fail here -- clipping the net is a legitimate outcome.
export function solveWithNet(from, target, T0, clearance = 0.10) {
  let T = T0;
  let v = solveLaunch(from, target, T);
  for (let i = 0; i < 14; i++) {
    const tc = netCrossTime(from, v);
    if (tc === null || tc > T) return { v, T, clears: true };
    const xAtNet = from.x + v.x * tc;
    if (Math.abs(xAtNet) > COURT.HALF_W + 0.08) return { v, T, clears: true }; // around the post
    const h = heightAt(from.y, v.y, tc);
    const need = netHeightAt(xAtNet) + clearance;
    if (h >= need) return { v, T, clears: true };
    T *= 1.12; // loft it a little and try again
    v = solveLaunch(from, target, T);
  }
  return { v, T, clears: false };
}

export function speedOf(v) {
  return Math.hypot(v.x, v.y, v.z);
}

export function clampSpeed(v, max) {
  const s = speedOf(v);
  if (s > max) {
    const k = max / s;
    v.x *= k; v.y *= k; v.z *= k;
  }
  return v;
}

// Where will the ball first touch the ground? Used by the AI and the landing
// marker. Integrates the same way the simulation does so the two agree.
export function predictLanding(ball, maxTime = 4, dt = 1 / 120) {
  let x = ball.p.x, y = ball.p.y, z = ball.p.z;
  let vx = ball.v.x, vy = ball.v.y, vz = ball.v.z;
  let spin = ball.spin;
  let t = 0;
  let crossedNet = false;
  const z0 = z;
  while (t < maxTime) {
    const sp = Math.hypot(vx, vy, vz);
    const d = BALL.DRAG * sp;
    const hsp = Math.hypot(vx, vz);
    vx += -d * vx * dt;
    vz += -d * vz * dt;
    vy += (BALL.GRAVITY - d * vy - BALL.MAGNUS * spin * hsp) * dt;
    const nz = z + vz * dt;
    if (!crossedNet && z0 * nz < 0) {
      crossedNet = true;
      const f = Math.abs(z0) < 1e-6 ? 0 : -z / (nz - z || 1e-6);
      const xAtNet = x + vx * dt * f;
      const yAtNet = y + vy * dt * f;
      if (Math.abs(xAtNet) <= COURT.HALF_W + 0.08 && yAtNet < netHeightAt(xAtNet)) {
        return { x, y, z, t, hitNet: true };
      }
    }
    x += vx * dt; y += vy * dt; z = nz;
    t += dt;
    if (y <= BALL.R) return { x, y: BALL.R, z, t, hitNet: false };
  }
  return { x, y, z, t, hitNet: false };
}

// solveWithNet ignores drag, so the ball lands short of the reticle. Correct for
// it by simulating, measuring the miss, and over-aiming by that amount. Short
// targets near the net also need a loftier arc than the requested flight time,
// so walk the flight time up until a solution both clears and lands true.
export function solveToLand(from, target, T0, spin, clearance = 0.10, allowLoft = true) {
  if (!allowLoft) {
    // Mistimed contact does not get to quietly buy a higher arc. Solve at the
    // flight time the shot actually earned, correct for drag, and if the path
    // clips the net then that is the shot -- which is what makes dumping a bad
    // dink into the net a real risk.
    let aim = { x: target.x, z: target.z };
    let sol = { v: solveLaunch(from, aim, T0), T: T0, clears: false };
    for (let i = 0; i < 4; i++) {
      const land = predictLanding({ p: { ...from }, v: { ...sol.v }, spin });
      if (land.hitNet) break;
      const ex = target.x - land.x;
      const ez = target.z - land.z;
      if (Math.hypot(ex, ez) < 0.02) break;
      aim = { x: aim.x + ex, z: aim.z + ez };
      sol = { v: solveLaunch(from, aim, T0), T: T0, clears: false };
    }
    return sol;
  }
  let fallback = null;
  let T = T0;
  for (let attempt = 0; attempt < 10; attempt++) {
    let aim = { x: target.x, z: target.z };
    let sol = solveWithNet(from, aim, T, clearance);
    let land = null;
    for (let i = 0; i < 4; i++) {
      land = predictLanding({ p: { ...from }, v: { ...sol.v }, spin });
      if (land.hitNet) break;
      const ex = target.x - land.x;
      const ez = target.z - land.z;
      if (Math.hypot(ex, ez) < 0.02) break;
      aim = { x: aim.x + ex, z: aim.z + ez };
      sol = solveWithNet(from, aim, sol.T, clearance);
    }
    if (!fallback) fallback = sol;
    if (land && !land.hitNet && Math.hypot(target.x - land.x, target.z - land.z) < 0.15) {
      return sol;
    }
    T *= 1.18;
  }
  return fallback;
}
