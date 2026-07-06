import * as THREE from 'three';
import {
  CITY,
  CORRIDOR_HALF,
  ROUNDABOUT_OUT,
  ROUNDABOUT_RADIUS,
  ROUNDABOUT_SW_R,
  SIDEWALK_CENTER,
  crosswalkKey,
  intersectionId,
  removedInteriorNode,
  removedRoadSegment,
  roadX,
  roadZ,
  type Bench,
  type CityModel,
  type EdgeCurve,
  type Hedge,
  type Intersection,
  type Vec2,
} from '../city/CityModel';
import { buildingFactories } from '../city/buildings/registry';
import { officeShaft, stairLayout, type OfficeShaft } from '../city/buildings/interior/stairGeometry';
import type { BuildingGeom, BuildingRenderCtx, BuildingRenderHelpers, RenderBuckets, RenderFurniture, SlidingDoorPose } from './buildings/BuildingRenderer';
import { buildingRenderers } from './buildings/renderRegistry';
import type { TreeRenderBuckets, TreeRenderCtx, TreeRenderHelpers } from './vegetation/TreeRenderer';
import { treeRenderers } from './vegetation/treeRenderRegistry';
import type { PlayRenderBuckets, PlayRenderCtx, PlayRenderHelpers, RenderPlayItem } from './park/PlayRenderer';
import { playRenderers } from './park/playRenderRegistry';
import { buildFloorLamps, type FloorLampController, type LampShade, type LampShadeGeo } from './FloorLamps';

const BUILDING_PALETTES: Record<string, number[]> = {
  house: [0xe8c8a9, 0xd9a38b, 0xc9d4b0, 0xe6d9b8, 0xd4b8c4, 0xbfd0d9],
  shop: [0xf2b3a7, 0xa7d3f2, 0xf2e3a7, 0xb8e0c2, 0xe0b8d9, 0xf2cfa7],
  office: [0x9fb4c7, 0x8da6bd, 0xb0bec9, 0xa3b8b0, 0x97a8c4, 0xb5c2d6],
  // Supermercado: tonos claros de nave comercial (blancos rotos y grises cálidos).
  supermarket: [0xeceae4, 0xe4dccb, 0xdfe3e6, 0xe8e2d4, 0xd8dee2, 0xeae4da],
};
const AWNING_COLORS = [0xd94f4f, 0x3f7fbf, 0x3fa66b, 0xe0a030, 0x9b59b6, 0xe06c9f];
const ROOF_COLORS = [0x914f3e, 0x6f7880, 0x40515f, 0xb06a45, 0x596567, 0x8a5a44];
const SIGN_COLORS = [0x284b63, 0x7a3b45, 0x326b52, 0x8b5a2b, 0x4d4b82, 0x7a456a];
const RUG_COLORS = [0xb0573f, 0x4f6f8f, 0x3f7f5f, 0x9a7b3f, 0x7a4f6f];
const UPHOLSTERY_COLORS = [0x6f7884, 0x4f6478, 0x55705a, 0x9a6b4f, 0xb59448, 0x7a5566, 0x8a8f96];
const BOOK_COLORS = [0x9a4b3f, 0x3f6f8f, 0x4f8f5f, 0xc7a23f, 0x6a4f8f, 0xb56a3f, 0x4a4a55];
/** Mueble de TV: un tono por variante (madera cálida, nórdico claro, grafito, blanco). */
const TV_STAND_COLORS = [0x8a6a45, 0xc9bda8, 0x2e2e33, 0xd8d3c8];
/** Altura máxima del hueco de puerta (calle e interiores). Holgada sobre la
 *  estatura del peatón para que pase con margen. */
const DOOR_TOP_MAX = 2.45;
const BATH_TOWEL_COLORS = [0xf2efe8, 0x8fb7c9, 0xd8b6a4, 0xb8c8a2, 0xc7c1d9];
/** Tonos de suelo interior (tarima/baldosa). Cada edificio elige uno para dar
 *  variedad; las escaleras del edificio toman el mismo tono que su suelo. */
const FLOOR_PALETTE = [0xc9b491, 0xb89a6e, 0xd8c39a, 0xa9885f, 0xcabfa6, 0xbfa17a];
/** Tonos de tabique interior: variaciones suaves de blanco cálido por edificio. */
const PARTITION_PALETTE = [0xe9e2d4, 0xeae6de, 0xe3ddcf, 0xdfe4e2, 0xeae0d0, 0xe6e1da];
const TREE_GREENS = [0x4e8f4a, 0x5fa052, 0x3f7f45];
const PALM_GREENS = [0x2f8f3f, 0x3aa14a, 0x2b7436];
const HEDGE_GREENS = [0x315f25, 0x3f7f2c, 0x4d8b36, 0x2b5122];
const PARK_LAMP_SPACING = 18;
// Nombre neutro a propósito: los bloqueadores de anuncios cancelan
// (ERR_BLOCKED_BY_CLIENT) cualquier asset cuya URL contenga "casino"/"advert".
const BILLBOARD_TEXTURE_URL = new URL('../assets/billboard_panel.png', import.meta.url).href;
const BILLBOARD_PANEL_W = 13.4;
const BILLBOARD_PANEL_H = 7.55;
const BILLBOARD_FOOTPRINT_W = BILLBOARD_PANEL_W + 2.2;
const BILLBOARD_FOOTPRINT_D = 5.2;

export type CityBuildLayer = 'ground' | 'roads' | 'sidewalks' | 'markings' | 'buildings' | 'roofs' | 'lamps' | 'trees';
export type CityBuildLayers = Record<CityBuildLayer, THREE.Group>;

export interface CityBuild {
  group: THREE.Group;
  /** Capas estaticas usadas por el panel de construccion. */
  layers: CityBuildLayers;
  /** Controla la animacion de las puertas de fachada. */
  doors: DoorAnimator;
  /** Controla las puertas correderas de cristal de los supermercados. */
  marketDoors: SlidingDoorAnimator;
  /** Enciende/apaga el emisivo de cada lámpara de pie (acción del menú radial). */
  floorLamps: FloorLampController;
  /** Material compartido de las ventanas (cristal reflectante; DayNightCycle lo ilumina de noche). */
  windowMaterial: THREE.MeshStandardMaterial;
  /** Material compartido de las bombillas de las farolas. */
  lampMaterial: THREE.MeshBasicMaterial;
  /** Material de los conos de luz de las farolas (opacidad animada de noche). */
  lampConeMaterial: THREE.MeshBasicMaterial;
  /** Material compartido de las bombillas colgantes del supermercado (encendidas
   *  de día, apagadas de noche: al revés que las farolas; sin cono de luz). */
  marketLampMaterial: THREE.MeshBasicMaterial;
}

export interface DoorPose {
  x: number;
  z: number;
  y: number;
  yaw: number;
  width: number;
  height: number;
  depth: number;
  hingeSide: -1 | 1;
}

const DOOR_OPEN_ANGLE = Math.PI * 0.58;
const DOOR_ANIM_SPEED = 5.5;

export class DoorAnimator {
  private readonly current: number[];
  /** Apertura pedida por el usuario (menú radial), persistente. */
  private readonly userTarget: number[];
  /** Apertura pedida por la simulación (peatón cruzando el umbral), por frame. */
  private readonly autoTarget: boolean[];
  private readonly tmp = new THREE.Matrix4();

  constructor(
    private readonly mesh: THREE.InstancedMesh,
    private readonly poses: DoorPose[],
  ) {
    this.current = new Array(poses.length).fill(0);
    this.userTarget = new Array(poses.length).fill(0);
    this.autoTarget = new Array(poses.length).fill(false);
  }

  toggle(index: number): void {
    if (!this.poses[index]) return;
    this.userTarget[index] = this.userTarget[index] > 0.5 ? 0 : 1;
  }

  /** La simulación marca si un peatón está cruzando esta puerta (se resetea cada frame). */
  setAuto(index: number, open: boolean): void {
    if (this.autoTarget[index] !== undefined) this.autoTarget[index] = open;
  }

  /** Reinicia las peticiones automáticas antes de recorrer los peatones del frame. */
  clearAuto(): void {
    this.autoTarget.fill(false);
  }

  /** Para la etiqueta del menú: refleja solo el estado que controla el usuario. */
  isOpen(index: number): boolean {
    return (this.userTarget[index] ?? 0) > 0.5;
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.poses.length; i++) {
      // Abierta si la pide el usuario O un peatón la está cruzando.
      const target = this.autoTarget[i] || this.userTarget[i] > 0.5 ? 1 : 0;
      const before = this.current[i];
      const next = before + (target - before) * Math.min(1, dt * DOOR_ANIM_SPEED);
      if (Math.abs(next - before) < 0.0005) continue;
      this.current[i] = next;
      this.mesh.setMatrixAt(i, doorMatrix(this.poses[i], easeInOut(next), this.tmp));
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const SLIDING_DOOR_SPEED = 3.2;
/** Fracción de `leafW` que recorre cada hoja al abrirse (queda casi escondida
 *  tras el escaparate fijo contiguo, como una corredera automática real). */
const SLIDING_DOOR_TRAVEL = 0.94;

/**
 * Anima las puertas correderas de cristal de los supermercados: dos hojas por
 * puerta que se deslizan a los lados (en vez de girar, como `DoorAnimator`).
 * Indexada por `buildingId` (no por posición), así el orden de creación de los
 * supermercados no importa.
 */
export class SlidingDoorAnimator {
  private readonly current: number[];
  private readonly userTarget: number[];
  private readonly autoTarget: boolean[];
  private readonly indexOf = new Map<number, number>();
  private readonly tmpA = new THREE.Matrix4();
  private readonly tmpB = new THREE.Matrix4();

  constructor(
    private readonly mesh: THREE.InstancedMesh,
    private readonly poses: SlidingDoorPose[],
  ) {
    poses.forEach((p, i) => this.indexOf.set(p.buildingId, i));
    this.current = new Array(poses.length).fill(0);
    this.userTarget = new Array(poses.length).fill(0);
    this.autoTarget = new Array(poses.length).fill(false);
  }

  toggle(buildingId: number): void {
    const i = this.indexOf.get(buildingId);
    if (i === undefined) return;
    this.userTarget[i] = this.userTarget[i] > 0.5 ? 0 : 1;
  }

  /** La simulación marca si un peatón está cruzando esta puerta (se resetea cada frame). */
  setAuto(buildingId: number, open: boolean): void {
    const i = this.indexOf.get(buildingId);
    if (i !== undefined) this.autoTarget[i] = open;
  }

  clearAuto(): void {
    this.autoTarget.fill(false);
  }

  isOpen(buildingId: number): boolean {
    const i = this.indexOf.get(buildingId);
    return i !== undefined && this.userTarget[i] > 0.5;
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.poses.length; i++) {
      const target = this.autoTarget[i] || this.userTarget[i] > 0.5 ? 1 : 0;
      const before = this.current[i];
      const next = before + (target - before) * Math.min(1, dt * SLIDING_DOOR_SPEED);
      if (Math.abs(next - before) < 0.0005) continue;
      this.current[i] = next;
      const eased = easeInOut(next);
      this.mesh.setMatrixAt(i * 2, slidingDoorMatrix(this.poses[i], eased, -1, this.tmpA));
      this.mesh.setMatrixAt(i * 2 + 1, slidingDoorMatrix(this.poses[i], eased, 1, this.tmpB));
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Construye toda la geometría estática de la ciudad (un grupo, casi todo instanciado). */
export function buildCityMesh(model: CityModel): CityBuild {
  const group = new THREE.Group();
  const layers: CityBuildLayers = {
    ground: new THREE.Group(),
    roads: new THREE.Group(),
    sidewalks: new THREE.Group(),
    markings: new THREE.Group(),
    buildings: new THREE.Group(),
    roofs: new THREE.Group(),
    lamps: new THREE.Group(),
    trees: new THREE.Group(),
  };
  group.add(layers.ground, layers.roads, layers.sidewalks, layers.markings, layers.buildings, layers.roofs, layers.lamps, layers.trees);
  const g = CITY.grid;
  const xMin = roadX(0);
  const xMax = roadX(g - 1);
  const zMin = roadZ(0);
  const zMax = roadZ(g - 1);
  const cx0 = (xMin + xMax) / 2;
  const cz0 = (zMin + zMax) / 2;

  /* ── Suelo ── */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(model.halfExtent * 2.6, model.halfExtent * 2.6),
    new THREE.MeshLambertMaterial({ color: 0x86a96a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  layers.ground.add(ground);

  /* ── Calzadas: banda larga por línea recta; curvas y rotondas, tramo a tramo ── */
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x3e4146 });
  const roadW = CITY.roadHalf * 2;
  const xLen = xMax - xMin + CORRIDOR_HALF * 2;
  const zLen = zMax - zMin + CORRIDOR_HALF * 2;
  // Las calzadas que llegan a una rotonda se recortan en el eje del anillo
  // (el propio anillo cubre de ahí hacia dentro); en el resto, caja completa.
  const isRound = (i: number, j: number) => model.roundabouts.has(intersectionId(i, j));
  const rowHasRound = (j: number) => Array.from({ length: g }, (_, i) => i).some((i) => isRound(i, j));
  const colHasRound = (i: number) => Array.from({ length: g }, (_, j) => j).some((j) => isRound(i, j));
  // Líneas que atraviesan el INTERIOR del parque: sus tramos dentro del parque
  // se han eliminado (parque fundido), así que se dibujan tramo a tramo.
  const park = model.park;
  const closedRects = [park, ...model.mergedBlocks];
  const rowHasRemoved = (j: number) => {
    for (let i = 0; i < g - 1; i++) if (removedRoadSegment(closedRects, 'h', j, i)) return true;
    return false;
  };
  const colHasRemoved = (i: number) => {
    for (let j = 0; j < g - 1; j++) if (removedRoadSegment(closedRects, 'v', i, j)) return true;
    return false;
  };
  const roadMats: THREE.Matrix4[] = []; // tramos rectos y aproximaciones a rotondas
  for (let k = 0; k < g; k++) {
    if (rowHasRound(k) || rowHasRemoved(k)) {
      for (let m = 0; m < g - 1; m++) {
        if (removedRoadSegment(closedRects, 'h', k, m)) continue; // tramo interior eliminado
        const a = roadX(m) + (isRound(m, k) ? ROUNDABOUT_RADIUS : m === 0 ? -CORRIDOR_HALF : 0);
        const b = roadX(m + 1) - (isRound(m + 1, k) ? ROUNDABOUT_RADIUS : m + 1 === g - 1 ? -CORRIDOR_HALF : 0);
        roadMats.push(compose((a + b) / 2, roadZ(k), 0, b - a, 0.1, roadW));
      }
    } else {
      const hRoad = new THREE.Mesh(new THREE.BoxGeometry(xLen, 0.1, roadW), asphalt);
      hRoad.position.set(cx0, 0, roadZ(k));
      hRoad.receiveShadow = true;
      layers.roads.add(hRoad);
    }

    if (hasCurvedColumn(model, k) || colHasRound(k) || colHasRemoved(k)) {
      // Esta línea vertical tiene tramos curvos, rotondas o parque: tramo a tramo.
      for (let j = 0; j < g - 1; j++) {
        if (removedRoadSegment(closedRects, 'v', k, j)) continue; // tramo interior eliminado
        const c = vSegCurve(model, k, j);
        if (c) {
          addCurvedBand(layers.roads, c.pts, roadW, 0.055, asphalt);
          continue;
        }
        const a = roadZ(j) + (isRound(k, j) ? ROUNDABOUT_RADIUS : j === 0 ? -CORRIDOR_HALF : 0);
        const b = roadZ(j + 1) - (isRound(k, j + 1) ? ROUNDABOUT_RADIUS : j + 1 === g - 1 ? -CORRIDOR_HALF : 0);
        roadMats.push(compose(roadX(k), (a + b) / 2, 0, roadW, 0.1, b - a));
      }
    } else {
      const vRoad = new THREE.Mesh(new THREE.BoxGeometry(roadW, 0.1, zLen), asphalt);
      vRoad.position.set(roadX(k), 0, cz0);
      vRoad.receiveShadow = true;
      layers.roads.add(vRoad);
    }
  }
  if (roadMats.length) layers.roads.add(instanced(new THREE.BoxGeometry(1, 1, 1), asphalt, roadMats, { receiveShadow: true }));
  for (const id of model.roundabouts) {
    const n = model.intersections[id];
    if (n.i < 0) continue;
    addRoundaboutRoadMouths(layers.roads, n.x, n.z, asphalt);
  }

  /* ── Aceras: tiras entre intersecciones + esquinas ── */
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a8 });
  const strips: THREE.Matrix4[] = [];
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g - 1; i++) {
      if (removedRoadSegment(closedRects, 'h', j, i)) continue; // acera interior eliminada
      // Junto a una rotonda la acera recta se recorta donde toca el arco.
      const roundA = isRound(i, j);
      const roundB = isRound(i + 1, j);
      for (const s of [-1, 1]) {
        if (roundA || roundB) {
          addSidewalkStrip(layers.sidewalks, sidewalkMat, 'x', roadX(i), roadX(i + 1), roadZ(j), s, roundA, roundB);
        } else {
          const a = roadX(i) + CORRIDOR_HALF;
          const b = roadX(i + 1) - CORRIDOR_HALF;
          strips.push(compose((a + b) / 2, roadZ(j) + SIDEWALK_CENTER * s, 0, b - a, 0.24, CITY.sidewalkWidth));
        }
      }
    }
  }
  for (let i = 0; i < g; i++) {
    for (let j = 0; j < g - 1; j++) {
      if (removedRoadSegment(closedRects, 'v', i, j)) continue; // acera interior eliminada
      const c = vSegCurve(model, i, j);
      if (c) {
        // Aceras que siguen la curva, una a cada lado del eje.
        for (const s of [-1, 1]) addCurvedBand(layers.sidewalks, offsetPolyline(c.pts, SIDEWALK_CENTER * s), CITY.sidewalkWidth, 0.12, sidewalkMat);
        continue;
      }
      const roundA = isRound(i, j);
      const roundB = isRound(i, j + 1);
      for (const s of [-1, 1]) {
        if (roundA || roundB) {
          addSidewalkStrip(layers.sidewalks, sidewalkMat, 'z', roadZ(j), roadZ(j + 1), roadX(i), s, roundA, roundB);
        } else {
          const a = roadZ(j) + CORRIDOR_HALF;
          const b = roadZ(j + 1) - CORRIDOR_HALF;
          strips.push(compose(roadX(i) + SIDEWALK_CENTER * s, (a + b) / 2, 0, CITY.sidewalkWidth, 0.24, b - a));
        }
      }
    }
  }
  // Esquinas: almohadilla 3x3 en cruces normales; en rotondas, arco de acera
  // que rodea el anillo (Bézier cuadrática racional = arco circular exacto).
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      if (removedInteriorNode(closedRects, i, j)) continue; // esquina interior: no hay acera
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          if (isRound(i, j)) {
            addRoundaboutSidewalkCorner(layers.sidewalks, roadX(i), roadZ(j), sx, sz, sidewalkMat);
            continue;
          }
          strips.push(
            compose(roadX(i) + SIDEWALK_CENTER * sx, roadZ(j) + SIDEWALK_CENTER * sz, 0, CITY.sidewalkWidth, 0.24, CITY.sidewalkWidth),
          );
        }
      }
    }
  }
  layers.sidewalks.add(instanced(new THREE.BoxGeometry(1, 1, 1), sidewalkMat, strips, { receiveShadow: true }));
  addMergedBlockWalkways(layers.sidewalks, model);

  /* ── Pasos de cebra ── */
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e2 });
  const stripes: THREE.Matrix4[] = [];
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      const cx = roadX(i);
      const cz = roadZ(j);
      for (const s of [-1, 1]) {
        const ns = model.crosswalks.has(crosswalkKey(i, j, 'NS', s));
        const ew = model.crosswalks.has(crosswalkKey(i, j, 'EW', s));
        for (let k = -2; k <= 2; k++) {
          // Cruce de la carretera vertical: banda en z = cz ± 5.5, barras a lo largo de x.
          if (ns) stripes.push(compose(cx + k * 1.6, cz + SIDEWALK_CENTER * s, 0.06, 0.85, 0.02, 2.4));
          // Cruce de la carretera horizontal.
          if (ew) stripes.push(compose(cx + SIDEWALK_CENTER * s, cz + k * 1.6, 0.06, 2.4, 0.02, 0.85));
        }
      }
    }
  }
  layers.markings.add(instanced(new THREE.BoxGeometry(1, 1, 1), stripeMat, stripes));

  /* ── Línea discontinua central ── */
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8cf9a });
  const dashes: THREE.Matrix4[] = [];
  for (let k = 0; k < g; k++) {
    // Carretera horizontal k (a lo largo de X).
    const cz = roadZ(k);
    for (let m = 0; m < g - 1; m++) {
      if (removedRoadSegment(closedRects, 'h', k, m)) continue;
      const a = roadX(m) + (isRound(m, k) ? ROUNDABOUT_OUT + 2 : CORRIDOR_HALF + 2);
      const b = roadX(m + 1) - (isRound(m + 1, k) ? ROUNDABOUT_OUT + 2 : CORRIDOR_HALF + 2);
      for (let p = a; p <= b; p += 5) dashes.push(compose(p, cz, 0.06, 2.2, 0.02, 0.3));
    }
    // Carretera vertical k (a lo largo de Z).
    const cx = roadX(k);
    for (let m = 0; m < g - 1; m++) {
      if (removedRoadSegment(closedRects, 'v', k, m)) continue;
      const c = vSegCurve(model, k, m);
      if (c) {
        // Discontinua que traza la curva (un trazo por cada dos muestras).
        for (let q = 0; q < c.pts.length - 1; q += 2) {
          const a2 = c.pts[q];
          const b2 = c.pts[q + 1];
          const len2 = Math.hypot(b2.x - a2.x, b2.z - a2.z) || 1;
          dashes.push(composeYaw((a2.x + b2.x) / 2, (a2.z + b2.z) / 2, 0.06, 0.3, 0.02, Math.min(2.2, len2 * 0.8), Math.atan2(b2.x - a2.x, b2.z - a2.z)));
        }
        continue;
      }
      const a = roadZ(m) + (isRound(k, m) ? ROUNDABOUT_OUT + 2 : CORRIDOR_HALF + 2);
      const b = roadZ(m + 1) - (isRound(k, m + 1) ? ROUNDABOUT_OUT + 2 : CORRIDOR_HALF + 2);
      for (let p = a; p <= b; p += 5) dashes.push(compose(cx, p, 0.06, 0.3, 0.02, 2.2));
    }
  }
  layers.markings.add(instanced(new THREE.BoxGeometry(1, 1, 1), dashMat, dashes));

  /* ── Rotondas: anillo de asfalto + isla ajardinada ── */
  const islandMat = new THREE.MeshLambertMaterial({ color: 0x6f9e54 });
  const R = ROUNDABOUT_RADIUS;
  const islandR = R - CITY.roadHalf - 0.4;
  for (const id of model.roundabouts) {
    const n = model.intersections[id];
    if (n.i < 0) continue; // solo el nodo central (los nodos de brazo tienen i=-1)
    // El borde exterior se prolonga un poco bajo la acera curva para que no
    // asome una rendija de césped entre el asfalto y el bordillo.
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - CITY.roadHalf, ROUNDABOUT_OUT + 0.6, 48), asphalt);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(n.x, 0.06, n.z);
    ring.receiveShadow = true;
    layers.roads.add(ring);
    const island = new THREE.Mesh(new THREE.CylinderGeometry(islandR, islandR + 0.3, 0.5, 24), islandMat);
    island.position.set(n.x, 0.18, n.z);
    island.receiveShadow = true;
    island.castShadow = true;
    layers.trees.add(island);
  }

  /* ── Patios y vallas por manzana ──
   * Manzana con cualquier edificio → patio de asfalto gris (ciudad densa).
   * Manzana SOLO de casas → césped: cada casa con su jardín vallado individual
   * (huella + margen, recortado contra los vecinos para que las casas contiguas
   * queden separadas por la valla). Las casas junto a una rotonda no se vallan.
   */
  const courtyardMat = new THREE.MeshLambertMaterial({ color: 0x4a4d52 });
  const courtyards: THREE.Matrix4[] = [];
  const courtyardPavements: THREE.Matrix4[] = [];
  const fencePosts: THREE.Matrix4[] = [];
  const fenceRails: THREE.Matrix4[] = [];
  const fencePickets: THREE.Matrix4[] = [];
  for (const blk of model.blocks) {
    if (blk.district === 'park') continue;
    const x0 = roadX(blk.bi) + CORRIDOR_HALF;
    const x1 = roadX(blk.bi + 1) - CORRIDOR_HALF;
    const z0 = roadZ(blk.bj) + CORRIDOR_HALF;
    const z1 = roadZ(blk.bj + 1) - CORRIDOR_HALF;
    if (x1 - x0 < 2 || z1 - z0 < 2) continue;
    const inBlock = model.buildings.filter((b) => b.x > x0 - 2 && b.x < x1 + 2 && b.z > z0 - 2 && b.z < z1 + 2);
    if (inBlock.length === 0) continue;
    // El tipo de patio lo decide la factoría de cada edificio (green = jardín).
    const houses = inBlock.filter((b) => buildingFactories[b.type].courtyardKind === 'green');
    if (houses.length < inBlock.length) {
      // Si conviven casas con edificios, manda el suelo urbano gris.
      courtyards.push(compose((x0 + x1) / 2, (z0 + z1) / 2, -0.01, x1 - x0, 0.08, z1 - z0));
      addCourtyardPavement(courtyardPavements, x0, x1, z0, z1, {
        nw: isRound(blk.bi, blk.bj),
        ne: isRound(blk.bi + 1, blk.bj),
        sw: isRound(blk.bi, blk.bj + 1),
        se: isRound(blk.bi + 1, blk.bj + 1),
      });
    } else {
      // Isla residencial: jardín vallado por casa, salvo si la manzana toca una
      // rotonda (esas casas se quedan sin valla).
      const touchesRound =
        isRound(blk.bi, blk.bj) ||
        isRound(blk.bi + 1, blk.bj) ||
        isRound(blk.bi, blk.bj + 1) ||
        isRound(blk.bi + 1, blk.bj + 1);
      if (!touchesRound) {
        for (const h of houses) {
          addHouseYardFence(fencePosts, fenceRails, fencePickets, h, inBlock, { x0, x1, z0, z1 });
        }
      }
    }
  }
  if (courtyards.length) {
    layers.ground.add(instanced(new THREE.BoxGeometry(1, 1, 1), courtyardMat, courtyards, { receiveShadow: true }));
  }
  if (courtyardPavements.length) {
    layers.sidewalks.add(instanced(new THREE.BoxGeometry(1, 1, 1), sidewalkMat, courtyardPavements, { receiveShadow: true }));
  }
  if (fencePickets.length) {
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x7a4a26 });
    const postMat = new THREE.MeshLambertMaterial({ color: 0x633a1d });
    layers.buildings.add(instanced(new THREE.BoxGeometry(1, 1, 1), postMat, fencePosts, { castShadow: true }));
    layers.buildings.add(instanced(new THREE.BoxGeometry(1, 1, 1), woodMat, fenceRails, { castShadow: true }));
    layers.buildings.add(instanced(new THREE.BoxGeometry(1, 1, 1), woodMat, fencePickets, { castShadow: true }));
  }

  /* ── Edificios ── */
  // Cristal: casi especular y oscuro, refleja el cielo vía scene.environment
  // (capturado en SceneRenderer). DayNightCycle le pone el brillo cálido de noche.
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x37495c, metalness: 0.92, roughness: 0.12, envMapIntensity: 1.0 });
  // Bombillas colgantes del supermercado: material PROPIO (no el de las farolas),
  // porque se comportan al revés (encendidas de día, apagadas de noche). Creado
  // ANTES de `addBuildings` para poder pasárselo.
  const marketLampMaterial = new THREE.MeshBasicMaterial({ color: 0x35383d });
  const { doors, marketDoors, floorLamps } = addBuildings(layers.buildings, layers.roofs, model, windowMaterial, marketLampMaterial);
  addBillboard(layers.buildings, model);

  /* ── Farolas: una a mitad de cada tramo de calle, en ambos lados ── */
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0x41454c });
  const lampConeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd98a,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lampPoles: THREE.Matrix4[] = [];
  const lampBulbs: THREE.Matrix4[] = [];
  const lampCones: THREE.Matrix4[] = [];
  const lampOffset = CORRIDOR_HALF - 0.4;
  const addLamp = (x: number, z: number) => {
    lampPoles.push(compose(x, z, 2.75, 0.16, 5.5, 0.16));
    lampBulbs.push(compose(x, z, 5.65, 0.7, 0.5, 0.7));
    lampCones.push(compose(x, z, 0, 1, 5.6, 1));
  };
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g - 1; i++) {
      if (removedRoadSegment(closedRects, 'h', j, i)) continue; // sin calle, sin farolas
      const xmid = (roadX(i) + roadX(i + 1)) / 2;
      for (const s of [-1, 1]) addLamp(xmid, roadZ(j) + lampOffset * s); // tramos horizontales
    }
  }
  for (let i = 0; i < g; i++) {
    for (let j = 0; j < g - 1; j++) {
      if (removedRoadSegment(closedRects, 'v', i, j)) continue; // sin calle, sin farolas
      const c = vSegCurve(model, i, j);
      if (c) {
        // Farola a media curva, a cada lado del eje.
        const mid = c.pts[Math.floor(c.pts.length / 2)];
        const prev = c.pts[Math.floor(c.pts.length / 2) - 1];
        let tx = mid.x - prev.x;
        let tz = mid.z - prev.z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
        for (const s of [-1, 1]) addLamp(mid.x - tz * lampOffset * s, mid.z + tx * lampOffset * s);
        continue;
      }
      const zmid = (roadZ(j) + roadZ(j + 1)) / 2;
      for (const s of [-1, 1]) addLamp(roadX(i) + lampOffset * s, zmid); // tramos verticales
    }
  }
  addParkLamps(model, addLamp);
  addMergedBlockLamps(model, addLamp);
  layers.lamps.add(
    instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), new THREE.MeshLambertMaterial({ color: 0x2c2f33 }), lampPoles, {
      castShadow: true,
    }),
  );
  layers.lamps.add(instanced(new THREE.SphereGeometry(0.5, 10, 8), lampMaterial, lampBulbs));
  // Cono de luz "volumétrico": cilindro abierto que se estrecha hacia la bombilla.
  const coneGeo = new THREE.CylinderGeometry(0.25, 2.3, 1, 10, 1, true);
  coneGeo.translate(0, 0.5, 0);
  layers.lamps.add(instanced(coneGeo, lampConeMaterial, lampCones));

  /* ── Árboles ── */
  const trunkMats: THREE.Matrix4[] = [];
  const roundCrownMats: THREE.Matrix4[] = [];
  const roundCrownColors: THREE.Color[] = [];
  const pineCrownMats: THREE.Matrix4[] = [];
  const pineCrownColors: THREE.Color[] = [];
  const palmCrownMats: THREE.Matrix4[] = [];
  const palmCrownColors: THREE.Color[] = [];
  const palmFrondMats: THREE.Matrix4[] = [];
  const palmFrondColors: THREE.Color[] = [];
  // Buckets compartidos (aliasan los arrays de arriba) + helpers inyectados; cada
  // especie vuelca su geometría vía su renderer, sin ramificar aquí por `kind`.
  const treeBuckets: TreeRenderBuckets = {
    trunkMats,
    roundCrownMats, roundCrownColors,
    pineCrownMats, pineCrownColors,
    palmCrownMats, palmCrownColors,
    palmFrondMats, palmFrondColors,
  };
  const treeHelpers: TreeRenderHelpers = { compose, composeEuler, palettes: { tree: TREE_GREENS, palm: PALM_GREENS } };
  const treeCtx: TreeRenderCtx = { buckets: treeBuckets, helpers: treeHelpers };
  for (const t of model.trees) treeRenderers[t.kind].render(t, treeCtx);
  layers.trees.add(
    instanced(new THREE.CylinderGeometry(0.5, 0.6, 1, 6), new THREE.MeshLambertMaterial({ color: 0x6e4f33 }), trunkMats, {
      castShadow: true,
    }),
  );
  if (roundCrownMats.length) layers.trees.add(
    instanced(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), roundCrownMats, {
      castShadow: true,
      colors: roundCrownColors,
    }),
  );
  if (pineCrownMats.length) layers.trees.add(
    instanced(new THREE.ConeGeometry(0.5, 1, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), pineCrownMats, {
      castShadow: true,
      colors: pineCrownColors,
    }),
  );
  if (palmCrownMats.length) layers.trees.add(
    instanced(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), palmCrownMats, {
      castShadow: true,
      colors: palmCrownColors,
    }),
  );
  if (palmFrondMats.length) layers.trees.add(
    instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), palmFrondMats, {
      castShadow: true,
      colors: palmFrondColors,
    }),
  );
  addParkHedges(layers.trees, model.hedges);
  addParkHedges(layers.trees, buildMergedBlockPlanters(model));
  addParkBenches(layers.trees, model.benches);
  addParkBenches(layers.trees, buildMergedBlockBenches(model));
  addPlayItems(layers.trees, model);

  return { group, layers, doors, marketDoors, floorLamps, windowMaterial, lampMaterial, lampConeMaterial, marketLampMaterial };
}

