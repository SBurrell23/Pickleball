// Small deterministic PRNG so the host's scatter rolls are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randDisc(rand, radius) {
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * radius;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}
