import Decimal from "break_eternity.js";
import { CONFIG } from "../sim/config";
import { tick } from "../sim/economy";
import { computeModifiers, type Modifiers } from "../sim/modifiers";
import { computeNetwork, type Network } from "../sim/network";
import { sporesForReset, sporulate } from "../sim/state";
import { HYPHA, TILE, type GameState } from "../sim/types";
import { isMaxed, upgradeCost, type UpgradeDef } from "../sim/upgrades";
import { neighbors } from "../sim/world";

export interface OfflineSummary {
  seconds: number;
  gained: Decimal;
  died: number;
}

/** Fachada sobre la simulación: guarda el estado y mantiene al día la red y los modificadores. */
export class Game {
  state: GameState;
  mods!: Modifiers;
  net!: Network;
  income = 0;
  upkeep = 0;
  log: string[] = [];
  /** Sube cada vez que cambia el estado "estructural" (red, mejoras, ciclo); la UI lo usa para redibujar. */
  revision = 0;

  constructor(state: GameState) {
    this.state = state;
    this.refresh();
  }

  refresh(): void {
    this.mods = computeModifiers(this.state);
    this.net = computeNetwork(this.state.world, this.mods.loss, CONFIG.cordLossFactor);
    this.revision++;
  }

  step(dt: number): number {
    const r = tick(this.state, this.mods, this.net, dt);
    this.income = r.income;
    this.upkeep = r.upkeep;
    if (r.died > 0) this.refresh();
    return r.died;
  }

  runOffline(seconds: number): OfflineSummary {
    const capped = Math.min(seconds, CONFIG.offlineCapSeconds);
    const before = this.state.totalRun;
    let died = 0;
    let left = capped;
    while (left > 0) {
      const dt = Math.min(CONFIG.offlineStepSeconds, left);
      died += this.step(dt);
      left -= dt;
    }
    return { seconds: capped, gained: this.state.totalRun.sub(before), died };
  }

  addLog(msg: string): void {
    this.log.push(msg);
    if (this.log.length > 50) this.log.shift();
    this.revision++;
  }

  // --- Crecimiento ---

  growCost(): Decimal {
    return Decimal.pow(this.mods.growCostGrowth, this.net.hyphae.length).mul(CONFIG.growBaseCost);
  }

  canGrowAt(i: number): boolean {
    const { world } = this.state;
    if (world.hypha[i] !== HYPHA.None || world.tiles[i] === TILE.Rock) return false;
    return neighbors(i, world.size).some((nb) => world.hypha[nb] !== HYPHA.None);
  }

  grow(i: number): boolean {
    const cost = this.growCost();
    if (!this.canGrowAt(i) || this.state.nutrients.lt(cost)) return false;
    this.state.nutrients = this.state.nutrients.sub(cost);
    this.state.world.hypha[i] = HYPHA.Hypha;
    this.refresh();
    return true;
  }

  cordCost(): Decimal {
    return Decimal.pow(CONFIG.cordCostGrowth, this.net.cords).mul(CONFIG.cordBaseCost);
  }

  canCordAt(i: number): boolean {
    return this.mods.cords && this.state.world.hypha[i] === HYPHA.Hypha;
  }

  cord(i: number): boolean {
    const cost = this.cordCost();
    if (!this.canCordAt(i) || this.state.nutrients.lt(cost)) return false;
    this.state.nutrients = this.state.nutrients.sub(cost);
    this.state.world.hypha[i] = HYPHA.Cord;
    this.refresh();
    return true;
  }

  // --- Mejoras ---

  level(def: UpgradeDef): number {
    const table = def.currency === "spores" ? this.state.sporeUpgrades : this.state.upgrades;
    return table[def.id] ?? 0;
  }

  cost(def: UpgradeDef): Decimal {
    return upgradeCost(def, this.level(def));
  }

  wallet(def: UpgradeDef): Decimal {
    return def.currency === "spores" ? this.state.spores : this.state.nutrients;
  }

  canBuy(def: UpgradeDef): boolean {
    return !isMaxed(def, this.level(def)) && this.wallet(def).gte(this.cost(def));
  }

  buy(def: UpgradeDef): boolean {
    if (!this.canBuy(def)) return false;
    const cost = this.cost(def);
    if (def.currency === "spores") {
      this.state.spores = this.state.spores.sub(cost);
      this.state.sporeUpgrades[def.id] = this.level(def) + 1;
    } else {
      this.state.nutrients = this.state.nutrients.sub(cost);
      this.state.upgrades[def.id] = this.level(def) + 1;
    }
    this.addLog(`Mejora: ${def.name} (nivel ${this.level(def)})`);
    this.refresh();
    return true;
  }

  // --- Prestigio ---

  sporesOnReset(): Decimal {
    return sporesForReset(this.state.totalRun);
  }

  sporulate(): boolean {
    const gain = this.sporesOnReset();
    if (gain.lt(1)) return false;
    this.state = sporulate(this.state);
    this.log = [];
    this.addLog(`Esporulaste: +${gain.toString()} esporas. Empieza el ciclo ${this.state.cycle + 1}.`);
    this.refresh();
    return true;
  }

  replaceState(state: GameState): void {
    this.state = state;
    this.log = [];
    this.refresh();
  }
}
