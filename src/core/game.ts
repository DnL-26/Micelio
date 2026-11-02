import Decimal from "break_eternity.js";
import { CONFIG } from "../sim/config";
import { effectiveEff, tick, transportExponent } from "../sim/economy";
import { computeModifiers, type Modifiers } from "../sim/modifiers";
import { computeNetwork, type Network } from "../sim/network";
import { sporesForReset, sporulate } from "../sim/state";
import { HYPHA, TILE, type GameState } from "../sim/types";
import { isMaxed, upgradeCost, type UpgradeDef } from "../sim/upgrades";
import { neighbors } from "../sim/world";
import { fmt } from "../util/format";

export interface OfflineSummary {
  seconds: number;
  gained: Decimal;
  died: number;
}

/** Lo que pasó en la simulación y la interfaz quiere mostrar (efectos, avisos). */
export type GameEvent =
  | { type: "grow"; tile: number; cost: Decimal }
  | { type: "cord"; tile: number; cost: Decimal }
  | { type: "die"; tile: number }
  | { type: "denied"; tile: number; reason: string }
  | { type: "buy"; def: UpgradeDef }
  | { type: "sporulate"; spores: Decimal };

/** Aporte y coste por segundo de una hifa (existente o hipotética). */
export interface HyphaEstimate {
  eff: number;
  gain: number;
  upkeep: number;
  /** La materia de la casilla se agota (hojarasca, madera); el humus no. */
  finite: boolean;
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
  private events: GameEvent[] = [];
  /** Durante el progreso offline no se emiten eventos: nadie los vería. */
  private quiet = false;

  constructor(state: GameState) {
    this.state = state;
    this.refresh();
  }

  refresh(): void {
    this.mods = computeModifiers(this.state);
    this.net = computeNetwork(this.state.world, this.mods.loss, CONFIG.cordLossFactor);
    this.revision++;
  }

  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(e: GameEvent): void {
    if (!this.quiet) this.events.push(e);
  }

  step(dt: number): number {
    const r = tick(this.state, this.mods, this.net, dt);
    this.income = r.income;
    this.upkeep = r.upkeep;
    for (const tile of r.deaths) this.emit({ type: "die", tile });
    if (r.deaths.length > 0) this.refresh();
    return r.deaths.length;
  }

  runOffline(seconds: number): OfflineSummary {
    const capped = Math.min(seconds, CONFIG.offlineCapSeconds);
    const before = this.state.totalRun;
    let died = 0;
    let left = capped;
    this.quiet = true;
    try {
      while (left > 0) {
        const dt = Math.min(CONFIG.offlineStepSeconds, left);
        died += this.step(dt);
        left -= dt;
      }
    } finally {
      this.quiet = false;
    }
    return { seconds: capped, gained: this.state.totalRun.sub(before), died };
  }

  addLog(msg: string): void {
    this.log.push(msg);
    if (this.log.length > 50) this.log.shift();
    this.revision++;
  }

  // --- Estimaciones para la interfaz ---

  efficiencyAt(i: number): number {
    return effectiveEff(this.net, i, transportExponent(this.state, this.mods));
  }

  private estimate(i: number, eff: number): HyphaEstimate {
    const t = this.state.world.tiles[i];
    const absorbs = t === TILE.Soil || t === TILE.Litter || (t === TILE.Wood && this.mods.lignin);
    const gain = absorbs ? CONFIG.absorbRate[t] * this.mods.rate * CONFIG.materiaYield[t] * this.mods.yield * eff : 0;
    const cordFactor = this.state.world.hypha[i] === HYPHA.Cord ? CONFIG.cordUpkeepFactor : 1;
    const upkeep = CONFIG.upkeepPerHypha * this.mods.upkeep * this.mods.yield * cordFactor;
    return { eff, gain, upkeep, finite: t === TILE.Litter || t === TILE.Wood };
  }

  /** Lo que aporta y cuesta una hifa que ya existe. */
  hyphaEstimate(i: number): HyphaEstimate {
    return this.estimate(i, this.efficiencyAt(i));
  }

  /** Lo que aportaría y costaría una hifa nueva en `i`, conectada por su mejor vecina. */
  growthPreview(i: number): HyphaEstimate & { via: number } {
    const { world } = this.state;
    let via = -1;
    for (const nb of neighbors(i, world.size)) {
      if (world.hypha[nb] !== HYPHA.None && (via < 0 || this.net.eff[nb] > this.net.eff[via])) via = nb;
    }
    const base = via < 0 ? 0 : this.net.eff[via] * (1 - this.mods.loss);
    const eff = Math.pow(base, transportExponent(this.state, this.mods));
    return { ...this.estimate(i, eff), via };
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

  private growBlockReason(i: number): string {
    const { world } = this.state;
    if (world.hypha[i] !== HYPHA.None) return "Ya es parte de tu red";
    if (world.tiles[i] === TILE.Rock) return "La roca no se puede atravesar";
    return "Tiene que tocar tu red";
  }

  /** `explain`: si la casilla no es válida, emitir el motivo (solo en clics directos, no al arrastrar). */
  grow(i: number, explain = false): boolean {
    if (!this.canGrowAt(i)) {
      if (explain) this.emit({ type: "denied", tile: i, reason: this.growBlockReason(i) });
      return false;
    }
    const cost = this.growCost();
    if (this.state.nutrients.lt(cost)) {
      this.emit({ type: "denied", tile: i, reason: `Faltan ${fmt(cost.sub(this.state.nutrients))}` });
      return false;
    }
    this.state.nutrients = this.state.nutrients.sub(cost);
    this.state.world.hypha[i] = HYPHA.Hypha;
    this.refresh();
    this.emit({ type: "grow", tile: i, cost });
    return true;
  }

  cordCost(): Decimal {
    return Decimal.pow(CONFIG.cordCostGrowth, this.net.cords).mul(CONFIG.cordBaseCost);
  }

  canCordAt(i: number): boolean {
    return this.mods.cords && this.state.world.hypha[i] === HYPHA.Hypha;
  }

  cord(i: number, explain = false): boolean {
    const h = this.state.world.hypha[i];
    if (!this.canCordAt(i)) {
      if (explain) {
        const reason = h === HYPHA.Cord ? "Ya es un cordón" : h === HYPHA.Core ? "El núcleo no se convierte" : "Solo sobre hifas";
        this.emit({ type: "denied", tile: i, reason });
      }
      return false;
    }
    const cost = this.cordCost();
    if (this.state.nutrients.lt(cost)) {
      this.emit({ type: "denied", tile: i, reason: `Faltan ${fmt(cost.sub(this.state.nutrients))}` });
      return false;
    }
    this.state.nutrients = this.state.nutrients.sub(cost);
    this.state.world.hypha[i] = HYPHA.Cord;
    this.refresh();
    this.emit({ type: "cord", tile: i, cost });
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
    this.emit({ type: "buy", def });
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
    this.emit({ type: "sporulate", spores: gain });
    return true;
  }

  replaceState(state: GameState): void {
    this.state = state;
    this.log = [];
    this.refresh();
  }
}
