import * as THREE from 'three';
import type { BuildingGeom, BuildingRenderCtx, BuildingRenderer, RenderBuilding } from './BuildingRenderer';

/** Casa baja: casco hueco con interior (o caja maciza si no lo tiene), tejado a
 *  cuatro aguas / a dos aguas y un balcón frontal. */
export class HouseRenderer implements BuildingRenderer {
  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void {
    const { buckets: K, helpers: H } = ctx;

    if (b.interior) {
      // Casa hueca: suelo + muros perimetrales (con hueco de puerta) + tabiques.
      H.addHouseShell(b, K.bodyMats, K.bodyColors, K.partitionMats, K.floorMats, K.windowMats, K.windowFrameMats);
      for (const f of b.interior.furniture) {
        switch (f.kind) {
          case 'bed':
            // La cama lleva faceX/faceZ hacia los pies; addBed quiere el vector al cabecero (opuesto).
            H.addBed(
              { x: f.x, z: f.z, w: f.w, d: f.d, headX: -f.faceX, headZ: -f.faceZ, double: !!f.double },
              K.bedFrameMats,
              K.bedMattressMats,
              K.bedBlanketMats,
              K.bedPillowMats,
              K.bedHeadboardMats,
            );
            break;
          case 'nightstand':
            H.addNightstand(f, K.furnWoodMats, K.furnDarkMats);
            break;
          case 'wardrobe':
            H.addWardrobe(f, K.furnWoodMats, K.furnDarkMats);
            break;
          case 'dresser':
            H.addDresser(f, K.furnWoodMats, K.furnDarkMats);
            break;
          case 'rug':
            H.addRug(f, K.rugMats, K.rugColors);
            break;
          case 'shower':
            H.addShower(f, K.bathCeramicMats, K.bathDarkMats, K.bathGlassMats, K.bathMirrorMats, K.showerMetalMats, K.showerHeadMats, K.showerHeadColors);
            break;
          case 'bathtub':
            H.addBathtub(f, K.bathCeramicMats, K.bathDarkMats, K.bathGlassMats);
            break;
          case 'sink':
            H.addSink(f, K.bathCeramicMats, K.bathDarkMats, K.bathMirrorMats);
            break;
          case 'toilet':
            H.addToilet(f, K.bathCeramicMats, K.bathDarkMats);
            break;
          case 'bathVanity':
            H.addBathVanity(f, K.bathWoodMats, K.bathDarkMats);
            break;
          case 'bathShelf':
            H.addBathShelf(f, K.bathWoodMats, K.bathDarkMats);
            break;
          case 'towelStack':
            H.addTowelStack(f, K.bathTowelMats, K.bathTowelColors, K.bathDarkMats);
            break;
          case 'diningTable':
            H.addDiningTable(f, K.furnWoodMats, K.furnDarkMats);
            break;
          case 'diningChair':
            H.addDiningChair(f, K.furnWoodMats, K.furnDarkMats);
            break;
          case 'sideboard':
            H.addSideboard(f, K.furnWoodMats, K.furnDarkMats);
            break;
          case 'pottedPlant':
            H.addPottedPlant(f, K.plantPotMats, K.plantLeafMats);
            break;
          case 'sofa':
          case 'armchair':
            H.addUpholstered(f, K.upholsteryMats, K.upholsteryColors, K.furnDarkMats);
            break;
          case 'tv':
            H.addTv(f, K.tvStandMats, K.tvStandColors, K.furnDarkMats, K.tvBezelMats, K.tvScreenMats);
            break;
          case 'coffeeTable':
            H.addCoffeeTable(f, K.furnWoodMats, K.furnDarkMats);
            break;
          case 'bookshelf':
            H.addBookshelf(f, K.furnWoodMats, K.bookMats, K.bookColors);
            break;
          case 'floorLamp':
            H.addFloorLamp(f, K.furnDarkMats, K.furnWoodMats, K.lampShades);
            break;
          case 'fridge':
            H.addFridge(f, K.applianceMats, K.furnDarkMats);
            break;
          case 'stove':
            H.addStove(f, K.furnWoodMats, K.counterTopMats, K.furnDarkMats);
            break;
          case 'oven':
            H.addOven(f, K.applianceMats, K.furnWoodMats, K.furnDarkMats);
            break;
          case 'microwave':
            H.addMicrowave(f, K.applianceMats, K.furnDarkMats);
            break;
          case 'kitchenCounter':
            H.addKitchenCounter(f, K.furnWoodMats, K.counterTopMats, K.furnDarkMats);
            break;
          case 'kitchenCabinet':
            H.addKitchenCabinet(f, K.furnWoodMats, K.furnDarkMats);
            break;
        }
      }
    } else {
      K.bodyMats.push(H.compose(b.x, b.z, b.h / 2, b.w, b.h, b.d));
      K.bodyColors.push(new THREE.Color(H.palettes.building[b.type][b.colorIdx % 6]));
    }

    // Tejado a cuatro aguas (pirámide de base rectangular alineada a la casa).
    if (variant % 3 === 0) {
      K.hipRoofMats.push(H.compose(b.x, b.z, b.h, b.w + 0.9, 1.65, b.d + 0.9));
      K.hipRoofColors.push(geom.roofColor);
    } else {
      const ridgeAlongX = (variant + b.colorIdx) % 2 === 0;
      K.gableRoofMats.push(
        H.composeYaw(
          b.x,
          b.z,
          b.h,
          ridgeAlongX ? b.d + 1.0 : b.w + 1.0,
          1.55,
          ridgeAlongX ? b.w + 1.0 : b.d + 1.0,
          ridgeAlongX ? Math.PI / 2 : 0,
        ),
      );
      K.gableRoofColors.push(geom.roofColor);
    }
    if (variant % 4 === 1) H.addRoofFixture(K.roofBoxMats, K.roofTankMats, b, variant);
    H.addFrontBalconies(K.balconySlabMats, K.balconyRailMats, b, geom.faceAngle, geom.frontDist, geom.frontW, 1, variant);
  }
}
