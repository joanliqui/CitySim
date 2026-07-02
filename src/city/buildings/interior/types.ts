import type { FridgeStore } from '../../food/Fridge';
import type { FoodCategory } from '../../food/FoodCategory';

/** Semántica de una estancia (se asigna al amueblar). */
export type RoomKind = 'bedroom' | 'bathroom' | 'dining' | 'kitchen' | 'other';

/** Rectángulo de estancia interior (coordenadas de mundo). */
export interface RoomRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Uso de la estancia, asignado por la fase de amueblado. */
  kind?: RoomKind;
}

/** Mobiliario de vivienda (lo coloca el pipeline de amuebladores de casas). */
export type HouseFurnitureKind =
  | 'bed'
  | 'nightstand'
  | 'wardrobe'
  | 'dresser'
  | 'rug'
  | 'shower'
  | 'bathtub'
  | 'sink'
  | 'toilet'
  | 'bathVanity'
  | 'bathShelf'
  | 'towelStack'
  | 'diningTable'
  | 'diningChair'
  | 'sideboard'
  | 'pottedPlant'
  | 'sofa'
  | 'armchair'
  | 'tv'
  | 'coffeeTable'
  | 'bookshelf'
  | 'floorLamp'
  | 'fridge'
  | 'stove'
  | 'oven'
  | 'microwave'
  | 'kitchenCounter'
  | 'kitchenCabinet';

/** Mobiliario de supermercado (lo genera `marketInterior`, no los amuebladores). */
export type MarketFurnitureKind =
  /** Mostrador de caja registradora junto a la entrada. */
  | 'checkout'
  /** Cinta transportadora asociada a una caja. */
  | 'conveyor'
  /** Góndola/estantería de un pasillo (lleva su `category`). */
  | 'shelfAisle';

/** Todos los tipos de mueble interior. */
export type FurnitureKind = HouseFurnitureKind | MarketFurnitureKind;

/**
 * Mueble axis-aligned en planta (coordenadas de mundo). `w`/`d` son la huella en
 * los ejes X/Z; `faceX`/`faceZ` es el vector unitario hacia el frente del mueble
 * (de espaldas a la pared en que se apoya). En la cama apunta hacia los pies.
 */
export interface Furniture {
  kind: FurnitureKind;
  x: number;
  z: number;
  w: number;
  d: number;
  faceX: number;
  faceZ: number;
  /** Solo cama: de matrimonio (true) o individual (false). */
  double?: boolean;
  /** Solo lavamanos: independiente o encastrado/sobre mueble bajo. */
  sinkMount?: 'standalone' | 'vanity';
  /** Solo microondas: si va exento sobre su propio soporte (true) o apoyado en una encimera. */
  microwaveStand?: boolean;
  /** Solo ducha de esquina: signo del lateral ABIERTO (con cristal), perpendicular a la cara;
   * el lado opuesto queda cerrado contra la pared. Por defecto +1. */
  openSign?: number;
  /** Variación de acabado/color determinista. */
  variant?: number;
  /** Solo nevera: comida almacenada (capacidad limitada). Sin representación 3D. */
  food?: FridgeStore;
  /** Solo góndola de súper: sección de comida a la que pertenece el pasillo. */
  category?: FoodCategory;
}

/** Tabique interior axis-aligned en planta, de (ax,az) a (bx,bz). */
export interface InteriorWall {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Hueco de puerta: distancia del centro del hueco desde (ax,az)... */
  doorAt?: number;
  /** ...y su semiancho. Si faltan, el tabique es macizo. */
  doorHalf?: number;
}

/**
 * Distribución interior de una casa: estancias + tabiques (generados por BSP
 * determinista) + mobiliario colocado por amuebladores especializados.
 */
export interface HouseInterior {
  /** Grosor de muro (perimetral y tabiques). */
  wallT: number;
  rooms: RoomRect[];
  walls: InteriorWall[];
  /** Mobiliario colocado dentro de las estancias. */
  furniture: Furniture[];
}

/** Núcleo de escaleras de un edificio alto: franja rectangular en planta. */
export interface StairCore {
  x: number;
  z: number;
  w: number;
  d: number;
  /**
   * Disposición del núcleo:
   *  - `false` → al FONDO, a todo el ancho (la escalera corre en profundidad,
   *    con la vivienda por delante). Por defecto en edificios profundos.
   *  - `true`  → a un LADO, ocupando todo el fondo (la escalera corre a lo largo
   *    del fondo, con la vivienda al lado). Para edificios poco profundos y anchos,
   *    donde un núcleo al fondo dejaría las escaleras estrechas.
   */
  side: boolean;
  /** Vector unitario VIVIENDA→NÚCLEO (normal del muro de acceso al rellano). */
  nX: number;
  nZ: number;
}

/**
 * Distribución interior de un edificio alto. La planta baja es un rellano (sin
 * vivienda) con escaleras; cada planta superior es UNA vivienda con su propia
 * distribución. El render apila las plantas en Y a partir de `floorH`.
 */
export interface OfficeInterior {
  /** Altura de planta (≈3 m, alineada con la cadencia de ventanas). */
  floorH: number;
  /** Nº total de plantas (la planta 0 es el rellano). */
  floorCount: number;
  /** Núcleo de escaleras (atraviesa todas las plantas). */
  core: StairCore;
  /** Vivienda de cada planta superior (índice 0 = planta 1). */
  dwellings: HouseInterior[];
}

/**
 * Distribución interior de un supermercado (nave de una sola planta): una zona de
 * cajas junto a la entrada y una rejilla de pasillos, cada uno dedicado a una
 * `FoodCategory`. Todo el mobiliario (cajas, cintas, góndolas) va en `furniture`
 * con su `kind`; el render lo recorre igual que el de las casas.
 */
export interface MarketInterior {
  /** Grosor del muro perimetral de la nave. */
  wallT: number;
  /** Secciones (una por pasillo), en el orden en que se colocaron. */
  categories: FoodCategory[];
  /** Cajas, cintas y góndolas de pasillo. */
  furniture: Furniture[];
}
