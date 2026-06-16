import * as THREE from 'three';
import type { CityModel } from '../../city/CityModel';
import type { LampShade } from '../FloorLamps';

/** Un edificio tal y como lo ve el render (alias del tipo del modelo). */
export type RenderBuilding = CityModel['buildings'][number];

/** Una pieza de mobiliario tal y como la ve el render. */
export type RenderFurniture = NonNullable<RenderBuilding['interior']>['furniture'][number];

/**
 * Todos los acumuladores de matrices/colores del render de edificios. Cada uno
 * se vuelca al final en una `InstancedMesh` (una malla por geometría). Los
 * renderers por tipo empujan aquí; el ensamblado vive en `CityMesh`.
 */
export interface RenderBuckets {
  bodyMats: THREE.Matrix4[];
  bodyColors: THREE.Color[];
  hipRoofMats: THREE.Matrix4[];
  hipRoofColors: THREE.Color[];
  gableRoofMats: THREE.Matrix4[];
  gableRoofColors: THREE.Color[];
  flatRoofMats: THREE.Matrix4[];
  flatRoofColors: THREE.Color[];
  parapetMats: THREE.Matrix4[];
  roofBoxMats: THREE.Matrix4[];
  roofTankMats: THREE.Matrix4[];
  awningMats: THREE.Matrix4[];
  awningColors: THREE.Color[];
  signMats: THREE.Matrix4[];
  signColors: THREE.Color[];
  windowMats: THREE.Matrix4[];
  windowFrameMats: THREE.Matrix4[];
  balconySlabMats: THREE.Matrix4[];
  balconyRailMats: THREE.Matrix4[];
  corniceMats: THREE.Matrix4[];
  partitionMats: THREE.Matrix4[];
  floorMats: THREE.Matrix4[];
  bedFrameMats: THREE.Matrix4[];
  bedMattressMats: THREE.Matrix4[];
  bedBlanketMats: THREE.Matrix4[];
  bedPillowMats: THREE.Matrix4[];
  bedHeadboardMats: THREE.Matrix4[];
  /** Mobiliario auxiliar: madera (cuerpos) y oscuro (tiradores/juntas). */
  furnWoodMats: THREE.Matrix4[];
  furnDarkMats: THREE.Matrix4[];
  /** Alfombras (color por instancia). */
  rugMats: THREE.Matrix4[];
  rugColors: THREE.Color[];
  /** Porcelana blanca de baños (lavamanos, váter, bañera). */
  bathCeramicMats: THREE.Matrix4[];
  /** Detalles oscuros/cromados de baños. */
  bathDarkMats: THREE.Matrix4[];
  /** Agua/cristal de ducha o bañera. */
  bathGlassMats: THREE.Matrix4[];
  /** Espejos sobre lavamanos. */
  bathMirrorMats: THREE.Matrix4[];
  /** Maceta (terracota) de las plantas de interior. */
  plantPotMats: THREE.Matrix4[];
  /** Follaje (verde) de las plantas de interior. */
  plantLeafMats: THREE.Matrix4[];
  /** Tapizado de sofás y sillones (color por instancia). */
  upholsteryMats: THREE.Matrix4[];
  upholsteryColors: THREE.Color[];
  /** Libros de las librerías (color por instancia). */
  bookMats: THREE.Matrix4[];
  bookColors: THREE.Color[];
  /** Pantallas emisivas de las lámparas de pie (con su geometría; encendibles por instancia). */
  lampShades: LampShade[];
  /** Madera de muebles bajos/estanterías de baño. */
  bathWoodMats: THREE.Matrix4[];
  /** Toallas y pequeños objetos decorativos de baño. */
  bathTowelMats: THREE.Matrix4[];
  bathTowelColors: THREE.Color[];
  /** Peldaños de las escaleras de los edificios altos. */
  stairMats: THREE.Matrix4[];
  /** Barandillas de escaleras y rellanos (solo en los bordes que dan al ojo). */
  stairRailMats: THREE.Matrix4[];
  /** Hojas de puerta de las viviendas dentro de edificios altos. */
  dwellingDoorMats: THREE.Matrix4[];
  /** Pomos de las puertas de vivienda. */
  dwellingDoorHandleMats: THREE.Matrix4[];
  /** Placa negra del número de vivienda, junto a cada puerta del rellano. */
  doorPlateMats: THREE.Matrix4[];
  /** Quads del número impreso, agrupados por número (una textura/malla por valor). */
  plateNumberMats: Map<number, THREE.Matrix4[]>;
}

/** Geometría derivada del edificio, precalculada una vez por iteración. */
export interface BuildingGeom {
  /** Ángulo de la fachada (yaw). */
  faceAngle: number;
  /** Ancho de la fachada. */
  frontW: number;
  /** Semiprofundidad hacia la calle. */
  frontDist: number;
  /** Color de tejado ya resuelto para este edificio. */
  roofColor: THREE.Color;
}

/**
 * Funciones de geometría compartidas (definidas en `CityMesh`) que los renderers
 * usan. Se inyectan para que los renderers vivan en su propio módulo sin tener
 * que exportar/mover los helpers ni duplicar `compose`.
 */
