export type RoundTreeKind = 'round';
export type PineTreeKind = 'pine';
export type PalmTreeKind = 'palm';

export type TreeKind = RoundTreeKind | PineTreeKind | PalmTreeKind;

/** Zona donde se planta el árbol; condiciona la mezcla de especies. */
export type TreeZone = 'park' | 'street' | 'island';
