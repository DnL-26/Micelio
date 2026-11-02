import "./style.css";
import { Game } from "./core/game";
import { startLoop } from "./core/loop";
import { deserialize, serialize } from "./core/save";
import { localSaveStorage } from "./platform/storage";
import { Fx } from "./render/fx";
import { Renderer } from "./render/renderer";
import { newGame } from "./sim/state";
import type { GameState } from "./sim/types";
import { byId } from "./ui/dom";
import { Hud } from "./ui/hud";
import { bindInput } from "./ui/input";
import { createUiState } from "./ui/uiState";

const AUTOSAVE_MS = 30_000;
const MIN_OFFLINE_SUMMARY_SECONDS = 60;

const storage = localSaveStorage;

function loadState(): GameState | null {
  const raw = storage.load();
  if (!raw) return null;
  try {
    return deserialize(raw);
  } catch (err) {
    console.error("No se pudo cargar el guardado:", err);
    return null;
  }
}

const loaded = loadState();
const game = new Game(loaded ?? newGame());
if (!loaded) game.addLog("Un micelio despierta bajo la hojarasca.");

const save = () => {
  game.state.lastSaved = Date.now();
  storage.save(serialize(game.state));
};

const ui = createUiState();
const fx = new Fx();
const canvas = byId<HTMLCanvasElement>("world");
const renderer = new Renderer(canvas, game, ui, fx);
const hud = new Hud(game, ui, {
  save,
  wipe: () => {
    storage.clear();
    fx.clear();
  },
});
bindInput(canvas, game, renderer, ui);

const catchUp = (seconds: number) => {
  const summary = game.runOffline(seconds);
  if (summary.seconds >= MIN_OFFLINE_SUMMARY_SECONDS) hud.showOfflineSummary(summary);
};

if (loaded) catchUp((Date.now() - loaded.lastSaved) / 1000);
if (!game.state.introSeen) hud.showHelp(true);

// Acceso desde la consola para depurar; no existe en el build de producción.
if (import.meta.env.DEV) Object.assign(window, { __game: game, __fx: fx });

// En desarrollo, ?speed=10 acelera la simulación para probar el balance.
const speed = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("speed")) || 1 : 1;

let lastFrame = performance.now();
startLoop({
  step: (dt) => game.step(dt),
  render: (t) => {
    const dt = Math.min(0.1, (t - lastFrame) / 1000);
    lastFrame = t;
    const events = game.drainEvents();
    fx.handle(events);
    hud.handle(events);
    fx.update(dt, game);
    renderer.draw(t);
    hud.update();
  },
  catchUp,
}, speed);

setInterval(save, AUTOSAVE_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") save();
});
window.addEventListener("beforeunload", save);
