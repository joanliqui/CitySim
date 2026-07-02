import * as THREE from 'three';
import { addFacadeWindows, type BuildingGeom, type BuildingRenderCtx, type RenderBuilding } from '../BuildingRenderer';
import type { ShopSubRenderer } from './ShopSubRenderer';

/** Tienda baja: caja maciza, cubierta plana, toldo y cartel sobre la puerta. */
export class GenericShopRenderer implements ShopSubRenderer {
  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void {
    const { buckets: K, helpers: H } = ctx;

    K.bodyMats.push(H.compose(b.x, b.z, b.h / 2, b.w, b.h, b.d));
    K.bodyColors.push(new THREE.Color(H.palettes.building[b.type][b.colorIdx % 6]));

    H.addFlatRoof(K.flatRoofMats, K.flatRoofColors, K.parapetMats, b, geom.roofColor, variant);

    // Toldo sobre la puerta.
    const ax = b.x + b.faceX * (geom.frontDist + 0.7);
    const az = b.z + b.faceZ * (geom.frontDist + 0.7);
    K.awningMats.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(ax, b.h * 0.62, az),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, geom.faceAngle, 0)),
        new THREE.Vector3(geom.frontW * 0.82, 0.28, 1.5),
      ),
    );
    K.awningColors.push(new THREE.Color(H.palettes.awning[b.colorIdx % H.palettes.awning.length]));
    K.signMats.push(H.composeYaw(ax, az, Math.min(b.h - 0.75, 3.4), geom.frontW * 0.55, 0.58, 0.12, geom.faceAngle));
    K.signColors.push(new THREE.Color(H.palettes.sign[(b.colorIdx + variant) % H.palettes.sign.length]));
    if (variant % 2 === 0) H.addRoofFixture(K.roofBoxMats, K.roofTankMats, b, variant);

    addFacadeWindows(b, ctx);
  }
}
