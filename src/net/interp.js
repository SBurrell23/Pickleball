// Client-side snapshot buffer. The client renders the world a fixed delay
// behind the host so there is always a snapshot on each side of the render
// time to interpolate between; that is what removes jitter from the ball.

const MAX_SNAPS = 40;

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Cubic Hermite through two position/velocity samples. For a ball travelling
// at 25 m/s a straight lerp visibly flattens the arc between snapshots; this
// keeps the curve.
function hermite(p0, v0, p1, v1, t, dt) {
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * v0 * dt + h01 * p1 + h11 * v1 * dt;
}

export class SnapshotBuffer {
  constructor() {
    this.snaps = [];
    this.lastPhase = null;
  }

  push(snap) {
    const t = snap.ht;
    if (this.snaps.length && t <= this.snaps[this.snaps.length - 1].ht) {
      return; // out-of-order arrival on the unreliable channel
    }
    this.snaps.push(snap);
    while (this.snaps.length > MAX_SNAPS) this.snaps.shift();
  }

  get latest() { return this.snaps[this.snaps.length - 1] || null; }

  // How far behind the host to render. Enough to cover jitter, no more.
  static delayFor(ping, snapshotHz) {
    const base = 2 / snapshotHz;
    return Math.max(0.055, Math.min(0.22, base + ping.jitter * 2.2));
  }

  sample(renderTime) {
    const n = this.snaps.length;
    if (n === 0) return null;
    if (n === 1) return { ...this.snaps[0], interpolated: false, stale: true };

    let hi = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (this.snaps[i].ht <= renderTime) { hi = i; break; }
    }
    // Render time is older than everything we hold: use the oldest.
    if (hi < 0) return { ...this.snaps[0], interpolated: false, stale: true };
    // Render time has run past the newest snapshot (a gap in delivery): hold
    // on the newest rather than extrapolating into nonsense.
    if (hi >= n - 1) return { ...this.snaps[n - 1], interpolated: false, stale: true };

    const a = this.snaps[hi];
    const b = this.snaps[hi + 1];
    const span = b.ht - a.ht;
    const t = span > 1e-6 ? (renderTime - a.ht) / span : 0;

    const out = {
      ...b,
      interpolated: true,
      stale: false,
      b: {
        ...b.b,
        p: [
          hermite(a.b.p[0], a.b.v[0], b.b.p[0], b.b.v[0], t, span),
          hermite(a.b.p[1], a.b.v[1], b.b.p[1], b.b.v[1], t, span),
          hermite(a.b.p[2], a.b.v[2], b.b.p[2], b.b.v[2], t, span),
        ],
        v: [
          lerp(a.b.v[0], b.b.v[0], t),
          lerp(a.b.v[1], b.b.v[1], t),
          lerp(a.b.v[2], b.b.v[2], t),
        ],
      },
      p: [],
    };

    // A bounce or a paddle hit between the two samples makes a smooth curve
    // wrong -- snap to the newer state instead of gliding through the court.
    if (a.b.sh !== b.b.sh || a.b.bb !== b.b.bb) {
      out.b.p = [...b.b.p];
      out.b.v = [...b.b.v];
    }

    const count = Math.min(a.p.length, b.p.length);
    for (let i = 0; i < count; i++) {
      const pa = a.p[i], pb = b.p[i];
      const arr = pb.slice();
      arr[0] = lerp(pa[0], pb[0], t);      // x
      arr[1] = lerp(pa[1], pb[1], t);      // z
      arr[2] = lerp(pa[2], pb[2], t);      // vx
      arr[3] = lerp(pa[3], pb[3], t);      // vz
      arr[4] = lerpAngle(pa[4], pb[4], t); // facing
      arr[5] = lerp(pa[5], pb[5], t);      // stamina
      arr[6] = lerp(pa[6], pb[6], t);      // special
      arr[10] = lerp(pa[10], pb[10], t);   // charge display
      out.p.push(arr);
    }
    return out;
  }
}

// Smoothly absorbs the difference between where the client predicted its own
// player to be and where the host says it is, instead of teleporting.
export class ErrorCorrector {
  constructor() {
    this.x = 0;
    this.z = 0;
  }

  // Called when a snapshot arrives; `dx`/`dz` are host minus predicted.
  apply(dx, dz) {
    const err = Math.hypot(dx, dz);
    if (err > 1.6) {
      // Way out of sync (tab was hidden, big packet gap) -- take the snap.
      this.x = 0; this.z = 0;
      return true;
    }
    if (err < 0.004) return false;
    this.x -= dx;
    this.z -= dz;
    return false;
  }

  update(dt) {
    const k = Math.exp(-11 * dt);
    this.x *= k;
    this.z *= k;
    if (Math.abs(this.x) < 0.0008) this.x = 0;
    if (Math.abs(this.z) < 0.0008) this.z = 0;
  }
}
