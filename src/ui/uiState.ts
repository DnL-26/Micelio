export type Tool = "grow" | "cord";

/** Estado de interfaz compartido entre render, entrada y HUD. No se guarda. */
export interface UiState {
  tool: Tool;
  hover: number;
  /** Última posición del puntero sobre el mapa, para refrescar el tooltip cada frame. */
  pointerX: number;
  pointerY: number;
}

export function createUiState(): UiState {
  return { tool: "grow", hover: -1, pointerX: 0, pointerY: 0 };
}
