import { CITY, type RoadAxis } from '../city/CityModel';

export type LightState = 'green' | 'yellow' | 'red';

/**
 * Ciclo de fases por intersección (estado puro función del tiempo):
 *   [0, 9)      verde NS
 *   [9, 11.5)   ámbar NS
 *   [11.5, 12.5) todo rojo (despeje)
 *   [12.5, 21.5) verde EW
 *   [21.5, 24)  ámbar EW
 *   [24, 25)    todo rojo (despeje)
 * Cada intersección tiene un desfase propio para evitar sincronía global.
 */
const CYCLE = 25;
const NS_GREEN_END = 9;
const NS_YELLOW_END = 11.5;
const EW_GREEN_START = 12.5;
const EW_GREEN_END = 21.5;
const EW_YELLOW_END = 24;

/** Tiempo que necesita un peatón para cruzar el corredor con margen. */
const PED_CROSS_TIME = 5.6;

export class TrafficLightSystem {
  private readonly offsets: number[];

  constructor(intersectionCount: number, private readonly roundabouts: Set<number> = new Set()) {
    this.offsets = [];
    for (let id = 0; id < intersectionCount; id++) {
      const i = id % CITY.grid;
      const j = Math.floor(id / CITY.grid);
      // Desfase pseudo-aleatorio pero determinista, con efecto de "ola verde" suave.
      this.offsets.push(((i * 3.7 + j * 6.3) * 1.31) % CYCLE);
    }
  }

  private phase(intersection: number, time: number): number {
    return (time + this.offsets[intersection]) % CYCLE;
  }

  /** Estado del semáforo vehicular para el tráfico del eje dado. */
  lightFor(intersection: number, axis: RoadAxis, time: number): LightState {
    if (this.roundabouts.has(intersection)) return 'green'; // las rotondas no tienen semáforo
    const p = this.phase(intersection, time);
    if (axis === 'NS') {
      if (p < NS_GREEN_END) return 'green';
      if (p < NS_YELLOW_END) return 'yellow';
      return 'red';
    }
    if (p >= EW_GREEN_START && p < EW_GREEN_END) return 'green';
    if (p >= EW_GREEN_END && p < EW_YELLOW_END) return 'yellow';
    return 'red';
  }

  /**
   * ¿Puede un peatón EMPEZAR a cruzar la carretera cuyo tráfico circula en `crossAxis`?
   * Requiere que ese tráfico esté en rojo y que quede tiempo suficiente para terminar.
   */
  pedCanCross(intersection: number, crossAxis: RoadAxis, time: number): boolean {
    const p = this.phase(intersection, time);
    if (crossAxis === 'NS') {
      // NS en rojo durante [11.5, 25); vuelve a verde en p = 25 (≡ 0).
      return p >= EW_GREEN_START && p <= CYCLE - PED_CROSS_TIME;
    }
    // EW en rojo durante [24, 25) ∪ [0, 12.5); vuelve a verde en 12.5.
    return p >= 0 && p <= EW_GREEN_START - PED_CROSS_TIME;
  }
}