export interface BuildingRenderHelpers {
  compose(x: number, z: number, y: number, sx: number, sy: number, sz: number): THREE.Matrix4;
  composeYaw(x: number, z: number, y: number, sx: number, sy: number, sz: number, yaw: number): THREE.Matrix4;
  addFlatRoof(
    flatRoofMats: THREE.Matrix4[],
    flatRoofColors: THREE.Color[],
    parapetMats: THREE.Matrix4[],
    b: RenderBuilding,
    roofColor: THREE.Color,
    variant: number,
  ): void;
  addRoofFixture(roofBoxMats: THREE.Matrix4[], roofTankMats: THREE.Matrix4[], b: RenderBuilding, variant: number): void;
  addFrontBalconies(
    balconySlabMats: THREE.Matrix4[],
    balconyRailMats: THREE.Matrix4[],
    b: RenderBuilding,
    faceAngle: number,
    frontDist: number,
    frontW: number,
    rows: number,
    variant: number,
  ): void;
  addFacadeBands(corniceMats: THREE.Matrix4[], b: RenderBuilding): void;
  addWindowRow(
    windowMats: THREE.Matrix4[],
    windowFrameMats: THREE.Matrix4[],
    x: number,
    z: number,
    y: number,
    w: number,
    d: number,
    faceX: number,
    faceZ: number,
  ): void;
  addHouseShell(
    b: RenderBuilding,
    bodyMats: THREE.Matrix4[],
    bodyColors: THREE.Color[],
    partitionMats: THREE.Matrix4[],
    floorMats: THREE.Matrix4[],
    windowMats: THREE.Matrix4[],
    windowFrameMats: THREE.Matrix4[],
  ): void;
  addBed(
    f: { x: number; z: number; w: number; d: number; headX: number; headZ: number; double: boolean },
    frame: THREE.Matrix4[],
    mattress: THREE.Matrix4[],
    blanket: THREE.Matrix4[],
    pillow: THREE.Matrix4[],
    headboard: THREE.Matrix4[],
  ): void;
  addNightstand(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addWardrobe(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addDresser(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addRug(f: RenderFurniture, rugMats: THREE.Matrix4[], rugColors: THREE.Color[]): void;
  addDiningTable(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addDiningChair(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addSideboard(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addPottedPlant(f: RenderFurniture, pot: THREE.Matrix4[], leaf: THREE.Matrix4[]): void;
  addUpholstered(f: RenderFurniture, uph: THREE.Matrix4[], uphColors: THREE.Color[], dark: THREE.Matrix4[]): void;
  addTv(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addCoffeeTable(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addBookshelf(f: RenderFurniture, wood: THREE.Matrix4[], books: THREE.Matrix4[], bookColors: THREE.Color[]): void;
  addFloorLamp(f: RenderFurniture, dark: THREE.Matrix4[], warm: THREE.Matrix4[], shades: LampShade[]): void;
  addShower(f: RenderFurniture, ceramic: THREE.Matrix4[], dark: THREE.Matrix4[], glass: THREE.Matrix4[]): void;
  addBathtub(f: RenderFurniture, ceramic: THREE.Matrix4[], dark: THREE.Matrix4[], glass: THREE.Matrix4[]): void;
  addSink(f: RenderFurniture, ceramic: THREE.Matrix4[], dark: THREE.Matrix4[], mirror: THREE.Matrix4[]): void;
  addToilet(f: RenderFurniture, ceramic: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addBathVanity(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addBathShelf(f: RenderFurniture, wood: THREE.Matrix4[], dark: THREE.Matrix4[]): void;
  addTowelStack(f: RenderFurniture, towelMats: THREE.Matrix4[], towelColors: THREE.Color[], dark: THREE.Matrix4[]): void;
  /** Casco hueco multiplanta de un edificio alto (rellano + escaleras + viviendas). */
  addOfficeShell(b: RenderBuilding, buckets: RenderBuckets): void;
  /** Paletas de color por tipo (datos puros). */
  palettes: { building: Record<string, number[]>; awning: number[]; sign: number[] };
}

/** Contexto pasado a cada renderer: dónde volcar geometría y con qué helpers. */
export interface BuildingRenderCtx {
  buckets: RenderBuckets;
  helpers: BuildingRenderHelpers;
}

/**
 * Estrategia de render por tipo de edificio. Para añadir un tipo nuevo: crea su
 * renderer y regístralo en `renderRegistry.ts` (y su factoría en `src/city`).
 */
export interface BuildingRenderer {
  render(b: RenderBuilding, variant: number, geom: BuildingGeom, ctx: BuildingRenderCtx): void;
}

/**
 * Ventanas de fachada en relieve, por plantas. Las casas NO la usan (sus huecos
 * van dentro de `addHouseShell`); el resto de tipos (cajas macizas) sí.
 */
export function addFacadeWindows(b: RenderBuilding, ctx: BuildingRenderCtx): void {
  const { buckets: K, helpers: H } = ctx;
  const floors = Math.max(1, Math.floor((b.h - 1.6) / 3));
  for (let f = 0; f < floors; f++) {
    const y = Math.min(2.1 + f * 3, b.h - 1.2);
    H.addWindowRow(K.windowMats, K.windowFrameMats, b.x, b.z, y, b.w, b.d, b.faceX, b.faceZ);
  }
}