function addBillboard(group: THREE.Group, model: CityModel, textureUrl = BILLBOARD_TEXTURE_URL): void {
  const site = pickBillboardSite(model);

  const billboard = buildBillboardMesh(textureUrl);
  billboard.name = 'billboard';
  billboard.userData.kind = 'billboard';
  billboard.position.set(site.x, 0, site.z);
  billboard.rotation.y = site.yaw;
  group.add(billboard);
}

/** Rotondas ordenadas de más céntrica (cerca del centro de la ciudad) a menos. */
function roundaboutsByCentrality(model: CityModel): Intersection[] {
  const g = CITY.grid;
  const cityCx = (roadX(0) + roadX(g - 1)) / 2;
  const cityCz = (roadZ(0) + roadZ(g - 1)) / 2;
  return [...model.roundabouts]
    .map((id) => model.intersections[id])
    .filter((c): c is Intersection => !!c)
    .sort((a, b) => Math.hypot(a.x - cityCx, a.z - cityCz) - Math.hypot(b.x - cityCx, b.z - cityCz));
}

/** ¿(x,z) cae en el interior edificable (sin calzada ni acera) de una isla no-parque? */
function insideNonParkBlockInterior(model: CityModel, x: number, z: number): boolean {
  const g = CITY.grid;
  let bi = -1;
  let bj = -1;
  for (let i = 0; i < g - 1; i++) if (x >= roadX(i) && x < roadX(i + 1)) bi = i;
  for (let j = 0; j < g - 1; j++) if (z >= roadZ(j) && z < roadZ(j + 1)) bj = j;
  if (bi < 0 || bj < 0) return false;
  if (x < roadX(bi) + CORRIDOR_HALF || x > roadX(bi + 1) - CORRIDOR_HALF) return false;
  if (z < roadZ(bj) + CORRIDOR_HALF || z > roadZ(bj + 1) - CORRIDOR_HALF) return false;
  const blk = model.blocks.find((b) => b.bi === bi && b.bj === bj);
  return !!blk && blk.district !== 'park';
}

/** Holguras candidatas (de más a menos): el spot puntúa según la mayor que pasa. */
const BILLBOARD_CLEAR_MARGINS = [2.4, 1.6, 0.9, 0.3];

/**
 * Coloca la valla en una de las cuatro esquinas diagonales de la rotonda `c`,
 * pegada al borde exterior del camino peatonal y mirando al centro de la rotonda.
 * Barre ángulos (evitando los cuatro brazos = calles) y radios, y elige el MEJOR
 * candidato (no el primero): máxima holgura con edificios, luego pegado al camino,
 * luego centrado en el hueco y con la vista a la rotonda despejada.
 *
 * Restricciones duras: dentro del interior de una isla no-parque, base fuera del
 * camino de toda rotonda, y sin clavar en un edificio (holgura 0). Devuelve null
 * solo si no hay ningún candidato duro-válido para esta rotonda.
 */
function pickRoundaboutBillboardSite(model: CityModel, c: Intersection): { x: number; z: number; yaw: number } | null {
  const pathOuter = ROUNDABOUT_SW_R + CITY.sidewalkWidth / 2; // borde exterior de la acera anular
  let best: { x: number; z: number; yaw: number; score: number } | null = null;

  for (let deg = 0; deg < 360; deg += 3) {
    // Evitar los cuatro brazos (carreteras en las direcciones cardinales).
    const gap = Math.min(deg % 90, 90 - (deg % 90));
    if (gap < 22) continue;
    const a = (deg * Math.PI) / 180;
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    for (let r = pathOuter + 1.5; r <= pathOuter + 16; r += 0.75) {
      const x = c.x + ux * r;
      const z = c.z + uz * r;
      if (!insideNonParkBlockInterior(model, x, z)) continue;
      if (!baseOffRoundaboutPaths(model, x, z)) continue;
      const yaw = Math.atan2(c.x - x, c.z - z); // mirar hacia la rotonda
      // Holgura: nivel = mayor margen que pasa; si ni con margen 0 está libre, el
      // panel clavaría en un edificio → descartar.
      let clearLevel = -1;
      for (let m = 0; m < BILLBOARD_CLEAR_MARGINS.length; m++) {
        if (isBillboardFootClear(model, x, z, yaw, BILLBOARD_CLEAR_MARGINS[m])) {
          clearLevel = BILLBOARD_CLEAR_MARGINS.length - m; // 4 = mejor holgura, 1 = la mínima
          break;
        }
      }
      if (clearLevel < 0 && !isBillboardFootClear(model, x, z, yaw, 0)) continue;
      if (clearLevel < 0) clearLevel = 0; // libre con margen 0 pero no con 0.3

      const sightlineBonus = segmentHitsBuilding(model, x, z, c.x, c.z) ? 0 : 1;
      // Prioridad: holgura >> vista despejada a la rotonda >> pegada al camino >> hueco.
      const score = clearLevel * 100 + sightlineBonus * 30 - r + gap * 0.2;
      if (!best || score > best.score) best = { x, z, yaw, score };
    }
  }

  return best ? { x: best.x, z: best.z, yaw: best.yaw } : null;
}

function pickBillboardSite(model: CityModel): { x: number; z: number; yaw: number } {
  // La valla SIEMPRE va en la esquina de una isla pegada a una rotonda, mirando a
  // la rotonda. Probamos de la rotonda más céntrica a la menos y nos quedamos con
  // la primera que tenga una esquina limpia (el panel no clava en ningún edificio).
  const rounds = roundaboutsByCentrality(model);
  for (const c of rounds) {
    const spot = pickRoundaboutBillboardSite(model, c);
    if (spot) return spot;
  }
  // Último recurso (prácticamente inalcanzable: ninguna rotonda tenía esquina
  // limpia): la rotonda más céntrica, en su esquina menos obstruida. Sigue siendo
  // junto a una rotonda, nunca entre edificios.
  return bestEffortRoundaboutSite(model, rounds[0]);
}

/**
 * Devuelve SIEMPRE un sitio en una esquina de la rotonda `c` (mirando a su
 * centro), aunque haya que relajar las restricciones. Maximiza la holgura con
 * edificios y prefiere quedar dentro del interior de una isla y fuera del camino.
 */
function bestEffortRoundaboutSite(model: CityModel, c: Intersection): { x: number; z: number; yaw: number } {
  const pathOuter = ROUNDABOUT_SW_R + CITY.sidewalkWidth / 2;
  let best: { x: number; z: number; yaw: number; score: number } | null = null;

  for (let deg = 0; deg < 360; deg += 3) {
    const gap = Math.min(deg % 90, 90 - (deg % 90));
    if (gap < 22) continue;
    const a = (deg * Math.PI) / 180;
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    for (let r = pathOuter + 1.5; r <= pathOuter + 18; r += 0.75) {
      const x = c.x + ux * r;
      const z = c.z + uz * r;
      const yaw = Math.atan2(c.x - x, c.z - z);
      let clear = 0;
      for (let m = 0; m < BILLBOARD_CLEAR_MARGINS.length; m++) {
        if (isBillboardFootClear(model, x, z, yaw, BILLBOARD_CLEAR_MARGINS[m])) {
          clear = BILLBOARD_CLEAR_MARGINS.length - m;
          break;
        }
      }
      const inside = insideNonParkBlockInterior(model, x, z) ? 1 : 0;
      const offPath = baseOffRoundaboutPaths(model, x, z) ? 1 : 0;
      const score = inside * 1000 + offPath * 500 + clear * 100 - r;
      if (!best || score > best.score) best = { x, z, yaw, score };
    }
  }

  // `best` siempre queda definido (el barrido produce candidatos sin filtro duro).
  return best
    ? { x: best.x, z: best.z, yaw: best.yaw }
    : { x: c.x, z: c.z + pathOuter + 3, yaw: Math.PI };
}

/**
 * ¿El segmento (x0,z0)→(x1,z1) atraviesa algún edificio? Sirve para saber si la
 * valla tiene línea de visión despejada hasta su carretera (que no quede mirando
 * a la pared de un edificio del anillo perimetral de la manzana).
 */
function segmentHitsBuilding(model: CityModel, x0: number, z0: number, x1: number, z1: number): boolean {
  const steps = 12;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    for (const b of model.buildings) {
      if (Math.abs(px - b.x) <= b.w / 2 && Math.abs(pz - b.z) <= b.d / 2) return true;
    }
  }
  return false;
}

interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
}

/**
 * ¿La huella de la valla está libre de edificios/árboles/setos/bancos con la
 * holgura `margin`? (No comprueba rotondas: esa es una verja aparte —
 * `baseOffRoundaboutPaths`— porque el panel elevado sí puede volar sobre el borde
 * del camino peatonal aunque la base no lo pise.)
 */
function isBillboardFootClear(model: CityModel, x: number, z: number, yaw: number, margin = 2.4): boolean {
  const footprint: Footprint = { x, z, w: BILLBOARD_FOOTPRINT_W, d: BILLBOARD_FOOTPRINT_D, yaw };

  for (const b of model.buildings) {
    if (footprintsOverlap(footprint, { x: b.x, z: b.z, w: b.w + margin * 2, d: b.d + margin * 2, yaw: 0 })) return false;
  }

  for (const t of model.trees) {
    if (circleOverlapsFootprint(t.x, t.z, t.r + margin, footprint)) return false;
  }

  for (const h of [...model.hedges, ...buildMergedBlockPlanters(model)]) {
    if (footprintsOverlap(footprint, { x: h.x, z: h.z, w: h.w + margin * 2, d: h.d + margin * 2, yaw: h.heading })) return false;
  }

  for (const b of [...model.benches, ...buildMergedBlockBenches(model)]) {
    if (footprintsOverlap(footprint, { x: b.x, z: b.z, w: 5.4 + margin * 2, d: 2.4 + margin * 2, yaw: b.heading })) return false;
  }

  return true;
}

/**
 * La BASE/poste no debe pisar el anillo ni la acera de NINGUNA rotonda (el panel
 * elevado sí puede volar un poco sobre el borde del camino peatonal, que es lo que
 * buscamos al colocarla pegada a la rotonda). Verja dura.
 */
function baseOffRoundaboutPaths(model: CityModel, x: number, z: number): boolean {
  const pathOuter = ROUNDABOUT_SW_R + CITY.sidewalkWidth / 2;
  for (const id of model.roundabouts) {
    const c = model.intersections[id];
    if (!c) continue;
    if (Math.hypot(x - c.x, z - c.z) < pathOuter + 0.5) return false;
  }
  return true;
}

function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  const axes = [footprintAxis(a, 1, 0), footprintAxis(a, 0, 1), footprintAxis(b, 1, 0), footprintAxis(b, 0, 1)];
  return axes.every((axis) => projectionsOverlap(projectFootprint(a, axis), projectFootprint(b, axis)));
}

function circleOverlapsFootprint(cx: number, cz: number, r: number, footprint: Footprint): boolean {
  const local = worldToFootprint(cx, cz, footprint);
  const hx = footprint.w / 2;
  const hz = footprint.d / 2;
  const dx = Math.max(Math.abs(local.x) - hx, 0);
  const dz = Math.max(Math.abs(local.z) - hz, 0);
  return dx * dx + dz * dz <= r * r;
}

function footprintAxis(f: Footprint, lx: number, lz: number): { x: number; z: number } {
  const s = Math.sin(f.yaw);
  const c = Math.cos(f.yaw);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

function projectFootprint(f: Footprint, axis: { x: number; z: number }): { min: number; max: number } {
  const cx = f.x * axis.x + f.z * axis.z;
  const ax = footprintAxis(f, 1, 0);
  const az = footprintAxis(f, 0, 1);
  const r = Math.abs((f.w / 2) * (ax.x * axis.x + ax.z * axis.z)) + Math.abs((f.d / 2) * (az.x * axis.x + az.z * axis.z));
  return { min: cx - r, max: cx + r };
}

function projectionsOverlap(a: { min: number; max: number }, b: { min: number; max: number }): boolean {
  return a.min <= b.max && b.min <= a.max;
}

function worldToFootprint(x: number, z: number, f: Footprint): { x: number; z: number } {
  const dx = x - f.x;
  const dz = z - f.z;
  const s = Math.sin(f.yaw);
  const c = Math.cos(f.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

function buildBillboardMesh(textureUrl: string): THREE.Group {
  const root = new THREE.Group();
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x555b60 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2f3337 });
  const concreteMat = new THREE.MeshLambertMaterial({ color: 0x8b8881 });
  const texture = new THREE.TextureLoader().load(
    textureUrl,
    (tex) => {
      // El PNG es grande (~2.4 MB): cuando termina de decodificar forzamos la
      // subida a GPU para que el panel no se quede en negro hasta el siguiente
      // cambio de material.
      tex.needsUpdate = true;
    },
    undefined,
    (err) => {
      // Sin esto el fallo de carga era silencioso y la valla salía en negro sin
      // pista alguna en consola.
      console.error(`No se pudo cargar la textura de la valla: ${textureUrl}`, err);
    },
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const adMat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const poleH = 12.0;
  const panelY = poleH + BILLBOARD_PANEL_H / 2;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.5, 14), concreteMat);
  base.position.set(0, 0.25, -0.42);
  base.castShadow = true;
  base.receiveShadow = true;
  root.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, poleH + 0.45, 12), metalMat);
  pole.position.set(0, (poleH + 0.45) / 2, -0.42);
  pole.castShadow = true;
  pole.receiveShadow = true;
  root.add(pole);

  const backing = new THREE.Mesh(new THREE.BoxGeometry(BILLBOARD_PANEL_W + 0.5, BILLBOARD_PANEL_H + 0.5, 0.28), darkMat);
  backing.position.set(0, panelY, -0.02);
  backing.castShadow = true;
  backing.receiveShadow = true;
  root.add(backing);

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(BILLBOARD_PANEL_W, BILLBOARD_PANEL_H), adMat);
  panel.position.set(0, panelY, 0.135);
  root.add(panel);

  addBillboardBox(root, metalMat, 0, panelY + BILLBOARD_PANEL_H / 2 + 0.28, 0.18, BILLBOARD_PANEL_W + 0.9, 0.36, 0.36);
  addBillboardBox(root, metalMat, 0, panelY - BILLBOARD_PANEL_H / 2 - 0.28, 0.18, BILLBOARD_PANEL_W + 0.9, 0.36, 0.36);
  addBillboardBox(root, metalMat, -BILLBOARD_PANEL_W / 2 - 0.28, panelY, 0.18, 0.36, BILLBOARD_PANEL_H + 0.9, 0.36);
  addBillboardBox(root, metalMat, BILLBOARD_PANEL_W / 2 + 0.28, panelY, 0.18, 0.36, BILLBOARD_PANEL_H + 0.9, 0.36);
  addBillboardBox(root, metalMat, 0, panelY - 2.25, -0.32, BILLBOARD_PANEL_W * 0.82, 0.2, 0.24);
  addBillboardBox(root, metalMat, 0, panelY + 2.25, -0.32, BILLBOARD_PANEL_W * 0.82, 0.2, 0.24);

  addCylinderBetween(root, new THREE.Vector3(0, poleH - 0.25, -0.42), new THREE.Vector3(-BILLBOARD_PANEL_W * 0.32, panelY - 2.7, -0.3), 0.08, metalMat);
  addCylinderBetween(root, new THREE.Vector3(0, poleH - 0.25, -0.42), new THREE.Vector3(BILLBOARD_PANEL_W * 0.32, panelY - 2.7, -0.3), 0.08, metalMat);

  return root;
}

