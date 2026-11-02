import type { Game } from "../core/game";
import type { Renderer } from "../render/renderer";
import type { Hud } from "./hud";
import type { UiState } from "./uiState";

/** Clic o arrastre sobre el mapa: aplica la herramienta activa a cada casilla que se pisa. */
export function bindInput(canvas: HTMLCanvasElement, game: Game, renderer: Renderer, hud: Hud, ui: UiState): void {
  let painting = false;
  let lastPainted = -1;

  const apply = (i: number) => {
    if (i < 0 || i === lastPainted) return;
    lastPainted = i;
    if (ui.tool === "grow") game.grow(i);
    else game.cord(i);
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    painting = true;
    lastPainted = -1;
    canvas.setPointerCapture(e.pointerId);
    apply(renderer.tileAt(e.clientX, e.clientY));
  });

  canvas.addEventListener("pointermove", (e) => {
    ui.hover = renderer.tileAt(e.clientX, e.clientY);
    hud.updateTooltip(e.clientX, e.clientY);
    if (painting) apply(ui.hover);
  });

  const stop = () => {
    painting = false;
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("pointerleave", () => {
    ui.hover = -1;
    hud.updateTooltip(0, 0);
  });
}
