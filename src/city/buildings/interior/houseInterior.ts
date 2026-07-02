import { Rng } from '../../../core/Rng';
import { rng2 } from '../../../core/seededRng';
import { makeFridgeStore, stockFridge } from '../../food/Fridge';
import type { Furniture, HouseInterior, InteriorWall, RoomRect } from './types';
import { bathroomFurnisher } from './furniture/BathroomFurnisher';
import { bedroomFurnisher } from './furniture/BedroomFurnisher';
import { diningFurnisher } from './furniture/DiningFurnisher';
import { kitchenFurnisher } from './furniture/KitchenFurnisher';

/* ── Interiores de casas ───────────────────────────────────────────────────
 * Partición BSP del rectángulo interior: cada corte añade un tabique y se
 * recurre en las dos mitades; el resultado es un árbol de estancias, así que
 * con UNA puerta por tabique toda la casa queda conectada.
 */
export const WALL_T = 0.24;

export function makeHouseInterior(
  x: number,
  z: number,
  w: number,
  d: number,
  faceX: number,
  faceZ: number,
  seedOffset = 0,
  minRooms = 0,
): HouseInterior {
  // `seedOffset` permite generar distribuciones distintas en una misma posición
  // (lo usan las plantas apiladas de un edificio alto). Por defecto 0 → las casas
  // no cambian.
  const rng = rng2(Math.round(x * 10) * 31 + Math.round(z * 10) + seedOffset * 1000003);
  const rooms: RoomRect[] = [];
  const walls: InteriorWall[] = [];

  // Hueco de la puerta exterior, tratado como una restricción de primera clase:
  // un tabique PERPENDICULAR a la fachada que caiga dentro de este vano la tapa.
  //   faceZ != 0 → fachada a lo largo de X, puerta centrada en x = `x`
  //   faceX != 0 → fachada a lo largo de Z, puerta centrada en z = `z`
  // `addHouseShell` usa doorHalf = 0.78; añadimos margen para que el vano respire.
  const DOOR_HALF_EXT = 0.78;
  const DOOR_CLEAR = DOOR_HALF_EXT + 0.5;
  const DOOR_CLEAR_TIGHT = DOOR_HALF_EXT + 0.15; // margen reducido al forzar estancias
  const doorCenter = faceZ !== 0 ? x : faceX !== 0 ? z : NaN;
  // ¿Un corte en este eje produce un tabique perpendicular a la fachada?
  //   cutAlongZ=false → tabique de x constante (a lo largo de Z)
  //   cutAlongZ=true  → tabique de z constante (a lo largo de X)
  const perpToFacade = (cutAlongZ: boolean): boolean =>
    (faceZ !== 0 && !cutAlongZ) || (faceX !== 0 && cutAlongZ);

  // Elige la posición del corte dentro de [lo, hi]. Si el corte es perpendicular
  // a la fachada, evita el intervalo del vano de la puerta: parte el rango en los
  // tramos libres a izquierda/derecha del hueco y elige uno (pesado por longitud).
  // Devuelve null si el vano ocupa todo el rango disponible.
  const pickCut = (lo: number, hi: number, cutAlongZ: boolean, clear = DOOR_CLEAR): number | null => {
    if (!perpToFacade(cutAlongZ) || Number.isNaN(doorCenter)) return rng.range(lo, hi);
    const flo = doorCenter - clear;
    const fhi = doorCenter + clear;
    const leftLen = Math.min(hi, flo) - lo;
    const rightLen = hi - Math.max(lo, fhi);
    if (leftLen <= 0 && rightLen <= 0) return null;
    if (leftLen <= 0) return rng.range(Math.max(lo, fhi), hi);
    if (rightLen <= 0) return rng.range(lo, Math.min(hi, flo));
    return rng.next() * (leftLen + rightLen) < leftLen
      ? rng.range(lo, Math.min(hi, flo))
      : rng.range(Math.max(lo, fhi), hi);
  };

  // Área y lado mínimos por estancia. Las viviendas de edificio (minRooms>0)
  // pueden recurrir a mínimos relajados para garantizar el nº de estancias: así
  // una puede salir pequeña (el baño).
  const MIN_SIDE = 2.7; // lado mínimo de una estancia (m)
  const MIN_AREA = 12; // superficie mínima de una estancia (m²)
  const MIN_SIDE_FORCE = 1.8; // lado mínimo relajado al forzar `minRooms`
  const MIN_AREA_FORCE = 4.5; // superficie mínima relajada (baño)
  // Límites del corte dentro de un tramo [start, start+len]: deja ambas mitades
  // con al menos `minSide` de lado, prefiriendo la zona central para repartos
  // parejos. Si no cabe el margen central, cae al punto medio.
  const cutBounds = (start: number, len: number, minSide: number): [number, number] => {
    const m = Math.max(minSide, len * 0.32);
    let lo = start + m;
    let hi = start + len - m;
    if (lo > hi) lo = hi = start + len / 2;
    return [lo, hi];
  };

  // Un único corte de [x0,z0,x1,z1]: elige eje (corta el lado más largo), respeta
  // el vano de la puerta, empuja el tabique y devuelve las dos mitades. null si no
  // cabe bajo los mínimos dados.
  const cutOnce = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    minSide: number,
    minArea: number,
    doorClear = DOOR_CLEAR,
  ): [RoomRect, RoomRect] | null => {
    const sw = x1 - x0;
    const sd = z1 - z0;
    const area = sw * sd;
    const canX = sw >= 2 * minSide + WALL_T && area >= 2 * minArea;
    const canZ = sd >= 2 * minSide + WALL_T && area >= 2 * minArea;
    if (!canX && !canZ) return null;
    let cutAlongZ = canX && canZ ? sd > sw : canZ;
    const tryCut = (alongZ: boolean): number | null => {
      const [lo, hi] = alongZ ? cutBounds(z0, sd, minSide) : cutBounds(x0, sw, minSide);
      return pickCut(lo, hi, alongZ, doorClear);
    };
    let cut = tryCut(cutAlongZ);
    if (cut === null && (cutAlongZ ? canX : canZ)) {
      cutAlongZ = !cutAlongZ;
      cut = tryCut(cutAlongZ);
    }
    if (cut === null) return null;
    if (!cutAlongZ) {
      walls.push({ ax: cut, az: z0, bx: cut, bz: z1 });
      return [{ x0, z0, x1: cut, z1 }, { x0: cut, z0, x1, z1 }];
    }
    walls.push({ ax: x0, az: cut, bx: x1, bz: cut });
    return [{ x0, z0, x1, z1: cut }, { x0, z0: cut, x1, z1 }];
  };

  // BSP "blando": divide mientras la estancia sea bastante mayor que un tamaño
  // objetivo (pocas estancias amplias). Es lo único que usan las casas sueltas.
  const split = (x0: number, z0: number, x1: number, z1: number, depth: number): void => {
    const area = (x1 - x0) * (z1 - z0);
    const splitTarget = rng.range(28, 44);
    if (depth <= 0 || area < splitTarget) {
      rooms.push({ x0, z0, x1, z1 });
      return;
    }
    const halves = cutOnce(x0, z0, x1, z1, MIN_SIDE, MIN_AREA);
    if (!halves) {
      rooms.push({ x0, z0, x1, z1 });
      return;
    }
    split(halves[0].x0, halves[0].z0, halves[0].x1, halves[0].z1, depth - 1);
    split(halves[1].x0, halves[1].z0, halves[1].x1, halves[1].z1, depth - 1);
  };
  split(x - w / 2 + WALL_T, z - d / 2 + WALL_T, x + w / 2 - WALL_T, z + d / 2 - WALL_T, 5);

  // Mínimo de estancias garantizado (viviendas de edificio): subdivide la estancia
  // más grande con mínimos relajados hasta llegar a `minRooms` (una puede quedar
  // pequeña: el baño). Las puertas se colocan después, así que el árbol de
  // tabiques —y la conectividad— se mantiene.
  let guard = 0;
  while (minRooms > 0 && rooms.length < minRooms && guard++ < 24) {
    let bi = -1;
    let bestArea = 0;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      const a = (r.x1 - r.x0) * (r.z1 - r.z0);
      if (a > bestArea) {
        bestArea = a;
        bi = i;
      }
    }
    if (bi < 0) break;
    const r = rooms[bi];
    const halves = cutOnce(r.x0, r.z0, r.x1, r.z1, MIN_SIDE_FORCE, MIN_AREA_FORCE, DOOR_CLEAR_TIGHT);
    if (!halves) break; // ninguna estancia admite más cortes
    rooms.splice(bi, 1, halves[0], halves[1]);
  }

  // Las puertas se colocan al final, cuando ya se conocen todas las uniones en
  // T entre tabiques: cada puerta va en el tramo libre más largo de su pared.
  for (const wall of walls) placeWallDoor(wall, walls, rng);

  // Amueblado por estancias, en orden: cada amueblador elige su estancia y reserva
  // las que necesitan los siguientes (dormitorio → baño → cocina → comedor). La
  // cocina toma una estancia libre o, si no la hay, monta una americana en la sala
  // de entrada; el comedor (que va último) esquiva lo ya colocado en esa sala.
  const furniture: Furniture[] = [];
  bedroomFurnisher.furnish(rooms, walls, { x, z, w, d, t: WALL_T, faceX, faceZ }, rng, furniture);
  bathroomFurnisher.furnish(rooms, walls, { x, z, w, d, t: WALL_T, faceX, faceZ }, rng, furniture);
  kitchenFurnisher.furnish(rooms, walls, { x, z, w, d, t: WALL_T, faceX, faceZ }, rng, furniture);
  diningFurnisher.furnish(rooms, walls, { x, z, w, d, t: WALL_T, faceX, faceZ }, rng, furniture);

  // Llena las neveras de comida. Va DESPUÉS del amueblado y con un RNG propio
  // (seeded por posición) para no alterar el orden de colocación de los muebles.
  stockFridges(furniture, rng2(Math.round(x * 10) * 31 + Math.round(z * 10) + seedOffset * 1000003 + 777));

  return { wallT: WALL_T, rooms, walls, furniture };
}

