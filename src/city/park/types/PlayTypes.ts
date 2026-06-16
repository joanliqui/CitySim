/**
 * Tipos de juego infantil que pueblan las zonas de juego de los parques grandes
 * (clave del registro de factorías). Para añadir uno (balancín, casita…): añade
 * su clave aquí, crea su factoría en `src/city/park` y su renderer en
 * `src/render/park`, y regístralos en sus respectivos `registry`.
 */
export type PlayKind = 'swing' | 'slide' | 'spring' | 'carousel';
