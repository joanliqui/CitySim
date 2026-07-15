/**
 * Tarea "hacer la compra": ir al supermercado, comprar un rato y volver a casa
 * a llenar la nevera. Cierra el ciclo nevera → se vacía → compra → se rellena.
 *
 * Su urgencia es de STOCK: proporcional a lo vacía que esté la nevera (señal),
 * con un rango dinámico grande (0–35) porque su base es baja: nevera casi vacía
 * ≈ importancia de trabajar. El evento `nevera-vacia` (una comida que fracasa)
 * le añade además un estímulo fuerte.
 */
import { simHours } from '../../../core/time';
import type { Pedestrian } from '../../agents';
import type { TaskCtx, TaskDef, TaskProgress } from '../TaskDef';
import type { RoutineEvent, RoutineTask } from '../TaskTypes';

/** Tiempo comprando dentro del súper (≈ media hora de sim). */
const SHOP_TIME = simHours(0.5);

/** Horario comercial del supermercado. */
export const SHOP_WINDOW = { start: 8.5, end: 20.5 };

interface ShopData {
  phase?: 'ir' | 'comprando' | 'volver';
  t?: number;
}

export const ShopTask: TaskDef = {
  kind: 'comprar',
  icon: '🛒',
  describe(): string {
    return 'Hacer la compra';
  },
  base: 40,
  interruptible: true,
  nightOk: false,
  onExpire: 'posponer',
  window(): { start: number; end: number } {
    return { ...SHOP_WINDOW };
  },

  // Señal de stock: 0 con la nevera llena, 35 con la nevera vacía.
  urgency(_task, ped, ctx): number {
    const fill = ctx.host.fridgeFill(ped);
    if (fill === null) return 0;
    return 35 * (1 - Math.min(Math.max(fill, 0), 1));
  },

  bias(p): number {
    return (p.organizacion - 50) / 10; // el organizado no deja vaciarse la nevera
  },

  canStart(_task, ped, ctx): boolean {
    const fill = ctx.host.fridgeFill(ped);
    return ctx.host.market(ped) !== null && fill !== null && fill < 0.95;
  },

  start(task, ped, ctx): boolean {
    const market = ctx.host.market(ped);
    if (!market || !ctx.host.routeTo(ped, market)) return false;
    (task.data as ShopData).phase = 'ir';
    return true;
  },

  update(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx, dt: number): TaskProgress {
    const data = task.data as ShopData;
    const market = ctx.host.market(ped);
    if (!market) return 'fallida';

    if (data.phase === 'ir') {
      if (ped.building !== market) return 'abandonada'; // lo redirigieron (noche, usuario…)
      if (!ctx.host.isInside(ped, market)) return 'sigue';
      data.phase = 'comprando';
      data.t = SHOP_TIME;
      return 'sigue';
    }

    if (data.phase === 'comprando') {
      data.t = (data.t ?? SHOP_TIME) - dt;
      if (data.t > 0) return 'sigue';
      if (!ctx.host.routeTo(ped, ped.home)) return 'sigue'; // reintenta el camino a casa
      data.phase = 'volver';
      return 'sigue';
    }

    // 'volver': al llegar a casa, guarda la compra en la nevera.
    if (ped.building !== ped.home) return 'abandonada';
    if (!ctx.host.atHome(ped)) return 'sigue';
    ctx.host.restockFridge(ped);
    return 'hecha';
  },

  onEvent(_task, ev: RoutineEvent): number {
    return ev.kind === 'nevera-vacia' ? 25 * ev.intensity : 0;
  },
};
