/** Reloj de simulación: paso fijo, multiplicador de velocidad y pausa. */
export class SimClock {
  readonly fixedDt = 1 / 60;
  /** Máximo de subpasos por frame para evitar la espiral de la muerte. */
  readonly maxSubSteps = 24;

  paused = false;
  speed = 1;
  /** Tiempo de simulación acumulado en segundos. */
  time = 0;

  private accumulator = 0;

  /**
   * Acumula tiempo real y devuelve cuántos pasos fijos debe ejecutar la simulación.
   * `realDt` en segundos.
   */
  tick(realDt: number): number {
    if (this.paused) {
      this.accumulator = 0;
      return 0;
    }
    this.accumulator += Math.min(realDt, 0.25) * this.speed;
    let steps = Math.floor(this.accumulator / this.fixedDt);
    if (steps > this.maxSubSteps) {
      steps = this.maxSubSteps;
      this.accumulator = 0;
    } else {
      this.accumulator -= steps * this.fixedDt;
    }
    return steps;
  }

  /** Fracción [0,1) del paso fijo pendiente, para interpolar el render. */
  get alpha(): number {
    return this.paused ? 1 : this.accumulator / this.fixedDt;
  }

  advance(): void {
    this.time += this.fixedDt;
  }
}
