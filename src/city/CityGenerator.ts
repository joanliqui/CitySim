import { Rng } from '../core/Rng';
import { rng2 } from '../core/seededRng';
import {
  CITY,
  CORRIDOR_HALF,
  ROUNDABOUT_RADIUS,
  buildEdgeCurve,
  crosswalkKey,
  intersectionId,
  removedInteriorNode,
  removedRoadSegment,
  roadX,
  roadZ,
  setCityLayout,
  type Bench,
  type Block,
  type Building,
  type BuildingType,
  type CityModel,
  type District,
  type EdgeCurve,
  type Hedge,
  type Intersection,
  type ParkRect,
  type MergeRect,
  type PlayItem,
  type Playground,
  type RoadAxis,
  type RoadEdge,
  type Tree,
  type Vec2,
} from './CityModel';
import { type DistrictSpec } from './buildings/BuildingFactory';
import { OFFICE_MIN_DEPTH } from './buildings/interior/officeInterior';
import { SETBACK, SIDE_INSET, type BuildableRect, type ClearanceCircle, type SideTag } from './buildings/placement';
import { buildingFactories, pickFactory } from './buildings/registry';
import { makePlayItem } from './park/registry';
import type { PlayKind } from './park/types/PlayTypes';
import { makeTree, treeFitsGrassRect } from './vegetation/registry';

const GREEN_STREET_CLEARANCE = 2.8; // margen extra desde acera/calle para vegetacion alta

interface ParkPatch {
  bi0: number;
  bj0: number;
  w: number;
  h: number;
}

interface DistrictAnchor {
  bi: number;
  bj: number;
  radius: number;
}

interface CityPlan {
  xGaps: number[];
  zGaps: number[];
  park: ParkPatch;
  mergedBlocks: MergeRect[];
  dense: DistrictAnchor[];
  residential: DistrictAnchor[];
  noiseSeed: number;
}

// El tercer peso de `types` ([casa, tienda, OFICINA]) controla cuántos
// edificios ALTOS salen: súbelo para una ciudad más vertical, bájalo para más
// casas. (Las oficinas usan el rango `tall`; casas y tiendas son bajas.)
const DISTRICTS: Record<Exclude<District, 'park'>, DistrictSpec> = {
  // Norte: barrio de casas con jardín. Parcelas amplias (pocas casas por lado,
  // con sitio para jardín) y predominio de casas para que se formen islas
  // residenciales (cada casa lleva su valla individual en el render).
  residential: { parcel: 20, types: [0.66, 0.2, 0.14], tall: [10, 17], courtyard: 4 },
  // Franjas centrales junto al parque y avenidas: predominio de media-gran altura.
  mixed: { parcel: 17, types: [0.18, 0.3, 0.52], tall: [12, 24], courtyard: 2 },
  // Sur: manzanas apretadas, casi todo rascacielos.
  dense: { parcel: 13, types: [0.03, 0.22, 0.75], tall: [16, 34], courtyard: 1 },
};

