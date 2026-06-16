import * as THREE from 'three';
import type { CityModel } from '../city/CityModel';
import type { Interactable } from './Interactable';

const DOOR_W = 1.5;
const DOOR_H = 2.3;
const DOOR_PICK_PAD = 0.25;

/** Cajas logicas para las puertas de fachada, en el mismo orden que CityMesh. */
export function collectDoorInteractables(model: CityModel): Interactable[] {
  return model.buildings.map((b, doorIndex) => {
    const frontDist = (b.faceX !== 0 ? b.w : b.d) / 2;
    const x = b.x + b.faceX * (frontDist + 0.06);
    const z = b.z + b.faceZ * (frontDist + 0.06);
    const halfX = b.faceX !== 0 ? DOOR_PICK_PAD : DOOR_W / 2 + DOOR_PICK_PAD;
    const halfZ = b.faceZ !== 0 ? DOOR_PICK_PAD : DOOR_W / 2 + DOOR_PICK_PAD;
    const bounds = new THREE.Box3(
      new THREE.Vector3(x - halfX, 0, z - halfZ),
      new THREE.Vector3(x + halfX, DOOR_H, z + halfZ),
    );
    return {
      id: `door-${b.id}`,
      type: 'door',
      label: 'Puerta',
      bounds,
      data: { doorIndex, building: b.name },
    };
  });
}
