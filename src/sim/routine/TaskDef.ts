/**
 * Contrato de cada tipo de tarea (patrón factory/registry, como edificios o
 * mobiliario): un `TaskDef` por `TaskKind` define su prioridad, su ventana, su
 * urgencia dinámica y cómo se ejecuta sobre el FSM existente de peatones.
 *
 * La puntuación de una tarea es:
 *   score = base + urgencia(señal) + boost + sesgo(personalidad) + estímulo
 * donde `urgencia` la define cada tipo (reloj, hambre, stock de la nevera,
 * suciedad…) y `estímulo` lo inyectan sucesos puntuales (decae con el tiempo).
 */
import type { Building } from '../../city/CityModel';
import type { Pedestrian } from '../agents';
import type { Personality } from '../personality';
import type { ExpirePolicy, RoutineEvent, RoutineTask, TaskKind, TaskWindow } from './TaskTypes';

/** Margen que debe superar una tarea para interrumpir a la activa (histéresis). */
export const INTERRUPT_MARGIN = 15;
/** Tope del boost acumulable por posposiciones (así nunca escala dos bandas). */
export const BOOST_CAP = 30;
/** Boost que gana una tarea pospuesta al pasar al día siguiente. */
export const BOOST_PER_MISS = 10;
/**
 * Umbral de componente dinámica (urgencia + estímulo) a partir del cual una
 * tarea puede competir FUERA de su ventana horaria: fuera de horas solo se
 * hace algo si hay una razón de verdad (p. ej. lluvia de barro → ducha ya).
 */
export const FLEX_WINDOW_THRESHOLD = 30;
/** Vida media del estímulo (segundos de sim ≈ 1 h con DAY_LENGTH = 300 s). */
export const STIMULUS_HALF_LIFE = 12.5;

/** Punto interior con orientación (para acercarse a un mueble). */
export interface FurniturePoint {
  x: number;
  z: number;
  y: number;
  heading: number;
}

/**
 * Lo que las tareas pueden pedirle al sistema de peatones (lo implementa
 * `PedestrianSystem`). Mantiene las `TaskDef` puras y sin dependencias del
 * sistema completo.
 */
export interface RoutineHost {
  /** ¿Está dentro de su casa? */
  atHome(ped: Pedestrian): boolean;
  /** ¿Está dentro del edificio `b`? */
  isInside(ped: Pedestrian, b: Building): boolean;
  /**
   * Encamina al peatón hacia `b` desde donde esté (dentro de un edificio o por
   * la calle). Devuelve false si no hay ruta. Si ya está dentro de `b`, true.
   */
  routeTo(ped: Pedestrian, b: Building): boolean;
  /** Sale a un destino aleatorio (el "pasear" clásico). */
  wander(ped: Pedestrian): boolean;
  /** Marca la intención de comer (la maquinaria de nevera existente hace el resto). */
  requestEat(ped: Pedestrian): void;
  /** Supermercado más cercano al hogar del peatón (null si la ciudad no tiene). */
  market(ped: Pedestrian): Building | null;
  /** Fracción de llenado de la nevera de su casa [0..1]; null si no tiene nevera. */
  fridgeFill(ped: Pedestrian): number | null;
  /** Rellena la nevera de casa (vuelta de la compra). */
  restockFridge(ped: Pedestrian): void;
  /** Punto frente a (o dentro de) un mueble del hogar, el primero que exista. */
  homeFurniture(ped: Pedestrian, kinds: readonly string[], standOff: number): FurniturePoint | null;
  /** Punto interior "de pie" del hogar (a donde volver tras una acción). */
  homeStand(ped: Pedestrian): { x: number; z: number; y: number };
}

/** Contexto de una decisión/paso de tarea. */
export interface TaskCtx {
  hour: number;
  day: number;
  host: RoutineHost;
}

/** Resultado de un paso de ejecución de la tarea activa. */
export type TaskProgress =
  | 'sigue'
  /** Completada con éxito. */
  | 'hecha'
  /** Fracasó (p. ej. nevera vacía al ir a comer). */
  | 'fallida'
  /** Interrumpida por algo externo (redirección a casa, orden del usuario): vuelve a pendiente. */
  | 'abandonada';

export interface TaskDef {
  kind: TaskKind;
  /** Icono y etiqueta para el HUD. */
  icon: string;
  describe(task: RoutineTask): string;
  /** Prioridad intrínseca (banda de importancia). */
  base: number;
  /** ¿Puede abandonarse por una tarea más urgente? */
  interruptible: boolean;
  /** ¿Puede elegirse de noche (estando en casa)? */
  nightOk: boolean;
  /** ¿Vuelve a pendiente tras completarse (tarea permanente, p. ej. pasear)? */
  repeatable?: boolean;
  onExpire: ExpirePolicy;
  /** Ventana horaria para el día `day` (jitter determinista por id); null = sin ventana. */
  window?(id: number, day: number): TaskWindow | null;
  /** Urgencia dinámica ≥ 0. Cada tipo elige su señal (reloj, hambre, stock…). */
  urgency(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx): number;
  /** Sesgo pequeño por personalidad (±5 aprox.). */
  bias?(p: Personality): number;
  /** Precondición para competir en la subasta. */
  canStart(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx): boolean;
  /** Arranca la ejecución (encamina, marca intenciones…). false = no pudo arrancar. */
  start(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx): boolean;
  /** Un paso de la tarea activa (se llama cada paso de sim). */
  update(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx, dt: number): TaskProgress;
  /** Reacción a un suceso: devuelve el estímulo a sumar (0 = indiferente). */
  onEvent?(task: RoutineTask, ev: RoutineEvent, ped: Pedestrian): number;
}

/** Urgencia de reloj: 0 → `max` cuadrática conforme se consume la ventana. */
export function clockUrgency(task: RoutineTask, hour: number, max: number): number {
  const w = task.window;
  if (!w || hour <= w.start) return 0;
  const u = Math.min((hour - w.start) / Math.max(w.end - w.start, 0.01), 1);
  return max * u * u;
}