function addBillboardBox(group: THREE.Group, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addCylinderBetween(group: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len <= 0.001) return;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addCourtyardPavement(
  out: THREE.Matrix4[],
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  round: { nw: boolean; ne: boolean; sw: boolean; se: boolean },
): void {
  const w = Math.min(2.6, (x1 - x0) * 0.22, (z1 - z0) * 0.22);
  if (w <= 0.45) return;
  const y = 0.07;
  const h = 0.14;
  const roundCut = ROUNDABOUT_OUT + CITY.sidewalkWidth - CORRIDOR_HALF + 0.25;

  const addH = (z: number, leftCut: boolean, rightCut: boolean) => {
    const a = x0 + (leftCut ? roundCut : 0);
    const b = x1 - (rightCut ? roundCut : 0);
    if (b - a > 0.45) out.push(compose((a + b) / 2, z, y, b - a, h, w));
  };
  const addV = (x: number, topCut: boolean, bottomCut: boolean) => {
    const a = z0 + (topCut ? roundCut : 0);
    const b = z1 - (bottomCut ? roundCut : 0);
    if (b - a > 0.45) out.push(compose(x, (a + b) / 2, y, w, h, b - a));
  };

  addH(z0 + w / 2, round.nw, round.ne);
  addH(z1 - w / 2, round.sw, round.se);
  addV(x0 + w / 2, round.nw, round.sw);
  addV(x1 - w / 2, round.ne, round.se);
}

function addMergedBlockWalkways(group: THREE.Group, model: CityModel): void {
  const paths: THREE.Matrix4[] = [];
  const plazas: THREE.Matrix4[] = [];
  const pathW = 5.2;
  const plazaW = 10.5;

  for (const r of model.mergedBlocks) {
    for (let i = r.bi0 + 1; i < r.bi0 + r.w; i++) {
      for (let j = r.bj0; j < r.bj0 + r.h; j++) {
        const a = roadZ(j) + SIDEWALK_CENTER;
        const b = roadZ(j + 1) - SIDEWALK_CENTER;
        if (b > a) paths.push(compose(roadX(i), (a + b) / 2, 0.08, pathW, 0.16, b - a));
      }
      const cx = roadX(i);
      const za = roadZ(r.bj0) + SIDEWALK_CENTER;
      const zb = roadZ(r.bj0 + r.h) - SIDEWALK_CENTER;
      const doors = model.buildings.filter((b) => Math.abs(Math.abs(b.door.x - cx) - SIDEWALK_CENTER) < 0.02 && b.door.z > za && b.door.z < zb);
      for (const b of doors) paths.push(compose((cx + b.door.x) / 2, b.door.z, 0.1, Math.abs(b.door.x - cx), 0.14, 1.7));
    }
    for (let j = r.bj0 + 1; j < r.bj0 + r.h; j++) {
      for (let i = r.bi0; i < r.bi0 + r.w; i++) {
        const a = roadX(i) + SIDEWALK_CENTER;
        const b = roadX(i + 1) - SIDEWALK_CENTER;
        if (b > a) paths.push(compose((a + b) / 2, roadZ(j), 0.08, b - a, 0.16, pathW));
      }
      const cz = roadZ(j);
      const xa = roadX(r.bi0) + SIDEWALK_CENTER;
      const xb = roadX(r.bi0 + r.w) - SIDEWALK_CENTER;
      const doors = model.buildings.filter((b) => Math.abs(Math.abs(b.door.z - cz) - SIDEWALK_CENTER) < 0.02 && b.door.x > xa && b.door.x < xb);
      for (const b of doors) paths.push(compose(b.door.x, (cz + b.door.z) / 2, 0.1, 1.7, 0.14, Math.abs(b.door.z - cz)));
    }
    for (let i = r.bi0 + 1; i < r.bi0 + r.w; i++) {
      for (let j = r.bj0 + 1; j < r.bj0 + r.h; j++) {
        plazas.push(compose(roadX(i), roadZ(j), 0.09, plazaW, 0.18, plazaW));
      }
    }
  }

  const pathMat = new THREE.MeshLambertMaterial({ color: 0xc9c1ad });
  const plazaMat = new THREE.MeshLambertMaterial({ color: 0xbdb49f });
  if (paths.length) group.add(instanced(new THREE.BoxGeometry(1, 1, 1), pathMat, paths, { receiveShadow: true }));
  if (plazas.length) group.add(instanced(new THREE.BoxGeometry(1, 1, 1), plazaMat, plazas, { receiveShadow: true }));
}

function addMergedBlockLamps(model: CityModel, addLamp: (x: number, z: number) => void): void {
  for (const r of model.mergedBlocks) {
    for (let i = r.bi0 + 1; i < r.bi0 + r.w; i++) {
      for (let j = r.bj0; j < r.bj0 + r.h; j++) {
        const z = (roadZ(j) + roadZ(j + 1)) / 2;
        addLamp(roadX(i) - 3.6, z);
      }
    }
    for (let j = r.bj0 + 1; j < r.bj0 + r.h; j++) {
      for (let i = r.bi0; i < r.bi0 + r.w; i++) {
        const x = (roadX(i) + roadX(i + 1)) / 2;
        addLamp(x, roadZ(j) + 3.6);
      }
    }
  }
}

function buildMergedBlockBenches(model: CityModel): Bench[] {
  const benches: Bench[] = [];
  for (const r of model.mergedBlocks) {
    for (let i = r.bi0 + 1; i < r.bi0 + r.w; i++) {
      for (let j = r.bj0; j < r.bj0 + r.h; j++) {
        benches.push({
          x: roadX(i) + 4.1,
          z: (roadZ(j) + roadZ(j + 1)) / 2,
          heading: -Math.PI / 2,
          shade: (i + j) % 3,
        });
      }
    }
    for (let j = r.bj0 + 1; j < r.bj0 + r.h; j++) {
      for (let i = r.bi0; i < r.bi0 + r.w; i++) {
        benches.push({
          x: (roadX(i) + roadX(i + 1)) / 2,
          z: roadZ(j) - 4.1,
          heading: 0,
          shade: (i * 2 + j) % 3,
        });
      }
    }
  }
  return benches;
}

function buildMergedBlockPlanters(model: CityModel): Hedge[] {
  const hedges: Hedge[] = [];
  for (const r of model.mergedBlocks) {
    for (let i = r.bi0 + 1; i < r.bi0 + r.w; i++) {
      for (let j = r.bj0; j < r.bj0 + r.h; j++) {
        const z = (roadZ(j) + roadZ(j + 1)) / 2;
        hedges.push({ x: roadX(i) - 4.4, z, w: 0.9, d: 5.2, heading: 0, shade: (i + j) % 4 });
      }
    }
    for (let j = r.bj0 + 1; j < r.bj0 + r.h; j++) {
      for (let i = r.bi0; i < r.bi0 + r.w; i++) {
        const x = (roadX(i) + roadX(i + 1)) / 2;
        hedges.push({ x, z: roadZ(j) + 4.4, w: 0.9, d: 5.2, heading: Math.PI / 2, shade: (i + j * 2) % 4 });
      }
    }
  }
  return hedges;
}

function addParkLamps(model: CityModel, addLamp: (x: number, z: number) => void): void {
  const park = model.park;
  const margin = 9;
  const x0 = roadX(park.bi0) + CORRIDOR_HALF + margin;
  const x1 = roadX(park.bi0 + park.w) - CORRIDOR_HALF - margin;
  const z0 = roadZ(park.bj0) + CORRIDOR_HALF + margin;
  const z1 = roadZ(park.bj0 + park.h) - CORRIDOR_HALF - margin;
  const w = x1 - x0;
  const d = z1 - z0;
  if (w < 6 || d < 6) return;

  const cols = Math.max(1, Math.ceil(w / PARK_LAMP_SPACING));
  const rows = Math.max(1, Math.ceil(d / PARK_LAMP_SPACING));
  const xStep = w / cols;
  const zStep = d / rows;
  for (let iz = 0; iz < rows; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      const stagger = rows > 1 && ix % 2 === 1 ? zStep * 0.12 : 0;
      const jx = (lampJitter(park.bi0, park.bj0, ix, iz, 0) - 0.5) * Math.min(6, xStep * 0.34);
      const jz = (lampJitter(park.bi0, park.bj0, ix, iz, 1) - 0.5) * Math.min(6, zStep * 0.34);
      const x = clamp(x0 + xStep * (ix + 0.5) + jx, x0 + 2.2, x1 - 2.2);
      const z = clamp(z0 + zStep * (iz + 0.5) + stagger + jz, z0 + 2.2, z1 - 2.2);
      addLamp(x, z);
    }
  }
}

function lampJitter(a: number, b: number, c: number, d: number, salt: number): number {
  let n = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 2654435761) ^ (salt * 1597334677);
  n = Math.imul(n ^ (n >>> 15), 1 | n);
  n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function addParkHedges(group: THREE.Group, hedges: Hedge[]): void {
  if (hedges.length === 0) return;
  const bodies: THREE.Matrix4[] = [];
  const bodyColors: THREE.Color[] = [];
  const leaves: THREE.Matrix4[] = [];
  const leafColors: THREE.Color[] = [];

  for (let i = 0; i < hedges.length; i++) {
    const h = hedges[i];
    bodies.push(composeYaw(h.x, h.z, 0.56, h.w, 1.12, h.d, h.heading));
    bodyColors.push(new THREE.Color(HEDGE_GREENS[h.shade % HEDGE_GREENS.length]));
    const count = Math.max(2, Math.floor(h.d / 1.15));
    for (let k = 0; k < count; k++) {
      const along = -h.d / 2 + ((k + 0.5) * h.d) / count;
      const side = k % 2 === 0 ? -0.24 : 0.24;
      const wobble = Math.sin(i * 12.989 + k * 4.17) * 0.12;
      const p = hedgePoint(h, side + wobble, along);
      leaves.push(composeYaw(p.x, p.z, 1.13 + (k % 3) * 0.035, 0.8, 0.36, 0.7, h.heading + (k % 2 === 0 ? 0.25 : -0.18)));
      leafColors.push(new THREE.Color(HEDGE_GREENS[(h.shade + k) % HEDGE_GREENS.length]));
    }
  }

  group.add(
    instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), bodies, {
      castShadow: true,
      receiveShadow: true,
      colors: bodyColors,
    }),
  );
  group.add(
    instanced(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), leaves, {
      castShadow: true,
      colors: leafColors,
    }),
  );
}

function hedgePoint(h: Hedge, lx: number, lz: number): { x: number; z: number } {
  const s = Math.sin(h.heading);
  const c = Math.cos(h.heading);
  return { x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c };
}

function addParkBenches(group: THREE.Group, benches: Bench[]): void {
  if (benches.length === 0) return;
  const woodMats: THREE.Matrix4[] = [];
  const woodColors: THREE.Color[] = [];
  const metalBoxes: THREE.Matrix4[] = [];
  const metalRods: THREE.Matrix4[] = [];
  const screws: THREE.Matrix4[] = [];
  const woodPalette = [0xb86a2c, 0xc77735, 0xa85f29];

  for (const b of benches) {
    const color = new THREE.Color(woodPalette[b.shade % woodPalette.length]);
    for (const z of [-0.46, -0.1, 0.26]) {
      benchBox(woodMats, b, 0, z, 0.68, 4.8, 0.16, 0.28);
      woodColors.push(color);
    }
    for (const y of [1.22, 1.68]) {
      benchBox(woodMats, b, 0, 0.72, y, 4.8, 0.22, 0.18);
      woodColors.push(color.clone().multiplyScalar(y > 1.3 ? 0.9 : 1));
    }
    for (const x of [-1.95, 1.95]) {
      for (const z of [-0.46, -0.1, 0.26]) benchScrew(screws, b, x, z, 0.78);
      for (const y of [1.22, 1.68]) benchScrew(screws, b, x, 0.72, y);
    }
    for (const x of [-1.65, 1.65]) addBenchFrame(b, x, metalBoxes, metalRods);
  }

  group.add(
    instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), woodMats, {
      castShadow: true,
      receiveShadow: true,
      colors: woodColors,
    }),
  );
  group.add(
    instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x151311 }), metalBoxes, {
      castShadow: true,
      receiveShadow: true,
    }),
  );
  group.add(
    instanced(new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshLambertMaterial({ color: 0x151311 }), metalRods, {
      castShadow: true,
      receiveShadow: true,
    }),
  );
  group.add(
    instanced(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0xb8b3aa }), screws, {
      castShadow: true,
    }),
  );
}

function addBenchFrame(b: Bench, lx: number, boxes: THREE.Matrix4[], rods: THREE.Matrix4[]): void {
  benchBox(boxes, b, lx, -0.66, 0.08, 0.55, 0.12, 0.22);
  benchBox(boxes, b, lx, 0.82, 0.08, 0.55, 0.12, 0.22);
  benchRod(rods, b, lx, 0.12, -0.58, lx, 0.67, -0.36, 0.07);
  benchRod(rods, b, lx, 0.12, 0.62, lx, 1.76, 0.72, 0.07);
  const pts: Array<[number, number]> = [
    [-0.58, 0.24],
    [-0.22, 0.45],
    [0.22, 0.45],
    [0.62, 0.24],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    benchRod(rods, b, lx, pts[i][1], pts[i][0], lx, pts[i + 1][1], pts[i + 1][0], 0.055);
  }
}

function benchBox(out: THREE.Matrix4[], b: Bench, lx: number, lz: number, y: number, sx: number, sy: number, sz: number): void {
  const p = benchWorldPoint(b, lx, y, lz);
  out.push(
    new THREE.Matrix4().compose(
      p,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.heading, 0)),
      new THREE.Vector3(sx, sy, sz),
    ),
  );
}

function benchScrew(out: THREE.Matrix4[], b: Bench, lx: number, lz: number, y: number): void {
  out.push(new THREE.Matrix4().compose(benchWorldPoint(b, lx, y, lz), new THREE.Quaternion(), new THREE.Vector3(0.055, 0.055, 0.055)));
}

function benchRod(
  out: THREE.Matrix4[],
  b: Bench,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r: number,
): void {
  const a = benchWorldPoint(b, ax, ay, az);
  const c = benchWorldPoint(b, bx, by, bz);
  const dir = c.clone().sub(a);
  const len = dir.length();
  if (len < 0.01) return;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  out.push(new THREE.Matrix4().compose(a.add(c).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r)));
}

function benchWorldPoint(b: Bench, lx: number, y: number, lz: number): THREE.Vector3 {
  const s = Math.sin(b.heading);
  const c = Math.cos(b.heading);
  return new THREE.Vector3(b.x + lx * c + lz * s, y, b.z - lx * s + lz * c);
}

/** Pasa un punto local del juego (origen en su base, +Z al frente) a coordenadas de mundo. */
function playWorldPoint(item: RenderPlayItem, lx: number, y: number, lz: number): THREE.Vector3 {
  const s = Math.sin(item.heading);
  const c = Math.cos(item.heading);
  return new THREE.Vector3(item.x + lx * c + lz * s, y, item.z - lx * s + lz * c);
}

/**
 * Render de los juegos de parque: suelo blando bajo cada zona de juego + dispatch
 * type-agnóstico a los renderers (espejo del bucle de árboles). Tres `InstancedMesh`
 * compartidas (cajas, cilindros, esferas) con color por instancia.
 */
function addPlayItems(group: THREE.Group, model: CityModel): void {
  // Suelo blando (caucho) de cada zona de juego, con bordillo perimetral.
  for (const p of model.playgrounds) {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.12, d),
      new THREE.MeshLambertMaterial({ color: 0xc08a52 }),
    );
    surface.position.set(cx, 0.06, cz);
    surface.receiveShadow = true;
    group.add(surface);
    const curbMat = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
    for (const [sx, sz, ox, oz] of [
      [w + 0.4, 0.5, 0, -d / 2],
      [w + 0.4, 0.5, 0, d / 2],
      [0.5, d + 0.4, -w / 2, 0],
      [0.5, d + 0.4, w / 2, 0],
    ] as const) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.22, sz), curbMat);
      curb.position.set(cx + ox, 0.11, cz + oz);
      curb.castShadow = true;
      curb.receiveShadow = true;
      group.add(curb);
    }
  }
  if (model.playItems.length === 0) return;

  const buckets: PlayRenderBuckets = {
    boxMats: [], boxColors: [],
    cylMats: [], cylColors: [],
    sphereMats: [], sphereColors: [],
  };
  const helpers: PlayRenderHelpers = {
    box(item, lx, lz, y, sx, sy, sz, color, rx = 0, yawLocal = 0, rz = 0) {
      const p = playWorldPoint(item, lx, y, lz);
      buckets.boxMats.push(
        new THREE.Matrix4().compose(
          p,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, item.heading + yawLocal, rz)),
          new THREE.Vector3(sx, sy, sz),
        ),
      );
      buckets.boxColors.push(new THREE.Color(color));
    },
    rod(item, ax, ay, az, bx, by, bz, r, color) {
      const a = playWorldPoint(item, ax, ay, az);
      const b = playWorldPoint(item, bx, by, bz);
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 1e-4) return;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      buckets.cylMats.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r)));
      buckets.cylColors.push(new THREE.Color(color));
    },
    sphere(item, lx, lz, y, r, color) {
      buckets.sphereMats.push(new THREE.Matrix4().compose(playWorldPoint(item, lx, y, lz), new THREE.Quaternion(), new THREE.Vector3(r, r, r)));
      buckets.sphereColors.push(new THREE.Color(color));
    },
  };
  const ctx: PlayRenderCtx = { buckets, helpers };
  for (const item of model.playItems) playRenderers[item.kind].render(item, ctx);

  group.add(
    instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), buckets.boxMats, {
      castShadow: true,
      receiveShadow: true,
      colors: buckets.boxColors,
    }),
  );
  group.add(
    instanced(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }), buckets.cylMats, {
      castShadow: true,
      receiveShadow: true,
      colors: buckets.cylColors,
    }),
  );
  group.add(
    instanced(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), buckets.sphereMats, {
      castShadow: true,
      colors: buckets.sphereColors,
    }),
  );
}

function addBuildings(
  group: THREE.Group,
  roofGroup: THREE.Group,
  model: CityModel,
  windowMaterial: THREE.MeshStandardMaterial,
  marketLampMaterial: THREE.MeshBasicMaterial,
): { doors: DoorAnimator; marketDoors: SlidingDoorAnimator; floorLamps: FloorLampController } {
  const bodyMats: THREE.Matrix4[] = [];
  const bodyColors: THREE.Color[] = [];
  const hipRoofMats: THREE.Matrix4[] = [];
  const hipRoofColors: THREE.Color[] = [];
  const gableRoofMats: THREE.Matrix4[] = [];
  const gableRoofColors: THREE.Color[] = [];
  const flatRoofMats: THREE.Matrix4[] = [];
  const flatRoofColors: THREE.Color[] = [];
  const parapetMats: THREE.Matrix4[] = [];
  const roofBoxMats: THREE.Matrix4[] = [];
  const roofTankMats: THREE.Matrix4[] = [];
  const awningMats: THREE.Matrix4[] = [];
  const awningColors: THREE.Color[] = [];
  const signMats: THREE.Matrix4[] = [];
  const signColors: THREE.Color[] = [];
  const marketGlassMats: THREE.Matrix4[] = []; // cristal transparente fijo del escaparate del súper
  const marketDoorLeafMats: THREE.Matrix4[] = []; // hojas correderas (estado inicial cerrado)
  const marketDoorPoses: SlidingDoorPose[] = []; // una por supermercado, para animarlas
  const marketLampMats: THREE.Matrix4[] = []; // bombillas colgantes (material propio: marketLampMaterial)
  const stainedGlassMats: THREE.Matrix4[] = []; // vidrieras laterales de colores
  const stainedGlassColors: THREE.Color[] = [];
  const checkoutMats: THREE.Matrix4[] = [];
  const conveyorMats: THREE.Matrix4[] = [];
  const marketCeilingMats: THREE.Matrix4[] = []; // placa del falso techo (va al roofGroup)
  const marketCeilingLineMats: THREE.Matrix4[] = []; // retícula fina entre baldosas
  const produceMats: THREE.Matrix4[] = []; // montones de fruta/verdura de la isla
  const produceColors: THREE.Color[] = [];
  const doorMats: THREE.Matrix4[] = [];
  const windowMats: THREE.Matrix4[] = []; // cristal
  const windowFrameMats: THREE.Matrix4[] = []; // marco + montantes + antepecho
  const balconySlabMats: THREE.Matrix4[] = [];
  const balconyRailMats: THREE.Matrix4[] = [];
  const corniceMats: THREE.Matrix4[] = [];
  const acBodyMats: THREE.Matrix4[] = [];
  const acVentMats: THREE.Matrix4[] = [];
  const pipeMats: THREE.Matrix4[] = [];
  const acRoofMats: THREE.Matrix4[] = [];
  const acFanMats: THREE.Matrix4[] = [];
  const binBodyMats: THREE.Matrix4[] = [];
  const binBodyColors: THREE.Color[] = [];
  const binLidMats: THREE.Matrix4[] = [];
  const binLidColors: THREE.Color[] = [];
  const doorPoses: DoorPose[] = [];

  const partitionMats: THREE.Matrix4[] = []; // tabiques interiores de las casas
  const partitionColors: THREE.Color[] = []; // un tono de tabique por edificio
  const floorMats: THREE.Matrix4[] = []; // suelo interior de las casas
  const floorColors: THREE.Color[] = []; // un tono de suelo por edificio

  // Mobiliario interior: cama (estructura, colchón, manta, almohadas, cabecero).
  const bedFrameMats: THREE.Matrix4[] = [];
  const bedMattressMats: THREE.Matrix4[] = [];
  const bedBlanketMats: THREE.Matrix4[] = [];
  const bedPillowMats: THREE.Matrix4[] = [];
  const bedHeadboardMats: THREE.Matrix4[] = [];

  // Mobiliario auxiliar: madera (mesitas/armarios/cómodas), oscuro (tiradores) y alfombras.
  const furnWoodMats: THREE.Matrix4[] = [];
  const furnDarkMats: THREE.Matrix4[] = [];
  const tvStandMats: THREE.Matrix4[] = []; // mueble de TV (color por instancia, por variante)
  const tvStandColors: THREE.Color[] = [];
  const tvBezelMats: THREE.Matrix4[] = []; // marco gris de la pantalla
  const tvScreenMats: THREE.Matrix4[] = []; // pantalla negra, hundida respecto al marco
  const rugMats: THREE.Matrix4[] = [];
  const rugColors: THREE.Color[] = [];
  const bathCeramicMats: THREE.Matrix4[] = [];
  const bathDarkMats: THREE.Matrix4[] = [];
  const bathGlassMats: THREE.Matrix4[] = [];
  const bathMirrorMats: THREE.Matrix4[] = [];
  const showerMetalMats: THREE.Matrix4[] = []; // palo/herrajes de la columna de ducha (gris metálico)
  const showerHeadMats: THREE.Matrix4[] = []; // rociador de ducha (color por instancia)
  const showerHeadColors: THREE.Color[] = [];
  const bathWoodMats: THREE.Matrix4[] = [];
  const bathTowelMats: THREE.Matrix4[] = [];
  const bathTowelColors: THREE.Color[] = [];
  const applianceMats: THREE.Matrix4[] = []; // electrodomésticos de cocina (acero claro)
  const counterTopMats: THREE.Matrix4[] = []; // encimeras de cocina (piedra clara)
  const plantPotMats: THREE.Matrix4[] = []; // macetas (terracota) de plantas de interior
  const plantLeafMats: THREE.Matrix4[] = []; // follaje (verde) de plantas de interior
  const upholsteryMats: THREE.Matrix4[] = []; // tapizado de sofás/sillones
  const upholsteryColors: THREE.Color[] = [];
  const bookMats: THREE.Matrix4[] = []; // libros de las librerías
  const bookColors: THREE.Color[] = [];
  const lampShades: LampShade[] = []; // pantallas emisivas de lámparas de pie (varias geometrías)
  const stairMats: THREE.Matrix4[] = []; // peldaños de las escaleras de los edificios altos
  const stairColors: THREE.Color[] = []; // peldaños del color del suelo de cada edificio
  const stairRailMats: THREE.Matrix4[] = []; // barandillas de escaleras/rellanos (lado del ojo)
  const dwellingDoorMats: THREE.Matrix4[] = []; // hojas de puerta de las viviendas en edificios altos
  const dwellingDoorHandleMats: THREE.Matrix4[] = []; // pomos de esas puertas
  const doorPlateMats: THREE.Matrix4[] = []; // placa negra del número de vivienda
  // Quads del número impreso, agrupados por número: una CanvasTexture + una malla
  // por valor distinto (≈ tantas como plantas máximas en la ciudad).
  const plateNumberMats = new Map<number, THREE.Matrix4[]>();

  // Buckets compartidos: el objeto solo aliasa los arrays de arriba para pasarlos
  // a los renderers por tipo; el ensamblado de InstancedMesh sigue leyéndolos.
  const buckets: RenderBuckets = {
    bodyMats, bodyColors,
    hipRoofMats, hipRoofColors,
    gableRoofMats, gableRoofColors,
    flatRoofMats, flatRoofColors,
    parapetMats, roofBoxMats, roofTankMats,
    awningMats, awningColors,
    signMats, signColors,
    marketGlassMats, marketDoorLeafMats, marketDoorPoses,
    marketLampMats, stainedGlassMats, stainedGlassColors, checkoutMats, conveyorMats,
    marketCeilingMats, marketCeilingLineMats, produceMats, produceColors,
    windowMats, windowFrameMats,
    balconySlabMats, balconyRailMats, corniceMats,
    partitionMats, floorMats,
    bedFrameMats, bedMattressMats, bedBlanketMats, bedPillowMats, bedHeadboardMats,
    furnWoodMats, furnDarkMats, tvStandMats, tvStandColors, tvBezelMats, tvScreenMats, rugMats, rugColors,
    bathCeramicMats, bathDarkMats, bathGlassMats, bathMirrorMats, showerMetalMats, showerHeadMats, showerHeadColors, bathWoodMats, bathTowelMats, bathTowelColors,
    applianceMats, counterTopMats,
    plantPotMats, plantLeafMats,
    upholsteryMats, upholsteryColors, bookMats, bookColors, lampShades,
    stairMats, stairRailMats, dwellingDoorMats, dwellingDoorHandleMats, doorPlateMats, plateNumberMats,
  };
  // Helpers de geometría inyectados (definidos en este módulo) + paletas.
  const helpers: BuildingRenderHelpers = {
    compose, composeYaw,
    addFlatRoof, addRoofFixture, addFrontBalconies, addFacadeBands, addWindowRow, addHouseShell, addMarketShell, addShopShell, addBed,
    addNightstand, addWardrobe, addDresser, addRug, addShower, addBathtub, addSink, addToilet, addBathVanity, addBathShelf, addTowelStack,
    addDiningTable, addDiningChair, addSideboard, addPottedPlant,
    addUpholstered, addTv, addCoffeeTable, addBookshelf, addFloorLamp,
    addFridge, addStove, addOven, addMicrowave, addKitchenCounter, addKitchenCabinet, addOfficeShell,
    palettes: { building: BUILDING_PALETTES, awning: AWNING_COLORS, sign: SIGN_COLORS },
  };
  const ctx: BuildingRenderCtx = { buckets, helpers };

  for (const b of model.buildings) {
    const variant = buildingVariant(b);
    const geom: BuildingGeom = {
      faceAngle: Math.atan2(b.faceX, b.faceZ),
      frontW: b.faceX !== 0 ? b.d : b.w, // ancho de fachada
      frontDist: (b.faceX !== 0 ? b.w : b.d) / 2, // semiprofundidad hacia la calle
      roofColor: new THREE.Color(ROOF_COLORS[(b.colorIdx + variant) % ROOF_COLORS.length]),
    };

    // Geometría propia del tipo (cuerpo, tejado, ventanas, detalles característicos).
    buildingRenderers[b.type].render(b, variant, geom, ctx);

    // Variedad de interior por edificio: un tono de suelo (que comparten sus
    // escaleras) y un tono de tabique. Se rellenan los arrays de color hasta la
    // longitud actual de cada bucket, así no hay que tocar las funciones internas.
    const floorColor = new THREE.Color(FLOOR_PALETTE[(b.colorIdx * 2 + variant) % FLOOR_PALETTE.length]);
    const wallColor = new THREE.Color(PARTITION_PALETTE[(b.colorIdx + variant + 1) % PARTITION_PALETTE.length]);
    while (floorColors.length < floorMats.length) floorColors.push(floorColor);
    while (stairColors.length < stairMats.length) stairColors.push(floorColor);
    while (partitionColors.length < partitionMats.length) partitionColors.push(wallColor);

    // Detalles comunes a todos los tipos: aire acondicionado, bajantes y AC de cubierta.
    addBuildingDetails(b, variant, acBodyMats, acVentMats, pipeMats, acRoofMats, acFanMats);
    // Contenedores de reciclaje en algunos puntos repartidos por los barrios.
    if (b.id % 6 === 2) addBinsCluster(b, binBodyMats, binBodyColors, binLidMats, binLidColors);

    // Puerta batiente genérica en la fachada. Los supermercados tienen su PROPIA
    // puerta corredera (ver MarketRenderer/marketDoorPoses); aquí se les reserva
    // un hueco degenerado (tamaño ~0, invisible) solo para no desalinear los
    // índices posicionales de `doorPoses` (que `DoorAnimator` y
    // `collectDoorInteractables` asumen 1:1 con `model.buildings`).
    const isMarket = b.type === 'shop' && b.shopKind === 'supermarket';
    const dx = b.x + b.faceX * (geom.frontDist + 0.06);
    const dz = b.z + b.faceZ * (geom.frontDist + 0.06);
    const door: DoorPose = isMarket
      ? { x: dx, z: dz, y: 0, yaw: geom.faceAngle, width: 0.001, height: 0.001, depth: 0.001, hingeSide: -1 }
      : { x: dx, z: dz, y: 1.15, yaw: geom.faceAngle, width: 1.5, height: 2.3, depth: 0.14, hingeSide: b.id % 2 === 0 ? -1 : 1 };
    doorPoses.push(door);
    doorMats.push(doorMatrix(door, 0));
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  group.add(
    instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), bodyMats, {
      castShadow: true,
      receiveShadow: true,
      colors: bodyColors,
    }),
  );
  // Interiores de casas: tabiques claros y suelo de tarima.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), partitionMats, { castShadow: true, receiveShadow: true, colors: partitionColors }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), floorMats, { receiveShadow: true, colors: floorColors }));
  // Camas: estructura de madera, colchón claro, manta de color, almohadas y cabecero.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x6b4f37 }), bedFrameMats, { castShadow: true, receiveShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xf3efe6 }), bedMattressMats, { castShadow: true, receiveShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x7d93b8 }), bedBlanketMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xfbf7f0 }), bedPillowMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x5a4029 }), bedHeadboardMats, { castShadow: true }));
  // Mobiliario auxiliar: cuerpos de madera, herrajes oscuros y alfombras.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x8a6a45 }), furnWoodMats, { castShadow: true, receiveShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x33271a }), furnDarkMats, { castShadow: true }));
  // Mueble de TV (color por variante) y pantalla: marco gris + panel negro hundido.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), tvStandMats, { castShadow: true, receiveShadow: true, colors: tvStandColors }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x55585e }), tvBezelMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x050608 }), tvScreenMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), rugMats, { receiveShadow: true, colors: rugColors }));
  // Plantas de interior: maceta de terracota y follaje verde.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xb5613a }), plantPotMats, { castShadow: true, receiveShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x4f7a3a }), plantLeafMats, { castShadow: true }));
  // Salón: tapizado de sofás/sillones, libros de colores y pantallas de lámpara.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), upholsteryMats, { castShadow: true, receiveShadow: true, colors: upholsteryColors }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), bookMats, { castShadow: true, colors: bookColors }));
  // Pantallas de lámpara de pie: emisivo encendible por instancia, una malla por
  // geometría de pantalla (tambor cilíndrico / campana cónica) — ver FloorLamps.
  const { meshes: lampShadeMeshes, controller: floorLamps } = buildFloorLamps(lampShades);
  for (const m of lampShadeMeshes) group.add(m);
  // Baños: porcelana clara, detalles cromados/oscuros y cristal/agua azulada.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xf2f1e8 }), bathCeramicMats, { castShadow: true, receiveShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x5d6870 }), bathDarkMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xaad6e3, transparent: true, opacity: 0.34 }), bathGlassMats));
  group.add(instanced(unitBox, new THREE.MeshStandardMaterial({ color: 0xb8d2dc, metalness: 0.45, roughness: 0.18 }), bathMirrorMats));
  // Columna de ducha: herrajes gris metálico; rociador con color por instancia (negro/blanco/acero).
  group.add(instanced(unitBox, new THREE.MeshStandardMaterial({ color: 0x8c9298, metalness: 0.6, roughness: 0.4 }), showerMetalMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.45 }), showerHeadMats, { castShadow: true, colors: showerHeadColors }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x8b623d }), bathWoodMats, { castShadow: true, receiveShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), bathTowelMats, { castShadow: true, colors: bathTowelColors }));
  // Cocina: electrodomésticos de acero claro y encimeras de piedra clara.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xd3d8de }), applianceMats, { castShadow: true, receiveShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xe9e6dd }), counterTopMats, { castShadow: true, receiveShadow: true }));
  // Escaleras de los edificios altos: peldaños del color del suelo de cada edificio
  // (colores por instancia); barandilla en un tono oscuro neutro para contraste.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), stairMats, { castShadow: true, receiveShadow: true, colors: stairColors }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x8f7a55 }), stairRailMats, { castShadow: true }));
  // Puertas de vivienda visibles desde el rellano de cada edificio alto.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x5a412d }), dwellingDoorMats, { castShadow: true, receiveShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xd1aa55 }), dwellingDoorHandleMats, { castShadow: true }));
  // Placa negra del número de vivienda, junto a cada puerta del rellano.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x111114 }), doorPlateMats));
  // Número impreso sobre la placa: un quad con CanvasTexture por valor distinto
  // (sin material por instancia → agrupamos las placas por su número).
  const plateQuad = new THREE.PlaneGeometry(1, 1);
  for (const [n, mats] of plateNumberMats) {
    const mat = new THREE.MeshBasicMaterial({ map: makeNumberTexture(n), transparent: true });
    group.add(instanced(plateQuad, mat, mats));
  }
  roofGroup.add(
    instanced(makeHipRoofGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), hipRoofMats, {
      castShadow: true,
      colors: hipRoofColors,
    }),
  );
  roofGroup.add(
    instanced(makeGableRoofGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), gableRoofMats, {
      castShadow: true,
      colors: gableRoofColors,
    }),
  );
  roofGroup.add(
    instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), flatRoofMats, {
      castShadow: true,
      receiveShadow: true,
      colors: flatRoofColors,
    }),
  );
  // Falso techo registrable del supermercado: baldosas blancas + retícula fina
  // gris. Va en el roofGroup para que "Quitar tejados" también lo retire y deje
  // ver el interior desde arriba.
  roofGroup.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }), marketCeilingMats, { receiveShadow: true }));
  roofGroup.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x8b8f92 }), marketCeilingLineMats));
  roofGroup.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x5a6268 }), parapetMats, { castShadow: true }));
  roofGroup.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x4c5358 }), roofBoxMats, { castShadow: true }));
  roofGroup.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), new THREE.MeshLambertMaterial({ color: 0x707b80 }), roofTankMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), awningMats, { colors: awningColors }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), signMats, { colors: signColors }));
  // Cristal fijo del escaparate del supermercado (no anima): translúcido de verdad.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xbfe0ea, transparent: true, opacity: 0.28 }), marketGlassMats));
  // Hojas correderas de la puerta del supermercado: mismo cristal, pero en su
  // propia InstancedMesh porque `SlidingDoorAnimator` reescribe sus matrices cada frame.
  const marketDoorMesh = instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xbfe0ea, transparent: true, opacity: 0.28 }), marketDoorLeafMats);
  group.add(marketDoorMesh);
  // Vidrieras laterales del supermercado: cristal de colores (color por instancia).
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }), stainedGlassMats, { colors: stainedGlassColors }));
  // Bombillas colgantes del techo del supermercado: material PROPIO (compartido,
  // no clonado): `DayNightCycle` las enciende de DÍA y las apaga de noche, al
  // revés que las farolas. Sin cono de luz (solo la bombilla).
  group.add(instanced(new THREE.SphereGeometry(0.5, 10, 8), marketLampMaterial, marketLampMats));
  // Interior del supermercado: mostradores de caja y cinta transportadora.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xd8d8d2 }), checkoutMats, { castShadow: true, receiveShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x2e3033 }), conveyorMats, { castShadow: true }));
  // Sección de frutería: cajas verdes + montones de fruta/verdura (color por instancia).
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), produceMats, { castShadow: true, receiveShadow: true, colors: produceColors }));
  const doorMesh = instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x4a3b2f }), doorMats);
  group.add(doorMesh);
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x6b6258 }), balconySlabMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x2f3439 }), balconyRailMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x737a80 }), corniceMats, { castShadow: true }));
  group.add(instanced(unitBox, windowMaterial, windowMats));
  // Marco/montantes/antepecho de las ventanas (PVC claro), en relieve sobre la fachada.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xeae6db }), windowFrameMats, { castShadow: true, receiveShadow: true }));

  // Aparatos de aire acondicionado (cuerpo + rejilla), tuberías y AC de cubierta.
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xced2d5 }), acBodyMats, { castShadow: true }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0x34373b }), acVentMats));
  group.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), new THREE.MeshLambertMaterial({ color: 0x8a9095 }), pipeMats, { castShadow: true }));
  roofGroup.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xb7bbbe }), acRoofMats, { castShadow: true }));
  roofGroup.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), new THREE.MeshLambertMaterial({ color: 0x303338 }), acFanMats));

  // Contenedores de reciclaje (cuerpo y tapa coloreados por instancia).
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), binBodyMats, { castShadow: true, colors: binBodyColors }));
  group.add(instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), binLidMats, { castShadow: true, colors: binLidColors }));
  return {
    doors: new DoorAnimator(doorMesh, doorPoses),
    marketDoors: new SlidingDoorAnimator(marketDoorMesh, marketDoorPoses),
    floorLamps,
  };
}

