import type { Rng } from '../core/Rng';

/**
 * Rasgos de personalidad según el modelo de los Cinco Grandes (Big Five / OCEAN).
 * Es estado puro de simulación: cada valor va de 0 a 100. No importa Three.js.
 */
export type BigFiveTrait =
  | 'apertura'
  | 'responsabilidad'
  | 'extraversion'
  | 'amabilidad'
  | 'neuroticismo';

export type Personality = Record<BigFiveTrait, number>;

export interface BigFiveDef {
  id: BigFiveTrait;
  /** Nombre corto para el slider. */
  label: string;
  /** Etiqueta breve para el eje del radar. */
  axis: string;
  /** Descripción del rasgo (tooltip). */
  desc: string;
}

/** Orden canónico de los rasgos (también el orden de los ejes del radar). */
export const BIG_FIVE: BigFiveDef[] = [
  { id: 'apertura', label: 'Apertura', axis: 'Apertura', desc: 'Curiosidad, imaginación y gusto por lo nuevo.' },
  { id: 'responsabilidad', label: 'Responsabilidad', axis: 'Respons.', desc: 'Organización, disciplina y orientación a objetivos.' },
  { id: 'extraversion', label: 'Extraversión', axis: 'Extraver.', desc: 'Sociabilidad, energía y búsqueda de estímulos.' },
  { id: 'amabilidad', label: 'Amabilidad', axis: 'Amabilidad', desc: 'Empatía, cooperación y confianza en los demás.' },
  { id: 'neuroticismo', label: 'Neuroticismo', axis: 'Neurotic.', desc: 'Tendencia a la ansiedad y a las emociones negativas.' },
];

/** Personalidad neutra (todos los rasgos a la mitad). */
export const DEFAULT_PERSONALITY: Personality = {
  apertura: 50,
  responsabilidad: 50,
  extraversion: 50,
  amabilidad: 50,
  neuroticismo: 50,
};

/** Total fijo de puntos a repartir entre los rasgos de personalidad. */
const PERSONALITY_TOTAL = 100;

/**
 * Genera una personalidad aleatoria cuya suma de rasgos es siempre exactamente
 * 100. Reparte ese total entre los cinco rasgos de forma proporcional a pesos
 * aleatorios; usa el Rng seeded (nunca Math.random) para mantener el
 * determinismo de la ciudad. El reparto entero usa el método del mayor resto
 * para que la suma cuadre exacta pese al redondeo.
 */
export function randomPersonality(rng: Rng): Personality {
  const weights = BIG_FIVE.map(() => rng.range(0.0001, 1));
  const sum = weights.reduce((a, b) => a + b, 0);

  // Reparto proporcional: parte entera + resto fraccionario por rasgo.
  const exact = weights.map((w) => (w / sum) * PERSONALITY_TOTAL);
  const floors = exact.map((v) => Math.floor(v));
  let assigned = floors.reduce((a, b) => a + b, 0);

  // Distribuye los puntos sobrantes a los rasgos con mayor resto.
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
