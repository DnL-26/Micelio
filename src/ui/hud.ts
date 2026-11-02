import Decimal from "break_eternity.js";
import type { Game, GameEvent, OfflineSummary } from "../core/game";
import { decodeExport, encodeExport } from "../core/save";
import { CONFIG } from "../sim/config";
import { entropy, transportExponent } from "../sim/economy";
import { newGame, totalForSpores } from "../sim/state";
import { HYPHA, TILE } from "../sim/types";
import { isMaxed, SPORE_UPGRADES, UPGRADES, type UpgradeDef } from "../sim/upgrades";
import { fmt, fmtDuration, fmtPercent } from "../util/format";
import { byId, h, isModalOpen, setText, showModal } from "./dom";
import { GUIDE } from "./guide";
import type { Tool, UiState } from "./uiState";

interface UpgradeRow {
  def: UpgradeDef;
  button: HTMLButtonElement;
  level: HTMLElement;
  stat: HTMLElement;
  cost: HTMLElement;
}

interface TipLine {
  text: string;
  cls?: string;
}

const TILE_NAMES = ["Suelo", "Hojarasca", "Madera muerta", "Roca"];

const TOOL_HINTS: Record<Tool, string> = {
  grow: "Clic o arrastra sobre las casillas marcadas para crecer",
  cord: "Clic en una hifa para convertirla en cordón",
};

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
  private toolHint = h("span", { class: "hint" });
  private prestigeButton!: HTMLButtonElement;
  private prestigeInfo = h("p", { class: "muted" });
  private guide = {
    root: byId("guide"),
    step: h("span", { class: "guide-step" }),
    title: h("div", { class: "guide-title" }),
    hint: h("div", { class: "guide-hint" }),
    bar: h("div", { class: "guide-bar" }, h("div", { class: "guide-fill" })),
    count: h("span", { class: "guide-count" }),
  };
  private guideShown = -1;
  private highlighted: Element[] = [];
  private lastDeathAt = -Infinity;
  private tipKey = "";
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
    this.buildGuide();
    this.buildSettings();
  }

  // --- Construcción ---

  private buildResources(): void {
    const s = this.stats;
    const row = (label: string, value: HTMLElement, hint = "") =>
      h("div", { class: "stat", title: hint }, h("span", { class: "label" }, label), value);
    byId("resources").append(
      h("div", { class: "stat main" }, h("span", { class: "label" }, "Nutrientes"), s.nutrients, s.net),
      row("Ingreso", s.income, "Nutrientes por segundo que llegan al núcleo"),
      row("Mantenimiento", s.upkeep, "Nutrientes por segundo que cuesta sostener la red"),
      row("Entropía", s.entropy, "Crece con todo lo que produces en el ciclo y degrada el transporte: las redes largas pierden más"),
      row("Hifas", s.hyphae),
      row("Esporas", s.spores, "Cada espora sin gastar da +10% de rendimiento"),
    );
  }

  private buildUpgrades(container: HTMLElement, defs: UpgradeDef[]): UpgradeRow[] {
    return defs.map((def) => {
      const level = h("span", { class: "level" });
      const stat = h("div", { class: "stat-preview" });
      const cost = h("span", { class: "cost" });
      const button = h("button", { class: "upgrade", onclick: () => this.game.buy(def) },
        h("div", { class: "upgrade-head" }, h("span", { class: "name" }, def.name), level),
        h("div", { class: "desc" }, def.desc),
        stat,
        cost,
      );
      button.hidden = true;
      container.append(button);
      return { def, button, level, stat, cost };
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
      button.dataset.tool = tool;
      this.toolButtons.set(tool, button);
      this.toolCost.set(tool, cost);
      bar.append(button);
    }
    const chip = (cls: string, label: string) => h("span", { class: "chip" }, h("i", { class: `swatch ${cls}` }), label);
    bar.append(
      this.toolHint,
      h("span", { class: "legend" }, chip("litter", "Hojarasca"), chip("wood", "Madera"), chip("rock", "Roca")),
      h("button", { class: "help", title: "Cómo se juega (H)", onclick: () => this.showHelp(false) }, "?"),
    );
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLTextAreaElement || isModalOpen()) return;
      if (e.key === "1") this.setTool("grow");
      if (e.key === "2") this.setTool("cord");
      if (e.key === "h" || e.key === "H" || e.key === "?") this.showHelp(false);
    });
  }

  private buildGuide(): void {
    const g = this.guide;
    g.root.append(
      h("div", { class: "guide-head" }, g.step,
        h("button", { class: "link", title: "Ocultar la guía", onclick: () => this.skipGuide() }, "Ocultar")),
      g.title,
      g.hint,
      h("div", { class: "guide-progress" }, g.bar, g.count),
    );
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

  // --- Eventos ---

  handle(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === "die") this.lastDeathAt = performance.now();
      if (e.type === "denied" && e.reason.startsWith("Faltan")) flash(this.stats.nutrients, "shake");
      if (e.type === "buy") {
        const row = [...this.rows, ...this.sporeRows].find((r) => r.def === e.def);
        if (row) flash(row.button, "bought");
      }
    }
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
    this.updateGuide();
    this.updateAlert(net);
    this.updateTooltip();

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
      const wallet = this.game.wallet(r.def);
      if (!this.revealed.has(r.def.id) && (level > 0 || wallet.gte(cost.mul(0.3)))) {
        this.revealed.add(r.def.id);
      }
      const ready = this.game.canBuy(r.def);
      r.button.hidden = !this.revealed.has(r.def.id);
      r.button.disabled = !ready;
      r.button.classList.toggle("maxed", maxed);
      r.button.classList.toggle("ready", ready);
      // Barra de progreso hacia el precio.
      const progress = maxed ? 0 : Math.min(1, wallet.div(cost).toNumber());
      r.button.style.setProperty("--p", `${(progress * 100).toFixed(1)}%`);
      setText(r.level, r.def.maxLevel === 1 ? "" : `nv ${level}`);
      setText(r.stat, r.def.stat && !maxed ? `${r.def.stat(level, r.def.effect)} → ${r.def.stat(level + 1, r.def.effect)}` : "");
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
    this.prestigeButton.classList.toggle("ready", gain.gte(1));
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
    setText(this.toolHint, TOOL_HINTS[this.ui.tool]);
  }

  private updateGuide(): void {
    const st = this.game.state;
    const g = this.guide;
    let advanced = false;
    while (st.tutorial < GUIDE.length && GUIDE[st.tutorial].done(this.game)) {
      st.tutorial++;
      advanced = true;
    }
    if (advanced && st.tutorial >= GUIDE.length) this.game.addLog("Guía completada. El bosque es tuyo.");

    const step = GUIDE[st.tutorial];
    g.root.hidden = !step || !st.introSeen;
    if (st.tutorial !== this.guideShown) {
      this.guideShown = st.tutorial;
      for (const el of this.highlighted) el.classList.remove("guide-pulse");
      this.highlighted = [];
      if (!step) return;
      if (advanced) flash(g.root, "advance");
      setText(g.step, `Objetivo ${st.tutorial + 1} de ${GUIDE.length}`);
      setText(g.title, step.title);
      setText(g.hint, step.hint);
    }
    if (!step) return;

    // El resaltado se reaplica cada frame porque el elemento puede aparecer más tarde.
    if (step.highlight) {
      const els = [...document.querySelectorAll(step.highlight)];
      for (const el of els) el.classList.add("guide-pulse");
      this.highlighted = els;
    }
    const progress = step.progress?.(this.game);
    g.bar.parentElement!.hidden = !progress;
    if (progress) {
      const [cur, goal] = progress;
      (g.bar.firstElementChild as HTMLElement).style.width = `${Math.min(100, (cur / goal) * 100)}%`;
      setText(g.count, `${fmt(Math.min(cur, goal))} / ${fmt(goal)}`);
    }
  }

  private skipGuide(): void {
    this.game.state.tutorial = GUIDE.length;
    for (const el of this.highlighted) el.classList.remove("guide-pulse");
    this.highlighted = [];
    this.game.addLog("Guía oculta. Puedes reiniciarla desde la ayuda (H).");
  }

  private updateAlert(net: number): void {
    const el = byId("alert");
    const starving = performance.now() - this.lastDeathAt < 3000;
    let text = "";
    let cls = "";
    if (starving) {
      text = "Tu micelio pasa hambre: las puntas más lejanas están muriendo. Compra Metabolismo lento o crece hacia la materia rica.";
      cls = "danger";
    } else if (net < 0 && this.game.net.hyphae.length > 0) {
      const secs = this.game.state.nutrients.toNumber() / -net;
      if (secs < 90) {
        text = `Tu red consume más de lo que produce: sin nutrientes en ${fmtDuration(secs)}. Las hifas sobre suelo lejano no compensan.`;
        cls = "warn";
      }
    }
    el.hidden = text === "";
    el.className = cls;
    setText(el, text);
  }

  private renderLog(): void {
    const items = this.game.log.slice(-5).map((m) => h("li", {}, m));
    byId("log").replaceChildren(h("ul", {}, ...items));
  }

  // --- Tooltip ---

  /** Se recalcula cada frame: el contenido cambia al actuar o al moverse la economía, no solo al mover el ratón. */
  private updateTooltip(): void {
    const tip = byId("tooltip");
    const i = this.ui.hover;
    if (i < 0) {
      tip.hidden = true;
      this.tipKey = "";
      return;
    }
    const g = this.game;
    const { world } = g.state;
    const t = world.tiles[i];
    const hy = world.hypha[i];
    const lines: TipLine[] = [{ text: hy === HYPHA.Core ? "Núcleo" : TILE_NAMES[t], cls: "tip-title" }];

    if (hy === HYPHA.Core) {
      lines.push({ text: "Aquí llegan todos los nutrientes." });
    } else {
      if (world.stock[i] > 0) lines.push({ text: `Materia: ${fmt(world.stock[i])}` });
      if (t === TILE.Wood && !g.mods.lignin) lines.push({ text: "Necesitas Enzimas lignolíticas para digerirla", cls: "tip-warn" });
      if (t === TILE.Soil && hy === HYPHA.None) lines.push({ text: "Humus: poco, pero infinito", cls: "tip-muted" });
      if (t === TILE.Rock) lines.push({ text: "Infranqueable", cls: "tip-muted" });
    }

    if (hy === HYPHA.Hypha || hy === HYPHA.Cord) {
      const est = g.hyphaEstimate(i);
      lines.push({ text: `${hy === HYPHA.Cord ? "Cordón" : "Hifa"} · eficiencia ${fmtPercent(est.eff)}` });
      lines.push({ text: `Aporta +${fmt(est.gain)}/s · mantener −${fmt(est.upkeep)}/s`, cls: "tip-muted" });
      if (this.ui.tool === "cord" && g.canCordAt(i)) {
        lines.push({ text: `Convertir en cordón: ${fmt(g.cordCost())}`, cls: "tip-action" });
      }
    } else if (this.ui.tool === "grow" && g.canGrowAt(i)) {
      const p = g.growthPreview(i);
      const net = p.gain - p.upkeep;
      lines.push({ text: `Crecer aquí: ${fmt(g.growCost())}`, cls: "tip-action" });
      lines.push({ text: `Eficiencia ${fmtPercent(p.eff)} · aporte +${fmt(p.gain)}/s · mantener −${fmt(p.upkeep)}/s`, cls: "tip-muted" });
      if (net >= 0) {
        lines.push({ text: p.finite ? "Compensa mientras dure la materia" : "Compensa", cls: "tip-good" });
      } else {
        lines.push({ text: "No compensa por sí sola: úsala solo como camino", cls: "tip-bad" });
      }
    }

    const key = lines.map((l) => `${l.cls}|${l.text}`).join("\n");
    if (key !== this.tipKey) {
      this.tipKey = key;
      tip.replaceChildren(...lines.map((l) => h("div", { class: l.cls ?? "" }, l.text)));
    }
    // Evita que el tooltip se salga por la derecha o por abajo.
    tip.hidden = false;
    const { pointerX: x, pointerY: y } = this.ui;
    tip.style.left = `${Math.min(x + 14, window.innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${Math.min(y + 14, window.innerHeight - tip.offsetHeight - 8)}px`;
  }

  // --- Diálogos ---

  /** Introducción la primera vez; después, ayuda desde el botón "?" o la tecla H. */
  showHelp(first: boolean): void {
    this.game.state.introSeen = true;
    const card = (icon: string, title: string, text: string) =>
      h("div", { class: "help-card" }, h("i", { class: `swatch big ${icon}` }),
        h("div", {}, h("strong", {}, title), h("p", {}, text)));
    const body = [
      h("p", { class: "lead" },
        "Bajo la hojarasca de un bosque viejo despierta un micelio: tú. Extiende tus hifas por el suelo, " +
        "digiere lo que el bosque deja caer y lleva los nutrientes a tu núcleo. Pero todo lo que ordenas " +
        "genera entropía, y el bosque no espera a nadie."),
      h("div", { class: "help-grid" },
        card("frontier", "1 · Crece",
          "Haz clic o arrastra sobre las casillas marcadas junto a tu red. Cada hifa cuesta un poco más que la anterior."),
        card("litter", "2 · Absorbe",
          "La hojarasca es rica pero se agota, y cae más con el tiempo. La madera muerta es enorme pero necesita una mejora. El suelo da un poco de humus."),
        card("flow", "3 · Transporta",
          "Los nutrientes viajan por la red hasta el núcleo y en cada casilla se pierde un poco. Las rutas largas rinden menos: los cordones lo arreglan."),
        card("danger", "4 · Equilibra",
          "Mantener cada hifa cuesta. Si te quedas sin nutrientes, las puntas más lejanas mueren de hambre. Pasa el ratón por una casilla para ver si compensa."),
        card("spore", "5 · Renace",
          "La entropía crece con todo lo que produces. Cuando tu red ya no rinda, esporula: renacerás en un bosque nuevo, más fuerte."),
      ),
      h("p", { class: "controls" },
        h("kbd", {}, "Clic"), " / ", h("kbd", {}, "Arrastrar"), " actuar   ",
        h("kbd", {}, "1"), " crecer   ", h("kbd", {}, "2"), " cordón   ",
        h("kbd", {}, "H"), " ayuda   ", h("kbd", {}, "Esc"), " cerrar"),
    ];
    const actions = first
      ? [{ label: "Despertar", primary: true }]
      : [
          { label: "Reiniciar guía", onClick: () => { this.game.state.tutorial = 0; this.guideShown = -1; } },
          { label: "Volver al bosque", primary: true },
        ];
    showModal(first ? "Micelio" : "Cómo se juega", body, actions, { wide: true });
  }

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
          this.guideShown = -1;
          this.game.addLog("Un micelio despierta bajo la hojarasca.");
          this.showHelp(true);
        },
      },
    ]);
  }
}

/** Reinicia una animación CSS de un solo uso. */
function flash(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}
