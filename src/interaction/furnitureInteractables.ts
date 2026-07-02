import * as THREE from 'three';
import type { Building, CityModel, Furniture } from '../city/CityModel';
import { floorSurfaceY } from '../city/buildings/interior/stairGeometry';
import type { FloorLampPlacement } from '../render/FloorLamps';
import type { Interactable } from './Interactable';

// Alturas de render (deben coincidir con `addWardrobe`/`addFridge` en CityMesh).
const WARDROBE_H = 2.0;
const FRIDGE_H = 1.85;

/**
 * Construye los interactuables de mobiliario a partir del modelo. De momento
 * armarios y neveras, tanto en casas (planta baja) como en cada vivienda de los
 * edificios altos (apiladas en Y). Añadir más piezas/tipos es cuestión de
 * ampliar `collectFromInterior` y registrar sus acciones.
 */
export function collectFurnitureInteractables(model: CityModel): Interactable[] {
  const out: Interactable[] = [];
  for (const b of model.buildings) {
    // Casa (interior en planta baja).
    if (b.interior) collectFromInterior(out, b, b.interior.furniture, 0);
    // Edificio alto: cada vivienda en su planta (índice 0 = planta 1).
    if (b.officeInterior) {
      const { floorH, dwellings } = b.officeInterior;
      dwellings.forEach((dw, i) => collectFromInterior(out, b, dw.furniture, floorSurfaceY(i + 1, floorH)));
    }
  }
  return out;
}

/** Emite los interactuables de una distribución interior a la cota `yBase`. */
function collectFromInterior(out: Interactable[], b: Building, furniture: Furniture[], yBase: number): void {
  for (const f of furniture) {
    if (f.kind === 'wardrobe') {
      out.push({
        id: `wardrobe-${b.id}-${out.length}`,
        type: 'wardrobe',
        label: 'Armario',
        bounds: boxFor(f.x, f.z, f.w, f.d, WARDROBE_H, yBase),
        data: { building: b.name, furniture: f },
      });
    } else if (f.kind === 'fridge') {
      out.push({
        id: `fridge-${b.id}-${out.length}`,
        type: 'fridge',
        label: 'Nevera',
        bounds: boxFor(f.x, f.z, f.w, f.d, FRIDGE_H, yBase),
        data: { building: b.name, furniture: f },
      });
    }
  }
}

/** AABB de un mueble axis-aligned: de la cota `yBase` (suelo de su planta) a +`height`. */
function boxFor(x: number, z: number, w: number, d: number, height: number, yBase: number): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(x - w / 2, yBase, z - d / 2),
    new THREE.Vector3(x + w / 2, yBase + height, z + d / 2),
  );
}

/**
 * Interactuables de las lámparas de pie. Se construyen a partir de los centros
 * de pantalla que calcula el render (incluyen el apilado de plantas de los
 * edificios altos), y su índice coincide con el del `FloorLampController`.
 */
export function collectFloorLampInteractables(placements: FloorLampPlacement[]): Interactable[] {
  return placements.map((p, i) => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(p.x - 0.35, p.y, p.z - 0.35), // desde el suelo de la lámpara…
      new THREE.Vector3(p.x + 0.35, p.y + 1.95, p.z + 0.35), // …hasta encima de la pantalla
    );
    return { id: `floorLamp-${i}`, type: 'floorLamp', label: 'Lámpara de pie', bounds, data: { index: i } };
  });
}
