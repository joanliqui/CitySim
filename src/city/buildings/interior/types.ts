/** Semántica de una estancia (se asigna al amueblar). */
export type RoomKind = 'bedroom' | 'bathroom' | 'dining' | 'other';

/** Rectángulo de estancia interior (coordenadas de mundo). */
export interface RoomRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Uso de la estancia, asignado por la fase de amueblado. */
  kind?: RoomKind;
}

/** Tipos de mueble interior. */
export type FurnitureKind =
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
  | 'floorLamp';

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
  /** Variación de acabado/color determinista. */
  variant?: number;
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
