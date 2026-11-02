import { HYPHA, type World } from "./types";
import { neighbors } from "./world";

export interface Network {
  core: number;
  /** Fracción de los nutrientes de cada casilla que llega al núcleo (0 si no está conectada). */
  eff: Float64Array;
  /** Siguiente casilla en el mejor camino hacia el núcleo (-1 para el núcleo o casillas vacías). */
  parent: Int32Array;
  /** Índices de hifas y cordones, sin el núcleo. */
  hyphae: number[];
  cords: number;
}

/**
 * Dijkstra desde el núcleo. Entrar en una casilla cuesta -ln(1 - pérdida), así que el camino
 * más corto es el que maximiza el producto de (1 - pérdida), es decir, la eficiencia.
 */
export function computeNetwork(world: World, loss: number, cordLossFactor: number): Network {
  const { size } = world;
  const n = size * size;
  const dist = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const eff = new Float64Array(n);
  const core = world.hypha.indexOf(HYPHA.Core);
  const wHypha = -Math.log(1 - loss);
  const wCord = -Math.log(1 - loss * cordLossFactor);

  const heap = new MinHeap();
  dist[core] = 0;
  heap.push(core, 0);
  while (heap.size > 0) {
    const [i, d] = heap.pop();
    if (d > dist[i]) continue;
    for (const nb of neighbors(i, size)) {
      const h = world.hypha[nb];
      if (h === HYPHA.None || h === HYPHA.Core) continue;
      const nd = d + (h === HYPHA.Cord ? wCord : wHypha);
      if (nd < dist[nb]) {
        dist[nb] = nd;
        parent[nb] = i;
        heap.push(nb, nd);
      }
    }
  }

  const hyphae: number[] = [];
  let cords = 0;
  for (let i = 0; i < n; i++) {
    const h = world.hypha[i];
    if (h === HYPHA.Hypha || h === HYPHA.Cord) {
      hyphae.push(i);
      if (h === HYPHA.Cord) cords++;
    }
    eff[i] = dist[i] === Infinity ? 0 : Math.exp(-dist[i]);
  }
  return { core, eff, parent, hyphae, cords };
}

class MinHeap {
  private nodes: number[] = [];
  private prios: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, prio: number): void {
    this.nodes.push(node);
    this.prios.push(prio);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prios[p] <= this.prios[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): [number, number] {
    const top: [number, number] = [this.nodes[0], this.prios[0]];
    const lastNode = this.nodes.pop()!;
    const lastPrio = this.prios.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.prios[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.nodes.length && this.prios[l] < this.prios[m]) m = l;
        if (r < this.nodes.length && this.prios[r] < this.prios[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.prios[a], this.prios[b]] = [this.prios[b], this.prios[a]];
  }
}