/** Genera el plano completo de la ciudad: intersecciones, aristas viales, edificios y árboles. */
export function generateCity(seed: number): CityModel {
  const rng = new Rng(seed);
  const g = CITY.grid;
  const plan = makeCityPlan(new Rng(seed + 101));
  const closedRects = [plan.park, ...plan.mergedBlocks];
  const parkOnly = [plan.park];

  setCityLayout(axisPositions(plan.xGaps), axisPositions(plan.zGaps));

  const intersections: Intersection[] = [];
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      intersections.push({ id: intersectionId(i, j), i, j, x: roadX(i), z: roadZ(j) });
    }
  }

  const edges: RoadEdge[] = [];
  const outgoing: number[][] = intersections.map(() => []);
  const addEdge = (from: number, to: number) => {
    const a = intersections[from];
    const b = intersections[to];
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    const edge: RoadEdge = {
      id: edges.length,
      from,
      to,
      dirX: dx,
      dirZ: dz,
      axis: dz !== 0 ? 'NS' : 'EW',
      length: Math.hypot(b.x - a.x, b.z - a.z),
    };
    edges.push(edge);
    outgoing[from].push(edge.id);
  };
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      const id = intersectionId(i, j);
      // Tramo horizontal (línea j, columnas i..i+1): se omite si es interior del parque.
      if (i + 1 < g && !removedRoadSegment(closedRects, 'h', j, i)) {
        addEdge(id, intersectionId(i + 1, j));
        addEdge(intersectionId(i + 1, j), id);
      }
      // Tramo vertical (línea i, filas j..j+1).
      if (j + 1 < g && !removedRoadSegment(closedRects, 'v', i, j)) {
        addEdge(id, intersectionId(i, j + 1));
        addEdge(intersectionId(i, j + 1), id);
      }
    }
  }

  if (ENABLE_CURVED_BOULEVARDS) applyCurvedBoulevards(intersections, edges);

  const trees: Tree[] = [];
  const hedges: Hedge[] = [];
  const benches: Bench[] = [];
  const roundabouts = new Set<number>();
  buildRoundabouts(new Rng(seed + 9), intersections, edges, outgoing, trees, roundabouts);
  const clearances = buildClearanceCircles(intersections, roundabouts);

  const buildings: Building[] = [];
  const blocks: Block[] = [];
  const typeCount: Record<BuildingType, number> = { house: 0, shop: 0, office: 0 };

  // Cada manzana se rodea de edificios mirando a sus cuatro calles; el interior
  // queda como patio o jardín. El distrito decide densidad, tipos y altura.
  for (let bj = 0; bj < g - 1; bj++) {
    for (let bi = 0; bi < g - 1; bi++) {
      const wX = roadX(bi);
      const eX = roadX(bi + 1);
      const nZ = roadZ(bj);
      const sZ = roadZ(bj + 1);
      const district = districtAt(plan, bi, bj);
      blocks.push({ bi, bj, district });

      if (district === 'park') {
        fillPark(rng, trees, benches, plan, bi, bj, wX, eX, nZ, sZ);
        continue;
      }

      const spec = DISTRICTS[district];
      // Borde edificable de la manzana (dentro de los corredores).
      const x0 = wX + CORRIDOR_HALF;
      const x1 = eX - CORRIDOR_HALF;
      const z0 = nZ + CORRIDOR_HALF;
      const z1 = sZ - CORRIDOR_HALF;
      const buildable = { x0, x1, z0, z1 };
      const halfX = (x1 - x0) / 2;
      const halfZ = (z1 - z0) / 2;

      // Filas de edificios por lado, hacia su calle. Los lados OPUESTOS comparten
      // el fondo de la manzana: en manzanas poco profundas una fila por lado daría
      // oficinas demasiado estrechas (cajas macizas sin interior), así que se
      // fusionan en UNA fila que ocupa todo el fondo (torre profunda con interior).
      const nOpen = !removedRoadSegment(parkOnly, 'h', bj, bi);
      const sOpen = !removedRoadSegment(parkOnly, 'h', bj + 1, bi);
      const wOpen = !removedRoadSegment(parkOnly, 'v', bi, bj);
      const eOpen = !removedRoadSegment(parkOnly, 'v', bi + 1, bj);
      // Eje vertical (filas a lo largo de X, fondo en Z).
      placePair(rng, buildings, spec, district, buildable, clearances, typeCount, 'N', 'S', x0, x1, nZ, sZ, halfZ, z1 - z0, nOpen, sOpen);
      // Eje horizontal (filas a lo largo de Z, fondo en X).
      placePair(rng, buildings, spec, district, buildable, clearances, typeCount, 'W', 'E', z0, z1, wX, eX, halfX, x1 - x0, wOpen, eOpen);

      // Patio/jardín interior. Los edificios de esta manzana ya están colocados
      // (placeSide arriba), así que los árboles esquivan sus huellas.
      // Las manzanas con cualquier edificio llevan patio de asfalto en el render:
      // ahí no se plantan árboles (solo crecen en zonas verdes residenciales).
      const blockBuildings = buildings.filter((b) => b.x > x0 - 2 && b.x < x1 + 2 && b.z > z0 - 2 && b.z < z1 + 2);
      const asphaltYard =
        blockBuildings.length > 0 && blockBuildings.some((b) => buildingFactories[b.type].courtyardKind !== 'green');
      const inner = Math.min(halfX, halfZ) * 0.55;
      if (!asphaltYard && inner > 3) {
        scatterTrees(rng, trees, (wX + eX) / 2 - inner, (nZ + sZ) / 2 - inner, inner * 2, inner * 2, spec.courtyard, buildings);
      }
    }
  }

  // Setos del perímetro del parque: una corona continua que rodea TODO el parque
  // (ya fundido), como las vallas rodean cada casa.
  addParkPerimeterHedges(rng, hedges, plan.park);

  // Zona de juego infantil dentro del parque grande. RNG propio (semilla aparte)
  // para no consumir el RNG principal: añadir juegos NO altera el resto de la ciudad.
  const playItems: PlayItem[] = [];
  const playgrounds: Playground[] = [];
  addPlaygrounds(new Rng(seed + 31), playItems, playgrounds, plan.park, trees);

  // Bancos del parque: se descartan los provisionales por-manzana y se rehacen como
  // dos anillos que SIEMPRE miran al interior — uno perimetral pegado a los setos y
  // otro alrededor de cada zona de juego. RNG propio: no altera el resto de la ciudad.
  benches.length = 0;
  rebuildParkBenches(new Rng(seed + 41), benches, trees, plan.park, playgrounds);

  // Anillo exterior de árboles alrededor de la ciudad.
  const extentX = roadX(g - 1) + CORRIDOR_HALF + 6;
  const extentZ = roadZ(g - 1) + CORRIDOR_HALF + 6;
  for (let k = 0; k < 90; k++) {
    const side = rng.int(0, 4);
    const off = rng.range(2, 20);
    const [x, z] =
      side === 0 ? [rng.range(-extentX, extentX), -extentZ - off]
      : side === 1 ? [rng.range(-extentX, extentX), extentZ + off]
      : side === 2 ? [-extentX - off, rng.range(-extentZ, extentZ)]
      : [extentX + off, rng.range(-extentZ, extentZ)];
    trees.push(makeTree(rng, x, z));
  }

  for (let id = 0; id < buildings.length; id++) buildings[id].id = id;

  return {
    intersections,
    edges,
    outgoing,
    buildings,
    trees,
    hedges,
    benches,
    playItems,
    playgrounds,
    blocks,
    halfExtent: Math.max(extentX, extentZ) + 20,
    park: plan.park,
    mergedBlocks: plan.mergedBlocks,
    crosswalks: buildCrosswalks(new Rng(seed + 5), roundabouts, closedRects),
    roundabouts,
  };
}

/**
 * Máscara de pasos de cebra: no todos los cruces los tienen en sus 4 lados.
 * Determinista (semilla propia para no alterar el resto de la generación).
 */