type RenderBuilding = CityModel['buildings'][number];

/**
 * Casco hueco de una casa con interior: suelo, cuatro muros perimetrales (la
 * fachada con hueco de puerta) y los tabiques del modelo. Las caras exteriores
 * de los muros coinciden exactamente con la caja maciza anterior, así que por
 * fuera la casa se ve igual (ventanas y puerta son apliques y no cambian).
 */
function addHouseShell(
  b: RenderBuilding,
  bodyMats: THREE.Matrix4[],
  bodyColors: THREE.Color[],
  partitionMats: THREE.Matrix4[],
  floorMats: THREE.Matrix4[],
  glassMats: THREE.Matrix4[],
  frameMats: THREE.Matrix4[],
): void {
  const interior = b.interior!;
  const t = interior.wallT;
  const color = new THREE.Color(BUILDING_PALETTES.house[b.colorIdx % 6]);
  const pushBody = (m: THREE.Matrix4) => {
    bodyMats.push(m);
    bodyColors.push(color);
  };
  const pushPartition = (m: THREE.Matrix4) => partitionMats.push(m);

  // Suelo interior (tarima).
  floorMats.push(compose(b.x, b.z, 0.09, b.w - 0.02, 0.18, b.d - 0.02));

  const doorHalf = 0.78;
  const doorTop = Math.min(DOOR_TOP_MAX, b.h - 0.4);

  // Bandas verticales de ventana válidas (una por planta), centro + alféizar/dintel.
  const bands: Array<{ yc: number; y0: number; y1: number }> = [];
  const floors = Math.max(1, Math.floor((b.h - 1.6) / 3));
  for (let f = 0; f < floors; f++) {
    const yc = Math.min(2.1 + f * 3, b.h - 1.2);
    const y0 = yc - WINDOW_H / 2;
    const y1 = yc + WINDOW_H / 2;
    if (y0 >= 0.4 && y1 <= b.h - 0.3) bands.push({ yc, y0, y1 });
  }

  // Caras interiores de los muros perimetrales (donde apoyan los bordes de las estancias).
  const innerX0 = b.x - b.w / 2 + t;
  const innerX1 = b.x + b.w / 2 - t;
  const innerZ0 = b.z - b.d / 2 + t;
  const innerZ1 = b.z + b.d / 2 - t;
  const EPS = 0.06;

  // Los cuatro muros perimetrales con su geometría y la lista de ventanas que
  // les irán asignando las estancias.
  type WallSpec = {
    nx: number;
    nz: number;
    p0x: number;
    p0z: number;
    p1x: number;
    p1z: number;
    alongX: boolean;
    len: number;
    hasDoor: boolean;
    slots: number[];
  };
  const walls: WallSpec[] = [];
  const mkWall = (nx: number, nz: number, p0x: number, p0z: number, p1x: number, p1z: number, hasDoor: boolean) => {
    walls.push({ nx, nz, p0x, p0z, p1x, p1z, alongX: Math.abs(p1x - p0x) > Math.abs(p1z - p0z), len: Math.hypot(p1x - p0x, p1z - p0z), hasDoor, slots: [] });
  };
  if (b.faceZ !== 0) {
    const zFront = b.z + b.faceZ * (b.d / 2 - t / 2);
    const zBack = b.z - b.faceZ * (b.d / 2 - t / 2);
    mkWall(0, b.faceZ, b.x - b.w / 2, zFront, b.x + b.w / 2, zFront, true);
    mkWall(0, -b.faceZ, b.x - b.w / 2, zBack, b.x + b.w / 2, zBack, false);
    for (const sgn of [-1, 1]) {
      const xs = b.x + sgn * (b.w / 2 - t / 2);
      mkWall(sgn, 0, xs, b.z - b.d / 2 + t, xs, b.z + b.d / 2 - t, false);
    }
  } else {
    const xFront = b.x + b.faceX * (b.w / 2 - t / 2);
    const xBack = b.x - b.faceX * (b.w / 2 - t / 2);
    mkWall(b.faceX, 0, xFront, b.z - b.d / 2, xFront, b.z + b.d / 2, true);
    mkWall(-b.faceX, 0, xBack, b.z - b.d / 2, xBack, b.z + b.d / 2, false);
    for (const sgn of [-1, 1]) {
      const zs = b.z + sgn * (b.d / 2 - t / 2);
      mkWall(0, sgn, b.x - b.w / 2 + t, zs, b.x + b.w / 2 - t, zs, false);
    }
  }
  const wallByNormal = (nx: number, nz: number) => walls.find((w) => w.nx === nx && w.nz === nz)!;

  // Una ventana por estancia (varias, separadas, si la estancia es grande),
  // sobre su pared exterior más larga.
  for (const r of interior.rooms) {
    type Cand = { wall: WallSpec; i0: number; i1: number; len: number };
    const cands: Cand[] = [];
    if (Math.abs(r.x0 - innerX0) < EPS) cands.push({ wall: wallByNormal(-1, 0), i0: r.z0, i1: r.z1, len: r.z1 - r.z0 });
    if (Math.abs(r.x1 - innerX1) < EPS) cands.push({ wall: wallByNormal(1, 0), i0: r.z0, i1: r.z1, len: r.z1 - r.z0 });
    if (Math.abs(r.z0 - innerZ0) < EPS) cands.push({ wall: wallByNormal(0, -1), i0: r.x0, i1: r.x1, len: r.x1 - r.x0 });
    if (Math.abs(r.z1 - innerZ1) < EPS) cands.push({ wall: wallByNormal(0, 1), i0: r.x0, i1: r.x1, len: r.x1 - r.x0 });
    if (cands.length === 0) continue;
    cands.sort((a, b) => b.len - a.len);
    const c = cands[0];
    const w = c.wall;
    const c0 = w.alongX ? w.p0x : w.p0z;
    const rs0 = c.i0 - c0;
    const rs1 = c.i1 - c0;
    const roomLen = rs1 - rs0;
    if (roomLen < WINDOW_W + 0.2) continue; // no cabe el hueco en esa pared
    // Una ventana hasta ~5 m de pared; a partir de ahí, repartidas (máx. 3).
    const n = Math.max(1, Math.min(3, Math.floor(roomLen / 5)));
    const margin = 0.7;
    const a = rs0 + margin;
    const bb = rs1 - margin;
    const doorS = w.len / 2;
    for (let k = 0; k < n; k++) {
      const s = n === 1 ? (a + bb) / 2 : a + ((bb - a) * k) / (n - 1);
      if (s < 0.6 || s > w.len - 0.6) continue;
      if (w.hasDoor && Math.abs(s - doorS) < 1.4) continue; // no pisar la puerta
      w.slots.push(s);
    }
  }

  // Construir cada muro con sus huecos (puerta + ventanas) y colocar el cristal.
  for (const w of walls) {
    const openings: WallOpening[] = [];
    if (w.hasDoor) openings.push({ s0: w.len / 2 - doorHalf, s1: w.len / 2 + doorHalf, y0: 0, y1: doorTop });
    for (const s of w.slots) for (const band of bands) {
      openings.push({ s0: s - WINDOW_W / 2, s1: s + WINDOW_W / 2, y0: band.y0, y1: band.y1 });
    }
    addWallWithHoles(pushBody, w.p0x, w.p0z, w.p1x, w.p1z, b.h, t, openings);

    const c0 = w.alongX ? w.p0x : w.p0z;
    const yaw = Math.atan2(w.nx, w.nz);
    for (const s of w.slots) {
      const along = c0 + s;
      const px = w.alongX ? along : w.p0x + w.nx * (t / 2);
      const pz = w.alongX ? w.p0z + w.nz * (t / 2) : along;
      for (const band of bands) addWindow(glassMats, frameMats, px, band.yc, pz, w.nx, w.nz, yaw);
    }
  }

  // Tabiques interiores con su hueco de puerta.
  for (const wall of interior.walls) {
    addWallBoxes(pushPartition, wall.ax, wall.az, wall.bx, wall.bz, b.h, t, wall.doorAt, wall.doorHalf);
  }
}

/**
 * Casco hueco de un supermercado (nave de una planta): suelo + cuatro muros
 * perimetrales. La fachada lleva un hueco REAL de puerta (`doorHalf` a cada
 * lado, hasta `doorTop`); si se pasa `sideWindow`, los DOS muros laterales
 * llevan cada uno el mismo hueco largo (misma `s0/s1/y0/y1`), para la vidriera.
 * El muro trasero siempre es macizo.
 */
function addMarketShell(
  b: RenderBuilding,
  doorHalf: number,
  doorTop: number,
  /** Desplazamiento lateral del centro de la puerta (tangente tx=faceZ, tz=−faceX). */
  doorAlong: number,
  wallT: number,
  sideWindow: { s0: number; s1: number; y0: number; y1: number } | null,
  bodyMats: THREE.Matrix4[],
  bodyColors: THREE.Color[],
  floorMats: THREE.Matrix4[],
): void {
  const color = new THREE.Color(BUILDING_PALETTES.supermarket[b.colorIdx % 6]);
  const pushBody = (m: THREE.Matrix4) => {
    bodyMats.push(m);
    bodyColors.push(color);
  };
  const t = wallT;
  const sideOpenings: WallOpening[] = sideWindow ? [sideWindow] : [];

  floorMats.push(compose(b.x, b.z, 0.06, b.w - 0.02, 0.12, b.d - 0.02));

  const doorOpening: WallOpening[] = [];
  if (b.faceZ !== 0) {
    const zFront = b.z + b.faceZ * (b.d / 2 - t / 2);
    const zBack = b.z - b.faceZ * (b.d / 2 - t / 2);
    // `s` del muro frontal crece hacia +X; la tangente de fachada es tx=faceZ.
    const sDoor = b.w / 2 + b.faceZ * doorAlong;
    doorOpening.push({ s0: sDoor - doorHalf, s1: sDoor + doorHalf, y0: 0, y1: doorTop });
    addWallWithHoles(pushBody, b.x - b.w / 2, zFront, b.x + b.w / 2, zFront, b.h, t, doorOpening);
    addWallWithHoles(pushBody, b.x - b.w / 2, zBack, b.x + b.w / 2, zBack, b.h, t, []);
    for (const sgn of [-1, 1]) {
      const xs = b.x + sgn * (b.w / 2 - t / 2);
      addWallWithHoles(pushBody, xs, b.z - b.d / 2 + t, xs, b.z + b.d / 2 - t, b.h, t, sideOpenings);
    }
  } else {
    const xFront = b.x + b.faceX * (b.w / 2 - t / 2);
    const xBack = b.x - b.faceX * (b.w / 2 - t / 2);
    // `s` del muro frontal crece hacia +Z; la tangente de fachada es tz=−faceX.
    const sDoor = b.d / 2 - b.faceX * doorAlong;
    doorOpening.push({ s0: sDoor - doorHalf, s1: sDoor + doorHalf, y0: 0, y1: doorTop });
    addWallWithHoles(pushBody, xFront, b.z - b.d / 2, xFront, b.z + b.d / 2, b.h, t, doorOpening);
    addWallWithHoles(pushBody, xBack, b.z - b.d / 2, xBack, b.z + b.d / 2, b.h, t, []);
    for (const sgn of [-1, 1]) {
      const zs = b.z + sgn * (b.d / 2 - t / 2);
      addWallWithHoles(pushBody, b.x - b.w / 2 + t, zs, b.x + b.w / 2 - t, zs, b.h, t, sideOpenings);
    }
  }
}

/**
 * Casco hueco de una tienda de gremio (local bajo de una planta): suelo + cuatro
 * muros, con huecos REALES solo en la fachada (puerta batiente + escaparates),
 * pasados en la coordenada `along` de la fachada (0 = centro, crece hacia la
 * tangente tx=faceZ, tz=−faceX — la misma convención que el interior/render).
 * Los otros tres muros son macizos. Paleta de tienda (no la de nave de súper).
 */
function addShopShell(
  b: RenderBuilding,
  wallT: number,
  openings: { along0: number; along1: number; y0: number; y1: number }[],
  bodyMats: THREE.Matrix4[],
  bodyColors: THREE.Color[],
  floorMats: THREE.Matrix4[],
): void {
  const color = new THREE.Color(BUILDING_PALETTES[b.type][b.colorIdx % 6]);
  const pushBody = (m: THREE.Matrix4) => {
    bodyMats.push(m);
    bodyColors.push(color);
  };
  const t = wallT;

  floorMats.push(compose(b.x, b.z, 0.06, b.w - 0.02, 0.12, b.d - 0.02));

  if (b.faceZ !== 0) {
    const zFront = b.z + b.faceZ * (b.d / 2 - t / 2);
    const zBack = b.z - b.faceZ * (b.d / 2 - t / 2);
    // `s` del muro frontal crece hacia +X; la tangente de fachada es tx=faceZ.
    const front: WallOpening[] = openings.map((o) => {
      const sA = b.w / 2 + b.faceZ * o.along0;
      const sB = b.w / 2 + b.faceZ * o.along1;
      return { s0: Math.min(sA, sB), s1: Math.max(sA, sB), y0: o.y0, y1: o.y1 };
    });
    addWallWithHoles(pushBody, b.x - b.w / 2, zFront, b.x + b.w / 2, zFront, b.h, t, front);
    addWallWithHoles(pushBody, b.x - b.w / 2, zBack, b.x + b.w / 2, zBack, b.h, t, []);
    for (const sgn of [-1, 1]) {
      const xs = b.x + sgn * (b.w / 2 - t / 2);
      addWallWithHoles(pushBody, xs, b.z - b.d / 2 + t, xs, b.z + b.d / 2 - t, b.h, t, []);
    }
  } else {
    const xFront = b.x + b.faceX * (b.w / 2 - t / 2);
    const xBack = b.x - b.faceX * (b.w / 2 - t / 2);
    // `s` del muro frontal crece hacia +Z; la tangente de fachada es tz=−faceX.
    const front: WallOpening[] = openings.map((o) => {
      const sA = b.d / 2 - b.faceX * o.along0;
      const sB = b.d / 2 - b.faceX * o.along1;
      return { s0: Math.min(sA, sB), s1: Math.max(sA, sB), y0: o.y0, y1: o.y1 };
    });
    addWallWithHoles(pushBody, xFront, b.z - b.d / 2, xFront, b.z + b.d / 2, b.h, t, front);
    addWallWithHoles(pushBody, xBack, b.z - b.d / 2, xBack, b.z + b.d / 2, b.h, t, []);
    for (const sgn of [-1, 1]) {
      const zs = b.z + sgn * (b.d / 2 - t / 2);
      addWallWithHoles(pushBody, b.x - b.w / 2 + t, zs, b.x + b.w / 2 - t, zs, b.h, t, []);
    }
  }
}

/** Hueco rectangular en una pared, en coordenadas locales: s a lo largo, y en altura. */
interface WallOpening {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
}

/**
 * Muro axis-aligned construido dejando huecos rectangulares (puertas y
 * ventanas) en la propia geometría. Descompone el muro en franjas verticales por
 * los bordes de los huecos y, en cada franja, emite las cajas macizas entre los
 * tramos abiertos. Resultado: el hueco se ve igual por fuera y por dentro.
 */
