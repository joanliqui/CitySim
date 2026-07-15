/**
 * Tarea "trabajar": ir a la tienda asignada (`ped.workplace`), ponerse DETRÁS
 * del mostrador y quedarse ahí toda la jornada (el horario de apertura de la
 * tienda, que `planDay` pone como ventana de la tarea); al cierre, volver a
 * casa. No es interrumpible y el hambre normal no la desvía (ver las
 * excepciones en `PedestrianSystem`); la orden directa del usuario sí la corta.
 */
import { lerpAngle } from '../../../city/CityModel';
import type { Pedestrian } from '../../agents';
import { clockUrgency, type TaskCtx, type TaskDef, type TaskProgress } from '../TaskDef';
import type { RoutineTask } from '../TaskTypes';

/** Segundos del deslizamiento de la puerta al mostrador (como `homeAction`). */
const MOVE_TIME = 0.8;

interface WorkData {
  phase?: 'ir' | 'puesto' | 'trabajando' | 'volver';
  /** Progreso del deslizamiento hasta el mostrador. */
  k?: number;
}

export const WorkTask: TaskDef = {
  kind: 'trabajar',
  icon: '💼',
  describe(): string {
    return 'Trabajar';
  },
  base: 70,
  interruptible: false,
  nightOk: false,
  onExpire: 'descartar', // se regenera cada día con el horario de su tienda

  // La ventana la fija `planDay` con el horario de apertura de la tienda
  // (por eso no hay `window()` aquí: no debe regenerarse con jitter genérico).

  urgency(task, _ped, ctx): number {
    return clockUrgency(task, ctx.hour, 10);
  },

  bias(p): number {
    return (p.disciplina - 50) / 10;
  },

  canStart(_task, ped): boolean {
    return ped.workplace !== undefined;
  },

  start(task, ped, ctx): boolean {
    if (!ped.workplace || !ctx.host.routeTo(ped, ped.workplace)) return false;
    (task.data as WorkData).phase = 'ir';
    return true;
  },

  update(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx, dt: number): TaskProgress {
    const data = task.data as WorkData;
    const shop = ped.workplace;
    if (!shop) return 'fallida';
    const closeAt = task.window?.end ?? shop.hours?.close ?? 21.5;

    if (data.phase === 'ir') {
      if (ped.building !== shop) return 'abandonada'; // lo redirigieron (usuario…)
      if (!ctx.host.isInside(ped, shop)) return 'sigue';
      data.phase = 'puesto';
      data.k = 0;
      return 'sigue';
    }

    if (data.phase === 'puesto' || data.phase === 'trabajando') {
      if (!ctx.host.isInside(ped, shop)) return 'abandonada'; // lo sacaron a medio turno

      // Deslizamiento de la entrada al puesto, tras el mostrador. Si la tienda
      // no tiene mostrador, trabaja de pie donde está.
      if (data.phase === 'puesto') {
        const spot = ctx.host.workSpot(ped);
        if (!spot) {
          data.phase = 'trabajando';
          return 'sigue';
        }
        data.k = Math.min(1, (data.k ?? 0) + dt / MOVE_TIME);
        const k = Math.min(1, dt / MOVE_TIME);
        ped.x += (spot.x - ped.x) * k;
        ped.z += (spot.z - ped.z) * k;
        ped.y += (spot.y - ped.y) * k;
        ped.heading = lerpAngle(ped.heading, spot.heading, k);
        if (data.k >= 1) {
          ped.x = spot.x;
          ped.z = spot.z;
          ped.y = spot.y;
          ped.heading = spot.heading;
          data.phase = 'trabajando';
        }
        return 'sigue';
      }

      // 'trabajando': fijo tras el mostrador hasta la hora de cierre.
      if (ctx.hour < closeAt) return 'sigue';
      if (!ctx.host.routeTo(ped, ped.home)) return 'sigue'; // reintenta el camino a casa
      data.phase = 'volver';
      return 'sigue';
    }

    // 'volver': jornada hecha al llegar a casa.
    if (ped.building !== ped.home) return 'abandonada';
    if (!ctx.host.atHome(ped)) return 'sigue';
    return 'hecha';
  },
};
