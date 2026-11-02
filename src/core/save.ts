import Decimal from "break_eternity.js";
import { SAVE_VERSION } from "../sim/state";
import type { GameState, HyphaType, TileType } from "../sim/types";

/** Formato en disco. Los Decimal van como string y la materia se redondea para aligerar el archivo. */
interface SaveFile {
  v: number;
  rng: number;
  size: number;
  tiles: number[];
  stock: number[];
  hypha: number[];
  nutrients: string;
  totalRun: string;
  totalAll: string;
  upgrades: Record<string, number>;
  spores: string;
  sporeUpgrades: Record<string, number>;
  cycle: number;
  timeRun: number;
  timeAll: number;
  leafTimer: number;
  logTimer: number;
  starveTimer: number;
  lastSaved: number;
}

export function serialize(s: GameState): string {
  const file: SaveFile = {
    v: SAVE_VERSION,
    rng: s.rng.seed,
    size: s.world.size,
    tiles: s.world.tiles,
    stock: s.world.stock.map((x) => Math.round(x * 100) / 100),
    hypha: s.world.hypha,
    nutrients: s.nutrients.toString(),
    totalRun: s.totalRun.toString(),
    totalAll: s.totalAll.toString(),
    upgrades: s.upgrades,
    spores: s.spores.toString(),
    sporeUpgrades: s.sporeUpgrades,
    cycle: s.cycle,
    timeRun: s.timeRun,
    timeAll: s.timeAll,
    leafTimer: s.leafTimer,
    logTimer: s.logTimer,
    starveTimer: s.starveTimer,
    lastSaved: s.lastSaved,
  };
  return JSON.stringify(file);
}

export function deserialize(json: string): GameState {
  const f = JSON.parse(json) as SaveFile;
  if (typeof f !== "object" || f === null || typeof f.v !== "number") {
    throw new Error("El guardado no es válido.");
  }
  if (f.v > SAVE_VERSION) throw new Error("El guardado es de una versión más nueva del juego.");
  const n = f.size * f.size;
  if (![f.tiles, f.stock, f.hypha].every((a) => Array.isArray(a) && a.length === n)) {
    throw new Error("El mundo del guardado está corrupto.");
  }
  // Cuando haya v2, las migraciones van aquí: if (f.v < 2) { ... }
  return {
    version: SAVE_VERSION,
    rng: { seed: f.rng },
    world: {
      size: f.size,
      tiles: f.tiles as TileType[],
      stock: f.stock,
      hypha: f.hypha as HyphaType[],
    },
    nutrients: new Decimal(f.nutrients),
    totalRun: new Decimal(f.totalRun),
    totalAll: new Decimal(f.totalAll),
    upgrades: f.upgrades ?? {},
    spores: new Decimal(f.spores),
    sporeUpgrades: f.sporeUpgrades ?? {},
    cycle: f.cycle ?? 0,
    timeRun: f.timeRun ?? 0,
    timeAll: f.timeAll ?? 0,
    leafTimer: f.leafTimer ?? 0,
    logTimer: f.logTimer ?? 0,
    starveTimer: f.starveTimer ?? 0,
    lastSaved: f.lastSaved ?? Date.now(),
  };
}

export function encodeExport(s: GameState): string {
  return btoa(serialize(s));
}

export function decodeExport(text: string): GameState {
  let json: string;
  try {
    json = atob(text.trim());
  } catch {
    throw new Error("El texto no es un guardado exportado.");
  }
  return deserialize(json);
}
