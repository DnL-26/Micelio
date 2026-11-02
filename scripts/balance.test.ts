/**
 * Simulación de balance: un bot sencillo juega ciclos completos y se imprime la evolución.
 * No es un test con aserciones; se ejecuta con `npm run balance`.
 */
import { it } from "vitest";
import { Game } from "../src/core/game";
import { newGame } from "../src/sim/state";
import { HYPHA, TILE } from "../src/sim/types";
import { UPGRADES } from "../src/sim/upgrades";
import { neighbors } from "../src/sim/world";
import { fmt } from "../src/util/format";
import { entropy } from "../src/sim/economy";

/** Primer paso del camino más corto desde la red hasta la materia aprovechable más cercana. */
function nextGrowStep(g: Game): number {
  const { world } = g.state;
  const n = world.size * world.size;
  const from = new Int32Array(n).fill(-2);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (world.hypha[i] !== HYPHA.None) {
      from[i] = -1;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const nb of neighbors(i, world.size)) {
      if (from[nb] !== -2 || world.tiles[nb] === TILE.Rock) continue;
      from[nb] = i;
      const t = world.tiles[nb];
      if (t === TILE.Litter || (t === TILE.Wood && g.mods.lignin)) {
        let step = nb;
        while (world.hypha[from[step]] === HYPHA.None) step = from[step];
        return step;
      }
      queue.push(nb);
    }
  }
  return -1;
}

function botTurn(g: Game): void {
  const affordable = UPGRADES.filter((u) => g.canBuy(u)).sort((a, b) => g.cost(a).cmp(g.cost(b)));
  if (affordable.length > 0) g.buy(affordable[0]);
  if (g.income - g.upkeep > 0.05 || g.state.nutrients.gte(g.growCost().mul(4))) {
    const step = nextGrowStep(g);
    if (step >= 0) g.grow(step);
  }
}

function runCycle(g: Game, minutes: number): void {
  const report = () => {
    const s = g.state;
    console.log(
      `  t=${String(Math.round(s.timeRun / 60)).padStart(3)}m  nutr=${fmt(s.nutrients).padStart(9)}  ` +
        `ing=${fmt(g.income).padStart(7)}/s  mant=${fmt(g.upkeep).padStart(7)}/s  ` +
        `entropía=${entropy(s, g.mods).toFixed(1).padStart(5)}  hifas=${String(g.net.hyphae.length).padStart(3)}  ` +
        `esporas=${fmt(g.sporesOnReset())}`,
    );
  };
  for (let sec = 1; sec <= minutes * 60; sec++) {
    for (let k = 0; k < 10; k++) g.step(0.1);
    botTurn(g);
    if (sec % 300 === 0) report();
  }
}

it("balance", () => {
  const g = new Game(newGame(12345));
  for (let cycle = 1; cycle <= 3; cycle++) {
    console.log(`Ciclo ${cycle} (esporas acumuladas: ${fmt(g.state.spores)})`);
    runCycle(g, 45);
    g.sporulate();
  }
}, 120_000);
