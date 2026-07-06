/**
 * Planificador diario: genera las tareas recurrentes de la agenda de cada
 * peatón al empezar el día (y la agenda inicial al crearse). Las horas llevan
 * jitter determinista por id — cada peatón desayuna/trabaja/se ducha a SU hora
 * — sin consumir el RNG principal (no altera el orden de consumo existente).
 */
import type { Pedestrian } from '../agents';
import type { RoutineHost } from './TaskDef';
import type { Routine } from './Routine';
import { taskDefs } from './registry';
import { hash01, makeTask, type TaskWindow } from './TaskTypes';
import type { MealName } from './tasks/EatTask';

/** Nivel de nevera por debajo del cual se agenda ir a la compra. */
const SHOP_AT_FILL = 0.35;
/** Cada cuántos días toca lavadora (aprox.; se sortea por id+día). */
const LAUNDRY_CHANCE = 1 / 3;

/** Franja de cada comida, con jitter por peatón (sal distinta por comida). */
function mealWindow(meal: MealName, id: number): TaskWindow {
  switch (meal) {
    case 'desayuno': {
      const start = 6.5 + hash01(id ^ 0xde5a) * 2; // 6:30..8:30
      return { start, end: start + 2.5 };
    }
    case 'comida': {
      const start = 12.5 + hash01(id ^ 0xc0a1) * 1.5; // 12:30..14:00
      return { start, end: start + 2.5 };
    }
    case 'cena': {
      const start = 19.5 + hash01(id ^ 0xceaa) * 1.5; // 19:30..21:00
      return { start, end: Math.min(start + 3, 23.5) };
    }
  }
}

/** Genera la agenda del día `day` para el peatón (tras el rollover de su rutina). */
export function planDay(routine: Routine, ped: Pedestrian, day: number, host: RoutineHost): void {
  const id = ped.id;

  // Tres comidas al día, cada una con su franja.
  for (const meal of ['desayuno', 'comida', 'cena'] as MealName[]) {
    const task = makeTask('comer', day, mealWindow(meal, id));
    task.data = { meal };
    routine.add(task);
  }

  // Jornada laboral (stub hasta que existan los trabajos: nunca gana la subasta).
  routine.add(makeTask('trabajar', day, taskDefs.trabajar.window!(id, day)));

  // Ducha diaria: si quedó una pospuesta de ayer, no se duplica.
  if (!routine.has('ducharse')) {
    routine.add(makeTask('ducharse', day, taskDefs.ducharse.window!(id, day)));
  }

  // Lavadora ~cada 3 días (sorteo determinista por id+día), sin duplicar pospuestas.
  if (!routine.has('lavadora') && hash01(id ^ ((day + 1) * 0x9e3779b9)) < LAUNDRY_CHANCE) {
    routine.add(makeTask('lavadora', day, taskDefs.lavadora.window!(id, day)));
  }

  // Pasear: tarea permanente de relleno (una sola instancia, repeatable).
  if (!routine.has('pasear')) routine.add(makeTask('pasear', day, null));

  // La compra se agenda de forma reactiva según el stock de la nevera.
  ensureShopping(routine, ped, day, host);
}

/**
 * Agenda "hacer la compra" si la nevera anda floja y no hay ya una pendiente.
 * Se llama en el rollover diario y cuando una comida fracasa por nevera vacía.
 */
export function ensureShopping(routine: Routine, ped: Pedestrian, day: number, host: RoutineHost): void {
  if (routine.has('comprar')) return;
  const fill = host.fridgeFill(ped);
  if (fill !== null && fill < SHOP_AT_FILL) {
    routine.add(makeTask('comprar', day, taskDefs.comprar.window!(ped.id, day)));
  }
}
