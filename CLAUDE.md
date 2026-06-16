# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

## Proyecto

Simulación de ciudad 3D en el navegador (UI en español): ciudad procedural low-poly con coches que respetan semáforos, peatones que hacen pathfinding entre edificios, cámara orbital, seguimiento de agentes y un HUD HTML. **Three.js + TypeScript + Vite**, sin otras dependencias de runtime ni assets externos.

## Comandos

```bash
npm run dev      # servidor Vite en http://localhost:5173
npm run build    # tsc + build de producción (este es el "test"; no hay suite de tests)
npx tsc --noEmit # solo type-check
```

No hay linter ni framework de tests. La verificación se hace ejecutando la app (`.claude/launch.json` define el server `city-sim` para el Preview MCP). En consola, `__app` expone helpers de debug: `__app.viewFrom(...)`, `__app.debugSelect('vehicle'|'pedestrian', i)`, `__app.sim.stats()`.

## Principios de diseño (IMPORTANTES)

El código sigue **principios SOLID** y se apoya fuertemente en el **patrón Abstract Factory**. Respétalos al añadir o modificar funcionalidad:

- **Separación simulación / render**: `src/sim/` y `src/city/` son datos y lógica puros, **sin imports de Three.js**. `src/render/` lee el estado de la simulación cada frame e **interpola** entre el paso previo y el actual (cada agente lleva `prevX/prevZ/prevHeading`; render hace lerp con `clock.alpha`). Todo estado dinámico nuevo que lea el render debe seguir este patrón prev/actual o parpadeará.
- **Determinismo**: toda la aleatoriedad pasa por el `Rng` seeded (`src/core/Rng.ts`); la ciudad y la simulación son reproducibles desde `SEED` en `src/core/App.ts`. **Nunca uses `Math.random()`.** Las geometrías que no deben reordenar la ciudad usan un RNG local seeded por posición (`src/core/seededRng.ts`), no el RNG principal. Preserva el orden de consumo del RNG: cambiarlo "reshuffletea" toda la ciudad.
- **Abstract Factory en doble registro** (uno por lado del split sim/render, porque `src/city` no puede importar Three.js). Se usa en cuatro familias; todas siguen la misma forma: un tipo enum + una factory abstracta con hooks por tipo + factories concretas + un `registry.ts` que las expone, y en render un renderer por tipo con su propio registry. **Para añadir una variante: añade la clave al enum, una factory, un renderer, regístralos — sin tocar los bucles genéricos.**
  - **Edificios** — `src/city/buildings/` (creación) + `src/render/buildings/` (render). Tipos en `BuildingTypes.ts`. `BuildingFactory` abstracta con la lógica de colocación compartida y hooks `footprint()`/`fillFactors()`/`buildInterior()`; concretas `House/Shop/Office`. Metadata por tipo (`pedestrianWeight`, `courtyardKind`) vive en la factory.
  - **Vegetación** — `src/city/vegetation/` + `src/render/vegetation/`. `TreeKind` (round/pine/palm); `makeTree(rng,...)` es el picker de especie.
  - **Juegos de parque** — `src/city/park/` + `src/render/park/`. `PlayKind` (swing/slide/spring/carousel).
  - **Mobiliario de interiores** — `src/city/buildings/interior/furniture/`. Cada pieza es una `FurnitureFactory`; un *furnisher* por habitación (`BedroomFurnisher`) define la receta. Preserva el orden de la receta.

## Estructura del proyecto

