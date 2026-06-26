import { Rng } from '../../../../core/Rng';
import type { Furniture, InteriorWall, RoomRect } from '../types';
import type { FurnishContext, HouseGeom } from './FurnitureFactory';
import type { Rect } from './placement';
import { furnitureFactories } from './registry';

/**
 * Amueblador de dormitorio: designa qué estancia(s) serán dormitorio y aplica la
 * receta de piezas — la cama manda, luego mesitas, armario y, con suerte, cómoda
 * y alfombra.
 *
 * Selección del dormitorio principal (nunca la estancia de entrada):
 *  - Debe ser una estancia de BORDE, preferiblemente en ESQUINA (que toque dos
 *    fachadas) — nunca una franja "en medio" de la casa.
 *  - Se penalizan las estancias muy ALARGADAS (relación de lados alta): un
 *    dormitorio debe ser razonablemente proporcionado, no un pasillo ancho.
 *
 * Si tras el dormitorio principal y el baño aún sobran estancias amplias y bien
 * proporcionadas, hay probabilidad de designar dormitorios EXTRA: así una casa
 * con muchas estancias puede tener más de una habitación en vez de dejar salas
 * vacías.
 *
 * Para otro tipo de estancia (cocina, baño…): crea otro `*Furnisher` con su
 * propia selección de estancia y su receta de `furnitureFactories`.
 */
export class BedroomFurnisher {
  furnish(rooms: RoomRect[], walls: InteriorWall[], house: HouseGeom, rng: Rng, out: Furniture[]): void {
    const { x, z, w, d, t, faceX, faceZ } = house;
    if (rooms.length === 0) return;

    // Punto justo dentro de la puerta de salida → estancia de entrada (vetada).
    const probeX = x + faceX * (w / 2 - t - 0.35);
    const probeZ = z + faceZ * (d / 2 - t - 0.35);
    const contains = (r: RoomRect, px: number, pz: number) => px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1;
    const entrance = rooms.find((r) => contains(r, probeX, probeZ));

    // Candidatas: todas menos la de entrada.
    const candidates = rooms.filter((r) => r !== entrance);
    rooms.forEach((r) => (r.kind = 'other'));
    if (candidates.length === 0) return;

    // Bordes interiores de la casa: sirven para distinguir estancias de borde y
    // de esquina de las que quedan "en medio".
    const EDGE = 0.2; // tolerancia para considerar un lado pegado a la fachada
    const minX = x - w / 2 + t;
    const maxX = x + w / 2 - t;
    const minZ = z - d / 2 + t;
    const maxZ = z + d / 2 - t;
    const touchX = (r: RoomRect) => r.x0 <= minX + EDGE || r.x1 >= maxX - EDGE;
    const touchZ = (r: RoomRect) => r.z0 <= minZ + EDGE || r.z1 >= maxZ - EDGE;
    const isCorner = (r: RoomRect) => touchX(r) && touchZ(r);
    const isBorder = (r: RoomRect) => touchX(r) || touchZ(r);

    const dims = (r: RoomRect) => {
      const rw = r.x1 - r.x0;
      const rd = r.z1 - r.z0;
      return { rw, rd, area: rw * rd, aspect: Math.max(rw, rd) / Math.max(0.01, Math.min(rw, rd)) };
    };

    // Puntuación para el dormitorio principal: superficie, con bonus por esquina/
    // borde y un fuerte castigo a las estancias alargadas o "en medio".
    const MAX_ASPECT = 1.9; // a partir de aquí la estancia se considera alargada
    const score = (r: RoomRect): number => {
      const { area, aspect } = dims(r);
      let s = area;
      if (aspect > MAX_ASPECT) s -= area * (aspect - MAX_ASPECT) * 1.5; // castiga lo alargado
      if (isCorner(r)) s += 8; // esquina: la forma más "habitación"
      else if (isBorder(r)) s += 3; // borde
      else s -= 12; // en medio de la casa: evitar
      return s;
    };

    // Estancias en orden de preferencia para dormitorio.
    const ranked = candidates.slice().sort((a, b) => score(b) - score(a));

    // Corredores de paso delante de cada puerta (comunes a todas las estancias).
    const zones = doorZones(walls, house);

    // Dormitorio principal: la mejor estancia donde quepa la cama (las siguientes
    // sirven de respaldo si en la preferida no entra). Si en ninguna cabe, no hay
    // dormitorio.
    let bedroom: RoomRect | null = null;
    for (const r of ranked) {
      if (this.furnishRoom(r, house, zones, rng, out)) {
        bedroom = r;
        break;
      }
    }
    if (!bedroom) return;

    // Dormitorios extra: con las estancias que sobran tras reservar las dos más
    // pequeñas para el baño y la cocina. Solo estancias de borde, amplias y bien
    // proporcionadas, y de forma probabilística — así no todas las casas amplias se
    // llenan de camas y siempre queda sitio para cocina y baño.
    const remaining = candidates.filter((r) => r !== bedroom).sort((a, b) => dims(a).area - dims(b).area);
    const spares = remaining.slice(2); // remaining[0] → baño, remaining[1] → cocina
    for (const r of spares) {
      const { area, aspect } = dims(r);
      if (!isBorder(r) || area < 9 || aspect > 2.4) continue;
      if (rng.next() < 0.55) this.furnishRoom(r, house, zones, rng, out);
    }
  }

  /** Amuebla una estancia como dormitorio. Devuelve false si la cama no cabe. */
  private furnishRoom(room: RoomRect, house: HouseGeom, zones: Rect[], rng: Rng, out: Furniture[]): boolean {
    const { t } = house;
    // Superficie útil del dormitorio (remetida medio tabique + zócalo).
    const inset = t / 2 + 0.06;
    const usable: Rect = { x0: room.x0 + inset, x1: room.x1 - inset, z0: room.z0 + inset, z1: room.z1 - inset };

    const ctx: FurnishContext = { room, house, usable, zones, occupied: zones.map((zn) => ({ ...zn })), bed: null };

    // Receta de piezas. La cama manda en el resto del amueblado.
    const bed = furnitureFactories.bed.place(ctx, rng);
    if (bed.length === 0) return false;
    room.kind = 'bedroom';
    out.push(...bed);
    out.push(...furnitureFactories.nightstand.place(ctx, rng));
    out.push(...furnitureFactories.wardrobe.place(ctx, rng));
    if (rng.next() < 0.7) out.push(...furnitureFactories.dresser.place(ctx, rng));
    if (rng.next() < 0.65) out.push(...furnitureFactories.rug.place(ctx, rng));
    return true;
  }
}

/** Corredores de paso delante de cada hueco de puerta (interiores + exterior). */
function doorZones(walls: InteriorWall[], house: HouseGeom): Rect[] {
  const { x, z, w, d, t, faceX, faceZ } = house;
  const PASS_DEPTH = 0.95; // holgura para pasar por delante del hueco
  const PASS_MARGIN = 0.15; // ensanche del corredor a cada lado del hueco
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
    if (Math.abs(ux) > Math.abs(uz)) {
      zones.push({ x0: cx - halfGap, x1: cx + halfGap, z0: cz - PASS_DEPTH, z1: cz + PASS_DEPTH });
    } else {
      zones.push({ x0: cx - PASS_DEPTH, x1: cx + PASS_DEPTH, z0: cz - halfGap, z1: cz + halfGap });
    }
  }
  // Puerta exterior de la fachada (su corredor entra en la estancia de entrada).
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

/** Instancia compartida del amueblador de dormitorio. */
export const bedroomFurnisher = new BedroomFurnisher();
