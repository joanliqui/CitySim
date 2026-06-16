# Ciudad 3D — Simulación urbana en el navegador

Simulación 3D de una ciudad low-poly generada proceduralmente: coches que circulan
respetando semáforos, peatones que caminan por las aceras, esperan en los pasos de
cebra y entran y salen de tiendas, casas y oficinas. Con ciclo día/noche completo:
amaneceres y atardeceres, estrellas, luna, ventanas que se iluminan y farolas con
conos de luz.

**Stack:** Three.js + TypeScript + Vite. Sin más dependencias.

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producción (con type-check)
```

## Controles

| Acción | Control |
|---|---|
| Orbitar / zoom / desplazar cámara | Ratón (arrastrar, rueda, botón derecho) |
| Seguir a un agente | Clic sobre un coche o peatón |
| Crear un personaje | Botón "👤 Crear personaje": popup con vista previa 3D y personalización (peinado, colores, altura); al confirmar aparece en la ciudad y la cámara lo sigue |
| Dejar de seguir | `ESC` o botón "Dejar de seguir" |
| Pausa | `Espacio` o botón ⏸ |
| Velocidad de simulación | Slider (×0.5 – ×8) |
| Ajustes | Botón ⚙: hora del día (slider + presets), duración del día, y regenerar la ciudad con otra semilla / nº de coches / nº de peatones |
| Inspeccionar casas | En el panel "Construcción", botón "Quitar tejados" para ocultar cubiertas y ver los interiores |

La configuración de la ciudad también se puede fijar por URL: `?seed=42&cars=120&peds=300`.

## Arquitectura

Separación estricta **simulación ↔ render**: la simulación opera sobre datos puros
(sin Three.js) con paso de tiempo fijo (60 Hz); el render interpola entre el paso
anterior y el actual, por lo que pausar o acelerar la simulación no afecta al render.

```
src/
├── core/        App (bucle fixed-timestep), Clock, Rng (PRNG con semilla)
├── city/        Generación procedural y grafos
│   ├── CityGenerator   trazado no uniforme: avenidas, parque, barrios, curvas, rotondas
│   ├── CityModel       tipos puros + trazado por eje (roadX/roadZ) + aristas curvas
│   ├── RoadGraph       grafo vial dirigido (carriles, conducción por la derecha)
│   └── SidewalkGraph   grafo peatonal (aceras + pasos de cebra) con A*
├── sim/         Sistemas de simulación (estado puro)
│   ├── TrafficLightSystem  fases por intersección, función pura del tiempo
│   ├── VehicleSystem       car-following, parada en semáforo, giros Bézier
│   └── PedestrianSystem    FSM: caminar → esperar → cruzar → entrar/salir
├── render/      Capa Three.js (todo InstancedMesh: 1 draw call por tipo)
│   ├── Sky             skybox shader cartoon: degradado, sol/luna, estrellas, nubes
│   └── DayNightCycle   ciclo día/noche dirigido por el tiempo de simulación
└── ui/          HUD (DOM plano) y picking por raycast sobre instancias
```

### Detalles de diseño

- **Trazado de la ciudad**: la retícula NO es uniforme. Inspirada en Valencia, mezcla
  una gran **avenida** vertical y otra horizontal (huecos anchos entre calles), un
  **parque central** (sin edificios, muy arbolado, con bancos y rodeado de setos;
  cuando ocupa varias manzanas, las calles interiores se eliminan y se funde en un
  único parque grande) y barrios distintos: al
  **norte**, calles amplias con casas grandes y jardín; al **sur**, manzanas apretadas
  llenas de edificios altos. Cada manzana se rodea de edificios mirando a sus calles y
  deja el interior como patio. El ancho de calzada es constante; lo que varía es la
  separación entre calles y el tamaño de las manzanas. Según lo que haya en cada
  manzana, el patio cambia: las manzanas de **solo edificios** tienen suelo de
  **asfalto gris** (ciudad densa) y las de **solo casas** mantienen el **césped**
  y **cada casa tiene su jardín vallado individual** (parcela = casa + jardín,
  separando las casas vecinas por sus vallas; las de junto a una rotonda no se
  vallan), con hueco en la puerta. Las casas
  además tienen **interior de verdad**: suelo, muros con su puerta y tabiques
  que dividen la planta en 2-4 estancias conectadas (partición BSP determinista,
  lista para amueblar más adelante).
- **Calles curvas**: las aristas viales pueden ser rectas o **curvas** (polilínea con
  longitud de arco). Dos **bulevares serpenteantes** atraviesan el parque central; los
  coches siguen la curva (rumbo por la tangente) y las aceras la acompañan.
- **Rotondas**: algunas intersecciones interiores se convierten en **rotonda** —anillo
  de sentido único con isla central ajardinada y sin semáforo—; al entrar, los coches
  **ceden el paso** al tráfico que ya circula por el anillo.
- **Pasos de cebra**: no todos los cruces tienen paso en sus 4 esquinas. La red de
  aceras sigue conectada (los peatones rodean por el cruce vecino).
- **Detalle de edificios**: aparatos de aire acondicionado (con rejilla) en los muros
  traseros y laterales, bajantes/tuberías por detrás y condensadores en las cubiertas
  planas; además, filas de **contenedores de reciclaje** (amarillo, verde y azul)
  repartidas junto al bordillo por los barrios. Las casas alternan tejados a dos aguas
  y a cuatro aguas con caras orientadas hacia fuera para que se vean correctamente desde
  el exterior; esos tejados viven en una capa independiente que el panel de construcción
  puede ocultar para inspeccionar los interiores. Todo instanciado (sin coste de draw calls).
- **Semáforos**: cada intersección cicla verde NS → ámbar → todo-rojo → verde EW
  con un desfase propio. Los peatones solo empiezan a cruzar si el tráfico que
  cruza está en rojo y queda tiempo suficiente para terminar.
- **Coches**: modelo de velocidad segura (frenan ante el líder o la línea de
  detención); en ámbar deciden parar solo si pueden frenar con comodidad. Los
  giros se suavizan con una Bézier cuadrática entre carriles.
- **Peatones**: A* puerta a puerta sobre el grafo de aceras, con preferencia por
  tiendas y destinos cercanos. Aparecen y se desvanecen en las puertas.
- **Personajes personalizados**: el creador (👤) permite elegir entre 8 peinados
  low-poly y colores de pelo, piel, camiseta y pantalón con vista previa 3D en
  vivo. El personaje se añade a la simulación como un peatón más (se incorpora
  al final del array, así el picking no se ve afectado) con malla propia no
  instanciada, y también se le puede seguir con un clic. Lleva un **rombo cian
  flotante** que crece con la distancia y se dibuja a través de los edificios,
  para localizarlo a cualquier zoom; al crearlo, la cámara se acerca a él
  automáticamente.
- **Ciclo día/noche**: un día dura 300 s de simulación (respeta pausa y velocidad).
  El sol orbita (6:00–20:00) y `DayNightCycle` mezcla tres paletas (día/atardecer/
  noche) para cielo, niebla y luces; de noche se encienden las ventanas (emissive
  compartido), las farolas y sus conos de luz aditivos, y el shader del cielo añade
  estrellas y luna. La hora se muestra en el HUD.
- **Postprocesado**: EffectComposer con UnrealBloom (umbral 1.0: solo "florecen"
  los emisores HDR — ventanas nocturnas, farolas, lámpara activa de cada semáforo,
  disco solar) y un pase final propio con viñeta y saturación. La intensidad del
  bloom sube de noche.
- **Rendimiento**: ~250 agentes y ~10 000 instancias estáticas (ventanas, aceras,
  cebras…) en un puñado de draw calls; 60 fps estables incluso a velocidad ×8.
- **Determinismo**: toda la aleatoriedad pasa por un PRNG con semilla
  (`SEED` en `src/core/App.ts`), así que la ciudad y la simulación son reproducibles.

### Depuración

En la consola del navegador hay un acceso de diagnóstico:

```js
__app.viewFrom(x, y, z, targetX, targetZ)  // coloca la cámara
__app.debugSelect('vehicle', 0)            // sigue a un agente por índice
__app.sim.stats()                          // contadores en vivo
```