- `src/core/` — `App.ts` (orquestación, config por query params, bucle), `Clock.ts` (timestep fijo 60 Hz), `Rng.ts`/`seededRng.ts`.
- `src/city/` — generación y modelo puro de la ciudad. `CityGenerator.ts` (seeded) produce `CityModel.ts` (tipos puros + constantes geométricas: `roadX()`/`roadZ()`, `CORRIDOR_HALF`, `ROUNDABOUT_RADIUS`, etc.). `RoadGraph.ts` y `SidewalkGraph.ts` son los dos grafos de navegación. Subcarpetas `buildings/`, `vegetation/`, `park/` (factories).
- `src/sim/` — sistemas de simulación: `Simulation.ts`, `VehicleSystem.ts`, `PedestrianSystem.ts`, `TrafficLightSystem.ts`, `agents.ts`.
- `src/render/` — todo Three.js: `CityMesh.ts` (construye la malla, todo `InstancedMesh`), `SceneRenderer.ts` (EffectComposer/post-proceso), `DayNightCycle.ts`, `Sky.ts`, `CameraRig.ts`, meshes de agentes, subcarpetas de renderers.
- `src/interaction/` — menú radial e interacción con objetos (`InteractionController`, `Interactable`/`Registry`, `MenuAction`/`ActionRegistry`).
- `src/ui/` — HUD, panel de construcción, picking, creador de personajes.

## Sistemas principales

- **Generación de ciudad** (`CityGenerator`): grid **no uniforme** (tablas de coordenadas por eje, no un `cell` único — usa `roadX(i)`/`roadZ(j)`). Asigna distritos por bloque (parque central, residencial, denso, mixto), superbloques fusionados (`mergedBlocks`), boulevares curvos y rotondas. Hay muchas reglas de "no dibujar carretera/acera/semáforo donde el segmento fue eliminado" (parque, superbloques, rotondas) — al recorrer el grid por segmento, honra los predicados de eliminación (`parkSegRemoved`, `removedRoadSegment`, etc.).
- **Tráfico de vehículos** (`VehicleSystem` + `RoadGraph`): car-following con velocidad segura, decisión en ámbar por distancia de frenado, giros suavizados con Bézier en intersecciones. Las carreteras pueden ser curvas (`EdgeCurve`); toda la geometría pasa por `RoadGraph.lanePoint`/`tangentAt`. Rotondas: ceda el paso al anillo (`yieldTo`/`ringBusy`).
- **Peatones** (`PedestrianSystem` + `SidewalkGraph`): FSM por tramos (door-out → andar/cruzar → door-in → inside), A* puerta a puerta sobre el grafo de aceras. Solo cruzan si `TrafficLightSystem.pedCanCross` lo permite.
- **Semáforos** (`TrafficLightSystem`): **stateless** — el estado es función pura del tiempo de sim + offset por intersección. Vehículos y peatones consultan el mismo controlador; mantén `PED_CROSS_TIME` coherente con la distancia/velocidad de cruce.
- **Ciclo día/noche** (`DayNightCycle`): deriva sol/luna, cielo, niebla, luces y emisivos del tiempo de sim (1 día = `DAY_LENGTH` = 300 s). Muta materiales compartidos devueltos por `buildCityMesh` — no los clones. Hora y duración del día son ajustables en vivo (vía offset, no tocando `clock.time`).
- **Render y post-proceso** (`SceneRenderer`): todo `InstancedMesh` (una draw call por tipo); color por instancia con `setColorAt`. Render vía `EffectComposer` (RenderPass → Bloom → OutputPass ACES → shader cinemático). El bloom solo capta emisores HDR (>1.0). Usa siempre `SceneRenderer.render()`/`resize()`, no `renderer.render()`.
- **Interacción** (`src/interaction/` + `src/ui/Picking.ts`): picking por raycast sobre los `InstancedMesh` de agentes (`instanceId` = índice del array, así que los arrays de agentes **no se reordenan ni redimensionan** tras construirse; la única excepción es `spawnCustom()` que hace *append*). Menú radial de acciones contextuales sobre objetos.

## Convenciones importantes

- Geometría: plano XZ, Y arriba, unidades ≈ metros. Heading = `atan2(dx, dz)` y los meshes se modelan con la longitud a lo largo de +Z (`rotation.y = heading` mira la dirección de avance).
- Los `InstancedMesh` de agentes deben llevar `frustumCulled = false` (si no, el bounding sphere se congela en radio 0 y se culla todo el mesh).
- Strings de UI y comentarios en **español** — mantén la consistencia.
- Config de runtime por query params (`?seed=&cars=&peds=`, `readConfig()` en `App.ts`); "regenerar" la ciudad navega a una nueva query (recarga completa, porque los arrays de agentes no se redimensionan en vivo).
