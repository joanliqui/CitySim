/**
 * Modelo de energía/cansancio para la rutina de sueño de los peatones. Estado y
 * lógica puros (sin Three.js). La energía baja mientras el peatón está despierto
 * y se recupera mientras duerme; los ritmos y umbrales dependen de la personalidad
 * (Big Five) más un jitter determinista por id, así cada peatón se acuesta a una
 * hora distinta y duerme un rato distinto.
 *
 * Referencia temporal: `DAY_LENGTH` (fuente única en `src/core/time.ts`).
 */
import { simHours } from '../core/time';
import type { Personality } from './personality';

/** Energía/seg gastada despierto: vaciar 100 ≈ 16 h de simulación, así un
 *  peatón se cansa a lo largo de un solo día y se acuesta esa misma noche. */
const DRAIN_BASE = 100 / simHours(16);
/** Energía/seg recuperada durmiendo: recargar 100 ≈ 8 h. Debe compensar el
 *  gasto del día completo para que no se acumule un déficit noche tras noche. */
const RECOVER_BASE = 100 / simHours(8);

/** Segundos que tarda en tumbarse/levantarse (anima `recline`). */
export const RECLINE_TIME = 0.6;

/** Hora a partir de la cual termina la noche (deja de poder acostarse / se levanta). */
const MORNING_END = 19;

/**
 * ¿Es de noche para irse a dormir? El sol se pone a las 20:00 y sale a las 6:00
 * en `DayNightCycle`; damos un margen para que los más cansados se acuesten al
 * caer la tarde.
 */
export function isNight(hour: number): boolean {
  return hour >= MORNING_END || hour < 7;
}

/**
 * ¿Es hora de levantarse? Cada peatón tiene su hora de despertar (≈6:00..8:30),
 * así no madrugan todos a la vez. La ventana evita volver a "despertar" de noche.
 */
export function isWakeUpTime(hour: number, id: number): boolean {
  const wakeHour = 6 + jitter(id ^ 0x85ebca6b) * 2.5; // 6:00..8:30
  return hour >= wakeHour && hour < MORNING_END;
}

/** Jitter determinista en [0, 1) a partir de un entero (hash entero rápido). */
function jitter(seed: number): number {
  let n = Math.imul(seed + 1, 2654435761) >>> 0;
  n = (n ^ (n >>> 15)) >>> 0;
  return n / 4294967296;
}

/** Ritmo de gasto: la ansiedad cansa antes; la disciplina lo modera. */
export function drainRate(p: Personality): number {
  return DRAIN_BASE * (1 + ((p.ansiedad - 50) / 100) * 0.5 - ((p.disciplina - 50) / 100) * 0.2);
}

/** Ritmo de recuperación: el emocionalmente estable descansa algo mejor. */
export function recoverRate(p: Personality): number {
  return RECOVER_BASE * (1 + ((p.estabilidad - 50) / 100) * 0.3);
}

/** Umbral de energía para acostarse (≈11..29): el disciplinado se acuesta antes. */
export function sleepAt(p: Personality, id: number): number {
  return 16 + ((p.disciplina - 50) / 100) * 10 + jitter(id) * 8;
}
