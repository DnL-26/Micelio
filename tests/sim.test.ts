import Decimal from "break_eternity.js";
import { describe, expect, it } from "vitest";
import { Game } from "../src/core/game";
import { deserialize, serialize } from "../src/core/save";
import { CONFIG } from "../src/sim/config";
import { effectiveEff, transportExponent } from "../src/sim/economy";
import { computeNetwork } from "../src/sim/network";
import { newGame, sporesForReset } from "../src/sim/state";
import { HYPHA, TILE, type World } from "../src/sim/types";
import { UPGRADES } from "../src/sim/upgrades";
import { coreIndex } from "../src/sim/world";

function emptyWorld(size: number): World {
  const n = size * size;
  const world: World = {
    size,
    tiles: new Array(n).fill(TILE.Soil),
    stock: new Array(n).fill(0),
    hypha: new Array(n).fill(HYPHA.None),
  };
  world.hypha[coreIndex(size)] = HYPHA.Core;
  return world;
}

describe("red", () => {
  it("la eficiencia es el producto de (1 - pérdida) a lo largo del camino", () => {
    const w = emptyWorld(5);
    const c = coreIndex(5);
    w.hypha[c + 1] = HYPHA.Hypha;
    w.hypha[c + 2] = HYPHA.Hypha;
    const net = computeNetwork(w, 0.1, 0.25);
    expect(net.eff[c]).toBe(1);
    expect(net.eff[c + 1]).toBeCloseTo(0.9);
    expect(net.eff[c + 2]).toBeCloseTo(0.81);
    expect(net.parent[c + 2]).toBe(c + 1);
  });

  it("los cordones reducen la pérdida", () => {
    const w = emptyWorld(5);
    const c = coreIndex(5);
    w.hypha[c + 1] = HYPHA.Cord;
    const net = computeNetwork(w, 0.1, 0.25);
    expect(net.eff[c + 1]).toBeCloseTo(0.975);
    expect(net.cords).toBe(1);
  });

  it("elige el camino más eficiente, no el primero encontrado", () => {
    const w = emptyWorld(5);
    const c = coreIndex(5);
    // Camino directo por hifas normales vs. rodeo por cordones.
    w.hypha[c + 1] = HYPHA.Hypha;
    w.hypha[c + 2] = HYPHA.Hypha;
    w.hypha[c - 5] = HYPHA.Cord;
    w.hypha[c - 4] = HYPHA.Cord;
    w.hypha[c - 3] = HYPHA.Cord;
    const net = computeNetwork(w, 0.3, 0.1);
    // Directo: 0.7² = 0.49. Rodeo: 0.97³ ≈ 0.913 hasta c-3 y luego c+2 entra como hifa normal: ≈ 0.639.
    expect(net.eff[c + 2]).toBeCloseTo(0.97 ** 3 * 0.7);
    expect(net.parent[c + 2]).toBe(c - 3);
  });
});

