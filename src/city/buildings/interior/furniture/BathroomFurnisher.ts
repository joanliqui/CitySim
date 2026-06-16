import { Rng } from '../../../../core/Rng';
import type { Furniture, InteriorWall, RoomRect } from '../types';
import type { FurnishContext, HouseGeom } from './FurnitureFactory';
import type { Rect } from './placement';
import { furnitureFactories } from './registry';

/** Amuebla como baño la estancia más pequeña que no sea la entrada. */
export class BathroomFurnisher {
  furnish(rooms: RoomRect[], walls: InteriorWall[], house: HouseGeom, rng: Rng, out: Furniture[]): void {
    const { x, z, w, d, t, faceX, faceZ } = house;
    if (rooms.length === 0) return;

    const probeX = x + faceX * (w / 2 - t - 0.35);
    const probeZ = z + faceZ * (d / 2 - t - 0.35);
    const contains = (r: RoomRect, px: number, pz: number) => px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1;
    const entrance = rooms.find((r) => contains(r, probeX, probeZ));

    const candidates = rooms.filter((r) => r !== entrance && r.kind !== 'bedroom');
    if (candidates.length === 0) return;
    let bathroom = candidates[0];
    let bestArea = Infinity;
    for (const r of candidates) {
      const a = (r.x1 - r.x0) * (r.z1 - r.z0);
      if (a < bestArea) {
        bestArea = a;
        bathroom = r;
      }
    }

    const zones = doorZones(walls, house);
    const inset = t / 2 + 0.06;
    const usable: Rect = { x0: bathroom.x0 + inset, x1: bathroom.x1 - inset, z0: bathroom.z0 + inset, z1: bathroom.z1 - inset };
    if (usable.x1 - usable.x0 < 1.05 || usable.z1 - usable.z0 < 1.05) return;

    const area = (usable.x1 - usable.x0) * (usable.z1 - usable.z0);
    const preferBathtub = area >= 4.8 && Math.max(usable.x1 - usable.x0, usable.z1 - usable.z0) >= 2.0;
    const order: Array<'bathtub' | 'shower'> = preferBathtub ? ['bathtub', 'shower'] : ['shower'];

    const spacious = area >= 6.2 && Math.max(usable.x1 - usable.x0, usable.z1 - usable.z0) >= 2.4;
    for (const bathing of order) {
      const placed = (spacious && this.tryRecipe(bathroom, house, usable, zones, bathing, rng, true)) || this.tryRecipe(bathroom, house, usable, zones, bathing, rng, false);
      if (placed) {
        bathroom.kind = 'bathroom';
        out.push(...placed);
        return;
      }
    }
  }

  private tryRecipe(
    room: RoomRect,
    house: HouseGeom,
    usable: Rect,
    zones: Rect[],
    bathing: 'bathtub' | 'shower',
    rng: Rng,
    extras: boolean,
  ): Furniture[] | null {
    const ctx: FurnishContext = { room, house, usable, zones, occupied: zones.map((zn) => ({ ...zn })), bed: null, bathVanity: null, bathShelf: null };
    const out: Furniture[] = [];

    const bath = furnitureFactories[bathing].place(ctx, rng);
    if (bath.length === 0) return null;
    out.push(...bath);

    if (extras) out.push(...furnitureFactories.bathVanity.place(ctx, rng));

    const sink = furnitureFactories.sink.place(ctx, rng);
    if (sink.length === 0) return null;
    out.push(...sink);

    const toilet = furnitureFactories.toilet.place(ctx, rng);
    if (toilet.length === 0) return null;
    out.push(...toilet);

    if (extras) {
      out.push(...furnitureFactories.bathShelf.place(ctx, rng));
      out.push(...furnitureFactories.towelStack.place(ctx, rng));
    }

    return out;
  }
}

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

export const bathroomFurnisher = new BathroomFurnisher();
