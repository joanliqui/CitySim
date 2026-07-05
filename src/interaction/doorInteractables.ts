import * as THREE from 'three';
import { marketDoorAlong, marketDoorGeometry } from '../city/buildings/interior/marketInterior';
import type { CityModel } from '../city/CityModel';
import type { Interactable } from './Interactable';

const DOOR_W = 1.5;
const DOOR_H = 2.3;
const DOOR_PICK_PAD = 0.25;

/**
 * Cajas logicas para las puertas de fachada, en el mismo orden que CityMesh.
 * Los supermercados quedan fuera: tienen su propia puerta corredera de cristal
 * (ver `collectMarketDoorInteractables`), no la batiente genérica.
 */
export function collectDoorInteractables(model: CityModel): Interactable[] {
  const out: Interactable[] = [];
  model.buildings.forEach((b, doorIndex) => {
    if (b.type === 'shop' && b.shopKind === 'supermarket') return;
    const frontDist = (b.faceX !== 0 ? b.w : b.d) / 2;
    const x = b.x + b.faceX * (frontDist + 0.06);
    const z = b.z + b.faceZ * (frontDist + 0.06);
    const halfX = b.faceX !== 0 ? DOOR_PICK_PAD : DOOR_W / 2 + DOOR_PICK_PAD;
    const halfZ = b.faceZ !== 0 ? DOOR_PICK_PAD : DOOR_W / 2 + DOOR_PICK_PAD;
    const bounds = new THREE.Box3(
      new THREE.Vector3(x - halfX, 0, z - halfZ),
      new THREE.Vector3(x + halfX, DOOR_H, z + halfZ),
    );
    out.push({
      id: `door-${b.id}`,
      type: 'door',
      label: 'Puerta',
      bounds,
      data: { doorIndex, building: b.name },
    });
  });
  return out;
}

/** Semiancho/alto del hueco real de la puerta corredera (debe coincidir con MarketRenderer). */
const MARKET_DOOR_PAD = 0.3;

/** Cajas logicas para las puertas correderas de los supermercados. */
export function collectMarketDoorInteractables(model: CityModel): Interactable[] {
  const out: Interactable[] = [];
  for (const b of model.buildings) {
    if (!(b.type === 'shop' && b.shopKind === 'supermarket')) continue;
    const frontW = b.faceX !== 0 ? b.d : b.w;
    const frontDist = (b.faceX !== 0 ? b.w : b.d) / 2;
    const { doorHalf, doorTop } = marketDoorGeometry(frontW, b.h);
    // Centro del hueco: desplazado a un lado por la tangente de la fachada
    // (tx=faceZ, tz=−faceX), igual que muro/correderas/modelo.
    const doorAlong = marketDoorAlong(frontW, frontDist * 2);
    const x = b.x + b.faceX * (frontDist + MARKET_DOOR_PAD) + b.faceZ * doorAlong;
    const z = b.z + b.faceZ * (frontDist + MARKET_DOOR_PAD) - b.faceX * doorAlong;
    const halfX = b.faceX !== 0 ? MARKET_DOOR_PAD : doorHalf + MARKET_DOOR_PAD;
    const halfZ = b.faceZ !== 0 ? MARKET_DOOR_PAD : doorHalf + MARKET_DOOR_PAD;
    const bounds = new THREE.Box3(
      new THREE.Vector3(x - halfX, 0, z - halfZ),
      new THREE.Vector3(x + halfX, doorTop, z + halfZ),
    );
    out.push({
      id: `market-door-${b.id}`,
      type: 'marketDoor',
      label: 'Puerta corredera',
      bounds,
      data: { buildingId: b.id, building: b.name },
    });
  }
  return out;
}
