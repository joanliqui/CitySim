/**
 * Escala temporal de la simulación — FUENTE ÚNICA. Todo lo que dependa de la
 * duración del día (ciclo día/noche, drenaje de necesidades, sueño, duración de
 * tareas) debe derivarse de aquí con `simHours()`, no de segundos "a pelo":
 * así cambiar la velocidad del reloj no descuadra el mundo.
 */

/** Duración de un día completo de simulación en segundos (a velocidad x1). */
export const DAY_LENGTH = 1200;

/** Convierte horas de sim a segundos de sim (1 h = DAY_LENGTH / 24). */
export function simHours(hours: number): number {
  return (DAY_LENGTH / 24) * hours;
}
