/**
 * Tarea "trabajar": STUB a la espera del sistema de trabajos. Ya ocupa su hueco
 * en la agenda diaria (banda 70, ventana laboral), pero `canStart` devuelve
 * false, así que nunca gana la subasta. Cuando existan los trabajos bastará con
 * rellenar `canStart`/`start`/`update` (ir al puesto, jornada, volver) sin
 * tocar el resto del sistema.
 */
import { hash01, type TaskWindow } from '../TaskTypes';
import { clockUrgency, type TaskDef } from '../TaskDef';

export const WorkTask: TaskDef = {
  kind: 'trabajar',
  icon: '💼',
  describe(): string {
    return 'Trabajar';
  },
  base: 70,
  interruptible: false,
  nightOk: false,
  onExpire: 'descartar', // se regenera cada día; no se acumula

  window(id: number): TaskWindow {
    const start = 8 + hash01(id ^ 0x0f1c10) * 1.5; // 8:00..9:30
    return { start, end: start + 8.5 };
  },

  urgency(task, _ped, ctx): number {
    return clockUrgency(task, ctx.hour, 10);
  },

  bias(p): number {
    return (p.disciplina - 50) / 10;
  },

  // Todavía no hay trabajos que ejercer.
  canStart(): boolean {
    return false;
  },

  start(): boolean {
    return false;
  },

  update(): 'fallida' {
    return 'fallida'; // inalcanzable mientras canStart sea false
  },
};
