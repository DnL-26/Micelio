import Decimal from "break_eternity.js";
import { CONFIG } from "./config";
import type { Modifiers } from "./modifiers";
import type { Network } from "./network";
import { TILE, HYPHA, type GameState } from "./types";
import { dropLeaf, placeLog } from "./world";

export interface TickResult {
  /** Nutrientes/s que llegan al núcleo. */
  income: number;
  /** Nutrientes/s que cuesta mantener la red. */
  upkeep: number;
  /** Casillas cuyas hifas murieron de hambre en este tick; si hay alguna hay que recalcular la red. */
  deaths: number[];
}

/** Entropía actual: crece con lo producido en el ciclo, no con el tiempo. */
export function entropy(s: GameState, mods: Modifiers): number {
  const total = s.totalRun.div(CONFIG.entropyScale).toNumber();
  return Math.pow(Math.max(0, total), CONFIG.entropyExponent) * mods.entropy;
}

/**
 * La entropía desordena el transporte: la eficiencia base se eleva a este exponente.
 * Como escala por igual todos los pesos del grafo, el árbol de caminos no cambia y no hace
 * falta recalcular la red cuando sube la entropía.
 */
export function transportExponent(s: GameState, mods: Modifiers): number {
  return 1 + CONFIG.entropyLossWeight * entropy(s, mods);
}

export function effectiveEff(net: Network, i: number, exponent: number): number {
  return Math.pow(net.eff[i], exponent);
}

export function upkeepPerSecond(mods: Modifiers, net: Network): number {
  const units = net.hyphae.length - net.cords + net.cords * CONFIG.cordUpkeepFactor;
  return units * CONFIG.upkeepPerHypha * mods.upkeep * mods.yield;
}

export function tick(s: GameState, mods: Modifiers, net: Network, dt: number): TickResult {
  const { world } = s;
  const exponent = transportExponent(s, mods);
  let gain = CONFIG.coreRate * mods.yield * dt;

  for (const i of net.hyphae) {
    const t = world.tiles[i];
    const eff = effectiveEff(net, i, exponent);
    if (t === TILE.Soil) {
      // Humus: no se agota.
      gain += CONFIG.absorbRate[t] * mods.rate * dt * CONFIG.materiaYield[t] * mods.yield * eff;
      continue;
    }
    if (t !== TILE.Litter && !(t === TILE.Wood && mods.lignin)) continue;
    const take = Math.min(world.stock[i], CONFIG.absorbRate[t] * mods.rate * dt);
    world.stock[i] -= take;
    gain += take * CONFIG.materiaYield[t] * mods.yield * eff;
    if (world.stock[i] <= 1e-6) {
      world.stock[i] = 0;
      world.tiles[i] = TILE.Soil;
    }
  }

  const upkeep = upkeepPerSecond(mods, net);
  s.nutrients = s.nutrients.add(gain - upkeep * dt);
  s.totalRun = s.totalRun.add(gain);
  s.totalAll = s.totalAll.add(gain);
  s.timeRun += dt;
  s.timeAll += dt;

  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i] !== TILE.Litter) continue;
    world.stock[i] -= CONFIG.litterDecay * dt;
    if (world.stock[i] <= 0) {
      world.stock[i] = 0;
      world.tiles[i] = TILE.Soil;
    }
  }

  s.leafTimer += dt;
  while (s.leafTimer >= CONFIG.leafFallSeconds) {
    s.leafTimer -= CONFIG.leafFallSeconds;
    dropLeaf(world, s.rng);
  }
  s.logTimer += dt;
  while (s.logTimer >= CONFIG.logFallSeconds) {
    s.logTimer -= CONFIG.logFallSeconds;
    placeLog(world, s.rng);
  }

  const deaths: number[] = [];
  if (s.nutrients.lt(0)) {
    s.nutrients = new Decimal(0);
    s.starveTimer += dt;
    while (s.starveTimer >= CONFIG.starveKillSeconds) {
      s.starveTimer -= CONFIG.starveKillSeconds;
      const killed = killWeakestTip(s, net);
      if (killed >= 0) deaths.push(killed);
    }
  } else {
    s.starveTimer = 0;
  }

  return { income: gain / dt, upkeep, deaths };
}

/**
 * Mata la hifa menos eficiente y devuelve su casilla (-1 si no queda ninguna). Como la eficiencia
 * decrece estrictamente a lo largo de cada camino, la de menor eficiencia siempre es una punta:
 * quitarla nunca desconecta el resto de la red.
 * Se filtran las ya muertas porque la red no se recalcula hasta el final del tick.
 */
function killWeakestTip(s: GameState, net: Network): number {
  const alive = net.hyphae.filter((i) => s.world.hypha[i] !== HYPHA.None);
  if (alive.length === 0) return -1;
  let worst = alive[0];
  for (const i of alive) if (net.eff[i] < net.eff[worst]) worst = i;
  s.world.hypha[worst] = HYPHA.None;
  return worst;
}
