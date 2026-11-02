/** Generador mulberry32. El estado vive en el guardado para que la simulación sea determinista. */
export interface RngState {
  seed: number;
}

export function nextRandom(r: RngState): number {
  let t = (r.seed = (r.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Entero en [min, max], ambos incluidos. */
export function randInt(r: RngState, min: number, max: number): number {
  return min + Math.floor(nextRandom(r) * (max - min + 1));
}

export function randRange(r: RngState, min: number, max: number): number {
  return min + nextRandom(r) * (max - min);
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