function addWallWithHoles(
  push: (m: THREE.Matrix4) => void,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  h: number,
  t: number,
  openings: WallOpening[],
  yBase = 0,
): void {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.05) return;
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const sgn = alongX ? Math.sign(bx - ax) : Math.sign(bz - az);

  const ops = openings
    .map((o) => ({
      s0: Math.max(0, Math.min(len, o.s0)),
      s1: Math.max(0, Math.min(len, o.s1)),
      y0: Math.max(0, Math.min(h, o.y0)),
      y1: Math.max(0, Math.min(h, o.y1)),
    }))
    .filter((o) => o.s1 - o.s0 > 0.02 && o.y1 - o.y0 > 0.02);

  const seg = (s0: number, s1: number, y0: number, y1: number) => {
    if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return;
    const smid = (s0 + s1) / 2;
    if (alongX) push(compose(ax + sgn * smid, az, yBase + (y0 + y1) / 2, s1 - s0, y1 - y0, t));
    else push(compose(ax, az + sgn * smid, yBase + (y0 + y1) / 2, t, y1 - y0, s1 - s0));
  };

  // Franjas verticales delimitadas por los bordes s de los huecos.
  const edges = [0, len];
  for (const o of ops) edges.push(o.s0, o.s1);
  const uniq = [...new Set(edges)].sort((a, b) => a - b);
  for (let i = 0; i < uniq.length - 1; i++) {
    const s0 = uniq[i];
    const s1 = uniq[i + 1];
    if (s1 - s0 < 0.02) continue;
    const smid = (s0 + s1) / 2;
    // Huecos que cubren esta franja, ordenados por altura.
    const covering = ops.filter((o) => o.s0 <= smid + 1e-4 && o.s1 >= smid - 1e-4).sort((a, b) => a.y0 - b.y0);
    // Tramos macizos = [0, h] menos la unión de los intervalos verticales abiertos.
    let yc = 0;
    for (const o of covering) {
      if (o.y0 > yc) seg(s0, s1, yc, o.y0);
      yc = Math.max(yc, o.y1);
    }
    if (yc < h) seg(s0, s1, yc, h);
  }
}

/**
 * Cama como cajas: estructura baja, colchón, manta en los pies, almohadas y
 * cabecero contra la pared. `f.headX`/`f.headZ` apunta hacia el cabecero.
 */
function addBed(
  f: { x: number; z: number; w: number; d: number; headX: number; headZ: number; double: boolean },
  frame: THREE.Matrix4[],
  mattress: THREE.Matrix4[],
  blanket: THREE.Matrix4[],
  pillow: THREE.Matrix4[],
  headboard: THREE.Matrix4[],
  yBase = 0,
): void {
  const FRAME_H = 0.32;
  const MATT_H = 0.2;
  const top = FRAME_H + MATT_H; // altura de la superficie de dormir
  const longAlongX = f.headX !== 0;
  const longLen = longAlongX ? f.w : f.d;

  // Estructura (base de madera) y colchón ligeramente remetido.
  frame.push(compose(f.x, f.z, yBase + FRAME_H / 2, f.w, FRAME_H, f.d));
  mattress.push(compose(f.x, f.z, yBase + FRAME_H + MATT_H / 2, f.w - 0.12, MATT_H, f.d - 0.12));

  // Cabecero: panel vertical en el extremo del cabecero.
  const HB_T = 0.1;
  const HB_H = 0.95;
  const hx = f.x + f.headX * (f.w / 2 - HB_T / 2);
  const hz = f.z + f.headZ * (f.d / 2 - HB_T / 2);
  headboard.push(compose(hx, hz, yBase + HB_H / 2, longAlongX ? HB_T : f.w, HB_H, longAlongX ? f.d : HB_T));

  // Manta sobre los pies (mitad opuesta al cabecero), un poco por encima.
  const blanketLen = longLen * 0.55;
  const footShift = (longLen - blanketLen) / 2;
  const blx = f.x - f.headX * footShift;
  const blz = f.z - f.headZ * footShift;
  blanket.push(
    compose(blx, blz, yBase + top + 0.03, longAlongX ? blanketLen : f.w - 0.08, 0.07, longAlongX ? f.d - 0.08 : blanketLen),
  );

  // Almohadas junto al cabecero. Doble → dos; individual → una centrada.
  const crossW = longAlongX ? f.d : f.w;
  const pillowLong = 0.34;
  const pcx = f.x + f.headX * (longLen / 2 - pillowLong / 2 - 0.06);
  const pcz = f.z + f.headZ * (longLen / 2 - pillowLong / 2 - 0.06);
  // Vector perpendicular al eje largo (para separar dos almohadas).
  const perpX = longAlongX ? 0 : 1;
  const perpZ = longAlongX ? 1 : 0;
  const place = (off: number, pw: number) => {
    const px = pcx + perpX * off;
    const pz = pcz + perpZ * off;
    pillow.push(compose(px, pz, yBase + top + 0.09, longAlongX ? pillowLong : pw, 0.14, longAlongX ? pw : pillowLong));
  };
  if (f.double) {
    const pw = crossW * 0.4;
    place(-crossW * 0.22, pw);
    place(crossW * 0.22, pw);
  } else {
    place(0, crossW * 0.6);
  }
}

/* ── Mobiliario auxiliar (cajas) ──────────────────────────────────────────
 * Las caras de los muebles son axis-aligned (`faceX/faceZ` ∈ {±1,0}), así que
 * el frente se modela desplazando cajas a lo largo del eje de `face` sin girar.
 */

/** Mesita de noche: cuerpo + tablero superior + tirador frontal. */
function addNightstand(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 0.42;
  wood.push(compose(f.x, f.z, yBase + H / 2, f.w, H, f.d));
  wood.push(compose(f.x, f.z, yBase + H + 0.025, f.w + 0.06, 0.05, f.d + 0.06)); // tablero
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  dark.push(compose(f.x + f.faceX * fr, f.z + f.faceZ * fr, yBase + H * 0.55, 0.1, 0.06, 0.1)); // tirador
}

/** Armario alto: cuerpo + junta vertical central + dos tiradores. */
function addWardrobe(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 2.0;
  wood.push(compose(f.x, f.z, yBase + H / 2, f.w, H, f.d));
  const alongX = f.faceX === 0; // mira en Z → el frente se extiende en X
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  dark.push(compose(fx, fz, yBase + H / 2, alongX ? 0.04 : 0.03, H - 0.08, alongX ? 0.03 : 0.04)); // junta
  const ho = frontW * 0.22;
  for (const s of [-1, 1]) {
    dark.push(compose(fx + (alongX ? ho * s : 0), fz + (alongX ? 0 : ho * s), yBase + H * 0.5, alongX ? 0.05 : 0.04, 0.2, alongX ? 0.04 : 0.05));
  }
}

/** Cómoda baja: cuerpo + dos ranuras de cajón con tirador. */
function addDresser(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 0.8;
  wood.push(compose(f.x, f.z, yBase + H / 2, f.w, H, f.d));
  const alongX = f.faceX === 0;
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  for (const ty of [H * 0.32, H * 0.68]) {
    dark.push(compose(fx, fz, yBase + ty, alongX ? frontW * 0.8 : 0.03, 0.04, alongX ? 0.03 : frontW * 0.8)); // ranura
    dark.push(compose(fx, fz, yBase + ty, alongX ? 0.22 : 0.05, 0.05, alongX ? 0.05 : 0.22)); // tirador
  }
}

/** Alfombra: losa plana coloreada por instancia. */
function addRug(f: RenderFurniture, rugMats: THREE.Matrix4[], rugColors: THREE.Color[], yBase = 0): void {
  rugMats.push(compose(f.x, f.z, yBase + 0.02, f.w, 0.04, f.d));
  rugColors.push(new THREE.Color(RUG_COLORS[(f.variant ?? 0) % RUG_COLORS.length]));
}

/** Mesa de comedor: tablero + cuatro patas en las esquinas. `f.w/f.d` = huella. */
function addDiningTable(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const TOP = 0.74; // altura del tablero
  const TH = 0.07; // grosor del tablero
  const LEG = 0.08; // sección de pata
  wood.push(compose(f.x, f.z, yBase + TOP - TH / 2, f.w, TH, f.d)); // tablero
  const ix = f.w / 2 - LEG / 2 - 0.04;
  const iz = f.d / 2 - LEG / 2 - 0.04;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    dark.push(compose(f.x + sx * ix, f.z + sz * iz, yBase + (TOP - TH) / 2, LEG, TOP - TH, LEG));
  }
}

/** Silla: asiento + cuatro patas + respaldo en el lado opuesto al frente (`faceX/faceZ`). */
function addDiningChair(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const SEAT = 0.44; // altura del asiento
  const ST = 0.06; // grosor del asiento
  const LEG = 0.05;
  const sw = 0.4; // tamaño del asiento en planta
  wood.push(compose(f.x, f.z, yBase + SEAT - ST / 2, sw, ST, sw)); // asiento
  const i = sw / 2 - LEG / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    dark.push(compose(f.x + sx * i, f.z + sz * i, yBase + (SEAT - ST) / 2, LEG, SEAT - ST, LEG));
  }
  // Respaldo: en el borde opuesto al frente (el frente mira a la mesa).
  const bx = f.x - f.faceX * (sw / 2 - LEG / 2);
  const bz = f.z - f.faceZ * (sw / 2 - LEG / 2);
  const alongX = f.faceX === 0; // respaldo se extiende perpendicular al frente
  wood.push(compose(bx, bz, yBase + SEAT + 0.22, alongX ? sw : LEG, 0.44, alongX ? LEG : sw));
}

/** Aparador bajo: cuerpo + dos ranuras de puerta con tirador (como la cómoda, más largo). */
function addSideboard(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 0.85;
  const LEG = 0.06;
  const FOOT = 0.12;
  wood.push(compose(f.x, f.z, yBase + FOOT + (H - FOOT) / 2, f.w, H - FOOT, f.d)); // cuerpo
  const alongX = f.faceX === 0; // mira en Z → el frente se extiende en X
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  // Dos puertas con junta central y tirador a cada lado.
  dark.push(compose(fx, fz, yBase + FOOT + (H - FOOT) / 2, alongX ? 0.03 : 0.02, H - FOOT - 0.08, alongX ? 0.02 : 0.03)); // junta
  const ho = frontW * 0.24;
  for (const s of [-1, 1]) {
    dark.push(compose(fx + (alongX ? ho * s : 0), fz + (alongX ? 0 : ho * s), yBase + H * 0.55, alongX ? 0.05 : 0.04, 0.12, alongX ? 0.04 : 0.05));
  }
  // Patas cortas en las esquinas.
  const ix = f.w / 2 - LEG / 2 - 0.02;
  const iz = f.d / 2 - LEG / 2 - 0.02;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    dark.push(compose(f.x + sx * ix, f.z + sz * iz, yBase + FOOT / 2, LEG, FOOT, LEG));
  }
}

/** Planta de interior: maceta troncocónica (aprox. dos cajas) + follaje apilado. */
function addPottedPlant(f: RenderFurniture, pot: THREE.Matrix4[], leaf: THREE.Matrix4[], yBase = 0): void {
  const potH = 0.34;
  const potW = f.w * 0.78;
  pot.push(compose(f.x, f.z, yBase + potH * 0.35, potW * 0.8, potH * 0.7, potW * 0.8)); // base estrecha
  pot.push(compose(f.x, f.z, yBase + potH - 0.04, potW, 0.1, potW)); // borde superior
  // Follaje: tres cajas decrecientes para una mata frondosa low-poly.
  const base = yBase + potH;
  leaf.push(compose(f.x, f.z, base + 0.22, potW * 1.25, 0.44, potW * 1.25));
  leaf.push(compose(f.x, f.z, base + 0.55, potW * 0.95, 0.36, potW * 0.95));
  leaf.push(compose(f.x, f.z, base + 0.82, potW * 0.55, 0.3, potW * 0.55));
}

/**
 * Mueble tapizado (sofá o sillón): asiento + respaldo al fondo (lado opuesto a
 * `faceX/faceZ`, que mira al centro) + dos reposabrazos. `f.w/f.d` = huella.
 */
function addUpholstered(f: RenderFurniture, uph: THREE.Matrix4[], uphColors: THREE.Color[], dark: THREE.Matrix4[], yBase = 0): void {
  const SEAT = 0.4; // alto del bloque de asiento
  const color = new THREE.Color(UPHOLSTERY_COLORS[(f.variant ?? 0) % UPHOLSTERY_COLORS.length]);
  const push = (m: THREE.Matrix4) => { uph.push(m); uphColors.push(color); };
  // Ejes: `face` (frente-fondo) y `side` (perpendicular). Uno de faceX/faceZ es 0.
  const faceAxisX = f.faceX !== 0;
  const sideX = -f.faceZ;
  const sideZ = f.faceX;
  const depth = faceAxisX ? f.w : f.d; // tamaño frente-fondo
  const width = faceAxisX ? f.d : f.w; // tamaño lado-a-lado

  push(compose(f.x, f.z, yBase + SEAT / 2 + 0.06, f.w, SEAT, f.d)); // base/cojines
  // Respaldo al fondo (−face).
  const bx = f.x - f.faceX * (depth / 2 - 0.09);
  const bz = f.z - f.faceZ * (depth / 2 - 0.09);
  push(compose(bx, bz, yBase + SEAT + 0.22, faceAxisX ? 0.18 : width, 0.46, faceAxisX ? width : 0.18));
  // Reposabrazos a cada lado.
  for (const s of [-1, 1]) {
    const ax = f.x + sideX * s * (width / 2 - 0.08);
    const az = f.z + sideZ * s * (width / 2 - 0.08);
    push(compose(ax, az, yBase + SEAT / 2 + 0.16, faceAxisX ? depth : 0.16, SEAT + 0.2, faceAxisX ? 0.16 : depth));
  }
  // Patitas oscuras en las esquinas.
  const ix = f.w / 2 - 0.06;
  const iz = f.d / 2 - 0.06;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    dark.push(compose(f.x + sx * ix, f.z + sz * iz, yBase + 0.03, 0.07, 0.06, 0.07));
  }
}

/**
 * Televisor: mueble bajo (variedad de forma/color por `variant`) + pantalla
 * plana orientada al frente (`faceX/faceZ`): marco gris con panel negro
 * ligeramente hundido respecto al marco.
 */
function addTv(
  f: RenderFurniture,
  stand: THREE.Matrix4[],
  standColors: THREE.Color[],
  dark: THREE.Matrix4[],
  bezel: THREE.Matrix4[],
  screen: THREE.Matrix4[],
  yBase = 0,
): void {
  const variant = (f.variant ?? 0) % TV_STAND_COLORS.length;
  const standColor = new THREE.Color(TV_STAND_COLORS[variant]);
  const faceAxisX = f.faceX !== 0;
  let standH = 0.44;

  if (variant === 1) {
    // Nórdico: tablero fino sobre cuatro patas finas oscuras.
    const topH = 0.07;
    standH = 0.4;
    stand.push(compose(f.x, f.z, yBase + standH - topH / 2, f.w, topH, f.d));
    standColors.push(standColor);
    const legH = standH - topH;
    const ix = f.w / 2 - 0.08;
    const iz = f.d / 2 - 0.08;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      dark.push(compose(f.x + sx * ix, f.z + sz * iz, yBase + legH / 2, 0.05, legH, 0.05));
    }
  } else if (variant === 2) {
    // Consola con zócalo oscuro a media altura.
    standH = 0.48;
    stand.push(compose(f.x, f.z, yBase + standH / 2, f.w, standH, f.d));
    standColors.push(standColor);
    dark.push(compose(f.x, f.z, yBase + 0.05, f.w * 0.98, 0.1, f.d * 0.98));
  } else if (variant === 3) {
    // Columna alta y estrecha.
    standH = 0.6;
    const narrowW = faceAxisX ? f.w : f.w * 0.72;
    const narrowD = faceAxisX ? f.d * 0.72 : f.d;
    stand.push(compose(f.x, f.z, yBase + standH / 2, narrowW, standH, narrowD));
    standColors.push(standColor);
  } else {
    // Consola baja y ancha (clásica).
    stand.push(compose(f.x, f.z, yBase + standH / 2, f.w, standH, f.d));
    standColors.push(standColor);
  }

  // Pantalla hacia el frente del mueble (cara visible desde el sofá): marco
  // gris de ancho completo + panel negro más estrecho, un poco por delante.
  const width = (faceAxisX ? f.d : f.w) * 0.82;
  const screenY = yBase + standH + 0.3;
  const bx = f.x + f.faceX * (f.w / 2 - 0.055);
  const bz = f.z + f.faceZ * (f.d / 2 - 0.055);
  bezel.push(compose(bx, bz, screenY, faceAxisX ? 0.06 : width, 0.5, faceAxisX ? width : 0.06));
  const px = f.x + f.faceX * (f.w / 2 - 0.03);
  const pz = f.z + f.faceZ * (f.d / 2 - 0.03);
  const panel = width * 0.86;
  screen.push(compose(px, pz, screenY, faceAxisX ? 0.03 : panel, 0.42, faceAxisX ? panel : 0.03));
}

/** Mesa de centro baja: tablero + cuatro patas. */
function addCoffeeTable(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 0.4;
  const TH = 0.06;
  const LEG = 0.06;
  wood.push(compose(f.x, f.z, yBase + H - TH / 2, f.w, TH, f.d)); // tablero
  const ix = f.w / 2 - LEG / 2 - 0.03;
  const iz = f.d / 2 - LEG / 2 - 0.03;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    dark.push(compose(f.x + sx * ix, f.z + sz * iz, yBase + (H - TH) / 2, LEG, H - TH, LEG));
  }
}

/** Librería: cuerpo de madera + filas de libros de colores en tres baldas. */
function addBookshelf(f: RenderFurniture, wood: THREE.Matrix4[], books: THREE.Matrix4[], bookColors: THREE.Color[], yBase = 0): void {
  const H = 1.6;
  wood.push(compose(f.x, f.z, yBase + H / 2, f.w, H, f.d)); // cuerpo
  const faceAxisX = f.faceX !== 0;
  const rowW = (faceAxisX ? f.d : f.w) * 0.84; // ancho de la fila de libros
  // Filas algo adelantadas hacia el frente (lado `face`).
  const bx = f.x + f.faceX * (f.w * 0.12);
  const bz = f.z + f.faceZ * (f.d * 0.12);
  const bookD = (faceAxisX ? f.w : f.d) * 0.55;
  for (let i = 0; i < 3; i++) {
    const y = yBase + 0.5 + i * 0.5;
    const sx = faceAxisX ? bookD : rowW;
    const sz = faceAxisX ? rowW : bookD;
    books.push(compose(bx, bz, y, sx, 0.3, sz));
    bookColors.push(new THREE.Color(BOOK_COLORS[((f.variant ?? 0) + i) % BOOK_COLORS.length]));
  }
}

/* ── Tipos de lámpara de pie ────────────────────────────────────────────────
 * Familia abierta a extensión: añadir un tipo = añadir su clave a FLOOR_LAMP_KINDS
 * y su builder a `lampBuilders` (la fábrica de muebles elige el tipo por `variant`).
 * Cada builder dibuja las partes NO emisivas (metal oscuro/cálido) y registra UNA
 * pantalla emisiva (cilindro o cono) vía `parts.shade(...)`. */
type FloorLampKind = 'tripod' | 'column' | 'arc' | 'classic';
const FLOOR_LAMP_KINDS: FloorLampKind[] = ['tripod', 'column', 'arc', 'classic'];

/** Acumuladores que recibe un builder de lámpara. */
interface LampParts {
  /** Metal oscuro (mástiles, bases, brazos). */
  dark: THREE.Matrix4[];
  /** Metal cálido (patas de trípode, latón). */
  warm: THREE.Matrix4[];
  /** Registra la pantalla emisiva de esta lámpara (se llama exactamente una vez). */
  shade(geo: LampShadeGeo, m: THREE.Matrix4): void;
}

// `dirX/dirZ` = dirección horizontal hacia el interior de la sala (eje unitario);
// solo la usan los tipos con brazo (arco) para no extenderlo contra la pared.
type LampBuilder = (x: number, z: number, yBase: number, p: LampParts, dirX: number, dirZ: number) => void;

const lampBuilders: Record<FloorLampKind, LampBuilder> = {
  // Trípode: tres patas cálidas que se abren desde un cubo alto + tambor cilíndrico.
  tripod(x, z, yBase, p) {
    const HUB = 1.45; // altura del cubo donde convergen las patas
    const R = 0.21; // radio de apoyo de las patas
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3 + Math.PI / 6;
      p.warm.push(composeSegment(x, yBase + HUB, z, x + R * Math.cos(a), yBase, z + R * Math.sin(a), 0.04));
    }
    p.warm.push(compose(x, z, yBase + HUB, 0.08, 0.1, 0.08)); // cubo superior
    p.shade('cyl', compose(x, z, yBase + HUB + 0.18, 0.62, 0.36, 0.62)); // tambor
  },

  // Columna: cuerpo cilíndrico alto que BRILLA entero (estilo malla tejida).
  column(x, z, yBase, p) {
    p.dark.push(compose(x, z, yBase + 0.04, 0.34, 0.08, 0.34)); // base
    p.dark.push(compose(x, z, yBase + 1.53, 0.36, 0.06, 0.36)); // remate superior
    p.shade('cyl', compose(x, z, yBase + 0.82, 0.34, 1.4, 0.34)); // cuerpo emisivo
  },

  // Arco: base escalonada + mástil + brazo curvo (dos tramos) + campana cónica colgante.
  // El brazo se asoma hacia el INTERIOR de la sala (dirX/dirZ) para no cruzar la pared.
  arc(x, z, yBase, p, dirX, dirZ) {
    p.dark.push(compose(x, z, yBase + 0.035, 0.56, 0.07, 0.56)); // zapata baja visible
    p.dark.push(compose(x, z, yBase + 0.105, 0.4, 0.06, 0.4)); // escalon superior
    p.dark.push(compose(x, z, yBase + 0.18, 0.18, 0.09, 0.18)); // cuello de apoyo
    p.dark.push(compose(x, z, yBase + 0.83, 0.05, 1.3, 0.05)); // mastil hasta ~1.48
    // Brazo curvo: dos tramos cortos que se asoman y bajan hacia la pantalla.
    const reach = 0.44;
    const mx = x + dirX * reach;
    const mz = z + dirZ * reach;
    p.dark.push(composeSegment(x, yBase + 1.44, z, x + dirX * reach * 0.55, yBase + 1.62, z + dirZ * reach * 0.55, 0.045));
    p.dark.push(composeSegment(x + dirX * reach * 0.55, yBase + 1.62, z + dirZ * reach * 0.55, mx, yBase + 1.5, mz, 0.045));
    p.shade('cone', compose(mx, mz, yBase + 1.3, 0.34, 0.34, 0.34)); // campana (apunta abajo)
  },

  // Clásica: base plana cuadrada + mástil recto + pantalla de tambor.
  classic(x, z, yBase, p) {
    p.dark.push(compose(x, z, yBase + 0.03, 0.46, 0.06, 0.46)); // base plana
    p.dark.push(compose(x, z, yBase + 0.78, 0.05, 1.5, 0.05)); // mástil
    p.shade('cyl', compose(x, z, yBase + 1.72, 0.62, 0.4, 0.62)); // tambor
  },
};

/** Lámpara de pie: despacha al builder de su tipo (elegido por `variant`). */
function addFloorLamp(f: RenderFurniture, dark: THREE.Matrix4[], warm: THREE.Matrix4[], shades: LampShade[], yBase = 0): void {
  const kind = FLOOR_LAMP_KINDS[(f.variant ?? 0) % FLOOR_LAMP_KINDS.length];
  // Dirección al interior de la sala (la fija la fábrica); por defecto +X.
  let dirX = f.faceX;
  let dirZ = f.faceZ;
  if (dirX === 0 && dirZ === 0) dirX = 1;
  lampBuilders[kind](
    f.x,
    f.z,
    yBase,
    { dark, warm, shade: (geo, m) => shades.push({ geo, matrix: m, x: f.x, z: f.z, y: yBase }) },
    dirX,
    dirZ,
  );
}

/** Ducha: plato bajo + dos mamparas ligeras + grifería. */
/**
 * Ducha: plato de ducha blanco bajo con desagüe, mampara de cristal en esquina
 * (dos paños de vidrio enmarcados en cromo en la cara abierta y un lateral; las
 * otras dos caras quedan contra la pared) y columna de ducha con la alcachofa de
 * lluvia colgada de la pared del fondo, bien visible.
 */