function buildCrosswalks(rng: Rng, roundabouts: Set<number>, closedRects: readonly ParkRect[]): Set<number> {
  const g = CITY.grid;
  const set = new Set<number>();
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      if (roundabouts.has(intersectionId(i, j))) continue; // las rotondas no tienen pasos
      if (removedInteriorNode(closedRects, i, j)) continue; // dentro de areas fusionadas no hay calles
      for (const axis of ['NS', 'EW'] as RoadAxis[]) {
        for (const side of [-1, 1]) {
          // El paso cruza una carretera concreta: solo existe si ese tramo existe.
          // 'NS' cruza la vertical (línea i) por el lado norte/sur; 'EW' la
          // horizontal (línea j) por el lado oeste/este.
          const removed =
            axis === 'NS'
              ? removedRoadSegment(closedRects, 'v', i, side < 0 ? j - 1 : j)
              : removedRoadSegment(closedRects, 'h', j, side < 0 ? i - 1 : i);
          if (removed) continue;
          if (rng.next() < 0.72) set.add(crosswalkKey(i, j, axis, side));
        }
      }
    }
  }
  return set;
}

function buildClearanceCircles(intersections: Intersection[], roundabouts: Set<number>): ClearanceCircle[] {
  const r = ROUNDABOUT_RADIUS + CITY.roadHalf + CITY.sidewalkWidth + SETBACK + 0.6;
  const out: ClearanceCircle[] = [];
  for (const id of roundabouts) {
    const n = intersections[id];
    if (n.i >= 0) out.push({ x: n.x, z: n.z, r });
  }
  return out;
}

/* ── Rotondas ──────────────────────────────────────────────────────────────
 * Unas pocas intersecciones interiores (no en los bulevares curvos) se
 * convierten en rotonda: nodos de brazo sobre un círculo, anillo curvo de
 * sentido único, y los brazos reconectados a los nodos del anillo.
 */
const MAX_ROUNDABOUTS = 4;
const RING_ARC_SAMPLES = 6;

function buildRoundabouts(
  rng: Rng,
  intersections: Intersection[],
  edges: RoadEdge[],
  outgoing: number[][],
  trees: Tree[],
  roundabouts: Set<number>,
): void {
  const g = CITY.grid;
  // Nodos tocados por curvas: se excluyen para no mezclar bulevar y rotonda.
  const curveTouched = new Set<number>();
  for (const e of edges) if (e.curve) curveTouched.add(e.from), curveTouched.add(e.to);

  const candidates = intersections.filter(
    (n) => n.i >= 1 && n.i <= g - 2 && n.j >= 1 && n.j <= g - 2 && !curveTouched.has(n.id) && outgoing[n.id].length >= 4,
  );
  // Barajado determinista.
  for (let k = candidates.length - 1; k > 0; k--) {
    const r = rng.int(0, k + 1);
    [candidates[k], candidates[r]] = [candidates[r], candidates[k]];
  }

  const chosen: Intersection[] = [];
  for (const c of candidates) {
    if (chosen.length >= MAX_ROUNDABOUTS) break;
    if (chosen.some((o) => Math.abs(o.i - c.i) + Math.abs(o.j - c.j) <= 2)) continue; // no adyacentes
    chosen.push(c);
  }
  for (const c of chosen) makeRoundabout(c, intersections, edges, outgoing, trees, roundabouts);
}

function makeRoundabout(
  center: Intersection,
  intersections: Intersection[],
  edges: RoadEdge[],
  outgoing: number[][],
  trees: Tree[],
  roundabouts: Set<number>,
): void {
  const R = ROUNDABOUT_RADIUS;
  roundabouts.add(center.id);

  const armByKey = new Map<string, number>();
  const getArm = (dx: number, dz: number): number => {
    const key = `${dx},${dz}`;
    const existing = armByKey.get(key);
    if (existing !== undefined) return existing;
    const id = intersections.length;
    intersections.push({ id, i: -1, j: -1, x: center.x + dx * R, z: center.z + dz * R });
    outgoing.push([]);
    roundabouts.add(id);
    armByKey.set(key, id);
    return id;
  };

  // Reconecta brazos entrantes (vecino→centro) y salientes (centro→vecino) a los nodos de anillo.
  for (const e of edges) {
    if (e.to === center.id) {
      const arm = getArm(-e.dirX, -e.dirZ); // lado del vecino
      e.to = arm;
      e.length = dist(intersections[e.from], intersections[arm]);
    } else if (e.from === center.id) {
      const arm = getArm(e.dirX, e.dirZ);
      e.from = arm;
      const idx = outgoing[center.id].indexOf(e.id);
      if (idx >= 0) outgoing[center.id].splice(idx, 1);
      outgoing[arm].push(e.id);
      e.length = dist(intersections[arm], intersections[e.to]);
    }
  }

  // Anillo de sentido unico: al entrar desde cualquier brazo, el coche gira a la derecha.
  const arms = [...armByKey.values()]
    .map((id) => ({ id, ang: Math.atan2(intersections[id].z - center.z, intersections[id].x - center.x) }))
    .sort((a, b) => a.ang - b.ang);
  const ringByTo = new Map<number, number>();
  for (let k = 0; k < arms.length; k++) {
    const a = intersections[arms[k].id];
    const b = intersections[arms[(k - 1 + arms.length) % arms.length].id];
    const e = makeRingEdge(a, b, center, edges.length);
    edges.push(e);
    outgoing[a.id].push(e.id);
    ringByTo.set(b.id, e.id);
  }
  // Las entradas ceden el paso al anillo que llega a su nodo de brazo.
  for (const e of edges) {
    if (e.yieldTo === undefined && ringByTo.has(e.to) && e.curve === undefined && e.from !== center.id) {
      // arista entrante de un vecino (recta) que termina en un nodo de brazo
      if (intersections[e.from].i >= 0) e.yieldTo = ringByTo.get(e.to);
    }
  }

  // Isla central ajardinada.
  trees.push(makeTree(rng2(center.id), center.x, center.z, true, 'island'));
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2;
    trees.push(makeTree(rng2(center.id * 7 + k), center.x + Math.cos(ang) * 3, center.z + Math.sin(ang) * 3, false, 'island'));
  }
}

