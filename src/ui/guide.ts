import type { Game } from "../core/game";
import { CONFIG } from "../sim/config";
import { HYPHA, TILE } from "../sim/types";

export interface GuideStep {
  title: string;
  hint: string;
  done(g: Game): boolean;
  /** Progreso numérico opcional [actual, objetivo]. */
  progress?(g: Game): [number, number];
  /** Selector del elemento de la interfaz que se resalta mientras el paso está activo. */
  highlight?: string;
}

const upgradesBought = (g: Game) => Object.values(g.state.upgrades).reduce((a, b) => a + b, 0);

const onRichMatter = (g: Game) =>
  g.net.hyphae.some((i) => {
    const t = g.state.world.tiles[i];
    return t === TILE.Litter || t === TILE.Wood;
  });

/** Guía de primeros pasos. Cada objetivo se comprueba sobre el estado, así que nunca se atasca. */
export const GUIDE: GuideStep[] = [
  {
    title: "Haz crecer tu primera hifa",
    hint: "Haz clic en una casilla marcada en verde junto al núcleo brillante. Las hifas solo crecen pegadas a tu red.",
    done: (g) => g.net.hyphae.length >= 1,
  },
  {
    title: "Alcanza la hojarasca",
    hint: "Las casillas anaranjadas son hojarasca: materia rica. Lleva una hifa encima y verás los nutrientes viajar al núcleo.",
    done: (g) => onRichMatter(g) || g.net.hyphae.length >= 10,
  },
  {
    title: "Compra tu primera mejora",
    hint: "Las mejoras aparecen a la izquierda al acercarte a su precio. Exoenzimas multiplica todo lo que produces.",
    done: (g) => upgradesBought(g) >= 1,
    highlight: "#upgrades",
  },
  {
    title: "Extiende la red a 15 hifas",
    hint: "Hasta el suelo vacío da algo de humus, pero lejos del núcleo se pierde por el camino. Pasa el ratón por una casilla para ver si una hifa ahí compensa.",
    done: (g) => g.net.hyphae.length >= 15,
    progress: (g) => [g.net.hyphae.length, 15],
  },
  {
    title: "Desbloquea los cordones",
    hint: "Compra Cordones miceliales: autopistas que pierden un 75% menos. Ideales para llegar a hojarasca lejana.",
    done: (g) => g.mods.cords,
    highlight: "#upgrades",
  },
  {
    title: "Convierte una hifa en cordón",
    hint: "Pulsa la tecla 2 (o el botón Cordón) y haz clic en las hifas del tronco principal de tu red.",
    done: (g) => g.state.world.hypha.includes(HYPHA.Cord),
    highlight: '[data-tool="cord"]',
  },
  {
    title: `Produce ${CONFIG.sporeDivisor} nutrientes en este ciclo`,
    hint: "La entropía sube con todo lo que produces y castiga las rutas largas: el bosque se desordena. Tarde o temprano tu red dejará de rendir.",
    done: (g) => g.state.totalRun.gte(CONFIG.sporeDivisor) || g.state.cycle > 0,
    progress: (g) => [Math.floor(g.state.totalRun.toNumber()), CONFIG.sporeDivisor],
  },
  {
    title: "Esporula",
    hint: "Tu micelio se disolverá y renacerá en un bosque nuevo. Las esporas dan +10% de rendimiento cada una, o se gastan en mejoras permanentes.",
    done: (g) => g.state.cycle > 0,
    highlight: "#prestige button",
  },
];