function addShower(
  f: RenderFurniture,
  ceramic: THREE.Matrix4[],
  dark: THREE.Matrix4[],
  glass: THREE.Matrix4[],
  chrome: THREE.Matrix4[],
  metal: THREE.Matrix4[],
  head: THREE.Matrix4[],
  headColors: THREE.Color[],
  yBase = 0,
): void {
  const ax = f.faceX; // vector a la cara ABIERTA; la pared del fondo es -face
  const az = f.faceZ;
  const facesX = ax !== 0;

  // Plato de ducha: losa blanca que SOBRESALE ~0.1 m sobre la tarima interior
  // (cuya cara superior está a y≈0.18, ver addHouseShell); la parte baja del plato
  // queda embebida en la tarima para no dejar holgura. La mampara apoya encima.
  const TRAY_TOP = 0.28; // cara superior del plato
  const TRAY_H = 0.12;
  ceramic.push(compose(f.x, f.z, yBase + TRAY_TOP - TRAY_H / 2, f.w, TRAY_H, f.d));
  dark.push(compose(f.x + ax * 0.18, f.z + az * 0.18, yBase + TRAY_TOP + 0.006, 0.13, 0.02, 0.13)); // rejilla de desagüe

  // Mampara: dos paños de cristal (cara abierta +face y un lateral en +X/+Z) con
  // perfiles cromados arriba/abajo y postes en las esquinas, apoyados en el plato.
  const GLASS_H = 1.92;
  const PT = 0.04; // grosor del cristal
  const FR = 0.05; // grosor de los perfiles cromados
  const gcy = yBase + TRAY_TOP + GLASS_H / 2;
  const yTop = yBase + TRAY_TOP + GLASS_H;
  const yBot = yBase + TRAY_TOP + FR / 2;
  const s = f.openSign ?? 1; // signo del lateral ABIERTO (perpendicular a la cara)
  const frontX = f.x + ax * (f.w / 2 - PT / 2);
  const frontZ = f.z + az * (f.d / 2 - PT / 2);
  const sideX = f.x + s * (f.w / 2 - PT / 2); // lateral abierto (cuando mira en Z)
  const sideZ = f.z + s * (f.d / 2 - PT / 2); // lateral abierto (cuando mira en X)

  if (facesX) {
    glass.push(compose(frontX, f.z, gcy, PT, GLASS_H, f.d)); // paño frontal
    glass.push(compose(f.x, sideZ, gcy, f.w, GLASS_H, PT)); // paño lateral
    chrome.push(compose(frontX, f.z, yTop, FR, FR, f.d)); // perfil superior frente
    chrome.push(compose(frontX, f.z, yBot, FR, FR, f.d)); // perfil inferior frente
    chrome.push(compose(f.x, sideZ, yTop, f.w, FR, FR)); // perfil superior lateral
    chrome.push(compose(f.x, sideZ, yBot, f.w, FR, FR)); // perfil inferior lateral
  } else {
    glass.push(compose(f.x, frontZ, gcy, f.w, GLASS_H, PT));
    glass.push(compose(sideX, f.z, gcy, PT, GLASS_H, f.d));
    chrome.push(compose(f.x, frontZ, yTop, f.w, FR, FR));
    chrome.push(compose(f.x, frontZ, yBot, f.w, FR, FR));
    chrome.push(compose(sideX, f.z, yTop, FR, FR, f.d));
    chrome.push(compose(sideX, f.z, yBot, FR, FR, f.d));
  }
  // Postes verticales en las 3 esquinas vistas (la 4ª, contra ambas paredes, se
  // omite). `(ox,oz)` es la esquina ABIERTA donde se juntan los dos cristales.
  const ox = facesX ? Math.sign(ax) : s;
  const oz = facesX ? s : Math.sign(az);
  for (const cxs of [-1, 1] as const) {
    for (const czs of [-1, 1] as const) {
      if (cxs === -ox && czs === -oz) continue; // esquina interior (contra dos paredes)
      chrome.push(compose(f.x + cxs * (f.w / 2 - FR / 2), f.z + czs * (f.d / 2 - FR / 2), gcy, FR, GLASS_H, FR));
    }
  }

  // Columna de ducha sobre la pared del fondo (-face): barra vertical, grifo
  // termostático bajo, ducha de mano y, arriba, brazo con rociador de lluvia
  // colgando hacia el interior. Los herrajes van en gris metálico (no en el cromo
  // azulado de la mampara) y el rociador toma color por instancia.
  const backX = f.x - ax * (f.w / 2 - 0.05);
  const backZ = f.z - az * (f.d / 2 - 0.05);
  metal.push(compose(backX, backZ, yBase + 1.46, 0.05, 1.16, 0.05)); // barra vertical
  metal.push(compose(backX + ax * 0.05, backZ + az * 0.05, yBase + 1.0, facesX ? 0.09 : 0.24, 0.14, facesX ? 0.24 : 0.09)); // grifo termostático
  metal.push(compose(backX + ax * 0.07, backZ + az * 0.07, yBase + 1.42, 0.07, 0.2, 0.07)); // ducha de mano
  metal.push(compose(backX + ax * 0.2, backZ + az * 0.2, yBase + 2.02, facesX ? 0.4 : 0.06, 0.06, facesX ? 0.06 : 0.4)); // brazo superior
  // Rociador de lluvia: negro / blanco / acero según la variante de la pieza.
  const HEAD_COLORS = [0x9aa6ad, 0x232327, 0xf0f0ec];
  head.push(compose(backX + ax * 0.4, backZ + az * 0.4, yBase + 1.95, 0.28, 0.06, 0.28));
  headColors.push(new THREE.Color(HEAD_COLORS[(f.variant ?? 0) % HEAD_COLORS.length]));
}

/** Bañera: cubeta clara con agua interior. */
function addBathtub(f: RenderFurniture, ceramic: THREE.Matrix4[], dark: THREE.Matrix4[], glass: THREE.Matrix4[], yBase = 0): void {
  const rim = 0.08;
  ceramic.push(compose(f.x, f.z, yBase + 0.18, f.w, 0.24, f.d));
  ceramic.push(compose(f.x - f.w / 2 + rim / 2, f.z, yBase + 0.42, rim, 0.38, f.d));
  ceramic.push(compose(f.x + f.w / 2 - rim / 2, f.z, yBase + 0.42, rim, 0.38, f.d));
  ceramic.push(compose(f.x, f.z - f.d / 2 + rim / 2, yBase + 0.42, f.w, 0.38, rim));
  ceramic.push(compose(f.x, f.z + f.d / 2 - rim / 2, yBase + 0.42, f.w, 0.38, rim));
  glass.push(compose(f.x, f.z, yBase + 0.43, Math.max(0.1, f.w - rim * 2.2), 0.035, Math.max(0.1, f.d - rim * 2.2)));
  dark.push(compose(f.x + f.faceX * (f.w / 2 - 0.12), f.z + f.faceZ * (f.d / 2 - 0.12), yBase + 0.62, 0.1, 0.08, 0.1));
}

/** Lavamanos con pie, grifo y espejo contra la pared. */
function addSink(f: RenderFurniture, ceramic: THREE.Matrix4[], dark: THREE.Matrix4[], mirror: THREE.Matrix4[], yBase = 0): void {
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  if (f.sinkMount === 'vanity') {
    const topY = yBase + 0.83;
    ceramic.push(compose(f.x, f.z, topY, f.w, 0.14, f.d));
    ceramic.push(compose(f.x, f.z, topY + 0.08, f.w * 0.78, 0.05, f.d * 0.78));
    dark.push(compose(f.x, f.z, topY + 0.12, 0.07, 0.035, 0.07)); // desague
    dark.push(compose(f.x - f.faceX * fr * 0.35, f.z - f.faceZ * fr * 0.35, topY + 0.18, 0.08, 0.14, 0.08)); // grifo
  } else {
    ceramic.push(compose(f.x, f.z, yBase + 0.42, f.w, 0.18, f.d));
    ceramic.push(compose(f.x, f.z, yBase + 0.22, f.w * 0.34, 0.42, f.d * 0.34));
    dark.push(compose(f.x - f.faceX * fr * 0.25, f.z - f.faceZ * fr * 0.25, yBase + 0.57, 0.08, 0.08, 0.08));
  }
  const backX = f.x - f.faceX * (fr - 0.025);
  const backZ = f.z - f.faceZ * (fr - 0.025);
  const mirrorW = Math.max(0.48, (f.faceX !== 0 ? f.d : f.w) * 0.9);
  if (f.faceX !== 0) mirror.push(compose(backX, f.z, yBase + 1.25, 0.04, 0.82, mirrorW));
  else mirror.push(compose(f.x, backZ, yBase + 1.25, mirrorW, 0.82, 0.04));
}

/** Váter: base, taza, cisterna y tapa oscura. */
function addToilet(f: RenderFurniture, ceramic: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const back = (f.faceX !== 0 ? f.w : f.d) / 2;
  ceramic.push(compose(f.x, f.z, yBase + 0.2, f.w * 0.62, 0.36, f.d * 0.62));
  ceramic.push(compose(f.x - f.faceX * back * 0.32, f.z - f.faceZ * back * 0.32, yBase + 0.62, f.faceX !== 0 ? 0.16 : f.w, 0.44, f.faceX !== 0 ? f.d : 0.16));
  dark.push(compose(f.x + f.faceX * back * 0.12, f.z + f.faceZ * back * 0.12, yBase + 0.42, f.w * 0.48, 0.05, f.d * 0.48));
}

/** Mueble bajo de lavabo con cajones y encimera clara. */
function addBathVanity(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 0.72;
  const alongX = f.faceX === 0;
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  wood.push(compose(f.x, f.z, yBase + H / 2, f.w, H, f.d));
  dark.push(compose(f.x, f.z, yBase + H + 0.035, f.w + 0.1, 0.07, f.d + 0.08));
  for (const rowY of [H * 0.36, H * 0.68]) {
    dark.push(compose(fx, fz, yBase + rowY, alongX ? frontW * 0.82 : 0.035, 0.035, alongX ? 0.035 : frontW * 0.82));
  }
  const pulls = frontW > 1.55 ? [-0.28, 0.28] : [0];
  for (const off of pulls) {
    dark.push(compose(fx + (alongX ? off * frontW : 0), fz + (alongX ? 0 : off * frontW), yBase + H * 0.5, alongX ? 0.28 : 0.05, 0.06, alongX ? 0.05 : 0.28));
  }
}

/** Estantería abierta con baldas para baños grandes. */
function addBathShelf(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 1.65;
  wood.push(compose(f.x, f.z, yBase + H / 2, f.w, H, f.d));
  const alongX = f.faceX === 0;
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  dark.push(compose(fx, fz, yBase + H / 2, alongX ? f.w * 0.82 : 0.04, H * 0.92, alongX ? 0.04 : f.d * 0.82));
  for (const y of [0.55, 1.05]) {
    dark.push(compose(f.x, f.z, yBase + y, alongX ? f.w : 0.05, 0.06, alongX ? 0.05 : f.d));
  }
}

/** Toallas dobladas y pequeños botes sobre una superficie de baño. */
function addTowelStack(f: RenderFurniture, towelMats: THREE.Matrix4[], towelColors: THREE.Color[], dark: THREE.Matrix4[], yBase = 0): void {
  const baseY = f.faceX !== 0 || f.faceZ !== 0 ? 0.86 : 0.5;
  for (let i = 0; i < 3; i++) {
    towelMats.push(compose(f.x, f.z, yBase + baseY + i * 0.055, f.w, 0.045, f.d));
    towelColors.push(new THREE.Color(BATH_TOWEL_COLORS[((f.variant ?? 0) + i) % BATH_TOWEL_COLORS.length]));
  }
  dark.push(compose(f.x + f.w * 0.42, f.z, yBase + baseY + 0.18, 0.08, 0.2, 0.08));
}

/* ── Cocina ──────────────────────────────────────────────────────────────── */
const KITCHEN_COUNTER_H = 0.9; // altura de la encimera (compartida por encimera y microondas)

/** Nevera: electrodoméstico alto de acero con junta frigo/congelador y dos tiradores. */
function addFridge(f: RenderFurniture, appliance: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 1.85;
  appliance.push(compose(f.x, f.z, yBase + H / 2, f.w, H, f.d));
  const alongX = f.faceX === 0;
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  dark.push(compose(fx, fz, yBase + H * 0.62, alongX ? frontW * 0.95 : 0.03, 0.04, alongX ? 0.03 : frontW * 0.95)); // junta horizontal
  const hx = alongX ? frontW * 0.3 : 0;
  const hz = alongX ? 0 : frontW * 0.3;
  for (const cy of [H * 0.3, H * 0.8]) {
    dark.push(compose(fx + hx, fz + hz, yBase + cy, alongX ? 0.05 : 0.04, 0.34, alongX ? 0.04 : 0.05)); // tiradores verticales
  }
}

/**
 * Vitrocerámica: módulo de mueble bajo (cuerpo + encimera) con la placa de cocción
 * EMPOTRADA a ras de la encimera (cristal oscuro) y cuatro fuegos marcados. Comparte
 * cuerpo y encimera con los armarios bajos para que la placa "forme parte del mueble".
 */
function addStove(f: RenderFurniture, wood: THREE.Matrix4[], top: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 0.86;
  const FOOT = 0.1;
  wood.push(compose(f.x, f.z, yBase + FOOT + (H - FOOT) / 2, f.w, H - FOOT, f.d)); // cuerpo del mueble
  top.push(compose(f.x, f.z, yBase + H + 0.02, f.w + 0.06, 0.06, f.d + 0.06)); // encimera (sobresale)
  // Placa de cocción empotrada: cristal oscuro a ras de la encimera, centrado.
  const glassW = Math.min(f.w * 0.7, f.d * 1.3);
  const glassD = f.d * 0.66;
  dark.push(compose(f.x, f.z, yBase + H + 0.055, glassW, 0.02, glassD));
  // Cuatro fuegos: aros claros impresos sobre el cristal (marcas finas).
  const bx = glassW * 0.26;
  const bz = glassD * 0.26;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    top.push(compose(f.x + sx * bx, f.z + sz * bz, yBase + H + 0.067, glassW * 0.32, 0.006, glassD * 0.32));
  }
  // Tirador de cajón bajo la encimera (es un mueble más).
  const alongX = f.faceX === 0;
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  dark.push(compose(fx, fz, yBase + H * 0.55, alongX ? frontW * 0.5 : 0.05, 0.05, alongX ? 0.05 : frontW * 0.5));
}

/**
 * Horno: integrado en un cuerpo de mueble (no exento). Puerta oscura de cristal que
 * ocupa el frente, marco/tirador de acero y panel de mandos arriba — como un horno
 * empotrado en la columna de armarios.
 */
function addOven(f: RenderFurniture, appliance: THREE.Matrix4[], wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 0.9;
  wood.push(compose(f.x, f.z, yBase + H / 2, f.w, H, f.d)); // cuerpo del mueble
  const alongX = f.faceX === 0;
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  // Marco de acero del horno encastrado.
  appliance.push(compose(fx, fz, yBase + H * 0.45, alongX ? frontW * 0.86 : 0.03, H * 0.66, alongX ? 0.03 : frontW * 0.86));
  // Puerta de cristal oscuro.
  dark.push(compose(fx, fz, yBase + H * 0.4, alongX ? frontW * 0.74 : 0.05, H * 0.46, alongX ? 0.05 : frontW * 0.74));
  // Tirador de acero.
  appliance.push(compose(fx, fz, yBase + H * 0.66, alongX ? frontW * 0.66 : 0.06, 0.05, alongX ? 0.06 : frontW * 0.66));
  // Panel de mandos (acero) arriba.
  appliance.push(compose(fx, fz, yBase + H * 0.82, alongX ? frontW * 0.78 : 0.04, 0.1, alongX ? 0.04 : frontW * 0.78));
}

/** Microondas: caja pequeña de acero a la altura de la encimera, con puerta oscura.
 *  Exento (`microwaveStand`) añade un soporte esbelto debajo para no flotar. */
function addMicrowave(f: RenderFurniture, appliance: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const base = yBase + KITCHEN_COUNTER_H;
  const H = 0.3;
  if (f.microwaveStand) dark.push(compose(f.x, f.z, yBase + KITCHEN_COUNTER_H / 2, f.w * 0.7, KITCHEN_COUNTER_H, f.d * 0.7)); // soporte
  appliance.push(compose(f.x, f.z, base + H / 2, f.w, H, f.d));
  const alongX = f.faceX === 0;
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  dark.push(compose(fx, fz, base + H / 2, alongX ? frontW * 0.66 : 0.03, H * 0.7, alongX ? 0.03 : frontW * 0.66)); // puerta/cristal
}

/** Encimera con armarios bajos: cuerpo de madera + tablero claro + dos puertas con tirador. */
function addKitchenCounter(f: RenderFurniture, wood: THREE.Matrix4[], top: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const H = 0.86;
  const FOOT = 0.1;
  wood.push(compose(f.x, f.z, yBase + FOOT + (H - FOOT) / 2, f.w, H - FOOT, f.d)); // cuerpo
  top.push(compose(f.x, f.z, yBase + H + 0.02, f.w + 0.06, 0.06, f.d + 0.06)); // encimera (sobresale)
  const alongX = f.faceX === 0;
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  dark.push(compose(fx, fz, yBase + FOOT + (H - FOOT) / 2, alongX ? 0.03 : 0.02, H - FOOT - 0.08, alongX ? 0.02 : 0.03)); // junta central
  const ho = frontW * 0.24;
  for (const s of [-1, 1]) {
    dark.push(compose(fx + (alongX ? ho * s : 0), fz + (alongX ? 0 : ho * s), yBase + H * 0.6, alongX ? 0.05 : 0.04, 0.12, alongX ? 0.04 : 0.05)); // tiradores
  }
}

/** Armario alto de pared (colgado sobre la encimera): cuerpo + junta + dos tiradores. */
function addKitchenCabinet(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[], yBase = 0): void {
  const BOTTOM = 1.5;
  const H = 0.7;
  wood.push(compose(f.x, f.z, yBase + BOTTOM + H / 2, f.w, H, f.d));
  const alongX = f.faceX === 0;
  const fr = (f.faceX !== 0 ? f.w : f.d) / 2;
  const fx = f.x + f.faceX * fr;
  const fz = f.z + f.faceZ * fr;
  const frontW = alongX ? f.w : f.d;
  dark.push(compose(fx, fz, yBase + BOTTOM + H / 2, alongX ? 0.03 : 0.02, H - 0.08, alongX ? 0.02 : 0.03)); // junta
  const ho = frontW * 0.26;
  for (const s of [-1, 1]) {
    dark.push(compose(fx + (alongX ? ho * s : 0), fz + (alongX ? 0 : ho * s), yBase + BOTTOM + H * 0.3, alongX ? 0.05 : 0.04, 0.12, alongX ? 0.04 : 0.05)); // tiradores
  }
}

/**
 * Una pared axis-aligned como cajas: maciza, o con hueco de puerta (dos hojas
 * + dintel encima del hueco). `doorAt` es la distancia del centro del hueco
 * desde (ax,az).
 */
function addWallBoxes(
  push: (m: THREE.Matrix4) => void,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  h: number,
  t: number,
  doorAt?: number,
  doorHalf?: number,
  yBase = 0,
): void {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.05) return;
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const sgn = alongX ? Math.sign(bx - ax) : Math.sign(bz - az);
  const seg = (s0: number, s1: number, y0: number, y1: number) => {
    if (s1 - s0 < 0.03 || y1 - y0 < 0.03) return;
    const mid = (s0 + s1) / 2;
    if (alongX) push(compose(ax + sgn * mid, az, yBase + (y0 + y1) / 2, s1 - s0, y1 - y0, t));
    else push(compose(ax, az + sgn * mid, yBase + (y0 + y1) / 2, t, y1 - y0, s1 - s0));
  };
  if (doorAt === undefined || doorHalf === undefined) {
    seg(0, len, 0, h);
    return;
  }
  const g0 = Math.max(0, doorAt - doorHalf);
  const g1 = Math.min(len, doorAt + doorHalf);
  const doorTop = Math.min(DOOR_TOP_MAX, h - 0.4);
  seg(0, g0, 0, h);
  seg(g1, len, 0, h);
  seg(g0, g1, doorTop, h); // dintel
}

/* ── Casco hueco multiplanta de un edificio alto ───────────────────────────
 * Planta baja = rellano con escaleras (sin vivienda); cada planta superior es
 * una vivienda (tabiques + muebles) detrás del núcleo de escaleras. Las plantas
 * se apilan en Y a partir de `floorH`. Reutiliza las primitivas de pared/ventana
 * y los muebles de las casas (con `yBase`).
 */
type OfficeCore = { x: number; z: number; w: number; d: number; side: boolean; nX: number; nZ: number };

function addOfficeShell(b: RenderBuilding, K: RenderBuckets): void {
  const oi = b.officeInterior!;
  const t = oi.dwellings[0]?.wallT ?? 0.24;
  const color = new THREE.Color(BUILDING_PALETTES.office[b.colorIdx % 6]);
  const pushBody = (m: THREE.Matrix4) => {
    K.bodyMats.push(m);
    K.bodyColors.push(color);
  };
  const pushPart = (m: THREE.Matrix4) => K.partitionMats.push(m);
  const { floorH, floorCount, core, dwellings } = oi;
  const shaft = officeShaft(b, core); // ojo de escalera (igual en todas las plantas)
  const railSides = holeRailSides(shaft, core); // qué bordes dan a rellano (barandilla) vs. muro
  const sw = b.faceZ !== 0 ? shaft.width : shaft.depth;
  const sd = b.faceZ !== 0 ? shaft.depth : shaft.width;

  for (let f = 0; f < floorCount; f++) {
    const yBase = f * floorH;
    // Solera de la planta (hace también de techo de la inferior). La planta baja
    // no la lleva (es el suelo de calle) y las superiores dejan un HUECO sobre el
    // ojo de escalera, para que la escalera lo atraviese de verdad.
    if (f > 0) addSlabWithHole(K.floorMats, b.x, b.z, b.w - 0.02, b.d - 0.02, shaft.x, shaft.z, sw, sd, yBase + 0.09);
    // Barandilla perimetral del HUECO de escalera en el forjado (protege de caer
    // al hueco desde el rellano; abierta por el frente, que es la boca de bajada).
    if (f > 0) addFloorHoleRail(shaft, railSides, yBase, floorH, K.stairRailMats);
    // Casco perimetral con su rejilla de ventanas (puerta de calle solo en baja).
    addOfficePerimeter(b, yBase, floorH, t, f === 0, pushBody, K.windowMats, K.windowFrameMats);

    if (f > 0) {
      const dw = dwellings[f - 1];
      if (dw) {
        // Muro rellano↔vivienda con su puerta, tabiques y mobiliario de la planta.
        // El número de vivienda es el índice de planta (1 = la más baja con vivienda).
        addCoreWall(b, core, yBase, floorH, t, pushPart, K.dwellingDoorMats, K.dwellingDoorHandleMats, K.doorPlateMats, f, K.plateNumberMats);
        for (const wall of dw.walls) {
          addWallBoxes(pushPart, wall.ax, wall.az, wall.bx, wall.bz, floorH, t, wall.doorAt, wall.doorHalf, yBase);
        }
        for (const fr of dw.furniture) addOfficeFurniture(fr, yBase, K);
      }
    }

    // Tramo de escalera (ida y vuelta) hacia la planta superior.
    if (f < floorCount - 1) addStairwell(shaft, railSides, yBase, floorH, K.stairMats, K.stairRailMats, f === floorCount - 2);
  }
}


/** Losa horizontal (cx,cz,W,D) menos un hueco rectangular, en hasta 4 piezas. */
function addSlabWithHole(
  slabMats: THREE.Matrix4[],
  cx: number,
  cz: number,
  W: number,
  D: number,
  hx: number,
  hz: number,
  hw: number,
  hd: number,
  y: number,
): void {
  const x0 = cx - W / 2;
  const x1 = cx + W / 2;
  const z0 = cz - D / 2;
  const z1 = cz + D / 2;
  const hx0 = Math.max(x0, hx - hw / 2);
  const hx1 = Math.min(x1, hx + hw / 2);
  const hz0 = Math.max(z0, hz - hd / 2);
  const hz1 = Math.min(z1, hz + hd / 2);
  const TH = 0.18;
  const piece = (a0: number, a1: number, b0: number, b1: number) => {
    if (a1 - a0 < 0.03 || b1 - b0 < 0.03) return;
    slabMats.push(compose((a0 + a1) / 2, (b0 + b1) / 2, y, a1 - a0, TH, b1 - b0));
  };
  piece(x0, x1, z0, hz0); // franja delante del hueco
  piece(x0, x1, hz1, z1); // franja detrás
  piece(x0, hx0, hz0, hz1); // izquierda del hueco
  piece(hx1, x1, hz0, hz1); // derecha del hueco
}

/** Cuatro muros perimetrales de una planta de oficina, con rejilla de ventanas. */
function addOfficePerimeter(
  b: RenderBuilding,
  yBase: number,
  storeyH: number,
  t: number,
  streetDoor: boolean,
  pushBody: (m: THREE.Matrix4) => void,
  glass: THREE.Matrix4[],
  frame: THREE.Matrix4[],
): void {
  const doorHalf = 0.78;
  const doorTop = Math.min(DOOR_TOP_MAX, storeyH - 0.4);
  const yc = Math.min(1.55, storeyH - 1.0); // centro de la banda de ventana

  type W = { nx: number; nz: number; p0x: number; p0z: number; p1x: number; p1z: number; alongX: boolean; len: number; isFacade: boolean };
  const walls: W[] = [];
  const mk = (nx: number, nz: number, p0x: number, p0z: number, p1x: number, p1z: number, isFacade: boolean) =>
    walls.push({ nx, nz, p0x, p0z, p1x, p1z, alongX: Math.abs(p1x - p0x) > Math.abs(p1z - p0z), len: Math.hypot(p1x - p0x, p1z - p0z), isFacade });
  if (b.faceZ !== 0) {
    const zF = b.z + b.faceZ * (b.d / 2 - t / 2);
    const zB = b.z - b.faceZ * (b.d / 2 - t / 2);
    mk(0, b.faceZ, b.x - b.w / 2, zF, b.x + b.w / 2, zF, true);
    mk(0, -b.faceZ, b.x - b.w / 2, zB, b.x + b.w / 2, zB, false);
    for (const s of [-1, 1]) {
      const xs = b.x + s * (b.w / 2 - t / 2);
      mk(s, 0, xs, b.z - b.d / 2 + t, xs, b.z + b.d / 2 - t, false);
    }
  } else {
    const xF = b.x + b.faceX * (b.w / 2 - t / 2);
    const xB = b.x - b.faceX * (b.w / 2 - t / 2);
    mk(b.faceX, 0, xF, b.z - b.d / 2, xF, b.z + b.d / 2, true);
    mk(-b.faceX, 0, xB, b.z - b.d / 2, xB, b.z + b.d / 2, false);
    for (const s of [-1, 1]) {
      const zs = b.z + s * (b.d / 2 - t / 2);
      mk(0, s, b.x - b.w / 2 + t, zs, b.x + b.w / 2 - t, zs, false);
    }
  }

  for (const w of walls) {
    const openings: WallOpening[] = [];
    const hasDoor = streetDoor && w.isFacade;
    if (hasDoor) openings.push({ s0: w.len / 2 - doorHalf, s1: w.len / 2 + doorHalf, y0: 0, y1: doorTop });
    // Rejilla regular de ventanas (≈1 cada 3.2 m), saltando el hueco de la puerta.
    const count = Math.max(1, Math.floor(w.len / 3.2));
    const span = w.len - 2.2;
    const slots: number[] = [];
    for (let k = 0; k < count; k++) {
      const off = count === 1 ? 0 : -span / 2 + (k * span) / (count - 1);
      const s = w.len / 2 + off;
      if (s < 0.7 || s > w.len - 0.7) continue;
      if (hasDoor && Math.abs(s - w.len / 2) < 1.4) continue;
      slots.push(s);
      openings.push({ s0: s - WINDOW_W / 2, s1: s + WINDOW_W / 2, y0: yc - WINDOW_H / 2, y1: yc + WINDOW_H / 2 });
    }
    addWallWithHoles(pushBody, w.p0x, w.p0z, w.p1x, w.p1z, storeyH, t, openings, yBase);

    const c0 = w.alongX ? w.p0x : w.p0z;
    const yaw = Math.atan2(w.nx, w.nz);
    for (const s of slots) {
      const along = c0 + s;
      const px = w.alongX ? along : w.p0x + w.nx * (t / 2);
      const pz = w.alongX ? w.p0z + w.nz * (t / 2) : along;
      addWindow(glass, frame, px, yBase + yc, pz, w.nx, w.nz, yaw);
    }
  }
}

