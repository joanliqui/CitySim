/**
 * Modelo de necesidades fisiológicas de los peatones (alimentación e
 * hidratación). Estado y lógica puros (sin Three.js). Cada necesidad es un
 * porcentaje 0–100 donde **100 = estado perfecto** y **0 = estado crítico**;
 * baja de forma continua con el tiempo de simulación.
 *
 * El ritmo de descenso se define por TRAMOS (`DrainSegment[]`): cada tramo cubre
 * un rango de porcentaje y se vacía a su propia velocidad. Hoy las dos
 * necesidades usan un único tramo lineal (velocidad constante), pero la
 * estructura ya permite, p. ej., que el hambre caiga más rápido por debajo del
 * 30 %: basta con añadir tramos a su `NeedConfig`, sin tocar la lógica de drenaje.
 *
 * Referencia temporal: `DAY_LENGTH` (fuente única en `src/core/time.ts`).
 */
import { DAY_LENGTH } from '../core/time';

/**
 * Un tramo del descenso. Mientras el porcentaje actual es ≤ `upTo` (y mayor que
 * el `upTo` del tramo anterior), la necesidad pierde `ratePerSec` puntos por
 * segundo de simulación. Los tramos de un `NeedConfig` van ordenados de menor a
 * mayor `upTo` y el último debe llegar a 100 para cubrir todo el rango.
 */
export interface DrainSegment {
  /** Límite superior del tramo (incluido), en %. */
  upTo: number;
  /** Puntos de porcentaje perdidos por segundo de simulación dentro del tramo. */
  ratePerSec: number;
}

/** Configuración de una necesidad: sus tramos de descenso. */
export interface NeedConfig {
  segments: DrainSegment[];
}

/**
 * Construye una necesidad LINEAL (un solo tramo) que se vacía de 100 a 0 en
 * `days` días de simulación.
 */
export function linearNeed(days: number): NeedConfig {
  return { segments: [{ upTo: 100, ratePerSec: 100 / (days * DAY_LENGTH) }] };
}

/** Velocidad de descenso (puntos/seg) que corresponde al `value` actual. */
export function drainRateAt(cfg: NeedConfig, value: number): number {
  for (const seg of cfg.segments) {
    if (value <= seg.upTo) return seg.ratePerSec;
  }
  // Por seguridad, si ningún tramo cubre el valor usa el último (el más alto).
  return cfg.segments[cfg.segments.length - 1]?.ratePerSec ?? 0;
}

/** Aplica `dt` segundos de descenso a una necesidad, con clamp a [0, 100]. */
export function drainNeed(value: number, cfg: NeedConfig, dt: number): number {
  return Math.max(0, value - drainRateAt(cfg, value) * dt);
}

/** Hidratación: se vacía de 100 a 0 en 2 días. */
export const HYDRATION: NeedConfig = linearNeed(2);

/** Alimentación: se vacía de 100 a 0 en 5 días. */
export const FOOD: NeedConfig = linearNeed(5);

/** Higiene: se vacía de 100 a 0 en 3 días (la ducha la restaura; ver rutinas). */
export const HYGIENE: NeedConfig = linearNeed(3);
