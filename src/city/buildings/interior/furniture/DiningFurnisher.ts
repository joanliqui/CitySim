import { Rng } from '../../../../core/Rng';
import type { Furniture, InteriorWall, RoomRect } from '../types';
import type { FurnishContext, HouseGeom } from './FurnitureFactory';
import type { Rect } from './placement';
import { furnitureFactories } from './registry';

/**
 * Amueblador de comedor: designa como sala-comedor la estancia de ENTRADA (a la
 * que da la puerta exterior/de la vivienda), prepara los corredores de paso y la
 * superficie útil, y aplica la receta — la mesa manda, luego la alfombra bajo
 * ella, las sillas alrededor y, con suerte, un aparador y una planta.
 *
 * Se ejecuta DESPUÉS de dormitorio y baño, así que la estancia de entrada sigue
 * libre (esos dos eligen siempre estancias que no sean la de entrada).
 */
export class DiningFurnisher {
  furnish(rooms: RoomRect[], walls: InteriorWall[], house: HouseGeom, rng: Rng, out: Furniture[]): void {
    const { x, z, w, d, t, faceX, faceZ } = house;
    if (rooms.length < 2) return; // un estudio de una sola estancia se deja como dormitorio

    // Estancia de entrada: la que contiene el punto justo dentro de la puerta.
    const probeX = x + faceX * (w / 2 - t - 0.35);
    const probeZ = z + faceZ * (d / 2 - t - 0.35);
    const contains = (r: RoomRect, px: number, pz: number) => px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1;
    const dining = rooms.find((r) => contains(r, probeX, probeZ));
    if (!dining) return;

    // Corredores de paso delante de cada puerta (incl. la exterior): no invadir.
    const PASS_DEPTH = 0.9;
    const PASS_MARGIN = 0.14;
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

    const inset = t / 2 + 0.06;
    const usable: Rect = { x0: dining.x0 + inset, x1: dining.x1 - inset, z0: dining.z0 + inset, z1: dining.z1 - inset };

    const ctx: FurnishContext = { room: dining, house, usable, zones, occupied: zones.map((zn) => ({ ...zn })), bed: null, table: null, sofa: null };

    // Receta del comedor: la mesa manda; si no cabe, la estancia no es comedor.
    const table = furnitureFactories.diningTable.place(ctx, rng);
    if (table.length === 0) return;
    dining.kind = 'dining';
    out.push(...table);
    out.push(...furnitureFactories.rug.place(ctx, rng)); // bajo la mesa
    out.push(...furnitureFactories.diningChair.place(ctx, rng));
    if (rng.next() < 0.8) out.push(...furnitureFactories.sideboard.place(ctx, rng));

    // Rincón de estar (salón-comedor). Cada pieza es probabilística y solo se
    // coloca si queda sitio, así que cada vivienda sale distinta. El sofá manda:
    // si entra, el televisor se le enfrenta y la mesa de centro va delante.
    if (rng.next() < 0.85) out.push(...furnitureFactories.sofa.place(ctx, rng));
    if (rng.next() < (ctx.sofa ? 0.85 : 0.4)) out.push(...furnitureFactories.tv.place(ctx, rng));
    if (ctx.sofa && rng.next() < 0.7) out.push(...furnitureFactories.coffeeTable.place(ctx, rng));
    if (rng.next() < 0.45) out.push(...furnitureFactories.armchair.place(ctx, rng));
    if (rng.next() < 0.5) out.push(...furnitureFactories.bookshelf.place(ctx, rng));

    // Remates de adorno.
    if (rng.next() < 0.7) out.push(...furnitureFactories.pottedPlant.place(ctx, rng));
    if (rng.next() < 0.5) out.push(...furnitureFactories.floorLamp.place(ctx, rng));
  }
}

/** Instancia compartida del amueblador de comedor. */
export const diningFurnisher = new DiningFurnisher();
