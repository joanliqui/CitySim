import * as THREE from 'three';
import { pushTrunk, type RenderTree, type TreeRenderCtx, type TreeRenderer } from './TreeRenderer';

/** Palmera: tronco alto + núcleo de copa + 8 fronds radiales. */
export class PalmTreeRenderer implements TreeRenderer {
  render(t: RenderTree, ctx: TreeRenderCtx): void {
    const { buckets: K, helpers: H } = ctx;
    pushTrunk(t, ctx, 0.42);
    K.palmCrownMats.push(H.compose(t.x, t.z, t.trunk + 0.25, 0.8, 0.55, 0.8));
    K.palmCrownColors.push(new THREE.Color(H.palettes.palm[t.shade % H.palettes.palm.length]));
    for (let k = 0; k < 8; k++) {
      const yaw = (k / 8) * Math.PI * 2 + (t.shade % 2) * 0.14;
      K.palmFrondMats.push(
        H.composeEuler(t.x + Math.sin(yaw) * t.r * 0.75, t.z + Math.cos(yaw) * t.r * 0.75, t.trunk + 0.25, 0.42, 0.08, t.r * 1.85, -0.42, yaw, 0),
      );
      K.palmFrondColors.push(new THREE.Color(H.palettes.palm[(t.shade + k) % H.palettes.palm.length]));
    }
  }
}
