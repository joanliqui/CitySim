import * as THREE from 'three';
import type { CityModel } from '../../city/CityModel';

/** Un árbol tal y como lo ve el render (alias del tipo del modelo). */
export type RenderTree = CityModel['trees'][number];

/**
 * Acumuladores de matrices/colores del render de árboles. El tronco es común a
 * todas las especies (una sola `InstancedMesh`); copas y fronds van por especie.
 */
export interface TreeRenderBuckets {
  trunkMats: THREE.Matrix4[];
  roundCrownMats: THREE.Matrix4[];
  roundCrownColors: THREE.Color[];
  pineCrownMats: THREE.Matrix4[];
  pineCrownColors: THREE.Color[];
  palmCrownMats: THREE.Matrix4[];
  palmCrownColors: THREE.Color[];
  palmFrondMats: THREE.Matrix4[];
  palmFrondColors: THREE.Color[];
}

/** Helpers de geometría (definidos en `CityMesh`) + paletas, inyectados. */
export interface TreeRenderHelpers {
  compose(x: number, z: number, y: number, sx: number, sy: number, sz: number): THREE.Matrix4;
  composeEuler(x: number, z: number, y: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number): THREE.Matrix4;
  /** Tonos de verde: copas comunes y palmeras. */
  palettes: { tree: number[]; palm: number[] };
}

export interface TreeRenderCtx {
  buckets: TreeRenderBuckets;
  helpers: TreeRenderHelpers;
}

/**
 * Estrategia de render por especie. Para añadir una especie: crea su renderer y
 * regístralo en `treeRenderRegistry.ts` (y su factoría en `src/city/vegetation`).
 */
export interface TreeRenderer {
  render(t: RenderTree, ctx: TreeRenderCtx): void;
}

/** Ancho de tronco por especie (la palmera/pino más finos que el árbol redondo). */
export function pushTrunk(t: RenderTree, ctx: TreeRenderCtx, trunkW: number): void {
  ctx.buckets.trunkMats.push(ctx.helpers.compose(t.x, t.z, t.trunk / 2, trunkW, t.trunk, trunkW));
}
