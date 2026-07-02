import { ArmchairFactory } from './ArmchairFactory';
import { BathShelfFactory } from './BathShelfFactory';
import { BathVanityFactory } from './BathVanityFactory';
import type { HouseFurnitureKind } from '../types';
import { BathtubFactory } from './BathtubFactory';
import { BedFactory } from './BedFactory';
import { BookshelfFactory } from './BookshelfFactory';
import { CoffeeTableFactory } from './CoffeeTableFactory';
import { DiningChairFactory } from './DiningChairFactory';
import { DiningTableFactory } from './DiningTableFactory';
import { DresserFactory } from './DresserFactory';
import { FloorLampFactory } from './FloorLampFactory';
import { FridgeFactory } from './FridgeFactory';
import type { FurnitureFactory } from './FurnitureFactory';
import { KitchenCabinetFactory } from './KitchenCabinetFactory';
import { KitchenCounterFactory } from './KitchenCounterFactory';
import { MicrowaveFactory } from './MicrowaveFactory';
import { NightstandFactory } from './NightstandFactory';
import { OvenFactory } from './OvenFactory';
import { StoveFactory } from './StoveFactory';
import { PottedPlantFactory } from './PottedPlantFactory';
import { RugFactory } from './RugFactory';
import { ShowerFactory } from './ShowerFactory';
import { SideboardFactory } from './SideboardFactory';
import { SinkFactory } from './SinkFactory';
import { SofaFactory } from './SofaFactory';
import { TowelStackFactory } from './TowelStackFactory';
import { ToiletFactory } from './ToiletFactory';
import { TvFactory } from './TvFactory';
import { WardrobeFactory } from './WardrobeFactory';

/** Registro de factorías por pieza. Los `*Furnisher` componen su receta a partir de aquí. */
export const furnitureFactories: Record<HouseFurnitureKind, FurnitureFactory> = {
  bed: new BedFactory(),
  nightstand: new NightstandFactory(),
  wardrobe: new WardrobeFactory(),
  dresser: new DresserFactory(),
  rug: new RugFactory(),
  shower: new ShowerFactory(),
  bathtub: new BathtubFactory(),
  sink: new SinkFactory(),
  toilet: new ToiletFactory(),
  bathVanity: new BathVanityFactory(),
  bathShelf: new BathShelfFactory(),
  towelStack: new TowelStackFactory(),
  diningTable: new DiningTableFactory(),
  diningChair: new DiningChairFactory(),
  sideboard: new SideboardFactory(),
  pottedPlant: new PottedPlantFactory(),
  sofa: new SofaFactory(),
  armchair: new ArmchairFactory(),
  tv: new TvFactory(),
  coffeeTable: new CoffeeTableFactory(),
  bookshelf: new BookshelfFactory(),
  floorLamp: new FloorLampFactory(),
  fridge: new FridgeFactory(),
  stove: new StoveFactory(),
  oven: new OvenFactory(),
  microwave: new MicrowaveFactory(),
  kitchenCounter: new KitchenCounterFactory(),
  kitchenCabinet: new KitchenCabinetFactory(),
};
