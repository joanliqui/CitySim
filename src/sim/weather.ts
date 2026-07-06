/**
 * Meteorología mínima y determinista: por ahora, solo el suceso "lluvia de
 * barro" que ensucia a los peatones que pilla en la calle (y dispara su tarea
 * de ducharse). Igual que los semáforos, el estado es función pura del día y la
 * hora de sim + la seed — reproducible, sin `Math.random`.
 */

/** Fracción de días con lluvia de barro. */
const MUD_RAIN_CHANCE = 0.25;
/** Duración del chaparrón, en horas de sim. */
const MUD_RAIN_HOURS = 0.6;

/** Hash determinista en [0, 1) (mismo esquema que `sleep.ts`). */
function hash01(seed: number): number {
  let n = Math.imul(seed + 1, 2654435761) >>> 0;
  n = (n ^ (n >>> 15)) >>> 0;
  return n / 4294967296;
}

export class Weather {
  /** Chaparrón forzado desde consola/debug: activo hasta este tiempo de sim. */
  private forcedUntil = -1;

  constructor(private readonly seed: number) {}

  /** ¿Está lloviendo barro ahora? (día/hora de sim; `time` para el forzado). */
  isMudRain(day: number, hour: number, time: number): boolean {
    if (time < this.forcedUntil) return true;
    if (hash01((day + 1) * 92821 + this.seed) > MUD_RAIN_CHANCE) return false;
    const start = 9 + hash01(((day + 1) * 40503) ^ this.seed) * 9; // entre las 9:00 y las 18:00
    return hour >= start && hour <= start + MUD_RAIN_HOURS;
  }

  /** Fuerza un chaparrón de barro ahora (utilidad de depuración/demostración). */
  forceMudRain(time: number, seconds = 10): void {
    this.forcedUntil = time + seconds;
  }
}
