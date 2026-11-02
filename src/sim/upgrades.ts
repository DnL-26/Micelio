import Decimal from "break_eternity.js";

export type Currency = "nutrients" | "spores";

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  currency: Currency;
  baseCost: number;
  costGrowth: number;
  maxLevel?: number;
  /** Magnitud del efecto; cómo se aplica lo decide computeModifiers. */
  effect: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: "exoenzymes", name: "Exoenzimas", desc: "+30% nutrientes por materia digerida.", currency: "nutrients", baseCost: 20, costGrowth: 1.75, effect: 1.3 },
  { id: "fastHyphae", name: "Puntas activas", desc: "+25% velocidad de absorción.", currency: "nutrients", baseCost: 30, costGrowth: 1.9, effect: 0.25 },
  { id: "chitin", name: "Paredes de quitina", desc: "-15% pérdida de transporte por casilla.", currency: "nutrients", baseCost: 40, costGrowth: 2, effect: 0.85 },
  { id: "slowMetabolism", name: "Metabolismo lento", desc: "-12% mantenimiento de la red.", currency: "nutrients", baseCost: 50, costGrowth: 2.1, effect: 0.88 },
  { id: "cords", name: "Cordones miceliales", desc: "Convierte hifas en cordones: 75% menos pérdida, 1,5× mantenimiento.", currency: "nutrients", baseCost: 100, costGrowth: 1, maxLevel: 1, effect: 0 },
  { id: "sclerotia", name: "Esclerocios", desc: "-10% entropía generada.", currency: "nutrients", baseCost: 120, costGrowth: 2.5, effect: 0.9 },
  { id: "lignin", name: "Enzimas lignolíticas", desc: "Permite digerir madera muerta.", currency: "nutrients", baseCost: 150, costGrowth: 1, maxLevel: 1, effect: 0 },
];

export const SPORE_UPGRADES: UpgradeDef[] = [
  { id: "geneticMemory", name: "Memoria genética", desc: "+50 nutrientes al empezar cada ciclo.", currency: "spores", baseCost: 1, costGrowth: 2, effect: 50 },
  { id: "hardySpores", name: "Esporas resistentes", desc: "-15% entropía generada.", currency: "spores", baseCost: 2, costGrowth: 2.2, effect: 0.85 },
  { id: "inheritedGrowth", name: "Crecimiento heredado", desc: "Las hifas se encarecen más despacio.", currency: "spores", baseCost: 3, costGrowth: 3, maxLevel: 10, effect: 0.005 },
];

const ALL = new Map([...UPGRADES, ...SPORE_UPGRADES].map((u) => [u.id, u]));

export function getUpgrade(id: string): UpgradeDef {
  const def = ALL.get(id);
  if (!def) throw new Error(`Mejora desconocida: ${id}`);
  return def;
}

export function upgradeCost(def: UpgradeDef, level: number): Decimal {
  return Decimal.pow(def.costGrowth, level).mul(def.baseCost);
}

export function isMaxed(def: UpgradeDef, level: number): boolean {
  return def.maxLevel !== undefined && level >= def.maxLevel;
}
