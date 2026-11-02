import type Decimal from "break_eternity.js";
import type { RngState } from "../util/rng";

export const TILE = { Soil: 0, Litter: 1, Wood: 2, Rock: 3 } as const;
export type TileType = (typeof TILE)[keyof typeof TILE];

export const HYPHA = { None: 0, Hypha: 1, Cord: 2, Core: 3 } as const;
export type HyphaType = (typeof HYPHA)[keyof typeof HYPHA];

export interface World {
  size: number;
  tiles: TileType[];
  /** Materia orgánica restante en cada casilla. */
  stock: number[];
  hypha: HyphaType[];
}

export interface GameState {
  version: number;
  rng: RngState;
  world: World;

  nutrients: Decimal;
  /** Nutrientes producidos en este ciclo; alimenta la entropía y las esporas. */
  totalRun: Decimal;
  totalAll: Decimal;
  upgrades: Record<string, number>;

  spores: Decimal;
  sporeUpgrades: Record<string, number>;
  cycle: number;

  timeRun: number;
  timeAll: number;
  leafTimer: number;
  logTimer: number;
  starveTimer: number;
  /** Epoch en ms del último guardado; sirve para calcular el progreso offline. */
  lastSaved: number;

  /** Paso actual de la guía de objetivos; sobrevive a la esporulación. */
  tutorial: number;
  introSeen: boolean;
}