/** Arco de circunferencia horario de A a B alrededor del centro, como arista curva. */
function makeRingEdge(a: Intersection, b: Intersection, center: Intersection, id: number): RoadEdge {
  const r = dist(center, a);
  const ang0 = Math.atan2(a.z - center.z, a.x - center.x);
  const ang1 = Math.atan2(b.z - center.z, b.x - center.x);
  let d = ang1 - ang0;
  while (d >= -0.001) d -= Math.PI * 2;
  const pts: Vec2[] = [];
  for (let k = 0; k <= RING_ARC_SAMPLES; k++) {
    const ang = ang0 + (d * k) / RING_ARC_SAMPLES;
    pts.push({ x: center.x + Math.cos(ang) * r, z: center.z + Math.sin(ang) * r });
  }
  const curve = buildEdgeCurve(pts);
  // Tangente inicial horaria: perpendicular al radio.
  const tx = Math.sin(ang0);
  const tz = -Math.cos(ang0);
  return {
    id,
    from: a.id,
    to: b.id,
    dirX: tx,
    dirZ: tz,
    axis: Math.abs(tx) > Math.abs(tz) ? 'EW' : 'NS',
    length: curve.cum[curve.cum.length - 1],
    curve,
  };
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Posiciones centradas en el origen a partir de los huecos entre líneas. */
function axisPositions(gaps: number[]): number[] {
  const pos = [0];
  for (const gap of gaps) pos.push(pos[pos.length - 1] + gap);
  const mid = (pos[0] + pos[pos.length - 1]) / 2;
  return pos.map((p) => p - mid);
}

/** Plan urbano por semilla: trazado, parque y zonas de densidad variables. */
function makeCityPlan(rng: Rng): CityPlan {
  const parkW = rng.weighted([2, 4, 3, 1]) + 1;
  const parkH = rng.weighted([2, 4, 3, 1]) + 1;
  const park: ParkPatch = {
    bi0: rng.int(0, CITY.grid - parkW),
    bj0: rng.int(0, CITY.grid - parkH),
    w: parkW,
    h: parkH,
  };
  const mergedBlocks = makeMergedBlocks(rng, park);

  return {
    xGaps: makeAxisGaps(rng, park.bi0, park.w),
    zGaps: makeAxisGaps(rng, park.bj0, park.h),
    park,
    mergedBlocks,
    dense: makeDistrictAnchors(rng, park, rng.int(1, 4), [1.4, 2.6]),
    residential: makeDistrictAnchors(rng, park, rng.int(1, 4), [1.6, 3.0]),
    noiseSeed: rng.int(1, 0x7fffffff),
  };
}

function makeMergedBlocks(rng: Rng, park: ParkPatch): MergeRect[] {
  const out: MergeRect[] = [];
  const target = rng.int(3, 6);
  const shapes: Array<[number, number]> = [
    [2, 1],
    [1, 2],
    [2, 1],
    [1, 2],
    [2, 2],
  ];
  for (let attempt = 0; attempt < 80 && out.length < target; attempt++) {
    const [w, h] = rng.pick(shapes);
    const rect: MergeRect = {
      bi0: rng.int(0, CITY.grid - w),
      bj0: rng.int(0, CITY.grid - h),
      w,
      h,
    };
    if (rectTouches(rect, park, 0)) continue;
    if (out.some((r) => rectTouches(rect, r, 0))) continue;
    out.push(rect);
  }
  return out;
}

function makeAxisGaps(rng: Rng, parkStart: number, parkSize: number): number[] {
  const gaps: number[] = [];
  for (let i = 0; i < CITY.grid - 1; i++) {
    const base = rng.next() < 0.22 ? rng.range(24, 31) : rng.range(30, 44);
    gaps.push(Math.round(base));
  }

  const avenueCandidates = [parkStart - 1, parkStart, parkStart + parkSize - 1, parkStart + parkSize].filter((i) => i >= 0 && i < gaps.length);
  const avenueCount = rng.next() < 0.55 ? 2 : 1;
  for (let k = 0; k < avenueCount; k++) {
    const idx = avenueCandidates.length && rng.next() < 0.75 ? rng.pick(avenueCandidates) : rng.int(0, gaps.length);
    gaps[idx] = Math.round(rng.range(48, 64));
  }
  return gaps;
}

function makeDistrictAnchors(rng: Rng, park: ParkPatch, count: number, radius: [number, number]): DistrictAnchor[] {
  const anchors: DistrictAnchor[] = [];
  for (let k = 0; k < count; k++) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const bi = rng.int(0, CITY.grid - 1);
      const bj = rng.int(0, CITY.grid - 1);
      if (insidePark(park, bi, bj)) continue;
      anchors.push({ bi, bj, radius: rng.range(radius[0], radius[1]) });
      break;
    }
  }
  return anchors;
}

function districtAt(plan: CityPlan, bi: number, bj: number): District {
  if (insidePark(plan.park, bi, bj)) return 'park';

  const noise = (cellNoise(plan.noiseSeed, bi, bj) - 0.5) * 0.7;
  const denseScore = bestAnchorScore(plan.dense, bi, bj) + noise;
  const residentialScore = bestAnchorScore(plan.residential, bi, bj) - noise * 0.6;
  if (denseScore > residentialScore && denseScore > -0.2) return 'dense';
  if (residentialScore > denseScore && residentialScore > -0.2) return 'residential';
  return 'mixed';
}

