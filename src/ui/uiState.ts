export type Tool = "grow" | "cord";

/** Estado de interfaz compartido entre render, entrada y HUD. No se guarda. */
export interface UiState {
  tool: Tool;
  hover: number;
}

export function createUiState(): UiState {
  return { tool: "grow", hover: -1 };
}
