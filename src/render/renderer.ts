import type { Game } from "../core/game";
import { entropy } from "../sim/economy";
import { HYPHA, TILE } from "../sim/types";
import type { UiState } from "../ui/uiState";
import { FLOATER_LIFE, PULSE_LIFE, type Fx } from "./fx";

const SOIL = [27, 22, 18];
const ROCK = "#3b3a40";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private tileSize = 0;
  private ox = 0;
  private oy = 0;
  private width = 0;
  private height = 0;
  /** Ruido fijo por casilla para que el suelo no se vea plano. */
  private grain: Float32Array = new Float32Array(0);

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private ui: UiState,
    private fx: Fx,
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
    this.width = rect.width;
    this.height = rect.height;
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

  private center(i: number): [number, number] {
    const size = this.game.state.world.size;
    return [this.ox + (i % size) * this.tileSize + this.tileSize / 2, this.oy + ((i / size) | 0) * this.tileSize + this.tileSize / 2];
  }

  private corner(i: number): [number, number] {
    const size = this.game.state.world.size;
    return [this.ox + (i % size) * this.tileSize, this.oy + ((i / size) | 0) * this.tileSize];
  }

  draw(timeMs: number): void {
    const size = this.game.state.world.size;
    if (this.grain.length !== size * size) this.grain = makeGrain(size * size);
    this.ctx.fillStyle = "#0e0c0a";
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.drawTiles();
    this.drawEntropyHaze();
    this.drawAffordances(timeMs);
    this.drawNetwork(timeMs);
    this.drawParticles();
    this.drawCore(timeMs);
    this.drawPulses();
    this.drawHover();
    this.drawFloaters();
  }

  private drawTiles(): void {
    const { ctx, tileSize: ts } = this;
    const { world } = this.game.state;
    for (let i = 0; i < world.tiles.length; i++) {
      const [x, y] = this.corner(i);
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
  }

  /** La entropía apaga los colores del bosque. */
  private drawEntropyHaze(): void {
    const fade = Math.min(0.45, entropy(this.game.state, this.game.mods) * 0.01);
    if (fade <= 0) return;
    const size = this.game.state.world.size;
    this.ctx.fillStyle = `rgba(110, 118, 135, ${fade})`;
    this.ctx.fillRect(this.ox, this.oy, this.tileSize * size, this.tileSize * size);
  }

  /** Marca dónde se puede actuar con la herramienta activa. */
  private drawAffordances(timeMs: number): void {
    const { ctx, tileSize: ts } = this;
    const g = this.game;
    const { world } = g.state;
    const breathe = 0.5 + 0.5 * Math.sin(timeMs / 500);
    if (this.ui.tool === "grow") {
      const affordable = g.state.nutrients.gte(g.growCost());
      ctx.strokeStyle = affordable ? `rgba(160, 230, 140, ${0.25 + 0.25 * breathe})` : "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (let i = 0; i < world.tiles.length; i++) {
        if (!g.canGrowAt(i)) continue;
        const [x, y] = this.corner(i);
        ctx.strokeRect(x + 2.5, y + 2.5, ts - 5, ts - 5);
      }
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = `rgba(255, 214, 150, ${0.2 + 0.3 * breathe})`;
      ctx.lineWidth = 1.5;
      for (const i of g.net.hyphae) {
        if (!g.canCordAt(i)) continue;
        const [cx, cy] = this.center(i);
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.32, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /** Cada hifa se une con su casilla padre en el mejor camino al núcleo. */
  private drawNetwork(timeMs: number): void {
    const { ctx, tileSize: ts } = this;
    const g = this.game;
    const { world } = g.state;
    const { net } = g;
    ctx.lineCap = "round";
    for (const i of net.hyphae) {
      const p = net.parent[i];
      if (p < 0) continue;
      const cord = world.hypha[i] === HYPHA.Cord;
      const [x1, y1] = this.center(i);
      const [x2, y2] = this.center(p);
      const a = 0.25 + 0.75 * g.efficiencyAt(i);
      ctx.strokeStyle = cord ? `rgba(255, 214, 150, ${a})` : `rgba(232, 226, 205, ${a})`;
      ctx.lineWidth = Math.max(1.5, ts * (cord ? 0.3 : 0.13));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    for (const i of net.hyphae) {
      const [x, y] = this.center(i);
      const t = world.tiles[i];
      if (t === TILE.Litter || (t === TILE.Wood && g.mods.lignin)) {
        const pulse = 0.5 + 0.5 * Math.sin(timeMs / 300 + i);
        ctx.fillStyle = `rgba(255, 220, 120, ${0.35 + 0.35 * pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, ts * 0.24, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(240, 236, 220, ${0.4 + 0.6 * g.efficiencyAt(i)})`;
      ctx.beginPath();
      ctx.arc(x, y, ts * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawParticles(): void {
    const { ctx, tileSize: ts } = this;
    for (const p of this.fx.particles) {
      const [x1, y1] = this.center(p.from);
      const [x2, y2] = this.center(p.to);
      const x = x1 + (x2 - x1) * p.t;
      const y = y1 + (y2 - y1) * p.t;
      ctx.fillStyle = p.warm ? "rgba(255, 210, 110, 0.95)" : "rgba(200, 230, 170, 0.7)";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.2, ts * (p.warm ? 0.09 : 0.06)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCore(timeMs: number): void {
    const { ctx, tileSize: ts } = this;
    const [cx, cy] = this.center(this.game.net.core);
    const r = ts * (0.55 + 0.06 * Math.sin(timeMs / 600) + 0.25 * this.fx.coreFlash);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
    glow.addColorStop(0, "rgba(255, 245, 210, 0.95)");
    glow.addColorStop(0.4, "rgba(230, 200, 140, 0.55)");
    glow.addColorStop(1, "rgba(230, 200, 140, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPulses(): void {
    const { ctx, tileSize: ts } = this;
    for (const p of this.fx.pulses) {
      const k = p.age / PULSE_LIFE[p.kind];
      const [cx, cy] = this.center(p.tile);
      if (p.kind === "grow" || p.kind === "cord") {
        ctx.strokeStyle = p.kind === "grow" ? `rgba(180, 240, 160, ${1 - k})` : `rgba(255, 214, 150, ${1 - k})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * (0.2 + 0.9 * k), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === "die") {
        const s = ts * 0.28;
        ctx.strokeStyle = `rgba(230, 90, 70, ${1 - k})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy - s);
        ctx.lineTo(cx + s, cy + s);
        ctx.moveTo(cx + s, cy - s);
        ctx.lineTo(cx - s, cy + s);
        ctx.stroke();
      } else {
        const [x, y] = this.corner(p.tile);
        const shake = Math.sin(p.age * 60) * 2 * (1 - k);
        ctx.strokeStyle = `rgba(230, 110, 90, ${1 - k})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1 + shake, y + 1, ts - 2, ts - 2);
      }
    }
  }

  /** Casilla bajo el cursor y, si se puede crecer, la conexión que tendría. */
  private drawHover(): void {
    const h = this.ui.hover;
    if (h < 0) return;
    const { ctx, tileSize: ts } = this;
    const g = this.game;
    const valid = this.ui.tool === "grow" ? g.canGrowAt(h) : g.canCordAt(h);
    if (valid && this.ui.tool === "grow") {
      const preview = g.growthPreview(h);
      const net = preview.gain - preview.upkeep;
      const [x1, y1] = this.center(h);
      const [x2, y2] = this.center(preview.via);
      ctx.strokeStyle = net >= 0 ? "rgba(180, 240, 160, 0.6)" : "rgba(240, 150, 120, 0.6)";
      ctx.lineWidth = Math.max(1.5, ts * 0.13);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const [x, y] = this.corner(h);
    ctx.strokeStyle = valid ? "rgba(160, 230, 140, 0.95)" : "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
  }

  private drawFloaters(): void {
    const { ctx, tileSize: ts } = this;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `600 ${Math.max(11, Math.round(ts * 0.7))}px "Segoe UI", system-ui, sans-serif`;
    for (const f of this.fx.floaters) {
      const k = f.age / FLOATER_LIFE;
      const [cx, cy] = this.center(f.tile);
      const y = cy - ts * 0.4 - k * ts * 1.2;
      ctx.globalAlpha = 1 - k * k;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(14, 12, 10, 0.85)";
      ctx.strokeText(f.text, cx, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, cx, y);
    }
    ctx.globalAlpha = 1;
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