function insidePark(park: ParkPatch, bi: number, bj: number): boolean {
  return bi >= park.bi0 && bi < park.bi0 + park.w && bj >= park.bj0 && bj < park.bj0 + park.h;
}

function rectTouches(a: ParkPatch, b: ParkPatch, pad: number): boolean {
  return (
    a.bi0 < b.bi0 + b.w + pad &&
    a.bi0 + a.w + pad > b.bi0 &&
    a.bj0 < b.bj0 + b.h + pad &&
    a.bj0 + a.h + pad > b.bj0
  );
}

function bestAnchorScore(anchors: DistrictAnchor[], bi: number, bj: number): number {
  let best = -Infinity;
  for (const a of anchors) {
    const d = Math.hypot(bi - a.bi, bj - a.bj);
    best = Math.max(best, a.radius - d);
  }
  return best;
}

function cellNoise(seed: number, bi: number, bj: number): number {
  let n = (seed ^ Math.imul(bi + 11, 374761393) ^ Math.imul(bj + 17, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Líneas de carretera vertical convertidas en bulevares serpenteantes. */
const ENABLE_CURVED_BOULEVARDS = false; // guardado para retomarlo cuando el trazado curvo esté listo
const BOULEVARD_LINES = [3, 4];
const BOW = 7; // amplitud de la curva hacia el parque
const CURVE_SAMPLES = 16;

/** Curva las aristas verticales de los bulevares (dentro del parque, ambos sentidos). */
function applyCurvedBoulevards(intersections: Intersection[], edges: RoadEdge[]): void {
  for (const e of edges) {
    const a = intersections[e.from];
    const b = intersections[e.to];
    if (a.i !== b.i || Math.abs(a.j - b.j) !== 1) continue; // solo tramos verticales
    if (!BOULEVARD_LINES.includes(a.i)) continue;
    const loj = Math.min(a.j, b.j);
    if (loj < 1 || loj > 4) continue; // solo dentro del parque
    // Serpentea: alterna el lado por fila y por línea → eses suaves, tangente vertical en los nodos.
    const sign = (loj % 2 === 0 ? 1 : -1) * (a.i === 3 ? 1 : -1);
    e.curve = makeBoulevardCurve(a, b, sign * BOW);
    e.length = e.curve.cum[e.curve.cum.length - 1];
  }
}

/** Lóbulo simétrico (1-cos) en X: sale y vuelve al eje, con tangente vertical en ambos extremos. */
function makeBoulevardCurve(a: Intersection, b: Intersection, bow: number): EdgeCurve {
  const pts: Vec2[] = [];
  for (let k = 0; k <= CURVE_SAMPLES; k++) {
    const t = k / CURVE_SAMPLES;
    pts.push({
      x: a.x + (bow * (1 - Math.cos(2 * Math.PI * t))) / 2,
      z: a.z + (b.z - a.z) * t,
    });
  }
  return buildEdgeCurve(pts);
}

/**
 * Coloca el par de lados OPUESTOS de una manzana (`sideA`/`sideB`), que comparten
 * el fondo en un eje. Normalmente coloca una fila por lado con medio fondo
 * (`halfPerp`). Pero si la manzana es tan poco profunda que las oficinas saldrían
 * macizas (fondo de fila < `OFFICE_MIN_DEPTH`) y el distrito usa oficinas, fusiona
 * las dos filas en UNA que ocupa TODO el fondo (`fullPerp`): así la torre tiene
 * fondo de sobra para su interior. La fila fusionada mira a la calle abierta.
 */
function placePair(
  rng: Rng,
  buildings: Building[],
  spec: DistrictSpec,
  district: Exclude<District, 'park'>,
  buildable: BuildableRect,
  clearances: ClearanceCircle[],
  typeCount: Record<BuildingType, number>,
  sideA: SideTag,
  sideB: SideTag,
  a0: number,
  a1: number,
  lineA: number,
  lineB: number,
  halfPerp: number,
  fullPerp: number,
  aOpen: boolean,
  bOpen: boolean,
): void {
  const rowMaxDepth = halfPerp - SETBACK - 0.5;
  const fullMaxDepth = fullPerp - SETBACK - 0.5;
  const usesOffices = spec.types[2] >= 0.3;
  // Margen pequeño sobre el mínimo para no quedar justos en el filo del umbral.
  const wouldBeMacizo = rowMaxDepth < OFFICE_MIN_DEPTH;
  const fitsMerged = fullMaxDepth >= OFFICE_MIN_DEPTH + 0.3;
  if (usesOffices && wouldBeMacizo && fitsMerged && (aOpen || bOpen)) {
    if (aOpen) placeSide(rng, buildings, spec, sideA, a0, a1, fullPerp, lineA, district, buildable, clearances, typeCount);
    else placeSide(rng, buildings, spec, sideB, a0, a1, fullPerp, lineB, district, buildable, clearances, typeCount);
    return;
  }
  if (aOpen) placeSide(rng, buildings, spec, sideA, a0, a1, halfPerp, lineA, district, buildable, clearances, typeCount);
  if (bOpen) placeSide(rng, buildings, spec, sideB, a0, a1, halfPerp, lineB, district, buildable, clearances, typeCount);
}

/**
 * Coloca una fila de edificios a lo largo de un lado de la manzana, mirando a su
 * calle. `a0..a1` es el rango a lo largo de la calle; `perpRoom`, el fondo
 * disponible hacia el interior; `roadLine`, la coordenada del eje de la calle.
 */
function placeSide(
  rng: Rng,
  buildings: Building[],
  spec: DistrictSpec,
  side: SideTag,
  a0: number,
  a1: number,
  perpRoom: number,
  roadLine: number,
  district: Exclude<District, 'park'>,
  buildable: BuildableRect,
  clearances: ClearanceCircle[],
  typeCount: Record<BuildingType, number>,
): void {
  const lo = a0 + SIDE_INSET;
  const hi = a1 - SIDE_INSET;
  if (hi - lo < 5) return; // tramo demasiado corto
  // La fachada arranca a SETBACK del borde edificable; el fondo llega hasta la
  // mitad de la manzana para no chocar con la fila del lado opuesto.
  const maxDepth = perpRoom - SETBACK - 0.5;
  if (maxDepth < 2.5) return; // sin fondo para construir

  const count = Math.min(8, Math.max(1, Math.ceil((hi - lo) / spec.parcel)));
  const seg = (hi - lo) / count;
  for (let k = 0; k < count; k++) {
    const center = lo + seg * (k + 0.5);
    const factory = pickFactory(rng, spec.types);
    const b = factory.build(rng, {
      side,
      center,
      segLen: seg,
      maxDepth,
      roadLine,
      district,
      spec,
      buildable,
      clearances,
      buildings,
      typeCount,
    });
    if (b) buildings.push(b);
  }
}

/** Rellena una manzana-parque con arbolado denso, setos y bancos. */
function fillPark(
  rng: Rng,
  trees: Tree[],
  benches: Bench[],
  plan: CityPlan,
  bi: number,
  bj: number,
  wX: number,
  eX: number,
  nZ: number,
  sZ: number,
): void {
  const p = plan.park;
  // En los lados que dan a OTRA manzana-parque la calle se ha eliminado: el
  // verde se extiende hasta la línea de carretera para cubrir el corredor y
  // fundirse con el bloque vecino. En los lados que dan a una calle real se
  // mantiene la separación con la acera.
  const x0 = bi > p.bi0 ? wX : wX + CORRIDOR_HALF + GREEN_STREET_CLEARANCE;
  const x1 = bi < p.bi0 + p.w - 1 ? eX : eX - CORRIDOR_HALF - GREEN_STREET_CLEARANCE;
  const z0 = bj > p.bj0 ? nZ : nZ + CORRIDOR_HALF + GREEN_STREET_CLEARANCE;
  const z1 = bj < p.bj0 + p.h - 1 ? sZ : sZ - CORRIDOR_HALF - GREEN_STREET_CLEARANCE;
  if (x1 <= x0 || z1 <= z0) return;
  const area = (x1 - x0) * (z1 - z0);
  const firstBench = benches.length;
  // Bancos PROVISIONALES por manzana: los árboles de abajo los esquivan (dejan
  // claros) y consumen el RNG principal exactamente como siempre. El conjunto
  // final de bancos se reconstruye después en `rebuildParkBenches` (dos anillos
  // mirando al interior), así que estos se descartan: NO tocar para no resembrar.
  placeProvisionalParkBenches(rng, benches, x0, x1, z0, z1, area);
  const count = Math.round(area / 80);
  // Despeja la franja por la que serpentea cada bulevar cuando se reactive.
  const clear = CORRIDOR_HALF + BOW + 1;
  for (let k = 0; k < count; k++) {
    let placed = false;
    for (let attempt = 0; attempt < 5 && !placed; attempt++) {
      const x = rng.range(x0, x1);
      const z = rng.range(z0, z1);
      if (ENABLE_CURVED_BOULEVARDS && BOULEVARD_LINES.some((i) => Math.abs(x - roadX(i)) < clear)) continue;
      if (benches.slice(firstBench).some((b) => Math.hypot(b.x - x, b.z - z) < 4.5)) continue;
      const t = makeTree(rng, x, z, true, 'park');
      if (!treeFitsGrassRect(t, x0, x1, z0, z1)) continue;
      trees.push(t);
      placed = true;
    }
  }
}

/** Corona continua de setos alrededor de todo el parque (ya fundido en uno). */
function addParkPerimeterHedges(rng: Rng, hedges: Hedge[], p: ParkRect): void {
  const x0 = roadX(p.bi0) + CORRIDOR_HALF + GREEN_STREET_CLEARANCE;
  const x1 = roadX(p.bi0 + p.w) - CORRIDOR_HALF - GREEN_STREET_CLEARANCE;
  const z0 = roadZ(p.bj0) + CORRIDOR_HALF + GREEN_STREET_CLEARANCE;
  const z1 = roadZ(p.bj0 + p.h) - CORRIDOR_HALF - GREEN_STREET_CLEARANCE;
  if (x1 <= x0 || z1 <= z0) return;
  addParkHedges(rng, hedges, x0, x1, z0, z1, { n: true, s: true, w: true, e: true });
}

function addParkHedges(
  rng: Rng,
  hedges: Hedge[],
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  sides: { n: boolean; s: boolean; w: boolean; e: boolean },
): void {
  const inset = 1.4;
  const gap = 4.8; // hueco en esquinas y para que el parque no parezca una caja cerrada.
  if (sides.n) addHedgeRun(rng, hedges, x0 + gap, z0 + inset, x1 - gap, z0 + inset);
  if (sides.s) addHedgeRun(rng, hedges, x0 + gap, z1 - inset, x1 - gap, z1 - inset);
  if (sides.w) addHedgeRun(rng, hedges, x0 + inset, z0 + gap, x0 + inset, z1 - gap);
  if (sides.e) addHedgeRun(rng, hedges, x1 - inset, z0 + gap, x1 - inset, z1 - gap);
}

function addHedgeRun(rng: Rng, hedges: Hedge[], ax: number, az: number, bx: number, bz: number): void {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 3) return;
  const ux = dx / len;
  const uz = dz / len;
  const heading = Math.atan2(ux, uz);
  const step = 5.4;
  const count = Math.max(1, Math.floor(len / step));
  for (let k = 0; k < count; k++) {
    const start = (k / count) * len;
    const end = ((k + 1) / count) * len - 0.35;
    const segLen = Math.max(2.0, end - start);
    const mid = start + segLen / 2;
    hedges.push({
      x: ax + ux * mid,
      z: az + uz * mid,
      w: 1.1 + rng.range(-0.12, 0.12),
      d: segLen,
      heading,
      shade: rng.int(0, 4),
    });
  }
}

/**
 * Bancos provisionales repartidos por una manzana-parque. Su única función hoy es
 * que el scatter de árboles deje claros a su alrededor y que el RNG principal
 * avance igual que siempre; el conjunto final de bancos lo fija `rebuildParkBenches`.
 */
function placeProvisionalParkBenches(rng: Rng, benches: Bench[], x0: number, x1: number, z0: number, z1: number, area: number): void {
  if (x1 - x0 < 13 || z1 - z0 < 13) return;
  const count = Math.max(2, Math.min(6, Math.round(area / 520)));
  const start = benches.length;
  for (let k = 0; k < count; k++) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const inset = rng.range(3.2, 5.6);
      const side = rng.int(0, 4);
      let x = 0;
      let z = 0;
      let heading = 0;
      if (side === 0) {
        x = rng.range(x0 + 5, x1 - 5);
        z = z0 + inset;
        heading = Math.PI;
      } else if (side === 1) {
        x = rng.range(x0 + 5, x1 - 5);
        z = z1 - inset;
        heading = 0;
      } else if (side === 2) {
        x = x0 + inset;
        z = rng.range(z0 + 5, z1 - 5);
        heading = -Math.PI / 2;
      } else {
        x = x1 - inset;
        z = rng.range(z0 + 5, z1 - 5);
        heading = Math.PI / 2;
      }
      if (ENABLE_CURVED_BOULEVARDS && BOULEVARD_LINES.some((i) => Math.abs(x - roadX(i)) < CORRIDOR_HALF + BOW + 2)) continue;
      if (benches.slice(start).some((b) => Math.hypot(b.x - x, b.z - z) < 7)) continue;
      benches.push({ x, z, heading, shade: rng.int(0, 3) });
      break;
    }
  }
}

