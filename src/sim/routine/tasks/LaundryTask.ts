/**
 * Tarea "poner la lavadora": la tarea doméstica de banda baja por excelencia.
 * Es el ejemplo canónico de POSPOSICIÓN: si el día se complica y no se hace,
 * pasa al día siguiente con más prioridad (boost), hasta que gana la subasta.
 * No hay lavadora como mueble aún, así que se hace junto a la encimera/lavabo.
 */
import { simHours } from '../../../core/time';
import type { Pedestrian } from '../../agents';
import { hash01, type RoutineTask, type TaskWindow } from '../TaskTypes';
import { clockUrgency, type TaskCtx, type TaskDef, type TaskProgress } from '../TaskDef';
import { stepHomeAction } from './homeAction';

/** Tiempo atareado con la colada (≈ 20 min de sim). */
const LAUNDRY_TIME = simHours(0.33);

export const LaundryTask: TaskDef = {
  kind: 'lavadora',
  icon: '🧺',
  describe(): string {
    return 'Poner la lavadora';
  },
  base: 25,
  interruptible: true,
  nightOk: false,
  onExpire: 'posponer',

  window(id: number, day: number): TaskWindow {
    const start = 9 + hash01(id ^ (day * 7919) ^ 0xc01ada) * 6; // 9:00..15:00
    return { start, end: 19 };
  },

  // Urgencia de RELOJ: crece cuadrática conforme se agota la ventana del día.
  urgency(task, _ped, ctx): number {
    return clockUrgency(task, ctx.hour, 20);
  },

  bias(p): number {
    return (p.organizacion - 50) / 10;
  },

  canStart(): boolean {
    return true;
  },

  start(task, ped, ctx): boolean {
    if (!ctx.host.atHome(ped) && !ctx.host.routeTo(ped, ped.home)) return false;
    (task.data as { phase?: string }).phase = 'ir';
    return true;
  },

  update(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx, dt: number): TaskProgress {
    return stepHomeAction(task, ped, ctx, dt, {
      kinds: ['kitchenCounter', 'sink', 'bathVanity'],
      standOff: 0.5,
      actionTime: LAUNDRY_TIME,
    });
  },
};
