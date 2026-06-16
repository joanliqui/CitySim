import type { Building, RoadAxis } from '../city/CityModel';

/* ── Vehículos ───────────────────────────────────────────────────────────── */

export type VehicleState = 'driving' | 'braking' | 'stopped';

export interface Vehicle {
  id: number;
  /** Arista actual y distancia recorrida sobre ella. */
  edgeId: number;
  s: number;
  /** Velocidad escalar (u/s) y velocidad máxima personal. */
  v: number;
  vMax: number;
  /** Aristas anterior y siguiente, para suavizar el paso por la intersección. */
  prevEdgeId: number;
  nextEdgeId: number;
  state: VehicleState;
  /** Si está detenido/frenando por un semáforo (para el HUD). */
  atLight: boolean;
  colorIdx: number;
  /** Pose mundial calculada por la simulación; el render interpola prev → actual. */
  x: number;
  z: number;
  heading: number;
  prevX: number;
  prevZ: number;
  prevHeading: number;
}

/* ── Peatones ────────────────────────────────────────────────────────────── */

export type PedestrianState = 'walking' | 'waiting' | 'crossing' | 'inside' | 'exiting' | 'entering';

export type LegKind = 'walk' | 'cross' | 'door-in' | 'door-out';

export interface Leg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
  kind: LegKind;
  /** Solo en piernas 'cross': intersección y eje del tráfico cruzado. */
  crossNode?: number;
  crossAxis?: RoadAxis;
}

export interface Pedestrian {
  id: number;
  state: PedestrianState;
  legs: Leg[];
  legIdx: number;
  /** Distancia recorrida sobre la pierna actual. */
  s: number;
  walkSpeed: number;
  /** Desplazamiento lateral personal para que no caminen en fila india. */
  lateral: number;
  colorIdx: number;
  /** Edificio destino (o en el que está dentro). */
  building: Building;
  /** Cuenta atrás dentro del edificio. */
  timer: number;
  /** Pose mundial + escala (para aparecer/desaparecer en puertas). */
  x: number;
  z: number;
  heading: number;
  scale: number;
  prevX: number;
  prevZ: number;
  prevHeading: number;
  prevScale: number;
}
