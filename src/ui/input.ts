import type { Game } from "../core/game";
import type { Renderer } from "../render/renderer";
import type { UiState } from "./uiState";

/** Clic o arrastre sobre el mapa: aplica la herramienta activa a cada casilla que se pisa. */
export function bindInput(canvas: HTMLCanvasElement, game: Game, renderer: Renderer, ui: UiState): void {
  let painting = false;
  let lastPainted = -1;

  // Solo el clic inicial explica por qué no se puede; al arrastrar sería ruido.
  const apply = (i: number, explain: boolean) => {
    if (i < 0 || i === lastPainted) return;
    lastPainted = i;
    if (ui.tool === "grow") game.grow(i, explain);
    else game.cord(i, explain);
  };

  const track = (e: PointerEvent) => {
    ui.pointerX = e.clientX;
    ui.pointerY = e.clientY;
    ui.hover = renderer.tileAt(e.clientX, e.clientY);
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    track(e);
    painting = true;
    lastPainted = -1;
    canvas.setPointerCapture(e.pointerId);
    apply(ui.hover, true);
  });

  canvas.addEventListener("pointermove", (e) => {
    track(e);
    if (painting) apply(ui.hover, false);
  });

  const stop = () => {
    painting = false;
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("pointerleave", () => {
    ui.hover = -1;
  });
}
