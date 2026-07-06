/**
 * Tarea "pasear": el relleno de la agenda. Es exactamente el comportamiento
 * clásico (salir a un edificio aleatorio, con pesos por tipo y cercanía) con la
 * prioridad mínima: solo gana cuando ninguna otra tarea aplica, y así el mundo
 * sigue vivo entre tareas. Es permanente (repeatable): al completarse vuelve a
 * quedar pendiente.
 */
import type { Pedestrian } from '../../agents';
import type { TaskCtx, TaskDef, TaskProgress } from '../TaskDef';
import type { RoutineTask } from '../TaskTypes';

export const StrollTask: TaskDef = {
  kind: 'pasear',
  icon: '🚶',
  describe(): string {
    return 'Pasear';
  },
  base: 5,
  interruptible: true,
  nightOk: false, // de noche nadie sale de paseo (converge con la regla existente)
  repeatable: true,
  onExpire: 'posponer', // permanente: nunca se descarta (no acumula boost, ver abajo)

  urgency(): number {
    return 0;
  },

  bias(p): number {
    return (p.sociabilidad - 50) / 10; // el sociable sale más
  },

  canStart(): boolean {
    return true;
  },

  start(_task, ped, ctx): boolean {
    return ctx.host.wander(ped);
  },

  update(_task: RoutineTask, ped: Pedestrian, _ctx: TaskCtx): TaskProgress {
    // Completado al llegar al destino; el tiempo de estancia lo pone el FSM.
    return ped.state === 'inside' ? 'hecha' : 'sigue';
  },
};