describe("economía", () => {
  it("absorbe hojarasca y la convierte en suelo al agotarse", () => {
    const g = new Game(newGame(1));
    const w = g.state.world;
    const c = coreIndex(w.size);
    w.tiles[c + 1] = TILE.Litter;
    w.stock[c + 1] = 0.05;
    g.state.nutrients = new Decimal(100);
    expect(g.grow(c + 1)).toBe(true);
    g.step(0.1);
    expect(w.tiles[c + 1]).toBe(TILE.Soil);
    expect(w.stock[c + 1]).toBe(0);
  });

  it("solo se crece junto a la red y no sobre roca", () => {
    const g = new Game(newGame(2));
    const w = g.state.world;
    const c = coreIndex(w.size);
    g.state.nutrients = new Decimal(1000);
    w.tiles[c - 1] = TILE.Rock;
    expect(g.grow(c + 3)).toBe(false);
    expect(g.grow(c - 1)).toBe(false);
    expect(g.grow(c + 1)).toBe(true);
  });

  it("el hambre mata primero las puntas menos eficientes", () => {
    const g = new Game(newGame(3));
    const w = g.state.world;
    const c = coreIndex(w.size);
    w.tiles.fill(TILE.Soil);
    w.stock.fill(0);
    g.state.nutrients = new Decimal(1e6);
    for (let k = 1; k <= 5; k++) expect(g.grow(c + k)).toBe(true);
    g.state.nutrients = new Decimal(0);
    g.mods.upkeep = 1e4; // mantenimiento imposible de pagar (refresh lo restaura tras la primera muerte)
    let died = 0;
    for (let t = 0; t < 30 && died === 0; t++) died += g.step(0.1);
    expect(w.hypha[c + 5]).toBe(HYPHA.None);
    expect(w.hypha[c + 4]).toBe(HYPHA.Hypha);
  });

  it("comprar una mejora descuenta su coste y sube el nivel", () => {
    const g = new Game(newGame(4));
    const exo = UPGRADES.find((u) => u.id === "exoenzymes")!;
    g.state.nutrients = new Decimal(1000);
    const before = g.mods.yield;
    expect(g.buy(exo)).toBe(true);
    expect(g.level(exo)).toBe(1);
    expect(g.state.nutrients.toNumber()).toBeCloseTo(1000 - exo.baseCost);
    expect(g.mods.yield).toBeCloseTo(before * exo.effect);
  });
});

describe("entropía", () => {
  it("reduce la eficiencia efectiva de transporte, más cuanto más lejos", () => {
    const g = new Game(newGame(7));
    const c = coreIndex(g.state.world.size);
    g.state.nutrients = new Decimal(1000);
    g.grow(c + 1);
    g.grow(c + 2);
    const near0 = effectiveEff(g.net, c + 1, transportExponent(g.state, g.mods));
    const far0 = effectiveEff(g.net, c + 2, transportExponent(g.state, g.mods));
    g.state.totalRun = new Decimal(1e6);
    const exp = transportExponent(g.state, g.mods);
    expect(exp).toBeGreaterThan(1);
    expect(effectiveEff(g.net, c + 1, exp)).toBeLessThan(near0);
    expect(effectiveEff(g.net, c + 2, exp) / far0).toBeLessThan(effectiveEff(g.net, c + 1, exp) / near0);
  });
});

describe("prestigio", () => {
  it("las esporas siguen la raíz cuadrada", () => {
    const d = CONFIG.sporeDivisor;
    expect(sporesForReset(new Decimal(d - 1)).toNumber()).toBe(0);
    expect(sporesForReset(new Decimal(d)).toNumber()).toBe(1);
    expect(sporesForReset(new Decimal(d * 4)).toNumber()).toBe(2);
  });

  it("esporular conserva esporas y cambia de bosque", () => {
    const g = new Game(newGame(5));
    g.state.totalRun = new Decimal(CONFIG.sporeDivisor * 9);
    g.state.upgrades.exoenzymes = 3;
    const oldTiles = g.state.world.tiles.join();
    expect(g.sporulate()).toBe(true);
    expect(g.state.spores.toNumber()).toBe(3);
    expect(g.state.cycle).toBe(1);
    expect(g.state.upgrades).toEqual({});
    expect(g.state.world.tiles.join()).not.toBe(oldTiles);
  });
});

describe("guardado", () => {
  it("serializar y deserializar conserva el estado", () => {
    const g = new Game(newGame(6));
    g.runOffline(120);
    const back = deserialize(serialize(g.state));
    expect(back.nutrients.toString()).toBe(g.state.nutrients.toString());
    expect(back.world.hypha).toEqual(g.state.world.hypha);
    expect(back.rng.seed).toBe(g.state.rng.seed);
  });

  it("rechaza guardados corruptos", () => {
    expect(() => deserialize("{}")).toThrow();
    expect(() => deserialize('{"v":1,"size":3,"tiles":[],"stock":[],"hypha":[]}')).toThrow();
  });
});
