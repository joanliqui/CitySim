import * as THREE from 'three';
import type { Interactable } from './Interactable';

/**
 * Almacén de objetos interactuables. Resuelve el clic mediante intersección
 * rayo–AABB (sin tocar el render). Responsabilidad única: guardar y consultar.
 */
export class InteractableRegistry {
  private readonly items: Interactable[] = [];
  private readonly hitPoint = new THREE.Vector3();

  add(interactable: Interactable): void {
    this.items.push(interactable);
  }

  addAll(interactables: Iterable<Interactable>): void {
    for (const it of interactables) this.items.push(it);
  }

  clear(): void {
    this.items.length = 0;
  }

  /** Interactuable más cercano al origen cuyo AABB corta el rayo, o `null`. */
  raycast(ray: THREE.Ray): Interactable | null {
    let best: Interactable | null = null;
    let bestDist = Infinity;
    for (const it of this.items) {
      if (!ray.intersectBox(it.bounds, this.hitPoint)) continue;
      const dist = ray.origin.distanceToSquared(this.hitPoint);
      if (dist < bestDist) {
        bestDist = dist;
        best = it;
      }
    }
    return best;
  }
}
