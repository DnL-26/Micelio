import { CONFIG } from "./config";
import type { GameState } from "./types";
import { getUpgrade } from "./upgrades";

export interface Modifiers {
  yield: number;
  rate: number;
  loss: number;
  upkeep: number;
  entropy: number;
  growCostGrowth: number;
  cords: boolean;
  lignin: boolean;
}

export function computeModifiers(s: GameState): Modifiers {
  const lvl = (id: string) => s.upgrades[id] ?? 0;
  const spore = (id: string) => s.sporeUpgrades[id] ?? 0;
  const eff = (id: string) => getUpgrade(id).effect;

  const sporeBonus = 1 + CONFIG.sporeYieldBonus * s.spores.toNumber();
  return {
    yield: Math.pow(eff("exoenzymes"), lvl("exoenzymes")) * sporeBonus,
    rate: 1 + eff("fastHyphae") * lvl("fastHyphae"),
    loss: CONFIG.baseLoss * Math.pow(eff("chitin"), lvl("chitin")),
    upkeep: Math.pow(eff("slowMetabolism"), lvl("slowMetabolism")),
    entropy:
      Math.pow(eff("sclerotia"), lvl("sclerotia")) *
      Math.pow(eff("hardySpores"), spore("hardySpores")),
    growCostGrowth: Math.max(
      CONFIG.minGrowCostGrowth,
      CONFIG.growCostGrowth - eff("inheritedGrowth") * spore("inheritedGrowth"),
    ),
    cords: lvl("cords") > 0,
    lignin: lvl("lignin") > 0,
  };
}
