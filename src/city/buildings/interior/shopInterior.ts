/**
 * Interior de una tienda de gremio (local pequeño de una planta): mostrador de
 * caja junto a la puerta, estanterías contra las paredes laterales y un fondo
 * que depende del gremio — góndolas centrales (ropa, farmacia…), mostrador de
 * servicio (carnicería/pescadería) o expositores de fruta con isla (frutería).
 * Datos puros (sin Three.js): reutiliza las piezas de `MarketFurnitureKind` y
 * el render las interpreta con los mismos renderers que el supermercado.
 *
 * Trabaja en coordenadas LOCALES (along, dep) con la misma convención que
 * `marketInterior.ts`: `along` a lo largo de la fachada (0 = centro, donde está
 * la puerta) y `dep` hacia dentro del edificio (0 = línea de fachada).
 */
import { rng2 } from '../../../core/seededRng';
import type { SpecialtyShopSpec } from '../shops/specialtyShops';
import type { MarketSection } from './marketSections';
import type { Furniture, MarketInterior } from './types';

/** Grosor del muro perimetral del local (entre casa y nave de súper). */
export const SHOP_WALL_T = 0.25;

/**
 * Hueco real de la puerta, compartido por muro (agujero) y render. Casa con la
 * hoja batiente genérica de 1.5×2.3 que `CityMesh` pone a todos los edificios
 * no-súper (mismas cotas que el hueco de `addHouseShell`).
 */
export function shopDoorGeometry(h: number): { doorHalf: number; doorTop: number } {
  return { doorHalf: 0.78, doorTop: Math.min(2.45, h - 0.4) };
}

/* ── Zona de entrada y caja ── */
const ENTRY_CLEAR = 2.6; // fondo libre delante de la puerta (centrada)
const COUNTER_DEP = 2.2; // mostrador de caja, cerca de la fachada
const COUNTER_D = 0.7;
const ROTATED_COUNTER_DEP = 1.3; // arranque (dep) del mostrador rotado de local estrecho

/* ── Estanterías de pared ── */
const SIDE_SHELF_T = 0.55; // fondo de las estanterías laterales
const SHELF_FRONT_MARGIN = 1.7; // no llegan al escaparate (se ve el interior)
const BACK_SHELF_T = 0.6; // estantería contra el muro del fondo
const WALK = 1.5; // paseo entre muebles

/* ── Góndolas centrales (layout `shelves`) ── */
const GONDOLA_W = 1.0;
const GONDOLA_AISLE = 1.7; // pasillo central entre las dos góndolas

/* ── Mostrador de servicio del fondo (layout `counter`), cotas del súper ── */
const TABLE_D = 0.7; // mesa de trabajo contra el muro
const COUNTER_BACK_D = 1.4; // expositor con bandejas
const WORK_GAP = 1.5; // pasillo de trabajo entre ambos

/* ── Frutería (layout `produce`) ── */
const RACK_T = 1.2; // fondo de los expositores inclinados
const ISLAND_W = 1.3; // isla de fruta suelta en el centro
const ISLAND_LEN = 2.6;
const ISLAND_PITCH = 4.5; // una isla por cada ~4.5 m de fondo útil

