import type { Rng } from '../core/Rng';

/**
 * Rasgos de personalidad según el modelo de los Cinco Grandes (Big Five / OCEAN),
 * desglosado en dos facetas por factor. Es estado puro de simulación: cada
 * faceta va de 0 a 100. No importa Three.js.
 */
export type BigFiveFactor =
  | 'apertura'
  | 'responsabilidad'
  | 'extraversion'
  | 'amabilidad'
  | 'neuroticismo';

export type BigFiveTrait =
  | 'curiosidad'
  | 'creatividad'
  | 'disciplina'
  | 'organizacion'
  | 'sociabilidad'
  | 'asertividad'
  | 'empatia'
  | 'cooperacion'
  | 'ansiedad'
  | 'estabilidad';

export type Personality = Record<BigFiveTrait, number>;

export interface BigFiveDef {
  id: BigFiveTrait;
  /** Factor de los Cinco Grandes al que pertenece la faceta. */
  factor: BigFiveFactor;
  /** Nombre del factor para agrupar en la UI. */
  factorLabel: string;
  /** Nombre corto para el slider. */
  label: string;
  /** Etiqueta breve para el eje del radar. */
  axis: string;
  /** Descripción de la faceta (tooltip). */
  desc: string;
}

/** Orden canónico de las facetas (también el orden de los ejes del radar). */
export const BIG_FIVE: BigFiveDef[] = [
  { id: 'curiosidad', factor: 'apertura', factorLabel: 'Apertura', label: 'Curiosidad', axis: 'Curios.', desc: 'Interés por aprender y explorar lo desconocido.' },
  { id: 'creatividad', factor: 'apertura', factorLabel: 'Apertura', label: 'Creatividad', axis: 'Creativ.', desc: 'Imaginación y gusto por las ideas nuevas.' },
  { id: 'disciplina', factor: 'responsabilidad', factorLabel: 'Responsabilidad', label: 'Disciplina', axis: 'Discipl.', desc: 'Constancia y autocontrol para cumplir lo previsto.' },
  { id: 'organizacion', factor: 'responsabilidad', factorLabel: 'Responsabilidad', label: 'Organización', axis: 'Organiz.', desc: 'Orden y planificación de tareas y recursos.' },
  { id: 'sociabilidad', factor: 'extraversion', factorLabel: 'Extraversión', label: 'Sociabilidad', axis: 'Sociab.', desc: 'Disfrute de la compañía y del trato con los demás.' },
  { id: 'asertividad', factor: 'extraversion', factorLabel: 'Extraversión', label: 'Asertividad', axis: 'Asertiv.', desc: 'Iniciativa y seguridad al expresarse.' },
  { id: 'empatia', factor: 'amabilidad', factorLabel: 'Amabilidad', label: 'Empatía', axis: 'Empatía', desc: 'Capacidad de ponerse en el lugar del otro.' },
  { id: 'cooperacion', factor: 'amabilidad', factorLabel: 'Amabilidad', label: 'Cooperación', axis: 'Cooper.', desc: 'Disposición a colaborar y evitar conflictos.' },
  { id: 'ansiedad', factor: 'neuroticismo', factorLabel: 'Neuroticismo', label: 'Ansiedad', axis: 'Ansied.', desc: 'Tendencia a la preocupación y al estrés.' },
  { id: 'estabilidad', factor: 'neuroticismo', factorLabel: 'Neuroticismo', label: 'Estabilidad emocional', axis: 'Estab.', desc: 'Calma y resistencia ante los contratiempos (inversa del neuroticismo).' },
];

/** Personalidad neutra (todas las facetas a la mitad). */
export const DEFAULT_PERSONALITY: Personality = {
  curiosidad: 50,
  creatividad: 50,
  disciplina: 50,
  organizacion: 50,
  sociabilidad: 50,
  asertividad: 50,
  empatia: 50,
  cooperacion: 50,
  ansiedad: 50,
  estabilidad: 50,
};

/** Total fijo de puntos a repartir entre las facetas de personalidad
 *  (20 de media por faceta, igual que con los cinco rasgos originales). */
const PERSONALITY_TOTAL = 200;

/**
 * Genera una personalidad aleatoria cuya suma de facetas es siempre exactamente
 * `PERSONALITY_TOTAL`. Reparte ese total entre las diez facetas de forma
 * proporcional a pesos aleatorios; usa el Rng seeded (nunca Math.random) para
 * mantener el determinismo de la ciudad. El reparto entero usa el método del
 * mayor resto para que la suma cuadre exacta pese al redondeo.
 */
export function randomPersonality(rng: Rng): Personality {
  const weights = BIG_FIVE.map(() => rng.range(0.0001, 1));
  const sum = weights.reduce((a, b) => a + b, 0);

  // Reparto proporcional: parte entera + resto fraccionario por faceta.
  const exact = weights.map((w) => (w / sum) * PERSONALITY_TOTAL);
  const floors = exact.map((v) => Math.floor(v));
  let assigned = floors.reduce((a, b) => a + b, 0);

  // Distribuye los puntos sobrantes a las facetas con mayor resto.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; assigned < PERSONALITY_TOTAL; k++, assigned++) {
    floors[order[k % order.length].i]++;
  }

  const p = {} as Personality;
  for (let i = 0; i < BIG_FIVE.length; i++) p[BIG_FIVE[i].id] = floors[i];
  return p;
}
