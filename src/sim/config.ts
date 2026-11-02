/** Constantes de balance. Todo el tuning numérico de la capa 1 vive aquí. */
export const CONFIG = {
  gridSize: 31,
  tickSeconds: 0.1,
  offlineStepSeconds: 1,
  offlineCapSeconds: 8 * 60 * 60,

  startNutrients: 15,
  /** Materia/s que el núcleo digiere por sí solo: el jugador nunca queda bloqueado del todo. */
  coreRate: 0.5,

  growBaseCost: 5,
  growCostGrowth: 1.12,
  minGrowCostGrowth: 1.07,
  cordBaseCost: 15,
  cordCostGrowth: 1.25,

  /**
   * Materia/s que absorbe una hifa, indexado por TileType (suelo, hojarasca, madera, roca).
   * El humus del suelo es infinito pero pobre: junto con el mantenimiento define un radio
   * óptimo de red que la entropía va encogiendo.
   */
  absorbRate: [0.05, 1, 0.4, 0],
  /** Nutrientes por unidad de materia, indexado por TileType. */
  materiaYield: [1, 1, 1.5, 0],

  /** Fracción de nutrientes que se pierde al atravesar una casilla de hifa. */
  baseLoss: 0.06,
  cordLossFactor: 0.25,

  /** Materia/s que consume cada hifa. Se paga en nutrientes × rendimiento, así escala con el juego. */
  upkeepPerHypha: 0.02,
  cordUpkeepFactor: 1.5,

  /** entropía = (nutrientes totales del ciclo / escala) ^ exponente */
  entropyScale: 1000,
  entropyExponent: 0.6,
  /** La eficiencia de transporte se eleva a (1 + peso × entropía). */
  entropyLossWeight: 0.05,

  leafFallSeconds: 2,
  leafStock: [40, 120],
  /**
   * Materia/s que pierde la hojarasca sola al descomponerse. Sin esto el mapa se satura de hojas;
   * con ~80 de materia por caída vive unos 160 s, así que hay unas 80 casillas con hojarasca a la vez.
   */
  litterDecay: 0.5,
  logFallSeconds: 150,
  logStock: [400, 900],
  logLength: [2, 4],

  initialLitter: 45,
  initialLogs: 5,
  rockClusters: 9,
  rockWalk: [5, 14],

  starveKillSeconds: 1,

  sporeDivisor: 2000,
  /** Bonus de rendimiento por cada espora sin gastar. */
  sporeYieldBonus: 0.1,
} as const;
