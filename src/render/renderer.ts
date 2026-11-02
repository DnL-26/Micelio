import type { Game } from "../core/game";
import { effectiveEff, entropy, transportExponent } from "../sim/economy";
import { HYPHA, TILE } from "../sim/types";
import type { UiState } from "../ui/uiState";

const SOIL = [27, 22, 18];
const ROCK = "#3b3a40";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private tileSize = 0;
  private ox = 0;
  private oy = 0;
  /** Ruido fijo por casilla para que el suelo no se vea plano. */
  private grain: Float32Array = new Float32Array(0);

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private ui: UiState,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible.");
    this.ctx = ctx;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = this.game.state.world.size;
    this.tileSize = Math.floor(Math.min(rect.width, rect.height) / size);
    this.ox = Math.floor((rect.width - this.tileSize * size) / 2);
    this.oy = Math.floor((rect.height - this.tileSize * size) / 2);
  }

  /** Casilla bajo un punto en coordenadas de pantalla, o -1. */
  tileAt(clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const size = this.game.state.world.size;
    const x = Math.floor((clientX - rect.left - this.ox) / this.tileSize);
    const y = Math.floor((clientY - rect.top - this.oy) / this.tileSize);
    if (x < 0 || y < 0 || x >= size || y >= size) return -1;
    return y * size + x;
  }

  draw(timeMs: number): void {
    const { ctx, tileSize: ts, ox, oy } = this;
    const { world } = this.game.state;
    const { size } = world;
    const net = this.game.net;
    const rect = this.canvas.getBoundingClientRect();
    if (this.grain.length !== size * size) this.grain = makeGrain(size * size);

    ctx.fillStyle = "#0e0c0a";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Casillas
    for (let i = 0; i < size * size; i++) {
      const x = ox + (i % size) * ts;
      const y = oy + ((i / size) | 0) * ts;
      const g = this.grain[i];
      ctx.fillStyle = `rgb(${SOIL[0] + g},${SOIL[1] + g},${SOIL[2] + g})`;
      ctx.fillRect(x, y, ts, ts);
      const t = world.tiles[i];
      if (t === TILE.Rock) {
        ctx.fillStyle = ROCK;
        ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      } else if (t === TILE.Litter) {
        ctx.fillStyle = `rgba(176, 112, 38, ${0.25 + 0.6 * Math.min(1, world.stock[i] / 120)})`;
        ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);
      } else if (t === TILE.Wood) {
        // Más apagada mientras no se pueda digerir.
        const base = this.game.mods.lignin ? 0.45 : 0.2;
        ctx.fillStyle = `rgba(120, 76, 42, ${base + 0.5 * Math.min(1, world.stock[i] / 900)})`;
        ctx.fillRect(x + 1, y + 3, ts - 2, ts - 6);
      }
    }

    // La entropía apaga los colores del bosque.
    const e = entropy(this.game.state, this.game.mods);
    const fade = Math.min(0.45, e * 0.01);
    if (fade > 0) {
      ctx.fillStyle = `rgba(110, 118, 135, ${fade})`;
      ctx.fillRect(ox, oy, ts * size, ts * size);
    }

    // Hifas: cada una se une con su casilla padre en el mejor camino al núcleo.
    const center = (i: number): [number, number] => [
      ox + (i % size) * ts + ts / 2,
      oy + ((i / size) | 0) * ts + ts / 2,
    ];
    const exponent = transportExponent(this.game.state, this.game.mods);
    const effAt = (i: number) => effectiveEff(net, i, exponent);
    ctx.lineCap = "round";
    for (const i of net.hyphae) {
      const p = net.parent[i];
      if (p < 0) continue;
      const cord = world.hypha[i] === HYPHA.Cord;
      const [x1, y1] = center(i);
      const [x2, y2] = center(p);
      const a = 0.25 + 0.75 * effAt(i);
      ctx.strokeStyle = cord ? `rgba(255, 214, 150, ${a})` : `rgba(232, 226, 205, ${a})`;
      ctx.lineWidth = Math.max(1.5, ts * (cord ? 0.3 : 0.13));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    for (const i of net.hyphae) {
      const [x, y] = center(i);
      const t = world.tiles[i];
      const absorbing = t === TILE.Litter || (t === TILE.Wood && this.game.mods.lignin);
      if (absorbing) {
        const pulse = 0.5 + 0.5 * Math.sin(timeMs / 300 + i);
        ctx.fillStyle = `rgba(255, 220, 120, ${0.35 + 0.35 * pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, ts * 0.24, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(240, 236, 220, ${0.4 + 0.6 * effAt(i)})`;
      ctx.beginPath();
      ctx.arc(x, y, ts * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }

    // Núcleo
    const [cx, cy] = center(net.core);
    const r = ts * (0.55 + 0.06 * Math.sin(timeMs / 600));
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
    glow.addColorStop(0, "rgba(255, 245, 210, 0.95)");
    glow.addColorStop(0.4, "rgba(230, 200, 140, 0.55)");
    glow.addColorStop(1, "rgba(230, 200, 140, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Casilla bajo el cursor
    const h = this.ui.hover;
    if (h >= 0) {
      const valid = this.ui.tool === "grow" ? this.game.canGrowAt(h) : this.game.canCordAt(h);
      ctx.strokeStyle = valid ? "rgba(160, 230, 140, 0.9)" : "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + (h % size) * ts + 1, oy + ((h / size) | 0) * ts + 1, ts - 2, ts - 2);
    }
  }
}

function makeGrain(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.sin(i * 12.9898) * 43758.5453;
    out[i] = Math.floor((v - Math.floor(v)) * 7);
  }
  return out;
}
