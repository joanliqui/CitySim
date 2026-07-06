/**
 * Mecánica compartida de "acción doméstica": el peatón, dentro de su casa, se
 * desliza hasta un mueble, realiza la acción durante un tiempo y vuelve a su
 * sitio. Es el mismo patrón de animación que la comida en la nevera
 * (`eatApproach` en `PedestrianSystem`), reutilizado por ducha y lavadora.
 * Si el hogar no tiene el mueble, la acción se hace de pie en el sitio.
 */
import { lerpAngle } from '../../../city/CityModel';
import type { Pedestrian } from '../../agents';
import type { TaskCtx, TaskProgress } from '../TaskDef';
import type { RoutineTask } from '../TaskTypes';

/** Segundos del deslizamiento ida/vuelta hasta el mueble. */
const MOVE_TIME = 0.8;

interface HomeActionData {
  phase?: 'ir' | 'aproxima' | 'accion' | 'vuelve';
  /** Progreso del deslizamiento: 0 = en su sitio, 1 = en el mueble. */
  k?: number;
  /** Cuenta atrás de la acción. */
  t?: number;
}

export interface HomeActionOpts {
  /** Muebles candidatos, por orden de preferencia. */
  kinds: readonly string[];
  /** Distancia frente al mueble (0 = meterse dentro, p. ej. la ducha). */
  standOff: number;
  /** Duración de la acción una vez en el mueble. */
  actionTime: number;
  /** Efecto continuo mientras dura la acción (p. ej. subir higiene). */
  onTick?(ped: Pedestrian, dt: number): void;
}

/**
 * Un paso de la acción doméstica. Encamina a casa si hace falta; una vez dentro
 * ejecuta las fases aproxima → accion → vuelve. Devuelve el progreso de tarea.
 */
export function stepHomeAction(
  task: RoutineTask,
  ped: Pedestrian,
  ctx: TaskCtx,
  dt: number,
  opts: HomeActionOpts,
): TaskProgress {
  const data = task.data as HomeActionData;
  const { host } = ctx;

  if (!host.atHome(ped)) {
    // Aún de camino. Si algo lo redirigió a otro edificio, se abandona.
    if (ped.building !== ped.home) return 'abandonada';
    if ((data.phase ?? 'ir') !== 'ir') return 'abandonada'; // lo movieron a mitad de acción
    return 'sigue';
  }

  // Pausas: el instinto (comer/dormir) tiene preferencia; la acción espera.
  if (ped.sleeping || ped.eating || ped.recline > 0 || ped.eatApproach > 0) return 'sigue';

  const target = host.homeFurniture(ped, opts.kinds, opts.standOff);
  if (data.phase === undefined || data.phase === 'ir') {
    data.phase = target ? 'aproxima' : 'accion';
    data.k = 0;
    data.t = opts.actionTime;
  }

  if (data.phase === 'aproxima' && target) {
    data.k = Math.min(1, (data.k ?? 0) + dt / MOVE_TIME);
    slideTo(ped, target.x, target.z, target.y, target.heading, dt);
    if (data.k >= 1) {
      ped.x = target.x;
      ped.z = target.z;
      ped.y = target.y;
      ped.heading = target.heading;
      data.phase = 'accion';
    }
    return 'sigue';
  }

  if (data.phase === 'accion') {
    opts.onTick?.(ped, dt);
    data.t = (data.t ?? opts.actionTime) - dt;
    if (data.t <= 0) data.phase = 'vuelve';
    return 'sigue';
  }

  // 'vuelve': deslizarse de vuelta al punto de estar de pie.
  const sp = host.homeStand(ped);
  data.k = Math.max(0, (data.k ?? 0) - dt / MOVE_TIME);
  slideTo(ped, sp.x, sp.z, sp.y, null, dt);
  if (data.k <= 0 || !target) return 'hecha';
  return 'sigue';
}

/** Deslizamiento exponencial hacia un punto (mismo estilo que `eat()`). */
function slideTo(ped: Pedestrian, x: number, z: number, y: number, heading: number | null, dt: number): void {
  const k = Math.min(1, dt / MOVE_TIME);
  ped.x += (x - ped.x) * k;
  ped.z += (z - ped.z) * k;
  ped.y += (y - ped.y) * k;
  if (heading !== null) ped.heading = lerpAngle(ped.heading, heading, k);
}
