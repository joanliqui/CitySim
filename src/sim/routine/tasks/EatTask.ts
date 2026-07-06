/**
 * Tarea "comer": una comida programada del día (desayuno / comida / cena).
 * Ejecuta el flujo de nevera ya existente (`wantsToEat` → `startEating`), así
 * que la tarea solo encamina a casa y marca la intención; la maquinaria de
 * `PedestrianSystem` hace el acto de comer.
 *
 * Su urgencia no es de reloj sino de NECESIDAD: proporcional al hambre real.
 * Si desayunó fuerte, la comida del mediodía compite floja y puede saltarse
 * (onExpire: descartar — el hambre acumulada ya infla la siguiente comida).
 */
import type { Pedestrian } from '../../agents';
import type { TaskCtx, TaskDef, TaskProgress } from '../TaskDef';
import type { RoutineTask } from '../TaskTypes';

export type MealName = 'desayuno' | 'comida' | 'cena';

interface EatData {
  meal?: MealName;
  phase?: 'ir' | 'comiendo';
  /** Ya lo hemos visto comer (para detectar el final). */
  saw?: boolean;
  /** Pasos de gracia tras pedir comer, antes de dar la nevera por vacía. */
  grace?: number;
}

const MEAL_LABEL: Record<MealName, string> = { desayuno: 'Desayunar', comida: 'Comer', cena: 'Cenar' };

export const EatTask: TaskDef = {
  kind: 'comer',
  icon: '🍽️',
  describe(task: RoutineTask): string {
    const meal = (task.data as EatData).meal;
    return meal ? MEAL_LABEL[meal] : 'Comer';
  },
  base: 80,
  interruptible: false,
  nightOk: true, // la cena cae dentro del tramo nocturno (isNight desde las 19:00)
  onExpire: 'descartar',

  // La urgencia es el hambre: 0 puntos saciado, 20 con hambre fuerte (food ≤ 60).
  urgency(_task, ped): number {
    return 20 * Math.min(Math.max((100 - ped.food) / 40, 0), 1);
  },

  // Sin comida en la nevera no tiene sentido competir (la compra se encarga).
  canStart(_task, ped, ctx): boolean {
    return (ctx.host.fridgeFill(ped) ?? 0) > 0;
  },

  start(task, ped, ctx): boolean {
    const data = task.data as EatData;
    if (ctx.host.atHome(ped)) {
      ctx.host.requestEat(ped);
      data.phase = 'comiendo';
      data.grace = 4;
      return true;
    }
    if (!ctx.host.routeTo(ped, ped.home)) return false;
    data.phase = 'ir';
    return true;
  },

  update(task: RoutineTask, ped: Pedestrian, ctx: TaskCtx): TaskProgress {
    const data = task.data as EatData;
    if (data.phase === 'ir') {
      if (ped.building !== ped.home) return 'abandonada'; // lo redirigieron
      if (!ctx.host.atHome(ped)) return 'sigue';
      ctx.host.requestEat(ped);
      data.phase = 'comiendo';
      data.grace = 4;
      return 'sigue';
    }
    // Fase 'comiendo': la maquinaria existente come; aquí solo detectamos el final.
    if (ped.eating) {
      data.saw = true;
      return 'sigue';
    }
    if (data.saw) return 'hecha'; // terminó de comer (alimentación restaurada)
    if (ped.wantsToEat) return 'sigue'; // aún no lo ha procesado stepInside
    // Pidió comer y no pasó nada: nevera vacía (con un par de pasos de gracia).
    data.grace = (data.grace ?? 0) - 1;
    return data.grace <= 0 ? 'fallida' : 'sigue';
  },
};
