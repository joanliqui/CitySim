import * as THREE from 'three';
import { pushTrunk, type RenderTree, type TreeRenderCtx, type TreeRenderer } from './TreeRenderer';

/** Pino: tronco + dos conos apilados, el de arriba más claro. */
export class PineTreeRenderer implements TreeRenderer {
  render(t: RenderTree, ctx: TreeRenderCtx): void {
    const { buckets: K, helpers: H } = ctx;
    pushTrunk(t, ctx, 0.42);
    K.pineCrownMats.push(H.compose(t.x, t.z, t.trunk + t.r * 0.95, t.r * 1.45, t.r * 2.4, t.r * 1.45));
    K.pineCrownColors.push(new THREE.Color(H.palettes.tree[(t.shade + 2) % H.palettes.tree.length]).multiplyScalar(0.78));
    K.pineCrownMats.push(H.compose(t.x, t.z, t.trunk + t.r * 1.55, t.r * 1.05, t.r * 1.85, t.r * 1.05));
    K.pineCrownColors.push(new THREE.Color(H.palettes.tree[(t.shade + 1) % H.palettes.tree.length]).multiplyScalar(0.86));
  }
}
