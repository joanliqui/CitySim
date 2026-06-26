/**
 * Clase social de un peatón. Estado puro de simulación (sin Three.js). Determina
 * en qué tipo de vivienda vive (ver el reparto en `PedestrianSystem`):
 *  - `alta`   → solo casas;
 *  - `media`  → casas o apartamentos (edificios);
 *  - `obrera` → solo apartamentos.
 */
export type SocialClass = 'alta' | 'media' | 'obrera';

/** Orden canónico (de mayor a menor poder adquisitivo). */
export const SOCIAL_CLASSES: readonly SocialClass[] = ['alta', 'media', 'obrera'];

/** Etiqueta en español para la ficha del HUD. */
export const SOCIAL_CLASS_LABEL: Record<SocialClass, string> = {
  alta: 'Clase alta',
  media: 'Clase media',
  obrera: 'Clase obrera',
};

/**
 * Proporción de cada clase en la población (pirámide realista): pocos de clase
 * alta, la mayoría obrera. Suman 1.
 */
export const SOCIAL_CLASS_SHARE: Record<SocialClass, number> = {
  alta: 0.15,
  media: 0.35,
  obrera: 0.5,
};