export function makeShopInterior(
  spec: SpecialtyShopSpec,
  x: number,
  z: number,
  w: number,
  d: number,
  faceX: number,
  faceZ: number,
): MarketInterior {
  const frontW = faceX !== 0 ? d : w; // ancho a lo largo de la fachada
  const depthLen = faceX !== 0 ? w : d; // fondo total
  const t = SHOP_WALL_T;

  // Tangente de la fachada y traducción local→mundo (convención de marketInterior).
  const tx = faceZ;
  const tz = -faceX;
  const frontLineX = x + faceX * (depthLen / 2);
  const frontLineZ = z + faceZ * (depthLen / 2);
  const toWorld = (along: number, dep: number): { x: number; z: number } => ({
    x: frontLineX - faceX * dep + tx * along,
    z: frontLineZ - faceZ * dep + tz * along,
  });
  const sizeOf = (alongExtent: number, depExtent: number): { w: number; d: number } =>
    faceZ !== 0 ? { w: alongExtent, d: depExtent } : { w: depExtent, d: alongExtent };

  const rng = rng2(Math.round(x * 10) * 31 + Math.round(z * 10) + 777);
  const furniture: Furniture[] = [];
  const innerHalf = frontW / 2 - t; // semiancho interior
  const backWallDep = depthLen - t; // cara interior del muro del fondo
  const doorHalf = shopDoorGeometry(3).doorHalf; // solo el semiancho (no depende de h)

  // Mostrador de caja a un lado de la puerta (centrada). La CARA del mostrador
  // marca dónde se pone la trabajadora (`workSpot`: lado de la cara); el
  // cliente queda en el lado opuesto.
  //  - Local ANCHO: paralelo a la fachada, cara hacia el INTERIOR — la
  //    trabajadora queda detrás (lado interior), mirando a la puerta.
  //  - Local ESTRECHO (banda puerta–pared corta): ROTADO 90° y arrimado a la
  //    pared izquierda, con la cara hacia la pared — la trabajadora queda en el
  //    hueco entre mostrador y pared, mirando al pasillo de entrada. Esa pared
  //    se reserva para el puesto (sin estantería izquierda).
  const cMin = -innerHalf + 0.4;
  const cMax = -doorHalf - 0.7;
  const band = cMax - cMin;
  let leftShelf = true;
  if (band >= 2.2) {
    const counterW = Math.min(2.4, band - 0.2);
    const p = toWorld((cMin + cMax) / 2, COUNTER_DEP);
    const sz = sizeOf(counterW, COUNTER_D);
    furniture.push({ kind: 'checkout', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX: -faceX, faceZ: -faceZ });
  } else if (innerHalf >= 2.7) {
    const len = 2.2;
    // Pared + hueco de la trabajadora (0.55 + 0.45 de holgura) + semifondo.
    const alongC = -innerHalf + 1.35;
    const p = toWorld(alongC, ROTATED_COUNTER_DEP + len / 2);
    const sz = sizeOf(COUNTER_D, len);
    furniture.push({ kind: 'checkout', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX: -tx, faceZ: -tz });
    leftShelf = false;
  }

  // Fondo según el gremio; devuelve hasta qué `dep` pueden llegar las estanterías laterales.
  let sideDepTo: number;
  switch (spec.layout) {
    case 'counter':
      sideDepTo = addServiceBack(furniture, toWorld, sizeOf, faceX, faceZ, innerHalf, backWallDep, spec.backCounter ?? 'meatCounter');
      break;
    case 'produce':
      sideDepTo = addProduceBack(furniture, toWorld, sizeOf, faceX, faceZ, innerHalf, backWallDep);
      break;
    default:
      sideDepTo = addShelvesBack(furniture, toWorld, sizeOf, faceX, faceZ, innerHalf, backWallDep);
      break;
  }

  // Muebles contra las paredes laterales: expositores de fruta en la frutería,
  // estanterías de pared en el resto. Empiezan pasado el escaparate. En locales
  // estrechos la pared izquierda es del puesto (mostrador rotado): sin mueble.
  const sideKind = spec.layout === 'produce' ? ('produceRack' as const) : ('wallShelf' as const);
  const sideT = spec.layout === 'produce' ? RACK_T : SIDE_SHELF_T;
  const sideLen = sideDepTo - SHELF_FRONT_MARGIN;
  if (sideLen > 1.2) {
    const depCenter = (SHELF_FRONT_MARGIN + sideDepTo) / 2;
    const sz = sizeOf(sideT, sideLen);
    for (const sgn of [-1, 1] as const) {
      if (sgn === -1 && !leftShelf) continue;
      const p = toWorld(sgn * (innerHalf - sideT / 2), depCenter);
      // Normal hacia el interior: −sgn·tangente.
      furniture.push({ kind: sideKind, x: p.x, z: p.z, w: sz.w, d: sz.d, faceX: -sgn * tx, faceZ: -sgn * tz });
    }
  }

  // Góndolas centrales (solo layout `shelves`), corriendo en profundidad, con el
  // pasillo central alineado con la puerta.
  if (spec.layout === 'shelves') {
    const gonFrom = ENTRY_CLEAR + 0.8;
    const gonTo = sideDepTo - 0.2;
    const innerAlong = 2 * (innerHalf - SIDE_SHELF_T) - 2 * 1.4; // deja pasillo junto a las estanterías laterales
    if (gonTo - gonFrom > 2 && innerAlong > GONDOLA_W) {
      const two = innerAlong >= 2 * GONDOLA_W + GONDOLA_AISLE;
      const centers = two ? [-(GONDOLA_AISLE + GONDOLA_W) / 2, (GONDOLA_AISLE + GONDOLA_W) / 2] : [0];
      const sz = sizeOf(GONDOLA_W, gonTo - gonFrom);
      for (const c of centers) {
        const p = toWorld(c, (gonFrom + gonTo) / 2);
        // Las caras de la góndola miran a lo largo de la tangente (como en el súper).
        furniture.push({ kind: 'shelfAisle', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX: tx, faceZ: tz });
      }
    }
  }

  assignShopSections(furniture, spec, rng.int(0, spec.shelfSections.length));
  return { wallT: t, furniture };
}

/**
 * Fondo con mostrador de servicio (carnicería/pescadería): mesa de trabajo inox
 * contra el muro y expositor con bandejas delante, mirando a la tienda, con su
 * pasillo de trabajo — las mismas piezas y cotas que los puestos del súper.
 */
