import Decimal from "break_eternity.js";
import { CONFIG } from "./config";
import type { GameState } from "./types";
import { getUpgrade } from "./upgrades";
import { generateWorld } from "./world";
import { nextRandom, randomSeed } from "../util/rng";

export const SAVE_VERSION = 2;

/** Lo que sobrevive a una esporulación. */
export interface Legacy {
  seed: number;
  spores: Decimal;
  sporeUpgrades: Record<string, number>;
  cycle: number;
  totalAll: Decimal;
  timeAll: number;
  tutorial: number;
  introSeen: boolean;
}

export function newGame(seed: number = randomSeed()): GameState {
  return newRun({
    seed,
    spores: new Decimal(0),
    sporeUpgrades: {},
    cycle: 0,
    totalAll: new Decimal(0),
    timeAll: 0,
    tutorial: 0,
    introSeen: false,
  });
}

export function newRun(legacy: Legacy): GameState {
  const rng = { seed: legacy.seed };
  const world = generateWorld(rng);
  const memory = (legacy.sporeUpgrades.geneticMemory ?? 0) * getUpgrade("geneticMemory").effect;
  return {
    version: SAVE_VERSION,
    rng,
    world,
    nutrients: new Decimal(CONFIG.startNutrients + memory),
    totalRun: new Decimal(0),
    totalAll: legacy.totalAll,
    upgrades: {},
    spores: legacy.spores,
    sporeUpgrades: legacy.sporeUpgrades,
    cycle: legacy.cycle,
    timeRun: 0,
    timeAll: legacy.timeAll,
    leafTimer: 0,
    logTimer: 0,
    starveTimer: 0,
    lastSaved: Date.now(),
    tutorial: legacy.tutorial,
    introSeen: legacy.introSeen,
  };
}

export function sporesForReset(totalRun: Decimal): Decimal {
  return totalRun.div(CONFIG.sporeDivisor).sqrt().floor();
}

/** Nutrientes totales del ciclo necesarios para tener `spores` esporas al reiniciar. */
export function totalForSpores(spores: number): Decimal {
  return new Decimal(spores * spores * CONFIG.sporeDivisor);
}

/** Esporula: devuelve el estado del siguiente ciclo, en un bosque nuevo. */
export function sporulate(s: GameState): GameState {
  return newRun({
    seed: Math.floor(nextRandom(s.rng) * 2 ** 32),
    spores: s.spores.add(sporesForReset(s.totalRun)),
    sporeUpgrades: { ...s.sporeUpgrades },
    cycle: s.cycle + 1,
    totalAll: s.totalAll,
    timeAll: s.timeAll,
    tutorial: s.tutorial,
    introSeen: s.introSeen,
  });
}
