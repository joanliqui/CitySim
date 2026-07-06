/**
 * Registro de definiciones de tarea por tipo (mismo patrón que
 * `buildings/registry.ts`). Los bucles genéricos (`Routine`, planner,
 * `PedestrianSystem`) solo consultan este registro: para añadir una tarea
 * nueva basta con crear su `TaskDef` y registrarla aquí.
 */
import type { TaskKind } from './TaskTypes';
import type { TaskDef } from './TaskDef';
import { EatTask } from './tasks/EatTask';
import { LaundryTask } from './tasks/LaundryTask';
import { ShopTask } from './tasks/ShopTask';
import { ShowerTask } from './tasks/ShowerTask';
import { StrollTask } from './tasks/StrollTask';
import { WorkTask } from './tasks/WorkTask';

export const taskDefs: Record<TaskKind, TaskDef> = {
  comer: EatTask,
  trabajar: WorkTask,
  comprar: ShopTask,
  ducharse: ShowerTask,
  lavadora: LaundryTask,
  pasear: StrollTask,
};
