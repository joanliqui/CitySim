/**
 * Tipos base del sistema de rutinas de los peatones. Datos puros (sin Three.js).
 *
 * Una `RoutineTask` es una intención en la agenda de UN peatón: algo que quiere
 * hacer hoy (comer, comprar, ducharse…). No es obligatoria: compite por
 * puntuación con el resto de tareas en cada punto de decisión (ver `Routine`).
 *
 * Para añadir un tipo de tarea nuevo: añade la clave a `TaskKind`, crea su
 * `TaskDef` en `tasks/` y regístrala en `registry.ts` — sin tocar los bucles.
 */

/** Tipos de tarea disponibles. */
export type TaskKind = 'comer' | 'trabajar' | 'comprar' | 'ducharse' | 'lavadora' | 'pasear';

/** Ciclo de vida de una tarea dentro del día. */
export type TaskState = 'pendiente' | 'activa' | 'hecha' | 'fallida';

/** Franja horaria preferida (horas de sim, 0–24). */
export interface TaskWindow {
  start: number;
  end: number;
}

/**
 * Qué hacer con una tarea sin completar cuando acaba el día:
 *  - `descartar`: se elimina (las comidas no se arrastran: el hambre ya las recuerda).
 *  - `posponer`: pasa al día siguiente con `misses+1` y más prioridad (`boost`).
 */
export type ExpirePolicy = 'descartar' | 'posponer';

/** Una tarea concreta en la agenda de un peatón. */
export interface RoutineTask {
  kind: TaskKind;
  state: TaskState;
  /** Franja horaria de hoy; null = sin restricción horaria. */
  window: TaskWindow | null;
  /** Prioridad extra acumulada por posponerla (+10/día, con tope). */
  boost: number;
  /** Días seguidos sin cumplirla. */
  misses: number;
  /** Día de sim en que se creó. */
  createdDay: number;
  /** Empujón transitorio por sucesos (decae con el tiempo, ver `Routine.tick`). */
  stimulus: number;
  /** Estado interno propio de cada tipo de tarea (fase, temporizadores…). */
  data: Record<string, unknown>;
}

/** Suceso del mundo ofrecido a las tareas (vía `Routine.notify`). */
export interface RoutineEvent {
  kind: 'lluvia-barro' | 'nevera-vacia';
  /** Intensidad 0–1 (module el estímulo que aplica cada tarea). */
  intensity: number;
}

/** Crea una tarea nueva pendiente. */
export function makeTask(kind: TaskKind, day: number, window: TaskWindow | null = null): RoutineTask {
  return { kind, state: 'pendiente', window, boost: 0, misses: 0, createdDay: day, stimulus: 0, data: {} };
}

/** Jitter determinista en [0, 1) a partir de un entero (mismo hash que `sleep.ts`). */
export function hash01(seed: number): number {
  let n = Math.imul(seed + 1, 2654435761) >>> 0;
  n = (n ^ (n >>> 15)) >>> 0;
  return n / 4294967296;
}
