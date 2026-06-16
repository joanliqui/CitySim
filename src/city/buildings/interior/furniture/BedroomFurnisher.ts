import { Rng } from '../../../../core/Rng';
import type { Furniture, InteriorWall, RoomRect } from '../types';
import type { FurnishContext, HouseGeom } from './FurnitureFactory';
import type { Rect } from './placement';
import { furnitureFactories } from './registry';

/**
 * Amueblador de dormitorio: designa la estancia que será dormitorio (la mayor
 * que NO contenga la puerta de salida), prepara el contexto (corredores de
 * paso, superficie útil) y aplica la receta de piezas en orden — la cama manda,
 * luego mesitas, armario y, con suerte, cómoda y alfombra.
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

    // Candidatas: todas menos la de entrada. El dormitorio es la mayor de ellas.
    const candidates = rooms.filter((r) => r !== entrance);
    if (candidates.length === 0) return;
    let bedroom = candidates[0];
    let bestArea = -1;
    for (const r of candidates) {
      const a = (r.x1 - r.x0) * (r.z1 - r.z0);
      if (a > bestArea) {
        bestArea = a;
        bedroom = r;
      }
    }
    for (const r of rooms) r.kind = r === bedroom ? 'bedroom' : 'other';

    // Corredores de paso delante de cada puerta: rectángulo que sale perpendicular
    // del hueco hacia dentro de la estancia. La cama no debe invadirlos para no
    // quedar "justo delante" de una puerta obstruyendo el paso.
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

    // Superficie útil del dormitorio (remetida medio tabique + zócalo).
    const inset = t / 2 + 0.06;
    const usable: Rect = { x0: bedroom.x0 + inset, x1: bedroom.x1 - inset, z0: bedroom.z0 + inset, z1: bedroom.z1 - inset };

    const ctx: FurnishContext = { room: bedroom, house, usable, zones, occupied: zones.map((zn) => ({ ...zn })), bed: null };

    // Receta de piezas. La cama manda en el resto del amueblado.
    const bed = furnitureFactories.bed.place(ctx, rng);
    if (bed.length === 0) return;
    out.push(...bed);
    out.push(...furnitureFactories.nightstand.place(ctx, rng));
    out.push(...furnitureFactories.wardrobe.place(ctx, rng));
    if (rng.next() < 0.7) out.push(...furnitureFactories.dresser.place(ctx, rng));
    if (rng.next() < 0.65) out.push(...furnitureFactories.rug.place(ctx, rng));
  }
}

/** Instancia compartida del amueblador de dormitorio. */
export const bedroomFurnisher = new BedroomFurnisher();
