import {
  CITY,
  ROUNDABOUT_SW_CLIP,
  ROUNDABOUT_SW_R,
  SIDEWALK_CENTER,
  crosswalkKey,
  intersectionId,
  removedInteriorNode,
  removedRoadSegment,
  roadX,
  roadZ,
  type CityModel,
  type RoadAxis,
} from './CityModel';

export interface WalkNode {
  id: number;
  x: number;
  z: number;
}

export interface WalkEdge {
  a: number;
  b: number;
  length: number;
  /** Si la arista es un paso de cebra: intersección y eje del tráfico que cruza. */
  cross?: { node: number; axis: RoadAxis };
}

export interface PathStep {
  /** Nodo de llegada. */
  node: number;
  /** Arista recorrida. */
  edge: number;
}

/**
 * Grafo peatonal: esquinas de acera + puertas de edificios, unidos por
 * tramos de acera y pasos de cebra. Incluye A* para rutas puerta a puerta.
 * Como efecto lateral de la construcción, asigna `doorNode` a cada edificio.
 */
export class SidewalkGraph {
  readonly nodes: WalkNode[] = [];
  readonly edges: WalkEdge[] = [];
  readonly adjacency: Array<Array<{ node: number; edge: number }>> = [];

  constructor(model: CityModel) {
    this.build(model);
  }

  crossings(): WalkEdge[] {
    return this.edges.filter((e) => e.cross);
  }

  private addNode(x: number, z: number): number {
    const id = this.nodes.length;
    this.nodes.push({ id, x, z });
    this.adjacency.push([]);
    return id;
  }

  private addEdge(a: number, b: number, cross?: WalkEdge['cross']): void {
    const na = this.nodes[a];
    const nb = this.nodes[b];
    const length = Math.hypot(nb.x - na.x, nb.z - na.z);
    const id = this.edges.length;
    this.edges.push({ a, b, length, cross });
    this.adjacency[a].push({ node: b, edge: id });
    this.adjacency[b].push({ node: a, edge: id });
  }

