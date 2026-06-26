import { Rng } from '../../../../core/Rng';
import type { Furniture, InteriorWall, RoomRect } from '../types';
import type { FurnishContext, HouseGeom } from './FurnitureFactory';
import type { Rect } from './placement';
import { furnitureFactories } from './registry';

/**
 * Amueblador de cocina. Coloca SIEMPRE los tres imprescindibles —nevera, placa de
 * cocción (vitrocerámica) y horno (o microondas en cocinas pequeñas)— más armarios
 * bajos (encimera) y, en cocinas amplias, armarios altos y algún extra.
 *
 * Selección de estancia (se ejecuta DESPUÉS de dormitorio y baño, ANTES del
 * comedor):
 *  - Si queda alguna estancia sin asignar (`kind === 'other'`, que no sea la de
 *    entrada), se amuebla como COCINA independiente, con tantos objetos como
 *    permita su superficie.
 *  - Si no sobra ninguna (pisos pequeños), se monta una COCINA AMERICANA: una
 *    tira compacta contra una pared de la estancia de ENTRADA. El comedor, que va
 *    después, esquiva estas piezas (lee el mobiliario ya colocado de esa estancia).
 */
export class KitchenFurnisher {
  furnish(rooms: RoomRect[], walls: InteriorWall[], house: HouseGeom, rng: Rng, out: Furniture[]): void {
    const { x, z, w, d, t, faceX, faceZ } = house;
    if (rooms.length === 0) return;

    // Estancia de entrada (reservada al comedor): se localiza por el punto justo
    // dentro de la puerta exterior.
    const probeX = x + faceX * (w / 2 - t - 0.35);
    const probeZ = z + faceZ * (d / 2 - t - 0.35);
    const contains = (r: RoomRect, px: number, pz: number) => px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1;
    const entrance = rooms.find((r) => contains(r, probeX, probeZ));

    const zones = doorZones(walls, house);

    // Estancias sin uso (ni dormitorio, ni baño, ni la de entrada): candidatas a
    // cocina independiente. La más amplia primero (mejor cocina).
    const free = rooms
      .filter((r) => r !== entrance && (r.kind === 'other' || r.kind === undefined))
      .sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));

    for (const r of free) {
      if (this.furnishRoom(r, house, zones, rng, out, false)) {
        r.kind = 'kitchen';
        return;
      }
    }

    // Sin estancia libre: cocina americana en la de entrada (tira compacta).
    if (entrance) this.furnishRoom(entrance, house, zones, rng, out, true);
  }

  /**
   * Amuebla una estancia como cocina. `kitchenette` = cocina americana compacta
   * (pocas piezas) en la sala de entrada. Devuelve false si no caben ni los
   * imprescindibles (la estancia no llega a cocina).
   */
  private furnishRoom(room: RoomRect, house: HouseGeom, zones: Rect[], rng: Rng, out: Furniture[], kitchenette: boolean): boolean {
    const { t } = house;
    const inset = t / 2 + 0.06;
    const usable: Rect = { x0: room.x0 + inset, x1: room.x1 - inset, z0: room.z0 + inset, z1: room.z1 - inset };
    if (usable.x1 - usable.x0 < 1.1 || usable.z1 - usable.z0 < 1.1) return false;

    const area = (usable.x1 - usable.x0) * (usable.z1 - usable.z0);
    // En cocina americana se ocupa solo un tramo de pared de la sala → tira corta.
    const big = !kitchenette && area >= 9;
    const medium = !kitchenette && area >= 6.5;

    const f = furnitureFactories;
    const ctx: FurnishContext = { room, house, usable, zones, occupied: zones.map((zn) => ({ ...zn })), bed: null, kitchenCounter: null };
    const draft: Furniture[] = [];

    // Imprescindibles 1/2: nevera y placa de cocción. Sin ellos no hay cocina.
    const fridge = f.fridge.place(ctx, rng);
    if (fridge.length === 0) return false;
    draft.push(...fridge);
    const stove = f.stove.place(ctx, rng);
    if (stove.length === 0) return false;
    draft.push(...stove);

    const tryPush = (pieces: Furniture[]): boolean => {
      if (pieces.length === 0) return false;
      draft.push(...pieces);
      return true;
    };

    // Una encimera base: superficie de trabajo y apoyo del microondas y los armarios altos.
    tryPush(f.kitchenCounter.place(ctx, rng));

    // Imprescindible 3: aparato de cocción. Horno (exento) en cocinas amplias;
    // microondas (sobre la encimera) en las pequeñas. Se intenta el preferido y, si
    // no cabe, el otro. Es OBLIGATORIO: si no entra ninguno, esta estancia no sirve
    // como cocina (se descarta y se prueba otra / la cocina americana de la sala).
    let cooked = medium ? tryPush(f.oven.place(ctx, rng)) : tryPush(f.microwave.place(ctx, rng));
    if (!cooked) cooked = medium ? tryPush(f.microwave.place(ctx, rng)) : tryPush(f.oven.place(ctx, rng));
    if (!cooked) return false;

    // Extras según holgura (después de los imprescindibles, que tienen prioridad de pared).
    if (medium) {
      tryPush(f.kitchenCounter.place(ctx, rng));
      tryPush(f.kitchenCabinet.place(ctx, rng));
    }
    if (big) {
      tryPush(f.kitchenCounter.place(ctx, rng));
      tryPush(f.kitchenCabinet.place(ctx, rng));
      if (rng.next() < 0.5) tryPush(f.pottedPlant.place(ctx, rng));
    }

    out.push(...draft);
    return true;
  }
}

/** Corredores de paso delante de cada hueco de puerta (interiores + exterior). */
function doorZones(walls: InteriorWall[], house: HouseGeom): Rect[] {
  const { x, z, w, d, t, faceX, faceZ } = house;
  const PASS_DEPTH = 0.8;
  const PASS_MARGIN = 0.12;
  const zones: Rect[] = [];
  for (const wl of walls) {
    if (wl.doorAt === undefined || wl.doorHalf === undefined) continue;
    const len = Math.hypot(wl.bx - wl.ax, wl.bz - wl.az);
    if (len < 0.05) continue;
    const ux = (wl.bx - wl.ax) / len;
    const uz = (wl.bz - wl.az) / len;
    const cx = wl.ax + ux * wl.doorAt;
    const cz = wl.az + uz * wl.doorAt;
    const halfGap = wl.doorHalf + PASS_MARGIN;
    if (Math.abs(ux) > Math.abs(uz)) zones.push({ x0: cx - halfGap, x1: cx + halfGap, z0: cz - PASS_DEPTH, z1: cz + PASS_DEPTH });
    else zones.push({ x0: cx - PASS_DEPTH, x1: cx + PASS_DEPTH, z0: cz - halfGap, z1: cz + halfGap });
  }
  const exHalf = 0.78 + PASS_MARGIN;
  if (faceZ !== 0) {
    const cz = z + faceZ * (d / 2 - t / 2);
    zones.push({ x0: x - exHalf, x1: x + exHalf, z0: cz - PASS_DEPTH, z1: cz + PASS_DEPTH });
  } else if (faceX !== 0) {
    const cx = x + faceX * (w / 2 - t / 2);
    zones.push({ x0: cx - PASS_DEPTH, x1: cx + PASS_DEPTH, z0: z - exHalf, z1: z + exHalf });
  }
  return zones;
}

/** Instancia compartida del amueblador de cocina. */
export const kitchenFurnisher = new KitchenFurnisher();
