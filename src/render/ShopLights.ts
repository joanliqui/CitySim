import * as THREE from 'three';
import type { Building } from '../city/CityModel';

/* ── Luces de tienda según su estado de apertura ───────────────────────────
 * Todas las bombillas colgantes de los comercios (súper y tiendas de gremio)
 * viven en UNA `InstancedMesh`; el encendido es POR TIENDA: cada edificio
 * aporta un tramo contiguo de instancias (`ShopLampRange`) y este controlador
 * escribe el color por instancia según el estado que dicta la SIM (abierta =
 * en horario Y con el trabajador en su puesto) — encendida (cálido HDR >1,
 * lo capta el bloom) con la tienda abierta, apagada (gris) cerrada.
 */

/** Tramo de bombillas de una tienda dentro de la malla instanciada. */
export interface ShopLampRange {
  /** Índice de la primera instancia y nº de bombillas de la tienda. */
  start: number;
  count: number;
  building: Building;
}

/** Color encendido: cálido y >1 por canal para superar el umbral del bloom. */
const LAMP_ON = new THREE.Color(0xfff2d0).multiplyScalar(2.2);
/** Color apagado: gris de bombilla fría. */
const LAMP_OFF = new THREE.Color(0x35383d);

/**
 * Controlador del encendido. `update(isOpen)` se llama cada frame con el
 * predicado de apertura de la sim; solo escribe en el buffer cuando alguna
 * tienda cambia de estado (abre o cierra).
 */
export class ShopLights {
  /** Último estado aplicado por tramo (null = aún no pintado). */
  private readonly lastOn: (boolean | null)[];

  constructor(
    private readonly mesh: THREE.InstancedMesh,
    private readonly ranges: readonly ShopLampRange[],
  ) {
    this.lastOn = ranges.map(() => null);
  }

  update(isOpen: (b: Building) => boolean): void {
    let dirty = false;
    for (let i = 0; i < this.ranges.length; i++) {
      const r = this.ranges[i];
      const on = isOpen(r.building);
      if (this.lastOn[i] === on) continue;
      this.lastOn[i] = on;
      const color = on ? LAMP_ON : LAMP_OFF;
      for (let k = r.start; k < r.start + r.count; k++) this.mesh.setColorAt(k, color);
      dirty = true;
    }
    if (dirty && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
