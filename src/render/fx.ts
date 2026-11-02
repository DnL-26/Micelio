import type { Game, GameEvent } from "../core/game";
import { HYPHA, TILE } from "../sim/types";
import { fmt } from "../util/format";

export interface Floater {
  tile: number;
  text: string;
  color: string;
  age: number;
}

export interface Pulse {
  tile: number;
  kind: "grow" | "cord" | "die" | "denied";
  age: number;
}

/** Un paquete de nutrientes que salta de casilla en casilla hacia el núcleo. */
export interface Particle {
  from: number;
  to: number;
  t: number;
  warm: boolean;
}

export const FLOATER_LIFE = 1.6;
export const PULSE_LIFE = { grow: 0.6, cord: 0.6, die: 1.6, denied: 0.5 } as const;
const MAX_PARTICLES = 400;
/** Casillas por segundo. */
const PARTICLE_SPEED = 5;
const CORD_SPEED = 12;

/** Efectos visuales efímeros. No afectan a la simulación ni se guardan. */
export class Fx {
  floaters: Floater[] = [];
  pulses: Pulse[] = [];
  particles: Particle[] = [];
  /** Brillo extra del núcleo cuando llegan nutrientes; decae solo. */
  coreFlash = 0;

  handle(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case "grow":
          this.pulses.push({ tile: e.tile, kind: "grow", age: 0 });
          this.floaters.push({ tile: e.tile, text: `-${fmt(e.cost)}`, color: "#e8c27a", age: 0 });
          break;
        case "cord":
          this.pulses.push({ tile: e.tile, kind: "cord", age: 0 });
          this.floaters.push({ tile: e.tile, text: `-${fmt(e.cost)}`, color: "#ffd696", age: 0 });
          break;
        case "die":
          this.pulses.push({ tile: e.tile, kind: "die", age: 0 });
          break;
        case "denied":
          this.pulses.push({ tile: e.tile, kind: "denied", age: 0 });
          this.floaters.push({ tile: e.tile, text: e.reason, color: "#e58c78", age: 0 });
          break;
        case "sporulate":
          this.particles = [];
          break;
        case "buy":
          break;
      }
    }
  }

  update(dt: number, game: Game): void {
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < FLOATER_LIFE);
    for (const p of this.pulses) p.age += dt;
    this.pulses = this.pulses.filter((p) => p.age < PULSE_LIFE[p.kind]);
    this.coreFlash = Math.max(0, this.coreFlash - dt * 1.5);

    const { world } = game.state;
    const { net } = game;

    // Mover partículas. Si la casilla murió o la red cambió, la partícula desaparece.
    const alive: Particle[] = [];
    for (const p of this.particles) {
      const fast = world.hypha[p.from] === HYPHA.Cord || world.hypha[p.to] === HYPHA.Cord;
      p.t += dt * (fast ? CORD_SPEED : PARTICLE_SPEED);
      while (p.t >= 1) {
        p.t -= 1;
        p.from = p.to;
        if (p.from === net.core) {
          this.coreFlash = Math.min(1, this.coreFlash + 0.04);
          p.to = -1;
          break;
        }
        p.to = net.parent[p.from];
        if (p.to < 0) break;
      }
      if (p.to >= 0 && world.hypha[p.from] !== HYPHA.None) alive.push(p);
    }
    this.particles = alive;

    // Generar: la materia rica emite más a menudo que el humus.
    for (const i of net.hyphae) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const t = world.tiles[i];
      const rich = t === TILE.Litter || (t === TILE.Wood && game.mods.lignin);
      const rate = (rich ? 2.2 : 0.18) * game.efficiencyAt(i);
      if (Math.random() < rate * dt && net.parent[i] >= 0) {
        this.particles.push({ from: i, to: net.parent[i], t: 0, warm: rich });
      }
    }
  }

  clear(): void {
    this.floaters = [];
    this.pulses = [];
    this.particles = [];
  }
}