/** Tamaño objetivo de la zona de juego (X × Z) y holgura mínima requerida en el parque. */
const PLAYGROUND_W = 26;
const PLAYGROUND_D = 17;

/**
 * Coloca una zona de juego infantil dentro del parque grande, si hay sitio. Carva
 * un rectángulo de césped (eliminando árboles que caigan dentro) y dispone los
 * juegos con una distribución fija escalada al rectángulo: columpios al fondo,
 * tobogán a un lado, la rueda giratoria al centro y caballitos delante. Los bancos
 * que rodean la zona los pone después `rebuildParkBenches`.
 */
function addPlaygrounds(
  rng: Rng,
  playItems: PlayItem[],
  playgrounds: Playground[],
  park: ParkRect,
  trees: Tree[],
): void {
  // Interior útil del parque (dentro de la corona de setos).
  const margin = CORRIDOR_HALF + GREEN_STREET_CLEARANCE + 3.5;
  const ix0 = roadX(park.bi0) + margin;
  const ix1 = roadX(park.bi0 + park.w) - margin;
  const iz0 = roadZ(park.bj0) + margin;
  const iz1 = roadZ(park.bj0 + park.h) - margin;
  if (ix1 - ix0 < PLAYGROUND_W || iz1 - iz0 < PLAYGROUND_D) return; // parque pequeño: sin zona de juego

  // Centro de la zona, con jitter dentro del margen disponible.
  const cx = rng.range(ix0 + PLAYGROUND_W / 2, ix1 - PLAYGROUND_W / 2);
  const cz = rng.range(iz0 + PLAYGROUND_D / 2, iz1 - PLAYGROUND_D / 2);
  const hw = PLAYGROUND_W / 2;
  const hd = PLAYGROUND_D / 2;
  const x0 = cx - hw;
  const x1 = cx + hw;
  const z0 = cz - hd;
  const z1 = cz + hd;
  playgrounds.push({ x0, z0, x1, z1 });

  // Despeja el rectángulo: nada de árboles dentro de la zona de juego.
  const clearPad = 1.5;
  const inside = (x: number, z: number) => x > x0 - clearPad && x < x1 + clearPad && z > z0 - clearPad && z < z1 + clearPad;
  for (let k = trees.length - 1; k >= 0; k--) if (inside(trees[k].x, trees[k].z)) trees.splice(k, 1);

  // Distribución fija (fracción del semieje), con leve jitter. heading mira a +Z.
  const add = (kind: PlayKind, fx: number, fz: number, heading: number) =>
    playItems.push(makePlayItem(rng, kind, cx + fx * hw + rng.range(-0.6, 0.6), cz + fz * hd + rng.range(-0.6, 0.6), heading));

  add('swing', -0.34, -0.5, 0); // columpios al fondo, mirando al frente
  add('slide', 0.52, -0.28, -Math.PI / 2); // tobogán a la derecha, bajando hacia el centro
  add('carousel', -0.02, 0.08, 0); // la rueda giratoria, al centro
  add('spring', -0.5, 0.55, Math.PI); // caballitos delante, mirando atrás
  add('spring', -0.02, 0.62, Math.PI);
  add('spring', 0.46, 0.55, Math.PI);
}