/**
 * Da a cada nevera de la vivienda un almacén con capacidad limitada y lo llena de
 * comida variada. La capacidad varía un poco por nevera (RNG seeded).
 */
function stockFridges(furniture: Furniture[], rng: Rng): void {
  for (const f of furniture) {
    if (f.kind !== 'fridge') continue;
    f.food = makeFridgeStore(rng.range(80, 120));
    stockFridge(f.food, rng);
  }
}

/** Hueco de puerta en el tramo de la pared más alejado de las uniones en T. */
function placeWallDoor(wall: InteriorWall, all: InteriorWall[], rng: Rng): void {
  const len = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az);
  const ux = (wall.bx - wall.ax) / len;
  const uz = (wall.bz - wall.az) / len;
  const junctions: number[] = [0, len];
  for (const other of all) {
    if (other === wall) continue;
    for (const [px, pz] of [[other.ax, other.az], [other.bx, other.bz]] as Array<[number, number]>) {
      const t = (px - wall.ax) * ux + (pz - wall.az) * uz;
      if (t < 0.01 || t > len - 0.01) continue;
      // ¿El extremo del otro tabique cae SOBRE esta pared? (unión en T)
      if (Math.hypot(px - (wall.ax + ux * t), pz - (wall.az + uz * t)) < 0.05) junctions.push(t);
    }
  }
  junctions.sort((a, b) => a - b);
  let bestA = 0;
  let bestB = 0;
  for (let k = 0; k < junctions.length - 1; k++) {
    if (junctions[k + 1] - junctions[k] > bestB - bestA) {
      bestA = junctions[k];
      bestB = junctions[k + 1];
    }
  }
  const margin = 0.45; // distancia mínima del hueco a esquinas y uniones
  const half = Math.min(0.55, Math.max(0.35, (bestB - bestA) / 2 - margin));
  const lo = bestA + margin + half;
  const hi = bestB - margin - half;
  wall.doorAt = lo >= hi ? (bestA + bestB) / 2 : rng.range(lo, hi);
  wall.doorHalf = half;
}
