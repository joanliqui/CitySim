import * as THREE from 'three';
import type { Pedestrian } from '../sim/agents';

export type PickResult = { kind: 'vehicle' | 'pedestrian'; index: number } | null;

/**
 * Selección de agentes con clic: raycast sobre las mallas instanciadas.
 * Distingue clic de arrastre (órbita) por el desplazamiento del puntero.
 */
export class Picking {
  private static readonly PED_SCREEN_RADIUS = 22;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  private downX = 0;
  private downY = 0;

  constructor(
    private readonly domElement: HTMLElement,
    private readonly camera: THREE.Camera,
    private readonly vehicleMesh: THREE.InstancedMesh,
    private readonly pedestrianMesh: THREE.InstancedMesh,
    /** Raíz de los personajes personalizados (sus grupos llevan userData.pedIndex). */
    private readonly customRoot: THREE.Object3D,
    private readonly pedestrians: Pedestrian[],
    private readonly onPick: (result: PickResult) => void,
  ) {
    this.domElement.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.downX = e.clientX;
      this.downY = e.clientY;
    });
    this.domElement.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 5) return;
      this.onPick(this.pick(e.clientX, e.clientY));
    });
  }

  private pick(clientX: number, clientY: number): PickResult {
    this.pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([this.vehicleMesh, this.pedestrianMesh], false);
    hits.push(...this.raycaster.intersectObject(this.customRoot, true));
    hits.sort((a, b) => a.distance - b.distance);
    for (const hit of hits) {
      if (hit.object === this.vehicleMesh) {
        if (!isVisibleInTree(hit.object)) continue;
        if (hit.instanceId !== undefined) return { kind: 'vehicle', index: hit.instanceId };
        continue;
      }
      if (hit.object === this.pedestrianMesh) {
        if (!isVisibleInTree(hit.object)) continue;
        if (hit.instanceId !== undefined) return { kind: 'pedestrian', index: hit.instanceId };
        continue;
      }
      if (!isVisibleInTree(hit.object)) continue;
      // Personaje personalizado: el índice viaja en el userData del grupo raíz.
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        if (o.userData.pedIndex !== undefined) return { kind: 'pedestrian', index: o.userData.pedIndex };
      }
    }
    return this.pickNearestPedestrian(clientX, clientY);
  }

  private pickNearestPedestrian(clientX: number, clientY: number): PickResult {
    if (!isVisibleInTree(this.pedestrianMesh)) return null;
    const rect = this.domElement.getBoundingClientRect();
    let best = -1;
    let bestD2 = Picking.PED_SCREEN_RADIUS * Picking.PED_SCREEN_RADIUS;
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      // Los 'inside' también se pueden seleccionar (ahora son visibles dentro de
      // casa); solo se descartan los realmente ocultos (escala ~0 en una puerta).
      if (p.scale <= 0.05) continue;
      // Usa su cota real: los de plantas altas están elevados sobre el suelo.
      this.tmp.set(p.x, p.y + 1.1, p.z).project(this.camera);
      if (this.tmp.z < -1 || this.tmp.z > 1) continue;
      const x = rect.left + (this.tmp.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-this.tmp.y * 0.5 + 0.5) * rect.height;
      const d2 = (x - clientX) ** 2 + (y - clientY) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best >= 0 ? { kind: 'pedestrian', index: best } : null;
  }
}

function isVisibleInTree(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}
