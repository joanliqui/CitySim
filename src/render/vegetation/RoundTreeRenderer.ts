import * as THREE from 'three';
import { pushTrunk, type RenderTree, type TreeRenderCtx, type TreeRenderer } from './TreeRenderer';

/** Árbol redondo: tronco + una copa icosaédrica. */
export class RoundTreeRenderer implements TreeRenderer {
  render(t: RenderTree, ctx: TreeRenderCtx): void {
    const { buckets: K, helpers: H } = ctx;
    pushTrunk(t, ctx, 0.5);
    K.roundCrownMats.push(H.compose(t.x, t.z, t.trunk + t.r * 0.8, t.r * 2, t.r * 2.1, t.r * 2));
    K.roundCrownColors.push(new THREE.Color(H.palettes.tree[t.shade % H.palettes.tree.length]));
  }
}
