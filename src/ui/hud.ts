import Decimal from "break_eternity.js";
import type { Game, OfflineSummary } from "../core/game";
import { decodeExport, encodeExport } from "../core/save";
import { CONFIG } from "../sim/config";
import { effectiveEff, entropy, transportExponent } from "../sim/economy";
import { newGame, totalForSpores } from "../sim/state";
import { HYPHA, TILE } from "../sim/types";
import { isMaxed, SPORE_UPGRADES, UPGRADES, type UpgradeDef } from "../sim/upgrades";
import { fmt, fmtDuration, fmtPercent } from "../util/format";
import { byId, h, setText, showModal } from "./dom";
import type { Tool, UiState } from "./uiState";

interface UpgradeRow {
  def: UpgradeDef;
  button: HTMLButtonElement;
  level: HTMLElement;
  cost: HTMLElement;
}

const TILE_NAMES = ["Suelo", "Hojarasca", "Madera muerta", "Roca"];

export interface HudCallbacks {
  save(): void;
  wipe(): void;
}

export class Hud {
  private stats = {
    nutrients: h("span", { class: "big" }),
    net: h("span"),
    income: h("span"),
    upkeep: h("span"),
    entropy: h("span"),
    hyphae: h("span"),
    spores: h("span"),
  };
  private rows: UpgradeRow[] = [];
  private sporeRows: UpgradeRow[] = [];
  /** Las mejoras aparecen al acercarse a su precio y ya no se ocultan durante el ciclo. */
  private revealed = new Set<string>();
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private toolCost = new Map<Tool, HTMLElement>();
  private prestigeButton!: HTMLButtonElement;
  private prestigeInfo = h("p", { class: "muted" });
  private lastRevision = -1;
  private lastCycle = -1;

  constructor(
    private game: Game,
    private ui: UiState,
    private callbacks: HudCallbacks,
  ) {
    this.buildResources();
    this.rows = this.buildUpgrades(byId("upgrades"), UPGRADES);
    this.sporeRows = this.buildUpgrades(byId("spore-upgrades"), SPORE_UPGRADES);
    this.buildPrestige();
    this.buildToolbar();
    this.buildSettings();
  }

  // --- Construcción ---

  private buildResources(): void {
    const s = this.stats;
    const row = (label: string, value: HTMLElement, hint = "") =>
      h("div", { class: "stat", title: hint }, h("span", { class: "label" }, label), value);
    byId("resources").append(
      h("div", { class: "stat main" }, h("span", { class: "label" }, "Nutrientes"), s.nutrients, s.net),
      row("Ingreso", s.income, "Nutrientes/s que llegan al núcleo"),
      row("Mantenimiento", s.upkeep, "Nutrientes/s que cuesta sostener la red"),
      row("Entropía", s.entropy, "Crece con todo lo que produces en el ciclo y degrada el transporte: las redes largas pierden más"),
      row("Hifas", s.hyphae),
      row("Esporas", s.spores, "Cada espora sin gastar da +10% de rendimiento"),
    );
  }

  private buildUpgrades(container: HTMLElement, defs: UpgradeDef[]): UpgradeRow[] {
    return defs.map((def) => {
      const level = h("span", { class: "level" });
      const cost = h("span", { class: "cost" });
      const button = h("button", { class: "upgrade", onclick: () => this.game.buy(def) },
        h("div", { class: "upgrade-head" }, h("span", { class: "name" }, def.name), level),
        h("div", { class: "desc" }, def.desc),
        cost,
      );
      button.hidden = true;
      container.append(button);
      return { def, button, level, cost };
    });
  }

  private buildPrestige(): void {
    this.prestigeButton = h("button", { class: "primary wide", onclick: () => this.confirmSporulate() });
    byId("prestige").append(this.prestigeInfo, this.prestigeButton);
  }

