import type { Building, RoadAxis } from '../city/CityModel';
import type { Personality } from './personality';
import type { Routine } from './routine/Routine';
import type { SocialClass } from './socialClass';

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

export type LegKind =
  | 'walk'
  | 'cross'
  | 'door-in'
  | 'door-out'
  /** Tramo interior en planta baja (cruza el umbral hacia/desde dentro). */
  | 'enter'
  /** Tramo de escalera (la cota cambia: usa ay/by). */
  | 'stairs'
  /** Andar dentro de una planta (cota constante de la planta). */
  | 'unit';

export interface Leg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
  kind: LegKind;
  /** Cota (Y) en cada extremo; por defecto 0 (planta baja). Para tramos 'stairs'. */
  ay?: number;
  by?: number;
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
  /** Rasgos de personalidad (Big Five), 0–100 cada uno. */
  personality: Personality;
  /** Clase social: fija el tipo de vivienda que se le asigna. */
  socialClass: SocialClass;
  /** Hogar fijo del peatón (una casa o un apartamento). */
  home: Building;
  /** Apartamento dentro del edificio (planta 1..N). 0 = casa individual. */
  homeUnit: number;
  /** Edificio destino (o en el que está dentro). */
  building: Building;
  /** Cuenta atrás dentro del edificio. */
  timer: number;
  /** Energía/vitalidad (0–100): baja durante el día, se recupera durmiendo. */
  energy: number;
  /** Alimentación (0–100): 100 = saciado, 0 = hambriento. Baja con el tiempo. */
  food: number;
  /** Hidratación (0–100): 100 = hidratado, 0 = deshidratado. Baja con el tiempo. */
  hydration: number;
  /** Higiene (0–100): 100 = limpio, 0 = mugriento. Baja con el tiempo; la ducha la restaura. */
  hygiene: number;
  /** Agenda de rutina diaria (tareas que compiten por puntuación). */
  routine: Routine;
  /** Cuenta atrás del re-chequeo de rutina mientras va por la calle (interrupciones). */
  decideT: number;
  /** Está tumbado en su cama durmiendo (recupera energía). */
  sleeping: boolean;
  /** Está comiendo en la nevera de su casa (consume comida, recupera alimentación). */
  eating: boolean;
  /** Intención de ir a comer (p. ej. ordenada por el usuario), aunque no tenga hambre. */
  wantsToEat: boolean;
  /** Cuenta atrás de la acción de comer una vez frente a la nevera. */
  eatTimer: number;
  /** Posición durante la comida: 0 = en su sitio, 1 = frente a la nevera (anima la ida/vuelta). */
  eatApproach: number;
  /** Postura: 0 = de pie, 1 = tumbado en la cama (anima la transición). */
  recline: number;
  prevRecline: number;
  /** Mientras cruza el umbral de la puerta de calle de `building` (el render la abre). */
  facadeDoorOpen: boolean;
  /** Pose mundial + escala (para aparecer/desaparecer en puertas). */
  x: number;
  z: number;
  /** Cota (Y) de los pies sobre la planta baja; >0 al subir escaleras / plantas altas. */
  y: number;
  heading: number;
  scale: number;
  prevX: number;
  prevZ: number;
  prevY: number;
  prevHeading: number;
  prevScale: number;
}