/** Muro que separa la vivienda del rellano del fondo, con la puerta centrada y
 *  una placa negra (número de vivienda) a la DERECHA de la puerta, en el rellano. */
function addCoreWall(
  b: RenderBuilding,
  core: OfficeCore,
  yBase: number,
  storeyH: number,
  t: number,
  pushPart: (m: THREE.Matrix4) => void,
  doorMats: THREE.Matrix4[],
  handleMats: THREE.Matrix4[],
  plateMats: THREE.Matrix4[],
  aptNumber: number,
  numberMats: Map<number, THREE.Matrix4[]>,
): void {
  const doorHalf = 0.8;
  const doorTop = Math.min(DOOR_TOP_MAX, storeyH - 0.4);
  const DOOR_GAP = 0.015;
  const DOOR_W = doorHalf * 2 - DOOR_GAP * 2;
  const DOOR_H = doorTop - DOOR_GAP * 2;
  const DOOR_T = 0.08;
  const DOOR_Y = DOOR_GAP;
  const HANDLE_Y = 1.08;
  const HANDLE_S = 0.11;
  // Normal VIVIENDA→NÚCLEO (perpendicular al muro de acceso). El muro corre en el
  // eje transversal a `n`; sirve igual para núcleo al fondo (n = −fachada) que
  // lateral (n = lateral). R = "derecha" a lo largo del muro = (nZ, −nX).
  const nX = core.nX;
  const nZ = core.nZ;
  const rX = nZ;
  const rZ = -nX;
  const PLATE_W = 0.26; // ancho de la placa (a lo largo del muro)
  const PLATE_H = 0.42;
  const PLATE_T = 0.05;
  const PLATE_Y = 1.55;
  const off = doorHalf + 0.3; // a la derecha del hueco de la puerta
  // El quad del número va pegado a la cara visible de la placa (lado del rellano,
  // +n), orientado hacia quien lo lee → yaw a lo largo de +n.
  const yaw = Math.atan2(nX, nZ);
  const pushNumber = (cx: number, cz: number): void => {
    const px = cx + nX * (PLATE_T / 2 + 0.004); // un pelín por delante de la placa
    const pz = cz + nZ * (PLATE_T / 2 + 0.004);
    let arr = numberMats.get(aptNumber);
    if (!arr) numberMats.set(aptNumber, (arr = []));
    arr.push(composeYaw(px, pz, yBase + PLATE_Y, PLATE_W * 0.78, PLATE_H * 0.78, 1, yaw));
  };
  if (nZ !== 0) {
    // `n` a lo largo de Z → muro de Z constante, corre a lo largo de X.
    const zB = core.z - nZ * (core.d / 2); // borde del núcleo hacia la vivienda
    const x0 = b.x - b.w / 2 + t;
    const x1 = b.x + b.w / 2 - t;
    addWallBoxes(pushPart, x0, zB, x1, zB, storeyH, t, b.x - x0, doorHalf, yBase);
    doorMats.push(compose(b.x, zB, yBase + DOOR_Y + DOOR_H / 2, DOOR_W, DOOR_H, DOOR_T));
    handleMats.push(compose(b.x + rX * (doorHalf - 0.28), zB + nZ * (DOOR_T / 2 + HANDLE_S / 2), yBase + HANDLE_Y, HANDLE_S, HANDLE_S, HANDLE_S));
    // Placa en la cara del rellano (lado +n).
    const px = b.x + rX * off;
    const pz = zB + nZ * (t / 2 + PLATE_T / 2);
    plateMats.push(compose(px, pz, yBase + PLATE_Y, PLATE_W, PLATE_H, PLATE_T));
    pushNumber(px, pz);
  } else {
    // `n` a lo largo de X → muro de X constante, corre a lo largo de Z.
    const xB = core.x - nX * (core.w / 2);
    const z0 = b.z - b.d / 2 + t;
    const z1 = b.z + b.d / 2 - t;
    addWallBoxes(pushPart, xB, z0, xB, z1, storeyH, t, b.z - z0, doorHalf, yBase);
    doorMats.push(compose(xB, b.z, yBase + DOOR_Y + DOOR_H / 2, DOOR_T, DOOR_H, DOOR_W));
    handleMats.push(compose(xB + nX * (DOOR_T / 2 + HANDLE_S / 2), b.z + rZ * (doorHalf - 0.28), yBase + HANDLE_Y, HANDLE_S, HANDLE_S, HANDLE_S));
    const px = xB + nX * (t / 2 + PLATE_T / 2);
    const pz = b.z + rZ * off;
    plateMats.push(compose(px, pz, yBase + PLATE_Y, PLATE_T, PLATE_H, PLATE_W));
    pushNumber(px, pz);
  }
}

/**
 * Qué bordes del hueco de escalera lindan con RELLANO transitable (y por tanto
 * necesitan barandilla) frente a los que dan a una PARED (no la necesitan). Se
 * decide comparando el hueco con la caja del núcleo (`core`): allí donde el
 * núcleo se extiende más allá del hueco un margen caminable hay suelo de rellano;
 * donde el hueco queda casi a ras del borde del núcleo, hay muro perimetral.
 *  - `plusU`/`minusU`: laterales del ojo (eje transversal), un lado suele ser el
 *    rellano y el otro la pared en núcleos laterales; ambos son rellano en núcleos
 *    al fondo (el hueco es más estrecho que el ancho a cada lado).
 *  - `back`: fondo del hueco (casi siempre pegado a la fachada trasera → false).
 * El FRENTE nunca se raila: es la boca de subida/bajada (lo tapa el rellano de planta).
 */
function holeRailSides(shaft: OfficeShaft, core: OfficeCore): { plusU: boolean; minusU: boolean; back: boolean } {
  const { x: sx, z: sz, depth: shaftD, width: shaftW, vX, vZ } = shaft;
  const uX = -vZ;
  const uZ = vX;
  const vAlongZ = vZ !== 0;
  const coreVhalf = (vAlongZ ? core.d : core.w) / 2; // semiextensión del núcleo en el eje de subida
  const coreUhalf = (vAlongZ ? core.w : core.d) / 2; // ...y en el transversal
  const du = (core.x - sx) * uX + (core.z - sz) * uZ; // centro del núcleo vs. hueco, proyectado
  const dv = (core.x - sx) * vX + (core.z - sz) * vZ;
  const WALK = 0.35; // margen mínimo de suelo para considerarlo rellano pisable (no un resquicio junto al muro)
  return {
    plusU: du + coreUhalf - shaftW / 2 > WALK,
    minusU: coreUhalf - du - shaftW / 2 > WALK,
    back: dv + coreVhalf - shaftD / 2 > WALK,
  };
}

/**
 * Escalera de ida y vuelta (zigzag) que sube de una planta a la siguiente. Sube
 * media planta (Tramo 1) por un lado del ojo hasta una MESETA DE GIRO al fondo, y
 * la otra media (Tramo 2) por el otro lado de vuelta al frente, terminando
 * EXACTAMENTE a la altura del piso superior, sobre un RELLANO DE PLANTA. El
 * rellano de planta y la meseta conectan los tramos para que el recorrido sea
 * continuo y caminable. `isTop` añade el rellano de la última planta servida.
 * `sides` indica qué bordes exteriores dan a rellano (llevan barandilla) o a muro.
 */
function addStairwell(
  shaft: OfficeShaft,
  sides: { plusU: boolean; minusU: boolean; back: boolean },
  yBase: number,
  floorH: number,
  stairMats: THREE.Matrix4[],
  stairRailMats: THREE.Matrix4[],
  isTop: boolean,
): void {
  const { x: sx, z: sz, depth: shaftD, width: shaftW, vX, vZ } = shaft;
  const uX = -vZ; // eje transversal (ancho del ojo)
  const uZ = vX;
  const vAlongZ = vZ !== 0;
  const { N, rise, going, halfRise, landBack, flightRun, frontLand } = stairLayout(shaftD, floorH);
  const flightW = shaftW * 0.4;
  const uOff = shaftW * 0.3; // separación de cada tramo respecto al ojo central
  const LAND_T = 0.18;
  const FLOOR_TOP = 0.18; // cota de la cara superior del forjado sobre `yBase` (ver addSlabWithHole)
  const RAIL_H = 0.95; // altura de la barandilla sobre el peldaño/rellano
  const RAIL_T = 0.08; // grosor de la barandilla
  const inner1 = uOff - flightW / 2; // borde interior del Tramo 1 (hacia el ojo)
  const inner2 = -uOff + flightW / 2; // borde interior del Tramo 2
  const eyeW = inner1 - inner2; // ancho del ojo (hueco central entre tramos)
  const outer1 = shaftW / 2; // borde exterior del Tramo 1 (hacia el rellano/muro del núcleo)
  const outer2 = -shaftW / 2; // borde exterior del Tramo 2
  // Caja en el frame local (bv a lo largo del eje de subida, bu transversal).
  const boxTo = (mats: THREE.Matrix4[], cx: number, cz: number, cy: number, bv: number, bu: number, hy: number) =>
    mats.push(compose(cx, cz, cy, vAlongZ ? bu : bv, hy, vAlongZ ? bv : bu));

  const frontX = sx - vX * (shaftD / 2);
  const frontZ = sz - vZ * (shaftD / 2);
  // Punto del frame local: `s` a lo largo del eje de subida (desde el frente),
  // `o` a lo largo del transversal. `at` → peldaños/losas, `rail` → barandilla.
  const at = (s: number, o: number, cy: number, bv: number, bu: number, hy: number) =>
    boxTo(stairMats, frontX + vX * s + uX * o, frontZ + vZ * s + uZ * o, cy, bv, bu, hy);
  const rail = (s: number, o: number, topY: number, bv: number, bu: number) =>
    boxTo(stairRailMats, frontX + vX * s + uX * o, frontZ + vZ * s + uZ * o, topY + RAIL_H / 2, bv, bu, RAIL_H);

  // Rellano de PLANTA (frente), a la altura del piso: enlaza el rellano lateral con
  // el arranque del Tramo 1 y la llegada del Tramo 2. (Cubre el vano de la losa.)
  if (frontLand > 0.05) {
    at(frontLand / 2, 0, yBase + FLOOR_TOP - LAND_T / 2, frontLand, shaftW, LAND_T);
    // Barandilla del rellano por el lado del ojo (borde trasero, tramo central).
    if (eyeW > 0.05) rail(frontLand - RAIL_T / 2, 0, yBase + FLOOR_TOP, RAIL_T, eyeW);
  }

  // Tramo 1 (lado +u): del rellano de planta hacia el fondo, subiendo media planta.
  // Barandilla SOLO en el borde interior (el que da al ojo). El borde exterior NO
  // se raila: contra la pared no hace falta, y del lado del rellano la protección
  // la da la barandilla del borde del hueco a nivel de planta (`addFloorHoleRail`),
  // sin barras que suban pegadas a los peldaños "tapando" la escalera.
  for (let i = 0; i < N; i++) {
    const s = frontLand + (i + 0.5) * going;
    const h = (i + 1) * rise;
    at(s, uOff, yBase + h / 2, going, flightW, h);
    rail(s, inner1, yBase + h, going, RAIL_T);
  }
  // Meseta de GIRO al fondo, a media altura, a todo el ancho del ojo.
  at(frontLand + flightRun + landBack / 2, 0, yBase + halfRise - LAND_T / 2, landBack, shaftW, LAND_T);
  // Barandilla de la meseta: lado del ojo (siempre) y el borde exterior solo si da
  // a rellano (la meseta es una tarima elevada: sí protege su caída lateral).
  if (eyeW > 0.05) rail(frontLand + flightRun + RAIL_T / 2, 0, yBase + halfRise, RAIL_T, eyeW);
  if (sides.plusU) rail(frontLand + flightRun + landBack / 2, outer1, yBase + halfRise, landBack, RAIL_T);
  if (sides.minusU) rail(frontLand + flightRun + landBack / 2, outer2, yBase + halfRise, landBack, RAIL_T);
  // Tramo 2 (lado −u): de la meseta de vuelta al frente, subiendo la otra media.
  for (let i = 0; i < N; i++) {
    const s = frontLand + flightRun - (i + 0.5) * going;
    const climb = (i + 1) * rise; // altura ganada sobre la meseta de giro
    at(s, -uOff, yBase + halfRise + climb / 2, going, flightW, climb);
    rail(s, inner2, yBase + halfRise + climb, going, RAIL_T);
  }
  // Rellano de la planta superior: lo aporta la escalera de la planta de arriba
  // (su rellano de planta), salvo en la última planta servida, que lo añade aquí.
  if (isTop && frontLand > 0.05) {
    at(frontLand / 2, 0, yBase + floorH + FLOOR_TOP - LAND_T / 2, frontLand, shaftW, LAND_T);
    if (eyeW > 0.05) rail(frontLand - RAIL_T / 2, 0, yBase + floorH + FLOOR_TOP, RAIL_T, eyeW);
  }
}

/**
 * Barandilla de protección en el borde del HUECO de la escalera del forjado de
 * una planta, SOLO en los lados que dan a rellano transitable (`sides`): así
 * protege la caída al hueco desde el suelo pisable, sin poner barandillas contra
 * las paredes ni en la boca de bajada. Cubre solo el vano abierto por detrás del
 * rellano de planta (`s ∈ [frontLand, shaftD]`); el frente lo tapa dicho rellano.
 * Comparte cota y grosor con las barandillas de los tramos (`addStairwell`).
 */
function addFloorHoleRail(
  shaft: OfficeShaft,
  sides: { plusU: boolean; minusU: boolean; back: boolean },
  yBase: number,
  floorH: number,
  stairRailMats: THREE.Matrix4[],
): void {
  const { x: sx, z: sz, depth: shaftD, width: shaftW, vX, vZ } = shaft;
  const uX = -vZ; // eje transversal (ancho del ojo)
  const uZ = vX;
  const vAlongZ = vZ !== 0;
  const { frontLand } = stairLayout(shaftD, floorH);
  const FLOOR_TOP = 0.18;
  const RAIL_H = 0.95;
  const RAIL_T = 0.08;
  const voidLen = shaftD - frontLand; // tramo de hueco abierto (por detrás del rellano)
  if (voidLen < 0.05) return;
  const frontX = sx - vX * (shaftD / 2);
  const frontZ = sz - vZ * (shaftD / 2);
  const topY = yBase + FLOOR_TOP;
  // `s` a lo largo del eje de subida (desde el frente), `o` transversal. `bv`/`bu`
  // = tamaños a lo largo de esos ejes (mapeados a X/Z según la orientación del ojo).
  const rail = (s: number, o: number, bv: number, bu: number) =>
    stairRailMats.push(
      compose(frontX + vX * s + uX * o, frontZ + vZ * s + uZ * o, topY + RAIL_H / 2, vAlongZ ? bu : bv, RAIL_H, vAlongZ ? bv : bu),
    );
  const midS = (frontLand + shaftD) / 2;
  const side = shaftW / 2 - RAIL_T / 2;
  if (sides.back) rail(shaftD - RAIL_T / 2, 0, RAIL_T, shaftW); // borde del fondo (a todo el ancho)
  if (sides.plusU) rail(midS, side, voidLen, RAIL_T); // lateral +u del ojo
  if (sides.minusU) rail(midS, -side, voidLen, RAIL_T); // lateral −u del ojo
}

/** Despacha una pieza de mobiliario de una planta de oficina a su bucket, con `yBase`. */
function addOfficeFurniture(f: RenderFurniture, yBase: number, K: RenderBuckets): void {
  switch (f.kind) {
    case 'bed':
      addBed({ x: f.x, z: f.z, w: f.w, d: f.d, headX: -f.faceX, headZ: -f.faceZ, double: !!f.double }, K.bedFrameMats, K.bedMattressMats, K.bedBlanketMats, K.bedPillowMats, K.bedHeadboardMats, yBase);
      break;
    case 'nightstand':
      addNightstand(f, K.furnWoodMats, K.furnDarkMats, yBase);
      break;
    case 'wardrobe':
      addWardrobe(f, K.furnWoodMats, K.furnDarkMats, yBase);
      break;
    case 'dresser':
      addDresser(f, K.furnWoodMats, K.furnDarkMats, yBase);
      break;
    case 'rug':
      addRug(f, K.rugMats, K.rugColors, yBase);
      break;
    case 'shower':
      addShower(f, K.bathCeramicMats, K.bathDarkMats, K.bathGlassMats, K.bathMirrorMats, K.showerMetalMats, K.showerHeadMats, K.showerHeadColors, yBase);
      break;
    case 'bathtub':
      addBathtub(f, K.bathCeramicMats, K.bathDarkMats, K.bathGlassMats, yBase);
      break;
    case 'sink':
      addSink(f, K.bathCeramicMats, K.bathDarkMats, K.bathMirrorMats, yBase);
      break;
    case 'toilet':
      addToilet(f, K.bathCeramicMats, K.bathDarkMats, yBase);
      break;
    case 'bathVanity':
      addBathVanity(f, K.bathWoodMats, K.bathDarkMats, yBase);
      break;
    case 'bathShelf':
      addBathShelf(f, K.bathWoodMats, K.bathDarkMats, yBase);
      break;
    case 'towelStack':
      addTowelStack(f, K.bathTowelMats, K.bathTowelColors, K.bathDarkMats, yBase);
      break;
    case 'diningTable':
      addDiningTable(f, K.furnWoodMats, K.furnDarkMats, yBase);
      break;
    case 'diningChair':
      addDiningChair(f, K.furnWoodMats, K.furnDarkMats, yBase);
      break;
    case 'sideboard':
      addSideboard(f, K.furnWoodMats, K.furnDarkMats, yBase);
      break;
    case 'pottedPlant':
      addPottedPlant(f, K.plantPotMats, K.plantLeafMats, yBase);
      break;
    case 'sofa':
    case 'armchair':
      addUpholstered(f, K.upholsteryMats, K.upholsteryColors, K.furnDarkMats, yBase);
      break;
    case 'tv':
      addTv(f, K.tvStandMats, K.tvStandColors, K.furnDarkMats, K.tvBezelMats, K.tvScreenMats, yBase);
      break;
    case 'coffeeTable':
      addCoffeeTable(f, K.furnWoodMats, K.furnDarkMats, yBase);
      break;
    case 'bookshelf':
      addBookshelf(f, K.furnWoodMats, K.bookMats, K.bookColors, yBase);
      break;
    case 'floorLamp':
      addFloorLamp(f, K.furnDarkMats, K.furnWoodMats, K.lampShades, yBase);
      break;
    case 'fridge':
      addFridge(f, K.applianceMats, K.furnDarkMats, yBase);
      break;
    case 'stove':
      addStove(f, K.furnWoodMats, K.counterTopMats, K.furnDarkMats, yBase);
      break;
    case 'oven':
      addOven(f, K.applianceMats, K.furnWoodMats, K.furnDarkMats, yBase);
      break;
    case 'microwave':
      addMicrowave(f, K.applianceMats, K.furnDarkMats, yBase);
      break;
    case 'kitchenCounter':
      addKitchenCounter(f, K.furnWoodMats, K.counterTopMats, K.furnDarkMats, yBase);
      break;
    case 'kitchenCabinet':
      addKitchenCabinet(f, K.furnWoodMats, K.furnDarkMats, yBase);
      break;
  }
}

function buildingVariant(b: RenderBuilding): number {
  return Math.abs((b.id * 37 + b.colorIdx * 17 + Math.round((b.w + b.d + b.h) * 10)) % 97);
}

/** Detalles de instalaciones: AC de muro, bajantes traseras y condensadores en cubierta. */
function addBuildingDetails(
  b: RenderBuilding,
  variant: number,
  acBody: THREE.Matrix4[],
  acVent: THREE.Matrix4[],
  pipes: THREE.Matrix4[],
  acRoof: THREE.Matrix4[],
  acFan: THREE.Matrix4[],
): void {
  const back = { nx: -b.faceX, nz: -b.faceZ };
  const side = { nx: -b.faceZ, nz: b.faceX };
  const side2 = { nx: b.faceZ, nz: -b.faceX };

  // Aparatos de aire acondicionado en los muros traseros y laterales.
  const units: Array<{ n: { nx: number; nz: number }; lat: number; y: number; s: number }> = [];
  if (b.type === 'office') {
    const rows = 2 + (variant % 2);
    for (let k = 0; k < rows; k++) {
      const y = 3.2 + k * Math.max(3, (b.h - 5) / rows);
      if (y > b.h - 1) break;
      units.push({ n: back, lat: k % 2 ? 0.45 : -0.45, y, s: 1 });
    }
    units.push({ n: side, lat: 0.3, y: 4.2, s: 1 });
  } else if (b.type === 'shop') {
    units.push({ n: back, lat: -0.3, y: Math.min(b.h - 0.9, 3.2), s: 0.9 });
    if (variant % 2 === 0) units.push({ n: side, lat: 0.35, y: 2.7, s: 0.85 });
  } else {
    units.push({ n: variant % 2 ? side : side2, lat: 0.3, y: 2.3, s: 0.8 });
  }
  for (const u of units) placeWallUnit(acBody, acVent, b, u.n.nx, u.n.nz, u.lat, u.y, u.s);

  // Bajantes / tuberías en el muro trasero.
  const pipeCount = b.type === 'office' ? 2 : 1;
  const pr = 0.13;
  const alongHalf = back.nx !== 0 ? b.w / 2 : b.d / 2;
  const wallW = back.nx !== 0 ? b.d : b.w;
  const tx = -back.nz;
  const tz = back.nx;
  for (let k = 0; k < pipeCount; k++) {
    const lat = (pipeCount === 1 ? (variant % 2 ? 0.32 : -0.32) : k ? 0.36 : -0.36) * wallW * 0.5;
    const px = b.x + back.nx * (alongHalf + pr) + tx * lat;
    const pz = b.z + back.nz * (alongHalf + pr) + tz * lat;
    const ph = b.h * (b.type === 'house' ? 0.95 : 0.88);
    pipes.push(compose(px, pz, ph / 2, pr * 2, ph, pr * 2));
  }

  // Condensador de aire acondicionado sobre la cubierta plana (tiendas y oficinas).
  if (b.type !== 'house') {
    const ox = (((variant % 3) - 1) / 3) * b.w * 0.4;
    const oz = (variant % 2 ? 1 : -1) * b.d * 0.22;
    acRoof.push(compose(b.x + ox, b.z + oz, b.h + 0.5, 1.5, 0.8, 1.3));
    acFan.push(compose(b.x + ox, b.z + oz, b.h + 0.92, 0.95, 0.12, 0.95));
  }
}

/** Coloca un split de AC (cuerpo + rejilla) sobre el muro con normal (nx,nz). */
function placeWallUnit(
  acBody: THREE.Matrix4[],
  acVent: THREE.Matrix4[],
  b: RenderBuilding,
  nx: number,
  nz: number,
  latFrac: number,
  y: number,
  scale: number,
): void {
  const alongHalf = nx !== 0 ? b.w / 2 : b.d / 2;
  const wallW = nx !== 0 ? b.d : b.w;
  const tx = -nz;
  const tz = nx;
  const yaw = Math.atan2(nx, nz);
  const uw = 1.05 * scale;
  const uh = 0.7 * scale;
  const ud = 0.45 * scale;
  const lat = latFrac * wallW * 0.5;
  const cx = b.x + nx * (alongHalf + ud / 2) + tx * lat;
  const cz = b.z + nz * (alongHalf + ud / 2) + tz * lat;
  acBody.push(composeYaw(cx, cz, y, uw, uh, ud, yaw));
  const vx = b.x + nx * (alongHalf + ud + 0.03) + tx * lat;
  const vz = b.z + nz * (alongHalf + ud + 0.03) + tz * lat;
  acVent.push(composeYaw(vx, vz, y, uw * 0.66, uh * 0.66, 0.06, yaw));
}

/** Fila de tres contenedores de reciclaje (amarillo, verde, azul) junto al bordillo. */
function addBinsCluster(
  b: RenderBuilding,
  binBody: THREE.Matrix4[],
  binBodyColors: THREE.Color[],
  binLid: THREE.Matrix4[],
  binLidColors: THREE.Color[],
): void {
  const faceAngle = Math.atan2(b.faceX, b.faceZ);
  const tx = -b.faceZ; // tangente de la acera
  const tz = b.faceX;
  const nudge = 1.1; // hacia el bordillo, fuera del paso de los peatones
  const colors = [0xf2c200, 0x2e9e4f, 0x2f6fd0]; // envases, vidrio, papel
  for (let k = 0; k < 3; k++) {
    const off = 1.5 + k * 0.74;
    const bx = b.door.x + b.faceX * nudge + tx * off;
    const bz = b.door.z + b.faceZ * nudge + tz * off;
    binBody.push(composeYaw(bx, bz, 0.69, 0.62, 0.9, 0.56, faceAngle));
    binBodyColors.push(new THREE.Color(colors[k]));
    binLid.push(composeYaw(bx, bz, 1.2, 0.68, 0.13, 0.62, faceAngle));
    binLidColors.push(new THREE.Color(colors[k]).multiplyScalar(0.62));
  }
}