  private buildToolbar(): void {
    const bar = byId("toolbar");
    const tools: [Tool, string, string][] = [
      ["grow", "Crecer", "1"],
      ["cord", "Cordón", "2"],
    ];
    for (const [tool, label, key] of tools) {
      const cost = h("span", { class: "cost" });
      const button = h("button", { class: "tool", onclick: () => this.setTool(tool) },
        h("kbd", {}, key), ` ${label} `, cost);
      this.toolButtons.set(tool, button);
      this.toolCost.set(tool, cost);
      bar.append(button);
    }
    bar.append(h("span", { class: "hint" }, "Clic o arrastra sobre el suelo junto a tu red"));
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "1") this.setTool("grow");
      if (e.key === "2") this.setTool("cord");
    });
  }

  private buildSettings(): void {
    byId("settings").append(
      h("button", { onclick: () => { this.callbacks.save(); this.game.addLog("Partida guardada."); } }, "Guardar"),
      h("button", { onclick: () => this.showExport() }, "Exportar"),
      h("button", { onclick: () => this.showImport() }, "Importar"),
      h("button", { class: "danger", onclick: () => this.confirmWipe() }, "Borrar"),
    );
  }

  setTool(tool: Tool): void {
    if (tool === "cord" && !this.game.mods.cords) return;
    this.ui.tool = tool;
  }

  // --- Actualización por frame ---

  update(): void {
    const g = this.game;
    const st = g.state;
    const s = this.stats;
    const net = g.income - g.upkeep;

    if (st.cycle !== this.lastCycle) {
      this.lastCycle = st.cycle;
      this.revealed.clear();
      setText(byId("cycle"), `Ciclo ${st.cycle + 1}`);
    }

    setText(s.nutrients, fmt(st.nutrients));
    setText(s.net, `${net >= 0 ? "+" : ""}${fmt(net)}/s`);
    s.net.className = net >= 0 ? "rate up" : "rate down";
    setText(s.income, `${fmt(g.income)}/s`);
    setText(s.upkeep, `${fmt(g.upkeep)}/s`);
    const e = entropy(st, g.mods);
    setText(s.entropy, `${e.toFixed(2)} (pérdida ^${transportExponent(st, g.mods).toFixed(2)})`);
    setText(s.hyphae, `${g.net.hyphae.length}${g.net.cords ? ` (${g.net.cords} cordones)` : ""}`);
    setText(s.spores, fmt(st.spores));

    this.updateRows(this.rows);
    this.updateRows(this.sporeRows);
    this.updatePrestige();
    this.updateToolbar();

    if (g.revision !== this.lastRevision) {
      this.lastRevision = g.revision;
      this.renderLog();
    }
  }

  private updateRows(rows: UpgradeRow[]): void {
    for (const r of rows) {
      const level = this.game.level(r.def);
      const maxed = isMaxed(r.def, level);
      const cost = this.game.cost(r.def);
      if (!this.revealed.has(r.def.id) && (level > 0 || this.game.wallet(r.def).gte(cost.mul(0.3)))) {
        this.revealed.add(r.def.id);
      }
      r.button.hidden = !this.revealed.has(r.def.id);
      r.button.disabled = !this.game.canBuy(r.def);
      r.button.classList.toggle("maxed", maxed);
      setText(r.level, r.def.maxLevel === 1 ? "" : `nv ${level}`);
      const unit = r.def.currency === "spores" ? (cost.eq(1) ? "espora" : "esporas") : "nutrientes";
      setText(r.cost, maxed ? "Adquirida" : `${fmt(cost)} ${unit}`);
    }
  }

  private updatePrestige(): void {
    const st = this.game.state;
    const visible = st.cycle > 0 || st.totalRun.gte(CONFIG.sporeDivisor * 0.2);
    byId("prestige-section").hidden = !visible;
    if (!visible) return;
    const gain = this.game.sporesOnReset();
    const next = totalForSpores(gain.toNumber() + 1).sub(st.totalRun);
    setText(this.prestigeButton, gain.gte(1) ? `Esporular (+${fmt(gain)} esporas)` : "Esporular");
    this.prestigeButton.disabled = gain.lt(1);
    setText(this.prestigeInfo,
      `Producido en este ciclo: ${fmt(st.totalRun)}. Siguiente espora en ${fmt(Decimal.max(next, 0))} más.`);
    byId("spore-upgrades").hidden = st.cycle === 0 && st.spores.eq(0);
  }

  private updateToolbar(): void {
    for (const [tool, button] of this.toolButtons) {
      button.classList.toggle("active", this.ui.tool === tool);
    }
    const cordButton = this.toolButtons.get("cord")!;
    cordButton.hidden = !this.game.mods.cords;
    if (!this.game.mods.cords && this.ui.tool === "cord") this.ui.tool = "grow";
    setText(this.toolCost.get("grow")!, fmt(this.game.growCost()));
    setText(this.toolCost.get("cord")!, fmt(this.game.cordCost()));
  }

  private renderLog(): void {
    const items = this.game.log.slice(-6).map((m) => h("li", {}, m));
    byId("log").replaceChildren(h("ul", {}, ...items));
  }

  // --- Tooltip ---

  updateTooltip(clientX: number, clientY: number): void {
    const tip = byId("tooltip");
    const i = this.ui.hover;
    if (i < 0) {
      tip.hidden = true;
      return;
    }
    const g = this.game;
    const { world } = g.state;
    const t = world.tiles[i];
    const hy = world.hypha[i];
    const lines: string[] = [TILE_NAMES[t]];
    if (world.stock[i] > 0) lines.push(`Materia: ${fmt(world.stock[i])}`);
    if (t === TILE.Wood && !g.mods.lignin) lines.push("Necesitas Enzimas lignolíticas");
    if (hy === HYPHA.Core) lines.push("Núcleo");
    else if (hy !== HYPHA.None) {
      const eff = effectiveEff(g.net, i, transportExponent(g.state, g.mods));
      lines.push(`${hy === HYPHA.Cord ? "Cordón" : "Hifa"}: eficiencia ${fmtPercent(eff)}`);
    }
    if (this.ui.tool === "grow" && g.canGrowAt(i)) lines.push(`Crecer: ${fmt(g.growCost())}`);
    if (this.ui.tool === "cord" && g.canCordAt(i)) lines.push(`Convertir en cordón: ${fmt(g.cordCost())}`);
    tip.replaceChildren(...lines.map((l, k) => h("div", { class: k === 0 ? "tip-title" : "" }, l)));
    tip.style.left = `${clientX + 14}px`;
    tip.style.top = `${clientY + 14}px`;
    tip.hidden = false;
  }

  // --- Diálogos ---

  showOfflineSummary(summary: OfflineSummary): void {
    const body = [
      h("p", {}, `Tu micelio siguió trabajando durante ${fmtDuration(summary.seconds)}.`),
      h("p", {}, `Produjo ${fmt(summary.gained)} nutrientes.`),
    ];
    if (summary.died > 0) body.push(h("p", { class: "warn" }, `${summary.died} hifas murieron de hambre.`));
    showModal("Mientras no estabas", body, [{ label: "Continuar", primary: true }]);
  }

  private confirmSporulate(): void {
    const gain = this.game.sporesOnReset();
    showModal("Esporular", [
      h("p", {}, "Tu micelio se disolverá y sus esporas viajarán a un bosque nuevo."),
      h("p", {}, `Obtendrás ${fmt(gain)} esporas. Se pierden los nutrientes, las hifas y las mejoras del ciclo.`),
    ], [
      { label: "Cancelar" },
      { label: "Esporular", primary: true, onClick: () => { this.game.sporulate(); this.callbacks.save(); } },
    ]);
  }

  private showExport(): void {
    const area = h("textarea", { readOnly: true, value: encodeExport(this.game.state) });
    showModal("Exportar partida", [h("p", {}, "Copia este texto para guardar tu partida:"), area], [
      { label: "Copiar", primary: true, onClick: () => void navigator.clipboard?.writeText(area.value) },
      { label: "Cerrar" },
    ]);
    area.select();
  }

  private showImport(): void {
    const area = h("textarea", { placeholder: "Pega aquí el texto exportado" });
    showModal("Importar partida", [area], [
      { label: "Cancelar" },
      {
        label: "Importar",
        primary: true,
        onClick: () => {
          try {
            this.game.replaceState(decodeExport(area.value));
            this.callbacks.save();
            this.game.addLog("Partida importada.");
          } catch (err) {
            showModal("No se pudo importar", h("p", {}, (err as Error).message), [{ label: "Cerrar" }]);
          }
        },
      },
    ]);
  }

  private confirmWipe(): void {
    showModal("Borrar partida", h("p", { class: "warn" }, "Se perderá todo el progreso, esporas incluidas. No se puede deshacer."), [
      { label: "Cancelar" },
      {
        label: "Borrar todo",
        primary: true,
        onClick: () => {
          this.callbacks.wipe();
          this.game.replaceState(newGame());
          this.game.addLog("Nueva partida.");
        },
      },
    ]);
  }
}
