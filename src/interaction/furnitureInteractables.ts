import * as THREE from 'three';
import type { CityModel } from '../city/CityModel';
import type { FloorLampPlacement } from '../render/FloorLamps';
import type { Interactable } from './Interactable';

// Altura de render del armario (debe coincidir con `addWardrobe` en CityMesh).
const WARDROBE_H = 2.0;

/**
 * Construye los interactuables de mobiliario a partir del modelo. De momento
 * solo los armarios; añadir más piezas/tipos es cuestión de ampliar este mapeo
 * y registrar sus acciones.
 */
export function collectFurnitureInteractables(model: CityModel): Interactable[] {
  const out: Interactable[] = [];
  for (const b of model.buildings) {
    if (!b.interior) continue;
    for (const f of b.interior.furniture) {
      if (f.kind !== 'wardrobe') continue;
      const bounds = new THREE.Box3(
        new THREE.Vector3(f.x - f.w / 2, 0, f.z - f.d / 2),
        new THREE.Vector3(f.x + f.w / 2, WARDROBE_H, f.z + f.d / 2),
      );
      out.push({ id: `wardrobe-${b.id}-${out.length}`, type: 'wardrobe', label: 'Armario', bounds, data: { building: b.name, furniture: f } });
    }
  }
  return out;
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
