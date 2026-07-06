/**
 * Agenda de rutina de UN peatón: la lista de tareas del día y la lógica de
 * subasta que decide cuál hacer. Datos y lógica puros (sin Three.js).
 *
 * La subasta: en cada punto de decisión gana la tarea con mayor puntuación
 *   score = base + urgencia(señal) + boost + sesgo(personalidad) + estímulo
 * Cumplir una tarea NO es obligatorio: si pierde todas las subastas del día,
 * su política `onExpire` decide si se descarta o pasa a mañana con más boost.
 */
import { isNight } from '../sleep';
import type { Pedestrian } from '../agents';
import { taskDefs } from './registry';
import {
  BOOST_CAP,
  BOOST_PER_MISS,
  FLEX_WINDOW_THRESHOLD,
  STIMULUS_HALF_LIFE,
  type TaskCtx,
} from './TaskDef';
import type { RoutineEvent, RoutineTask, TaskKind } from './TaskTypes';

/** Factor de decaimiento por segundo del estímulo (vida media = STIMULUS_HALF_LIFE). */
const STIMULUS_DECAY = Math.LN2 / STIMULUS_HALF_LIFE;

export class Routine {
  /** Tareas del día (pendientes, activa, hechas y fallidas hasta el rollover). */
  readonly tasks: RoutineTask[] = [];
  /** Tarea en ejecución (null = sin tarea; el FSM sigue su vida normal). */
  active: RoutineTask | null = null;

  add(task: RoutineTask): RoutineTask {
    this.tasks.push(task);
    return task;
  }

  /** ¿Hay ya una tarea viva (pendiente o activa) de este tipo? */
  has(kind: TaskKind): boolean {
    return this.tasks.some((t) => t.kind === kind && (t.state === 'pendiente' || t.state === 'activa'));
  }

  /** Decae el estímulo de todas las tareas (se llama cada paso de sim). */
  tick(dt: number): void {
    const f = Math.exp(-dt * STIMULUS_DECAY);
    for (const t of this.tasks) {
      if (t.stimulus > 0.01) t.stimulus *= f;
      else t.stimulus = 0;
    }
  }

  /** Ofrece un suceso a todas las tareas vivas; cada tipo decide su reacción. */
  notify(ev: RoutineEvent, ped: Pedestrian): void {
    for (const t of this.tasks) {
      if (t.state !== 'pendiente' && t.state !== 'activa') continue;
      const gain = taskDefs[t.kind].onEvent?.(t, ev, ped) ?? 0;
      if (gain > 0) t.stimulus = Math.min(t.stimulus + gain, 40);
    }
  }

  /**
   * Puntuación de una tarea, o null si no puede competir ahora (precondición,
   * ventana, noche). `asActive` salta la precondición: la tarea activa se
   * puntúa siempre (para la histéresis) aunque su `canStart` ya no se cumpla.
   */
  score(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx, asActive = false): number | null {
    const def = taskDefs[task.kind];
    if (!asActive) {
      if (task.state !== 'pendiente') return null;
      if (isNight(ctx.hour) && !def.nightOk) return null;
      if (!def.canStart(task, ped, ctx)) return null;
    }
    const dynamic = def.urgency(task, ped, ctx) + task.stimulus;
    const w = task.window;
    if (!asActive && w && (ctx.hour < w.start || ctx.hour > w.end) && dynamic < FLEX_WINDOW_THRESHOLD) {
      return null; // fuera de ventana y sin una razón de peso
    }
    return def.base + Math.min(task.boost, BOOST_CAP) + dynamic + (def.bias?.(ped.personality) ?? 0);
  }

  /** Mejor tarea pendiente en este momento (la ganadora de la subasta), si hay. */
  best(ped: Pedestrian, ctx: TaskCtx): { task: RoutineTask; score: number } | null {
    let bestTask: RoutineTask | null = null;
    let bestScore = -Infinity;
    for (const t of this.tasks) {
      const s = this.score(t, ped, ctx);
      if (s !== null && s > bestScore) {
        bestScore = s;
        bestTask = t;
      }
    }
    return bestTask ? { task: bestTask, score: bestScore } : null;
  }

  /** Marca la tarea activa. */
  activate(task: RoutineTask): void {
    task.state = 'activa';
    this.active = task;
  }

  /** Tarea completada: las permanentes vuelven a pendiente; el resto queda hecha. */
  complete(task: RoutineTask): void {
    task.data = {};
    task.stimulus = 0;
    task.state = taskDefs[task.kind].repeatable ? 'pendiente' : 'hecha';
    if (this.active === task) this.active = null;
  }

  /** Tarea fracasada (p. ej. nevera vacía): queda fallida hasta el rollover. */
  fail(task: RoutineTask): void {
    task.data = {};
    task.state = 'fallida';
    if (this.active === task) this.active = null;
  }

  /** Tarea interrumpida/abandonada: vuelve a pendiente para reintentarla hoy. */
  release(task: RoutineTask): void {
    task.data = {};
    task.state = 'pendiente';
    if (this.active === task) this.active = null;
  }

  /**
   * Cambio de día: aplica la política `onExpire` a lo no completado y limpia lo
   * hecho. La tarea activa sobrevive (puede estar a medias a medianoche). Las
   * pospuestas suben su boost y regeneran su ventana para el nuevo día.
   */
  rollover(id: number, newDay: number): void {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const t = this.tasks[i];
      if (t === this.active) continue;
      const def = taskDefs[t.kind];
      if (def.repeatable) {
        t.window = def.window?.(id, newDay) ?? t.window;
        continue; // las permanentes ni se descartan ni acumulan boost
      }
      const pendiente = t.state === 'pendiente' || t.state === 'fallida';
      if (!pendiente || def.onExpire === 'descartar') {
        this.tasks.splice(i, 1);
        continue;
      }
      // posponer: pasa a mañana con más prioridad.
      t.state = 'pendiente';
      t.misses += 1;
      t.boost = Math.min(t.boost + BOOST_PER_MISS, BOOST_CAP);
      t.window = def.window?.(id, newDay) ?? t.window;
      t.data = {};
    }
  }
}
