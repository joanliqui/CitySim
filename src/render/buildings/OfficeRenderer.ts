import * as THREE from 'three';
import { addFacadeWindows, type BuildingGeom, type BuildingRenderCtx, type BuildingRenderer, type RenderBuilding } from './BuildingRenderer';

/** Edificio alto de oficinas: caja maciza, cubierta plana con equipos, bandas de
 *  cornisa y, en algunos, varias filas de balcones. */
export class OfficeRenderer implements BuildingRenderer {
  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void {
    const { buckets: K, helpers: H } = ctx;

    if (b.officeInterior) {
      // Casco hueco multiplanta: rellano + escaleras abajo, una vivienda por
      // planta arriba. Las ventanas las emiten los propios muros (no
      // `addFacadeWindows`). La cubierta va a la capa de tejados (ocultable).
      H.addOfficeShell(b, K);
      H.addFlatRoof(K.flatRoofMats, K.flatRoofColors, K.parapetMats, b, geom.roofColor, variant);
      H.addRoofFixture(K.roofBoxMats, K.roofTankMats, b, variant);
      H.addFacadeBands(K.corniceMats, b);
      return;
    }

    K.bodyMats.push(H.compose(b.x, b.z, b.h / 2, b.w, b.h, b.d));
    K.bodyColors.push(new THREE.Color(H.palettes.building[b.type][b.colorIdx % 6]));

    H.addFlatRoof(K.flatRoofMats, K.flatRoofColors, K.parapetMats, b, geom.roofColor, variant);
    H.addRoofFixture(K.roofBoxMats, K.roofTankMats, b, variant);
    if (b.h > 16 && variant % 3 !== 0) {
      K.roofBoxMats.push(H.compose(b.x + ((variant % 2) - 0.5) * b.w * 0.18, b.z, b.h + 0.95, b.w * 0.42, 1.9, b.d * 0.34));
    }
    H.addFacadeBands(K.corniceMats, b);
    if (variant % 2 === 0) {
      H.addFrontBalconies(K.balconySlabMats, K.balconyRailMats, b, geom.faceAngle, geom.frontDist, geom.frontW, Math.min(4, Math.floor(b.h / 6)), variant);
    }

    addFacadeWindows(b, ctx);
  }
}