/**
 * Construye TODOS los bancos del parque como dos anillos que miran SIEMPRE al
 * interior (respaldo hacia fuera):
 *  - un anillo PERIMETRAL pegado a la corona de setos, repartido por los cuatro
 *    lados con huecos en las esquinas;
 *  - un anillo alrededor de cada zona de juego, un banco por lado mirando al centro.
 * Limpia los árboles que pise cada banco. Usa un RNG propio: reconstruir los bancos
 * no altera el resto de la ciudad.
 */
function rebuildParkBenches(rng: Rng, benches: Bench[], trees: Tree[], park: ParkRect, playgrounds: Playground[]): void {
  const x0 = roadX(park.bi0) + CORRIDOR_HALF + GREEN_STREET_CLEARANCE;
  const x1 = roadX(park.bi0 + park.w) - CORRIDOR_HALF - GREEN_STREET_CLEARANCE;
  const z0 = roadZ(park.bj0) + CORRIDOR_HALF + GREEN_STREET_CLEARANCE;
  const z1 = roadZ(park.bj0 + park.h) - CORRIDOR_HALF - GREEN_STREET_CLEARANCE;
  if (x1 <= x0 || z1 <= z0) return;

  const clearTrees = (bx: number, bz: number) => {
    for (let k = trees.length - 1; k >= 0; k--) if (Math.hypot(trees[k].x - bx, trees[k].z - bz) < 2.6) trees.splice(k, 1);
  };
  const onPlayground = (bx: number, bz: number) =>
    playgrounds.some((p) => bx > p.x0 - 2 && bx < p.x1 + 2 && bz > p.z0 - 2 && bz < p.z1 + 2);
  const place = (bx: number, bz: number, heading: number) => {
    clearTrees(bx, bz);
    benches.push({ x: bx, z: bz, heading, shade: rng.int(0, 3) });
  };

  // ── Anillo perimetral: respaldo al seto, frente al interior del parque ──
  // heading mira a -Z local; PI→+Z, 0→-Z, -PI/2→+X, PI/2→-X (siempre hacia dentro).
  const inset = 2.6; // hacia dentro desde la corona de setos
  const corner = 7; // hueco en las esquinas
  const spacing = 16; // separación objetivo entre bancos del perímetro
  const run = (from: number, to: number, fixed: number, horizontal: boolean, heading: number) => {
    const a = from + corner;
    const b = to - corner;
    const span = b - a;
    const count = span > 0 ? Math.max(1, Math.round(span / spacing)) : 1;
    for (let k = 0; k < count; k++) {
      const pos = span > 0 ? a + ((k + 0.5) / count) * span : (from + to) / 2;
      const bx = horizontal ? pos : fixed;
      const bz = horizontal ? fixed : pos;
      if (onPlayground(bx, bz)) continue; // un banco perimetral no aterriza sobre la zona de juego
      place(bx, bz, heading);
    }
  };
  run(x0, x1, z0 + inset, true, Math.PI); // norte
  run(x0, x1, z1 - inset, true, 0); // sur
  run(z0, z1, x0 + inset, false, -Math.PI / 2); // oeste
  run(z0, z1, x1 - inset, false, Math.PI / 2); // este

  // ── Anillo alrededor de cada zona de juego: un banco por lado mirando al centro ──
  const gap = 1.9; // justo fuera del bordillo
  for (const p of playgrounds) {
    const pcx = (p.x0 + p.x1) / 2;
    const pcz = (p.z0 + p.z1) / 2;
    const sites: Array<[number, number]> = [
      [pcx, p.z0 - gap],
      [pcx, p.z1 + gap],
      [p.x0 - gap, pcz],
      [p.x1 + gap, pcz],
    ];
    // El banco mira a -Z local, así que heading = atan2(bx-pcx, bz-pcz) lo orienta al centro.
    for (const [bx, bz] of sites) place(bx, bz, Math.atan2(bx - pcx, bz - pcz));
  }
}

