import * as THREE from 'three';
import { CITY, CORRIDOR_HALF, intersectionId, removedRoadSegment, roadX, roadZ, type ParkRect, type RoadAxis } from '../city/CityModel';
import type { LightState, TrafficLightSystem } from '../sim/TrafficLightSystem';

const LAMP_ON: Record<LightState, [number, number, number]> = {
  red: [0xff2e1f, 0x3a0c08, 0x3a0c08],
  yellow: [0x4a1410, 0xffb31f, 0x4a3a08],
  green: [0x113a10, 0x143a14, 0x2eff5e],
};

interface Head {
  intersection: number;
  axis: RoadAxis;
  /** Índices de instancia de sus 3 lámparas (rojo, ámbar, verde). */
  lamps: [number, number, number];
}

/**
 * Semáforos: un poste por aproximación existente, con cabezal de 3 lámparas
 * orientado hacia el tráfico entrante. Las lámparas son instancias de
 * MeshBasicMaterial cuyo color se actualiza según la fase.
 */
export class TrafficLightMesh {
  readonly group = new THREE.Group();
  private readonly lamps: THREE.InstancedMesh;
  private readonly heads: Head[] = [];
  private readonly lastState: LightState[] = [];

  constructor(private readonly lights: TrafficLightSystem, roundabouts: Set<number> = new Set(), closedRects: readonly ParkRect[] = []) {
    const g = CITY.grid;
    const poleMats: THREE.Matrix4[] = [];
    const headMats: THREE.Matrix4[] = [];
    const lampTransforms: THREE.Matrix4[] = [];

    const approaches: Array<{ dx: number; dz: number }> = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];

    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        if (roundabouts.has(intersectionId(i, j))) continue; // las rotondas no llevan semáforo
        const cx = roadX(i);
        const cz = roadZ(j);
        for (const { dx, dz } of approaches) {
          // Solo si existe carretera entrante desde esa dirección.
          const ni = i - dx;
          const nj = j - dz;
          if (ni < 0 || ni >= g || nj < 0 || nj >= g) continue;
          // El tramo hacia ese vecino puede haberse eliminado (interior del parque).
          const removed = dx !== 0 ? removedRoadSegment(closedRects, 'h', j, dx > 0 ? i - 1 : i) : removedRoadSegment(closedRects, 'v', i, dz > 0 ? j - 1 : j);
          if (removed) continue;

          // Poste en la esquina derecha de la aproximación, justo antes del cruce.
          const rx = -dz;
          const rz = dx;
          const px = cx - dx * (CORRIDOR_HALF - 0.6) + rx * (CORRIDOR_HALF - 0.6);
          const pz = cz - dz * (CORRIDOR_HALF - 0.6) + rz * (CORRIDOR_HALF - 0.6);
          const yaw = Math.atan2(-dx, -dz); // el cabezal mira hacia el tráfico que llega

          poleMats.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(px, 2.6, pz),
              new THREE.Quaternion(),
              new THREE.Vector3(0.22, 5.2, 0.22),
            ),
          );
          const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
          headMats.push(new THREE.Matrix4().compose(new THREE.Vector3(px, 4.6, pz), rot, new THREE.Vector3(0.7, 1.9, 0.55)));

          const lampIdx: number[] = [];
          for (let k = 0; k < 3; k++) {
            const ly = 5.18 - k * 0.58;
            // Lámpara ligeramente por delante del cabezal (en la dirección que mira).
            const fx = Math.sin(yaw) * 0.31;
            const fz = Math.cos(yaw) * 0.31;
            lampIdx.push(lampTransforms.length);
            lampTransforms.push(
              new THREE.Matrix4().compose(new THREE.Vector3(px + fx, ly, pz + fz), rot, new THREE.Vector3(1, 1, 1)),
            );
          }
          this.heads.push({
            intersection: intersectionId(i, j),
            axis: dz !== 0 ? 'NS' : 'EW',
            lamps: lampIdx as [number, number, number],
          });
          this.lastState.push('red');
        }
      }
    }

    const poleMesh = makeInstanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), new THREE.MeshLambertMaterial({ color: 0x2c2f33 }), poleMats);
    poleMesh.castShadow = true;
    const headMesh = makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x1c1e21 }), headMats);
    this.lamps = makeInstanced(new THREE.SphereGeometry(0.21, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), lampTransforms);
    for (let k = 0; k < lampTransforms.length; k++) this.lamps.setColorAt(k, new THREE.Color(0x222222));
    this.lamps.instanceColor!.needsUpdate = true;

    this.group.add(poleMesh, headMesh, this.lamps);
  }

  update(time: number): void {
    let dirty = false;
    const c = new THREE.Color();
    for (let h = 0; h < this.heads.length; h++) {
      const head = this.heads[h];
      const state = this.lights.lightFor(head.intersection, head.axis, time);
      if (state === this.lastState[h]) continue;
      this.lastState[h] = state;
      const colors = LAMP_ON[state];
      const onIdx = state === 'red' ? 0 : state === 'yellow' ? 1 : 2;
      // El bloom umbraliza por LUMINANCIA: el rojo necesita mucho más refuerzo
      // que el verde/ámbar (el canal verde domina la luminancia percibida).
      const boost = state === 'red' ? 3.3 : state === 'yellow' ? 2.0 : 1.7;
      for (let k = 0; k < 3; k++) {
        c.setHex(colors[k]);
        if (k === onIdx) c.multiplyScalar(boost);
        this.lamps.setColorAt(head.lamps[k], c);
      }
      dirty = true;
    }
    if (dirty && this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }
}

function makeInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
