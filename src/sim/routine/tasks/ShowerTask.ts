/**
 * Tarea "ducharse": ir a casa, meterse en la ducha (o bañera) y recuperar la
 * higiene. Urgencia de SEÑAL con rango grande (0–60): con higiene normal es una
 * tarea de banda baja que a veces se pospone; si un suceso la hunde (lluvia de
 * barro), la urgencia se dispara y la ducha interrumpe lo que sea. Como su
 * componente dinámica puede superar el umbral flexible, compite incluso fuera
 * de su ventana horaria.
 */
import type { Pedestrian } from '../../agents';
import { hash01, type RoutineEvent, type RoutineTask, type TaskWindow } from '../TaskTypes';
import type { TaskCtx, TaskDef, TaskProgress } from '../TaskDef';
import { stepHomeAction } from './homeAction';

/** Segundos de sim bajo la ducha (≈ 12 min con DAY_LENGTH = 300 s). */
const WASH_TIME = 2.5;

export const ShowerTask: TaskDef = {
  kind: 'ducharse',
  icon: '🚿',
  describe(): string {
    return 'Ducharse';
  },
  base: 25,
  interruptible: true,
  nightOk: true,
  onExpire: 'posponer',

  // Ventana preferida por la tarde-noche, con jitter por peatón.
  window(id: number): TaskWindow {
    const start = 17.5 + hash01(id ^ 0x5ca1ab1e) * 3.5; // 17:30..21:00
    return { start, end: Math.min(start + 4, 23.5) };
  },

  // Señal de suciedad: cuadrática para que solo empuje fuerte cuando importa.
  urgency(_task, ped): number {
    const dirt = Math.min(Math.max((100 - ped.hygiene) / 100, 0), 1);
    return 60 * dirt * dirt;
  },

  canStart(): boolean {
    return true; // ducharse siempre es posible (sin ducha, se asea en el sitio)
  },

  start(task, ped, ctx): boolean {
    if (!ctx.host.atHome(ped) && !ctx.host.routeTo(ped, ped.home)) return false;
    (task.data as { phase?: string }).phase = 'ir';
    return true;
  },

  update(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx, dt: number): TaskProgress {
    return stepHomeAction(task, ped, ctx, dt, {
      kinds: ['shower', 'bathtub'],
      standOff: 0, // se mete dentro del plato de ducha
      actionTime: WASH_TIME,
      onTick(p, tick) {
        p.hygiene = Math.min(100, p.hygiene + (tick * 100) / WASH_TIME);
      },
    });
  },

  onEvent(_task, ev: RoutineEvent): number {
    return ev.kind === 'lluvia-barro' ? 25 * ev.intensity : 0;
  },
};