  private build(model: CityModel): void {
    const g = CITY.grid;
    const closedRects = [model.park, ...model.mergedBlocks];
    // Esquinas: 4 por intersección. En cruces normales es un único nodo en
    // (±5.5, ±5.5); en rotondas la esquina se abre en dos puntos de contacto
    // (donde cada acera recta toca la curva) unidos por un nodo diagonal sobre
    // el arco, de modo que los peatones RODEAN la rotonda siguiendo la acera.
    const cornerH = new Map<string, number>(); // extremo de los tramos de acera horizontales
    const cornerV = new Map<string, number>(); // extremo de los tramos verticales
    const cornerKey = (i: number, j: number, sx: number, sz: number) => `${i},${j},${sx},${sz}`;
    const diag = ROUNDABOUT_SW_R * Math.SQRT1_2;
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        if (removedInteriorNode(closedRects, i, j)) continue; // dentro de areas fusionadas no hay aceras
        const cx = roadX(i);
        const cz = roadZ(j);
        const isRoundabout = model.roundabouts.has(intersectionId(i, j));
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const key = cornerKey(i, j, sx, sz);
            if (!isRoundabout) {
              const n = this.addNode(cx + SIDEWALK_CENTER * sx, cz + SIDEWALK_CENTER * sz);
              cornerH.set(key, n);
              cornerV.set(key, n);
            } else {
              const ch = this.addNode(cx + ROUNDABOUT_SW_CLIP * sx, cz + SIDEWALK_CENTER * sz);
              const cv = this.addNode(cx + SIDEWALK_CENTER * sx, cz + ROUNDABOUT_SW_CLIP * sz);
              const d = this.addNode(cx + diag * sx, cz + diag * sz);
              this.addEdge(ch, d);
              this.addEdge(d, cv);
              cornerH.set(key, ch);
              cornerV.set(key, cv);
            }
          }
        }
      }
    }

    // Pasos de cebra en cada intersección.
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        const node = intersectionId(i, j);
        for (const s of [-1, 1]) {
          // Cruza la carretera vertical (tráfico NS), caminando en X. Solo si existe el paso.
          if (model.crosswalks.has(crosswalkKey(i, j, 'NS', s))) {
            this.addEdge(cornerH.get(cornerKey(i, j, -1, s))!, cornerH.get(cornerKey(i, j, 1, s))!, { node, axis: 'NS' });
          }
          // Cruza la carretera horizontal (tráfico EW), caminando en Z.
          if (model.crosswalks.has(crosswalkKey(i, j, 'EW', s))) {
            this.addEdge(cornerV.get(cornerKey(i, j, s, -1))!, cornerV.get(cornerKey(i, j, s, 1))!, { node, axis: 'EW' });
          }
        }
      }
    }

    // Tramos de acera entre intersecciones, con las puertas intercaladas.
    const doorEps = 0.01;
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g - 1; i++) {
        if (removedRoadSegment(closedRects, 'h', j, i)) continue; // tramo interior eliminado
        // Carretera horizontal j, tramo entre i e i+1, dos lados (sz).
        for (const sz of [-1, 1]) {
          const z = roadZ(j) + SIDEWALK_CENTER * sz;
          const start = cornerH.get(cornerKey(i, j, 1, sz))!;
          const end = cornerH.get(cornerKey(i + 1, j, -1, sz))!;
          // Los límites del filtro son geométricos (esquina clásica), no la
          // posición del nodo: en rotondas el nodo está más lejos y las puertas
          // cercanas a la esquina deben seguir entrando en la cadena.
          const xa = roadX(i) + SIDEWALK_CENTER;
          const xb = roadX(i + 1) - SIDEWALK_CENTER;
          const doors = model.buildings
            .filter((b) => Math.abs(b.door.z - z) < doorEps && b.door.x > xa && b.door.x < xb)
            .sort((a, b) => a.door.x - b.door.x);
          this.chain(start, end, doors);
        }
      }
    }
    for (let i = 0; i < g; i++) {
      for (let j = 0; j < g - 1; j++) {
        if (removedRoadSegment(closedRects, 'v', i, j)) continue; // tramo interior eliminado
        // Carretera vertical i, tramo entre j y j+1, dos lados (sx).
        for (const sx of [-1, 1]) {
          const x = roadX(i) + SIDEWALK_CENTER * sx;
          const start = cornerV.get(cornerKey(i, j, sx, 1))!;
          const end = cornerV.get(cornerKey(i, j + 1, sx, -1))!;
          const za = roadZ(j) + SIDEWALK_CENTER;
          const zb = roadZ(j + 1) - SIDEWALK_CENTER;
          const doors = model.buildings
            .filter((b) => Math.abs(b.door.x - x) < doorEps && b.door.z > za && b.door.z < zb)
            .sort((a, b) => a.door.z - b.door.z);
          this.chain(start, end, doors);
        }
      }
    }
    this.addMergedBlockPaths(model, cornerH, cornerV, cornerKey);
  }

  /** Encadena start → puertas (en orden) → end con aristas de acera. */
  private addMergedBlockPaths(
    model: CityModel,
    cornerH: Map<string, number>,
    cornerV: Map<string, number>,
    cornerKey: (i: number, j: number, sx: number, sz: number) => string,
  ): void {
    const pathNodes = new Map<string, number>();
    const pathNode = (x: number, z: number) => {
      const key = `${x.toFixed(3)},${z.toFixed(3)}`;
      const existing = pathNodes.get(key);
      if (existing !== undefined) return existing;
      const id = this.addNode(x, z);
      pathNodes.set(key, id);
      return id;
    };
    const connect = (a: number, b: number | undefined) => {
      if (b !== undefined) this.addEdge(a, b);
    };
    const connectDoor = (building: { door: { x: number; z: number }; doorNode: number }, path: number) => {
      if (building.doorNode >= 0) return;
      const door = this.addNode(building.door.x, building.door.z);
      building.doorNode = door;
      this.addEdge(path, door);
    };

    for (const r of model.mergedBlocks) {
      for (let i = r.bi0 + 1; i < r.bi0 + r.w; i++) {
        const cx = roadX(i);
        const start = pathNode(cx, roadZ(r.bj0) + SIDEWALK_CENTER);
        let prev = start;
        connect(prev, cornerH.get(cornerKey(i, r.bj0, -1, 1)));
        connect(prev, cornerH.get(cornerKey(i, r.bj0, 1, 1)));
        for (let j = r.bj0 + 1; j < r.bj0 + r.h; j++) {
          const next = pathNode(cx, roadZ(j));
          this.addEdge(prev, next);
          prev = next;
        }
        const end = pathNode(cx, roadZ(r.bj0 + r.h) - SIDEWALK_CENTER);
        this.addEdge(prev, end);
        connect(end, cornerH.get(cornerKey(i, r.bj0 + r.h, -1, -1)));
        connect(end, cornerH.get(cornerKey(i, r.bj0 + r.h, 1, -1)));
        const za = roadZ(r.bj0) + SIDEWALK_CENTER;
        const zb = roadZ(r.bj0 + r.h) - SIDEWALK_CENTER;
        const doors = model.buildings.filter((b) => Math.abs(Math.abs(b.door.x - cx) - SIDEWALK_CENTER) < 0.02 && b.door.z > za && b.door.z < zb);
        for (const b of doors) {
          const p = pathNode(cx, b.door.z);
          connect(p, start);
          connect(p, end);
          connectDoor(b, p);
        }
      }

      for (let j = r.bj0 + 1; j < r.bj0 + r.h; j++) {
        const cz = roadZ(j);
        const start = pathNode(roadX(r.bi0) + SIDEWALK_CENTER, cz);
        let prev = start;
        connect(prev, cornerV.get(cornerKey(r.bi0, j, 1, -1)));
        connect(prev, cornerV.get(cornerKey(r.bi0, j, 1, 1)));
        for (let i = r.bi0 + 1; i < r.bi0 + r.w; i++) {
          const next = pathNode(roadX(i), cz);
          this.addEdge(prev, next);
          prev = next;
        }
        const end = pathNode(roadX(r.bi0 + r.w) - SIDEWALK_CENTER, cz);
        this.addEdge(prev, end);
        connect(end, cornerV.get(cornerKey(r.bi0 + r.w, j, -1, -1)));
        connect(end, cornerV.get(cornerKey(r.bi0 + r.w, j, -1, 1)));
        const xa = roadX(r.bi0) + SIDEWALK_CENTER;
        const xb = roadX(r.bi0 + r.w) - SIDEWALK_CENTER;
        const doors = model.buildings.filter((b) => Math.abs(Math.abs(b.door.z - cz) - SIDEWALK_CENTER) < 0.02 && b.door.x > xa && b.door.x < xb);
        for (const b of doors) {
          const p = pathNode(b.door.x, cz);
          connect(p, start);
          connect(p, end);
          connectDoor(b, p);
        }
      }
    }
  }

  private chain(start: number, end: number, doors: Array<{ door: { x: number; z: number }; doorNode: number } & object>): void {
    let prev = start;
    for (const b of doors) {
      const doorNode = this.addNode(b.door.x, b.door.z);
      (b as { doorNode: number }).doorNode = doorNode;
      this.addEdge(prev, doorNode);
      prev = doorNode;
    }
    this.addEdge(prev, end);
  }

  /** A* entre dos nodos. Devuelve los pasos (arista + nodo de llegada) o null. */
  /** Nodo del grafo más cercano a un punto del mundo (para reencaminar en ruta). */
  nearestNode(x: number, z: number): number {
    let best = 0;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  }

  findPath(start: number, goal: number): PathStep[] | null {
    if (start === goal) return [];
    const n = this.nodes.length;
    const gScore = new Float64Array(n).fill(Infinity);
    const fScore = new Float64Array(n).fill(Infinity);
    const cameFrom = new Int32Array(n).fill(-1);
    const cameEdge = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const goalNode = this.nodes[goal];
    const h = (id: number) => Math.hypot(this.nodes[id].x - goalNode.x, this.nodes[id].z - goalNode.z);

    gScore[start] = 0;
    fScore[start] = h(start);
    const open: number[] = [start];

    while (open.length > 0) {
      // Grafo pequeño (~600 nodos): búsqueda lineal del mejor f es suficiente.
      let bestIdx = 0;
      for (let k = 1; k < open.length; k++) if (fScore[open[k]] < fScore[open[bestIdx]]) bestIdx = k;
      const current = open[bestIdx];
      open.splice(bestIdx, 1);
      if (current === goal) {
        const steps: PathStep[] = [];
        let at = goal;
        while (at !== start) {
          steps.push({ node: at, edge: cameEdge[at] });
          at = cameFrom[at];
        }
        return steps.reverse();
      }
      closed[current] = 1;
      for (const { node, edge } of this.adjacency[current]) {
        if (closed[node]) continue;
        const tentative = gScore[current] + this.edges[edge].length;
        if (tentative < gScore[node]) {
          gScore[node] = tentative;
          fScore[node] = tentative + h(node);
          cameFrom[node] = current;
          cameEdge[node] = edge;
          if (!open.includes(node)) open.push(node);
        }
      }
    }
    return null;
  }
}