function addServiceBack(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  faceX: number,
  faceZ: number,
  innerHalf: number,
  backWallDep: number,
  counterKind: 'fishCounter' | 'meatCounter',
): number {
  const half = innerHalf - SIDE_SHELF_T - 0.4; // deja hueco a las estanterías laterales
  if (half < 1.2) return backWallDep - WALK;
  // El expositor no puede invadir la zona de entrada/caja (la trabajadora de
  // caja queda a ~dep 3): en locales poco profundos se prescinde de la mesa de
  // trabajo y el expositor se arrima al fondo; si ni así cabe, no hay puesto.
  const minCounterDep = ENTRY_CLEAR + 1.4;
  const tableDep = backWallDep - TABLE_D / 2 - 0.05;
  let counterDep = tableDep - TABLE_D / 2 - WORK_GAP - COUNTER_BACK_D / 2;
  const conMesa = counterDep >= minCounterDep;
  if (!conMesa) counterDep = backWallDep - COUNTER_BACK_D / 2 - 0.15;
  if (counterDep < minCounterDep) return backWallDep - WALK;

  if (conMesa) {
    const tp = toWorld(0, tableDep);
    const tSz = sizeOf(half * 2, TABLE_D);
    furniture.push({ kind: 'fishTable', x: tp.x, z: tp.z, w: tSz.w, d: tSz.d, faceX, faceZ });
  }

  const cp = toWorld(0, counterDep);
  const cSz = sizeOf(half * 2, COUNTER_BACK_D);
  furniture.push({ kind: counterKind, x: cp.x, z: cp.z, w: cSz.w, d: cSz.d, faceX, faceZ });

  return counterDep - COUNTER_BACK_D / 2 - WALK;
}

/**
 * Fondo de frutería: expositor inclinado contra el muro del fondo (mirando a la
 * tienda) e islas de fruta suelta en el eje central, delante de la puerta.
 */
function addProduceBack(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  faceX: number,
  faceZ: number,
  innerHalf: number,
  backWallDep: number,
): number {
  const half = innerHalf - RACK_T - 0.4; // esquinas libres para los expositores laterales
  const backRackDep = backWallDep - RACK_T / 2 - 0.05;
  if (half > 1.2) {
    const p = toWorld(0, backRackDep);
    const sz = sizeOf(half * 2, RACK_T);
    furniture.push({ kind: 'produceRack', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX, faceZ });
  }
  const sideDepTo = backRackDep - RACK_T / 2 - WALK;

  // Islas centrales, repartidas por el fondo útil entre la entrada y el expositor.
  const islFrom = ENTRY_CLEAR + ISLAND_LEN / 2 + 0.4;
  const islTo = sideDepTo - ISLAND_LEN / 2 - 0.2;
  if (islTo >= islFrom) {
    const count = Math.max(1, Math.min(2, Math.floor((islTo - islFrom + ISLAND_PITCH) / ISLAND_PITCH)));
    const sz = sizeOf(ISLAND_W, ISLAND_LEN);
    for (let i = 0; i < count; i++) {
      const dep = count === 1 ? (islFrom + islTo) / 2 : islFrom + ((islTo - islFrom) * i) / (count - 1);
      const p = toWorld(0, dep);
      furniture.push({ kind: 'produceCrate', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX, faceZ });
    }
  }
  return sideDepTo;
}

/** Fondo por defecto: estantería de pared contra el muro trasero. */
function addShelvesBack(
  furniture: Furniture[],
  toWorld: (along: number, dep: number) => { x: number; z: number },
  sizeOf: (alongExtent: number, depExtent: number) => { w: number; d: number },
  faceX: number,
  faceZ: number,
  innerHalf: number,
  backWallDep: number,
): number {
  const half = innerHalf - SIDE_SHELF_T - 0.4;
  const backDep = backWallDep - BACK_SHELF_T / 2 - 0.05;
  if (half > 1.2) {
    const p = toWorld(0, backDep);
    const sz = sizeOf(half * 2, BACK_SHELF_T);
    furniture.push({ kind: 'wallShelf', x: p.x, z: p.z, w: sz.w, d: sz.d, faceX, faceZ });
  }
  return backDep - BACK_SHELF_T / 2 - WALK;
}

/**
 * Reparte las secciones del gremio entre el mobiliario: los frescos van ligados
 * a su mueble (fruta, mostradores) y las estanterías ciclan `shelfSections`
 * empezando por un offset (RNG local: cada tienda ordena distinto).
 */
function assignShopSections(furniture: Furniture[], spec: SpecialtyShopSpec, start: number): void {
  let next = start;
  const deal = (): MarketSection => spec.shelfSections[next++ % spec.shelfSections.length];
  for (const f of furniture) {
    switch (f.kind) {
      case 'shelfAisle':
        f.sections = [deal(), deal()];
        break;
      case 'wallShelf':
        f.sections = [deal()];
        break;
      case 'produceRack':
      case 'produceCrate':
        f.sections = ['fruta'];
        break;
      case 'fishCounter':
        f.sections = ['pescaderia'];
        break;
      case 'meatCounter':
        f.sections = ['carniceria'];
        break;
    }
  }
}
