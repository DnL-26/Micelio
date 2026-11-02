import { CONFIG } from "./config";
import { HYPHA, TILE, type World } from "./types";
import { nextRandom, randInt, randRange, type RngState } from "../util/rng";

export function neighbors(i: number, size: number): number[] {
  const x = i % size;
  const y = (i / size) | 0;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < size - 1) out.push(i + 1);
  if (y > 0) out.push(i - size);
  if (y < size - 1) out.push(i + size);
  return out;
}

export function coreIndex(size: number): number {
  const c = size >> 1;
  return c * size + c;
}

function nearCore(i: number, size: number, radius: number): boolean {
  const c = size >> 1;
  return Math.abs((i % size) - c) <= radius && Math.abs(((i / size) | 0) - c) <= radius;
}

export function generateWorld(rng: RngState, size: number = CONFIG.gridSize): World {
  const n = size * size;
  const world: World = {
    size,
    tiles: new Array(n).fill(TILE.Soil),
    stock: new Array(n).fill(0),
    hypha: new Array(n).fill(HYPHA.None),
  };

  for (let k = 0; k < CONFIG.rockClusters; k++) {
    let x = randInt(rng, 0, size - 1);
    let y = randInt(rng, 0, size - 1);
    const steps = randInt(rng, CONFIG.rockWalk[0], CONFIG.rockWalk[1]);
    for (let s = 0; s < steps; s++) {
      const i = y * size + x;
      if (!nearCore(i, size, 2)) world.tiles[i] = TILE.Rock;
      if (nextRandom(rng) < 0.5) x = Math.min(size - 1, Math.max(0, x + (nextRandom(rng) < 0.5 ? -1 : 1)));
      else y = Math.min(size - 1, Math.max(0, y + (nextRandom(rng) < 0.5 ? -1 : 1)));
    }
  }

  for (let k = 0; k < CONFIG.initialLogs; k++) placeLog(world, rng);
  for (let k = 0; k < CONFIG.initialLitter; k++) dropLeaf(world, rng);

  // Hojarasca garantizada cerca del núcleo para que el arranque nunca dependa de la suerte.
  const c = size >> 1;
  for (const [dx, dy] of [[2, 0], [-1, -2], [0, 3]]) {
    const i = (c + dy) * size + (c + dx);
    world.tiles[i] = TILE.Litter;
    world.stock[i] = 80;
  }

  const core = coreIndex(size);
  world.tiles[core] = TILE.Soil;
  world.stock[core] = 0;
  world.hypha[core] = HYPHA.Core;
  return world;
}

/** Deja caer hojarasca en una casilla aleatoria. Las rocas, la madera y el núcleo la ignoran. */
export function dropLeaf(world: World, rng: RngState): void {
  const i = randInt(rng, 0, world.size * world.size - 1);
  const t = world.tiles[i];
  if (t === TILE.Rock || t === TILE.Wood || world.hypha[i] === HYPHA.Core) return;
  world.tiles[i] = TILE.Litter;
  world.stock[i] += randRange(rng, CONFIG.leafStock[0], CONFIG.leafStock[1]);
}

/** Coloca un tronco recto de madera muerta en una posición aleatoria. */
export function placeLog(world: World, rng: RngState): void {
  const { size } = world;
  const len = randInt(rng, CONFIG.logLength[0], CONFIG.logLength[1]);
  const horizontal = nextRandom(rng) < 0.5;
  const x0 = randInt(rng, 0, size - 1);
  const y0 = randInt(rng, 0, size - 1);
  for (let k = 0; k < len; k++) {
    const x = x0 + (horizontal ? k : 0);
    const y = y0 + (horizontal ? 0 : k);
    if (x >= size || y >= size) break;
    const i = y * size + x;
    if (world.tiles[i] === TILE.Rock || nearCore(i, size, 1)) continue;
    world.tiles[i] = TILE.Wood;
    world.stock[i] = randRange(rng, CONFIG.logStock[0], CONFIG.logStock[1]);
  }
}