function addFlatRoof(
  flatRoofs: THREE.Matrix4[],
  flatRoofColors: THREE.Color[],
  parapets: THREE.Matrix4[],
  b: RenderBuilding,
  color: THREE.Color,
  variant: number,
): void {
  flatRoofs.push(compose(b.x, b.z, b.h + 0.12, b.w + 0.35, 0.24, b.d + 0.35));
  flatRoofColors.push(new THREE.Color(color).multiplyScalar(0.72 + (variant % 3) * 0.06));

  const y = b.h + 0.42;
  parapets.push(compose(b.x, b.z - b.d / 2 - 0.02, y, b.w + 0.55, 0.6, 0.16));
  parapets.push(compose(b.x, b.z + b.d / 2 + 0.02, y, b.w + 0.55, 0.6, 0.16));
  parapets.push(compose(b.x - b.w / 2 - 0.02, b.z, y, 0.16, 0.6, b.d + 0.55));
  parapets.push(compose(b.x + b.w / 2 + 0.02, b.z, y, 0.16, 0.6, b.d + 0.55));
}

function addRoofFixture(boxes: THREE.Matrix4[], tanks: THREE.Matrix4[], b: RenderBuilding, variant: number): void {
  const ox = (((variant % 5) - 2) / 5) * b.w * 0.45;
  const oz = ((((variant * 3) % 5) - 2) / 5) * b.d * 0.45;

  if (b.type === 'house') {
    boxes.push(compose(b.x + ox, b.z + oz, b.h + 1.35, 0.62, 1.25, 0.62));
    return;
  }

  boxes.push(compose(b.x + ox, b.z + oz, b.h + 0.55, Math.max(1.1, b.w * 0.18), 0.85, Math.max(1.0, b.d * 0.14)));
  if (b.type === 'office') {
    boxes.push(compose(b.x - ox * 0.55, b.z - oz * 0.55, b.h + 0.42, 1.0, 0.55, 1.5));
    if (variant % 3 === 0) tanks.push(compose(b.x + b.w * 0.24, b.z - b.d * 0.2, b.h + 0.72, 1.0, 1.25, 1.0));
  }
}

function addFrontBalconies(
  slabs: THREE.Matrix4[],
  rails: THREE.Matrix4[],
  b: RenderBuilding,
  yaw: number,
  frontDist: number,
  frontW: number,
  rows: number,
  variant: number,
): void {
  const tx = Math.cos(yaw);
  const tz = -Math.sin(yaw);
  const perRow = frontW > 9.5 && b.type !== 'house' ? 2 : 1;
  const width = Math.min(3.1, frontW / (perRow + 1.2));
  const protrude = b.type === 'office' ? 0.62 : 0.78;

  for (let r = 0; r < rows; r++) {
    const y = b.type === 'house' ? Math.min(2.85, b.h - 0.62) : Math.min(4.1 + r * 5.4, b.h - 1.35);
    if (y < 2.3 || y > b.h - 0.55) continue;

    for (let k = 0; k < perRow; k++) {
      const off = perRow === 1 ? ((variant % 3) - 1) * 0.35 : (k === 0 ? -frontW * 0.22 : frontW * 0.22);
      const cx = b.x + b.faceX * (frontDist + protrude * 0.5) + tx * off;
      const cz = b.z + b.faceZ * (frontDist + protrude * 0.5) + tz * off;
      slabs.push(composeYaw(cx, cz, y - 0.45, width, 0.16, protrude, yaw));

      const fx = b.x + b.faceX * (frontDist + protrude + 0.04) + tx * off;
      const fz = b.z + b.faceZ * (frontDist + protrude + 0.04) + tz * off;
      rails.push(composeYaw(fx, fz, y - 0.08, width, 0.58, 0.08, yaw));
      rails.push(composeYaw(cx + tx * width * 0.5, cz + tz * width * 0.5, y - 0.08, 0.08, 0.52, protrude, yaw));
      rails.push(composeYaw(cx - tx * width * 0.5, cz - tz * width * 0.5, y - 0.08, 0.08, 0.52, protrude, yaw));
    }
  }
}

function addFacadeBands(out: THREE.Matrix4[], b: RenderBuilding): void {
  for (let y = 4.8; y < b.h - 1.5; y += 5.8) {
    out.push(compose(b.x, b.z - b.d / 2 - 0.055, y, b.w + 0.1, 0.13, 0.1));
    out.push(compose(b.x, b.z + b.d / 2 + 0.055, y, b.w + 0.1, 0.13, 0.1));
    out.push(compose(b.x - b.w / 2 - 0.055, b.z, y, 0.1, 0.13, b.d + 0.1));
    out.push(compose(b.x + b.w / 2 + 0.055, b.z, y, 0.1, 0.13, b.d + 0.1));
  }
}

function makeGableRoofGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -0.5, 0, -0.5,
        0.5, 0, -0.5,
        0.5, 0, 0.5,
        -0.5, 0, 0.5,
        0, 1, -0.5,
        0, 1, 0.5,
      ],
      3,
    ),
  );
  // Solo las dos faldas y los dos hastiales: sin cara inferior. Esa cara, al ras
  // de la tapa del edificio (y = b.h) y con su normal apuntando hacia arriba,
  // provocaba z-fighting (rayado) contra la parte de arriba de la base.
  geo.setIndex([0, 5, 4, 0, 3, 5, 1, 5, 2, 1, 4, 5, 0, 4, 1, 3, 2, 5]);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Tejado a cuatro aguas: pirámide de base rectangular [-0.5,0.5]² (alineada a
 * los ejes) y vértice en (0,1,0). Cuatro faldas, sin cara inferior (evita el
 * z-fighting contra la tapa de la casa). Se escala por (ancho, alto, fondo) sin
 * rotar, así que encaja exactamente con la huella de la casa.
 */
function makeHipRoofGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -0.5, 0, -0.5, // 0
        0.5, 0, -0.5, // 1
        0.5, 0, 0.5, // 2
        -0.5, 0, 0.5, // 3
        0, 1, 0, // 4 (vértice)
      ],
      3,
    ),
  );
  // Una falda por lado, con el bobinado hacia el exterior (material FrontSide).
  geo.setIndex([1, 0, 4, 2, 1, 4, 3, 2, 4, 0, 3, 4]);
  geo.computeVertexNormals();
  return geo;
}

/** Fila de ventanas a altura `y` en las cuatro caras (saltando la fachada junto a la puerta). */
/** Dimensiones del hueco de ventana (compartidas por la geometría del muro y el cristal). */
const WINDOW_W = 1.32;
const WINDOW_H = 1.46;

function addWindowRow(
  glass: THREE.Matrix4[],
  frame: THREE.Matrix4[],
  cx: number,
  cz: number,
  y: number,
  w: number,
  d: number,
  faceX: number,
  faceZ: number,
): void {
  const place = (nx: number, nz: number, width: number, planeHalf: number) => {
    const isFront = nx === faceX && nz === faceZ;
    const count = Math.max(1, Math.floor(width / 3.2));
    const span = width - 2.2;
    const yaw = Math.atan2(nx, nz);
    for (let k = 0; k < count; k++) {
      const off = count === 1 ? 0 : -span / 2 + (k * span) / (count - 1);
      if (isFront && Math.abs(off) < 1.4) continue; // hueco para la puerta
      // Centro del hueco sobre el plano exterior del muro.
      const px = cx + nx * planeHalf + (nx === 0 ? off : 0);
      const pz = cz + nz * planeHalf + (nz === 0 ? off : 0);
      addWindow(glass, frame, px, y, pz, nx, nz, yaw);
    }
  };
  place(1, 0, d, w / 2);
  place(-1, 0, d, w / 2);
  place(0, 1, w, d / 2);
  place(0, -1, w, d / 2);
}

/**
 * Una ventana como conjunto de cajas: cristal remetido (reflectante) + marco en
 * relieve con montante en cruz y antepecho. `(px,y,pz)` es el centro del hueco
 * sobre el plano del muro; `(nx,nz)` la normal saliente; `yaw` la orientación.
 * El relieve del marco y el ligero retranqueo del cristal dan sensación de hueco
 * real sin tener que perforar la geometría instanciada.
 */
function addWindow(
  glass: THREE.Matrix4[],
  frame: THREE.Matrix4[],
  px: number,
  y: number,
  pz: number,
  nx: number,
  nz: number,
  yaw: number,
): void {
  const W = WINDOW_W; // ancho del hueco
  const H = WINDOW_H; // alto del hueco
  const FT = 0.1; // grosor del marco
  const FD = 0.1; // saliente del marco respecto al muro
  const MT = 0.05; // grosor del montante en cruz

  // Tangente de la fachada en el plano XZ (eje local X tras el yaw).
  const tx = nz;
  const tz = -nx;
  // `lo` desplaza a lo largo de la fachada, `vo` en vertical, `no` según la normal.
  const piece = (lo: number, vo: number, no: number, sw: number, sh: number, sd: number, arr: THREE.Matrix4[]) => {
    arr.push(composeYaw(px + tx * lo + nx * no, pz + tz * lo + nz * no, y + vo, sw, sh, sd, yaw));
  };

  // Cristal: ligeramente remetido (no = 0.02) y un pelo más pequeño que el marco.
  piece(0, 0, 0.02, W - 0.04, H - 0.04, 0.04, glass);

  // Marco perimetral en relieve.
  piece(0, (H - FT) / 2, FD / 2 + 0.01, W, FT, FD, frame); // dintel
  piece(0, -(H - FT) / 2, FD / 2 + 0.01, W, FT, FD, frame); // alféizar interior
  piece(-(W - FT) / 2, 0, FD / 2 + 0.01, FT, H, FD, frame); // jamba izq
  piece((W - FT) / 2, 0, FD / 2 + 0.01, FT, H, FD, frame); // jamba der

  // Montante en cruz (un poco menos saliente que el marco).
  piece(0, 0, FD * 0.4, MT, H - FT * 2, FD * 0.7, frame); // vertical
  piece(0, 0, FD * 0.4, W - FT * 2, MT, FD * 0.7, frame); // horizontal

  // Antepecho/vierteaguas saliente bajo la ventana.
  piece(0, -(H / 2 + 0.06), FD * 0.7, W + 0.18, 0.08, FD + 0.1, frame);
}

/** Curva del tramo vertical (i,j)-(i,j+1), o null si es recto. */
function vSegCurve(model: CityModel, i: number, j: number): EdgeCurve | null {
  const from = intersectionId(i, j);
  const to = intersectionId(i, j + 1);
  for (const eid of model.outgoing[from]) {
    const e = model.edges[eid];
    if (e.to === to) return e.curve ?? null;
  }
  return null;
}

/** ¿Tiene la línea vertical `i` algún tramo curvo? (entonces se dibuja segmento a segmento). */
function hasCurvedColumn(model: CityModel, i: number): boolean {
  for (let j = 0; j < CITY.grid - 1; j++) if (vSegCurve(model, i, j)) return true;
  return false;
}

/** Desplaza una polilínea una distancia `offset` a lo largo de su normal (lado izquierdo si >0). */
function offsetPolyline(pts: Vec2[], offset: number): Vec2[] {
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ ...p }));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = segmentNormal(pts[Math.max(0, i - 1)], pts[i]);
    const next = segmentNormal(pts[i], pts[Math.min(n - 1, i + 1)]);
    let nx = prev.x + next.x;
    let nz = prev.z + next.z;
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-5) {
      nx = next.x;
      nz = next.z;
    } else {
      nx /= nl;
      nz /= nl;
    }
    const dot = Math.max(0.35, nx * next.x + nz * next.z);
    out.push({ x: pts[i].x + (nx * offset) / dot, z: pts[i].z + (nz * offset) / dot });
  }
  return out;
}

function segmentNormal(a: Vec2, b: Vec2): Vec2 {
  let tx = b.x - a.x;
  let tz = b.z - a.z;
  const l = Math.hypot(tx, tz) || 1;
  tx /= l;
  tz /= l;
  return { x: -tz, z: tx };
}

/** Banda continua para tramos curvos: evita los huecos que dejan las cajas rectas. */
function addCurvedBand(group: THREE.Group, poly: Vec2[], width: number, y: number, material: THREE.Material): void {
  if (poly.length < 2) return;
  const left = offsetPolyline(poly, width / 2);
  const right = offsetPolyline(poly, -width / 2);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    positions.push(left[i].x, y, left[i].z, right[i].x, y, right[i].z);
    if (i < poly.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  orientTrianglesUp(indices, positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addSidewalkStrip(
  group: THREE.Group,
  material: THREE.Material,
  axis: 'x' | 'z',
  u0: number,
  u1: number,
  cross: number,
  side: number,
  startRound: boolean,
  endRound: boolean,
): void {
  const vInner = side * CITY.roadHalf;
  const vOuter = side * CORRIDOR_HALF;
  const pts: Vec2[] = [
    sidewalkStripPoint(axis, u0, u1, cross, vInner, startRound, true),
    sidewalkStripPoint(axis, u0, u1, cross, vInner, endRound, false),
    sidewalkStripPoint(axis, u0, u1, cross, vOuter, endRound, false),
    sidewalkStripPoint(axis, u0, u1, cross, vOuter, startRound, true),
  ];

  addFlatPolygon(group, pts, 0.12, material);
}

function sidewalkStripPoint(
  axis: 'x' | 'z',
  u0: number,
  u1: number,
  cross: number,
  v: number,
  round: boolean,
  start: boolean,
): Vec2 {
  const clip = round ? circleU(sidewalkRoundRadius(v), v) : CORRIDOR_HALF;
  return toWorld(axis, start ? u0 + clip : u1 - clip, cross, v);
}

function sidewalkRoundRadius(v: number): number {
  const t = (Math.abs(v) - CITY.roadHalf) / CITY.sidewalkWidth;
  return ROUNDABOUT_OUT + Math.min(Math.max(t, 0), 1) * CITY.sidewalkWidth;
}

function circleU(r: number, v: number): number {
  return Math.sqrt(Math.max(0, r * r - v * v));
}

function toWorld(axis: 'x' | 'z', u: number, cross: number, v: number): Vec2 {
  return axis === 'x' ? { x: u, z: cross + v } : { x: cross + v, z: u };
}

function addRoundaboutSidewalkCorner(
  group: THREE.Group,
  cx: number,
  cz: number,
  sx: number,
  sz: number,
  material: THREE.Material,
): void {
  const rIn = ROUNDABOUT_OUT;
  const rOut = ROUNDABOUT_OUT + CITY.sidewalkWidth;
  const aIn0 = Math.asin(CITY.roadHalf / rIn);
  const aIn1 = Math.PI / 2 - aIn0;
  const aOut0 = Math.asin(CORRIDOR_HALF / rOut);
  const aOut1 = Math.PI / 2 - aOut0;
  const pts: Vec2[] = [];
  const steps = 12;

  for (let k = 0; k <= steps; k++) {
    const a = aIn0 + ((aIn1 - aIn0) * k) / steps;
    pts.push({ x: cx + sx * Math.cos(a) * rIn, z: cz + sz * Math.sin(a) * rIn });
  }
  for (let k = 0; k <= steps; k++) {
    const a = aOut1 - ((aOut1 - aOut0) * k) / steps;
    pts.push({ x: cx + sx * Math.cos(a) * rOut, z: cz + sz * Math.sin(a) * rOut });
  }
  addFlatPolygon(group, pts, 0.12, material);
}

function addRoundaboutRoadMouths(group: THREE.Group, cx: number, cz: number, material: THREE.Material): void {
  addRoundaboutRoadMouth(group, cx, cz, 1, 0, material);
  addRoundaboutRoadMouth(group, cx, cz, -1, 0, material);
  addRoundaboutRoadMouth(group, cx, cz, 0, 1, material);
  addRoundaboutRoadMouth(group, cx, cz, 0, -1, material);
}

function addRoundaboutRoadMouth(group: THREE.Group, cx: number, cz: number, dx: number, dz: number, material: THREE.Material): void {
  const h = CITY.roadHalf;
  const r = ROUNDABOUT_OUT + 0.7;
  const inner = ROUNDABOUT_RADIUS - 0.3;
  const theta = Math.asin(h / r);
  const base = Math.atan2(dz, dx);
  const tx = -dz;
  const tz = dx;
  const pts: Vec2[] = [{ x: cx + dx * inner - tx * h, z: cz + dz * inner - tz * h }];

  for (let k = 0; k <= 8; k++) {
    const a = base - theta + (theta * 2 * k) / 8;
    pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
  }
  pts.push({ x: cx + dx * inner + tx * h, z: cz + dz * inner + tz * h });
  addFlatPolygon(group, pts, 0.045, material);
}

function addFlatPolygon(group: THREE.Group, pts: Vec2[], y: number, material: THREE.Material): void {
  if (pts.length < 3) return;
  const positions: number[] = [];
  const normals: number[] = [];
  for (const p of pts) {
    positions.push(p.x, y, p.z);
    normals.push(0, 1, 0);
  }

  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.z - b.x * a.z;
  }

  const indices: number[] = [];
  const triangles = THREE.ShapeUtils.triangulateShape(
    pts.map((p) => new THREE.Vector2(p.x, p.z)),
    [],
  );
  for (const tri of triangles) {
    if (area > 0) indices.push(tri[0], tri[2], tri[1]);
    else indices.push(tri[0], tri[1], tri[2]);
  }
  orientTrianglesUp(indices, positions);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function orientTrianglesUp(indices: number[], positions: number[]): void {
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ux = positions[ib] - positions[ia];
    const uz = positions[ib + 2] - positions[ia + 2];
    const vx = positions[ic] - positions[ia];
    const vz = positions[ic + 2] - positions[ia + 2];
    const normalY = uz * vx - ux * vz;
    if (normalY < 0) {
      const tmp = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = tmp;
    }
  }
}

/**
 * Valla de jardín alrededor de UNA casa: parcela = huella + margen, recortada
 * al interior de la manzana y, contra cada vecino, hasta el punto medio entre
 * ambas huellas (así dos casas contiguas quedan separadas por sus vallas sin
 * solaparse ni cruzar al vecino). El lado de la fachada lleva hueco de puerta.
 */
function addHouseYardFence(
  posts: THREE.Matrix4[],
  rails: THREE.Matrix4[],
  pickets: THREE.Matrix4[],
  h: RenderBuilding,
  blockBuildings: RenderBuilding[],
  bounds: { x0: number; x1: number; z0: number; z1: number },
): void {
  const EDGE_INSET = 0.25; // mantiene la valla dentro del cesped, sin pisar la acera
  const hx0 = h.x - h.w / 2;
  const hx1 = h.x + h.w / 2;
  const hz0 = h.z - h.d / 2;
  const hz1 = h.z + h.d / 2;
  // Parcela inicial: huella + jardín, recortada al interior de la manzana.
  const y = {
    x0: bounds.x0 + EDGE_INSET,
    x1: bounds.x1 - EDGE_INSET,
    z0: bounds.z0 + EDGE_INSET,
    z1: bounds.z1 - EDGE_INSET,
  };
  // Recorta contra cada otra construcción de la manzana, por el eje dominante,
  // hasta el punto medio entre las dos huellas que se miran.
  for (const o of blockBuildings) {
    if (o === h) continue;
    const dx = o.x - h.x;
    const dz = o.z - h.z;
    if (Math.abs(dx) >= Math.abs(dz)) {
      if (dx > 0) y.x1 = Math.min(y.x1, (hx1 + (o.x - o.w / 2)) / 2);
      else y.x0 = Math.max(y.x0, (hx0 + (o.x + o.w / 2)) / 2);
    } else {
      if (dz > 0) y.z1 = Math.min(y.z1, (hz1 + (o.z - o.d / 2)) / 2);
      else y.z0 = Math.max(y.z0, (hz0 + (o.z + o.d / 2)) / 2);
    }
  }
  if (y.x1 - y.x0 < 1 || y.z1 - y.z0 < 1) return;

  // Lado de la fachada (donde va el hueco de la puerta) según hacia dónde mira.
  const HW = 1.0;
  const nOpen = h.faceZ < 0 ? [h.door.x] : [];
  const sOpen = h.faceZ > 0 ? [h.door.x] : [];
  const wOpen = h.faceX < 0 ? [h.door.z] : [];
  const eOpen = h.faceX > 0 ? [h.door.z] : [];
  for (const [a, b] of sideRuns(y.x0, y.x1, nOpen, HW)) addFenceSegment(posts, rails, pickets, a, y.z0, b, y.z0);
  for (const [a, b] of sideRuns(y.x0, y.x1, sOpen, HW)) addFenceSegment(posts, rails, pickets, a, y.z1, b, y.z1);
  for (const [a, b] of sideRuns(y.z0, y.z1, wOpen, HW)) addFenceSegment(posts, rails, pickets, y.x0, a, y.x0, b);
  for (const [a, b] of sideRuns(y.z0, y.z1, eOpen, HW)) addFenceSegment(posts, rails, pickets, y.x1, a, y.x1, b);
}

/** Trozos sólidos de [lo,hi] tras descontar los huecos de puerta (centro ± hw). */
function sideRuns(lo: number, hi: number, openings: number[], hw: number): Array<[number, number]> {
  const cuts = openings
    .filter((c) => c > lo - hw && c < hi + hw)
    .map((c) => [c - hw, c + hw] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const runs: Array<[number, number]> = [];
  let cur = lo;
  for (const [s, e] of cuts) {
    if (s > cur + 0.5) runs.push([cur, Math.min(s, hi)]);
    cur = Math.max(cur, e);
  }
  if (cur < hi - 0.5) runs.push([cur, hi]);
  return runs;
}

/** Un tramo recto de valla entre dos puntos del suelo. */
function addFenceSegment(
  posts: THREE.Matrix4[],
  rails: THREE.Matrix4[],
  pickets: THREE.Matrix4[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
): void {
  const dx = bx - ax;
  const dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 0.5) return;
  const ux = dx / L;
  const uz = dz / L;
  const yaw = Math.atan2(ux, uz);
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  // Dos travesaños horizontales que recorren el tramo (longitud = sz).
  rails.push(composeYaw(cx, cz, 0.45, 0.05, 0.1, L, yaw));
  rails.push(composeYaw(cx, cz, 0.82, 0.05, 0.1, L, yaw));
  // Listones verticales cada ~0.3 m.
  const n = Math.max(1, Math.round(L / 0.3));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pickets.push(composeYaw(ax + ux * L * t, az + uz * L * t, 0.55, 0.04, 0.95, 0.12, yaw));
  }
  // Postes en los extremos (un poco más altos).
  posts.push(composeYaw(ax, az, 0.62, 0.16, 1.24, 0.16, yaw));
  posts.push(composeYaw(bx, bz, 0.62, 0.16, 1.24, 0.16, yaw));
}

function compose(x: number, z: number, y: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion(),
    new THREE.Vector3(sx, sy, sz),
  );
}

function composeYaw(x: number, z: number, y: number, sx: number, sy: number, sz: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
    new THREE.Vector3(sx, sy, sz),
  );
}

function doorMatrix(p: DoorPose, open01: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  const angle = p.hingeSide * open01 * DOOR_OPEN_ANGLE;
  const hx = p.x - Math.cos(p.yaw) * p.width * 0.5 * p.hingeSide;
  const hz = p.z + Math.sin(p.yaw) * p.width * 0.5 * p.hingeSide;
  return out
    .identity()
    .makeTranslation(hx, p.y, hz)
    .multiply(new THREE.Matrix4().makeRotationY(p.yaw + angle))
    .multiply(new THREE.Matrix4().makeTranslation(p.width * 0.5 * p.hingeSide, 0, 0))
    .multiply(new THREE.Matrix4().makeScale(p.width, p.height, p.depth));
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Transforma una hoja corredera: se traslada a lo largo de la tangente de la
 *  fachada (`tx/tz`); `side` (-1 izquierda, 1 derecha) fija hacia qué lado. */
function slidingDoorMatrix(p: SlidingDoorPose, open01: number, side: -1 | 1, out = new THREE.Matrix4()): THREE.Matrix4 {
  const along = side * (p.leafW / 2 + open01 * p.leafW * SLIDING_DOOR_TRAVEL);
  const x = p.x + p.tx * along;
  const z = p.z + p.tz * along;
  return out.compose(
    new THREE.Vector3(x, p.y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, 0)),
    new THREE.Vector3(p.leafW, p.height, p.depth),
  );
}

/** Caja (de largo `len` en su eje local +Y) tendida entre dos puntos del mundo. */
function composeSegment(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  thick: number,
): THREE.Matrix4 {
  const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const len = dir.length() || 1e-4;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().multiplyScalar(1 / len));
  return new THREE.Matrix4().compose(
    new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2),
    q,
    new THREE.Vector3(thick, len, thick),
  );
}

function composeEuler(x: number, z: number, y: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

/**
 * Textura de un número (dígitos claros sobre fondo transparente) para la placa de
 * vivienda. Se genera en runtime con un <canvas> (sin assets externos); el llamante
 * la reutiliza para todas las placas con el mismo número.
 */
function makeNumberTexture(n: number): THREE.CanvasTexture {
  const W = 96;
  const H = 152;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const cx = canvas.getContext('2d')!;
  const s = String(n);
  cx.clearRect(0, 0, W, H);
  cx.fillStyle = '#ececf1';
  cx.font = `bold ${s.length > 1 ? 78 : 112}px system-ui, "Segoe UI", sans-serif`;
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText(s, W / 2, H / 2 + 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  opts: { castShadow?: boolean; receiveShadow?: boolean; colors?: THREE.Color[] } = {},
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  if (opts.colors) opts.colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.castShadow = opts.castShadow ?? false;
  mesh.receiveShadow = opts.receiveShadow ?? false;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