function scatterTrees(
  rng: Rng,
  trees: Tree[],
  x0: number,
  z0: number,
  w: number,
  d: number,
  count: number,
  avoid?: Building[],
): void {
  for (let k = 0; k < count; k++) {
    // Varios intentos: si el árbol pisaría un edificio, se reubica; si tras
    // unos cuantos sigue chocando, se descarta (mejor sin árbol que solapado).
    for (let attempt = 0; attempt < 8; attempt++) {
      const t = makeTree(rng, rng.range(x0, x0 + w), rng.range(z0, z0 + d));
      if (!treeFitsGrassRect(t, x0, x0 + w, z0, z0 + d)) continue;
      if (!avoid || treeClearsBuildings(t, avoid)) {
        trees.push(t);
        break;
      }
    }
  }
}

/** ¿La copa del árbol queda libre de toda huella de edificio (con margen)? */
function treeClearsBuildings(t: Tree, buildings: Building[]): boolean {
  const margin = t.r + 0.3; // la copa (radio r) no debe tocar el muro
  for (const b of buildings) {
    const dx = Math.max(Math.abs(t.x - b.x) - b.w / 2, 0);
    const dz = Math.max(Math.abs(t.z - b.z) - b.d / 2, 0);
    if (dx * dx + dz * dz < margin * margin) return false;
  }
  return true;
}
