# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

3D city simulation in the browser (Spanish-language UI): procedural low-poly city with cars obeying traffic lights, pedestrians pathfinding between buildings, orbital camera, agent-following, and an HTML HUD. Three.js + TypeScript + Vite, no other runtime dependencies, no external assets.

## Commands

```bash
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # tsc type-check + production build (this is the "test" — there is no test suite)
npx tsc --noEmit # type-check only
```

There is no linter or test framework. Verification is done by running the app: `.Codex/launch.json` defines the `city-sim` server for the Codex Preview MCP. The browser console exposes `__app` for debugging: `__app.viewFrom(x,y,z,tx,tz)` places the camera, `__app.debugSelect('vehicle'|'pedestrian', index)` follows an agent, `__app.sim.stats()` returns live counters.

## Architecture

The cardinal rule is **simulation/render separation**:

- `src/sim/` and `src/city/` contain pure data and logic — no Three.js imports allowed there. The simulation runs at a fixed 60 Hz timestep (`src/core/Clock.ts`) driven by `App.start()`.
- `src/render/` reads simulation state each frame and **interpolates** between the previous and current sim step (every agent carries `prevX/prevZ/prevHeading` updated at the start of each sim step; render lerps with `clock.alpha`). New dynamic state that the render reads must follow this prev/current pattern or it will stutter at low sim speeds.
- All randomness goes through the seeded `Rng` (`src/core/Rng.ts`); the whole city and simulation are reproducible from `SEED` in `src/core/App.ts`. Never use `Math.random()`.

The road grid is **non-uniform**: `CityModel` no longer derives line positions from a single `cell` size. Instead `CityGenerator` fixes per-axis coordinate tables via `setCityLayout(xs, zs)` (built from `X_GAPS`/`Z_GAPS`), and everything reads `roadX(i)` / `roadZ(j)` — separate functions because the X and Z axes differ. The roadway *width* (`roadHalf`, `CORRIDOR_HALF`, `SIDEWALK_CENTER`) stays constant, so crosswalk geometry and `PED_CROSS_TIME` are unaffected by spacing; only block sizes and edge lengths vary. The generator assigns a **district** per block (`districtAt`): a cross-shaped central **park** (no buildings, dense trees), spacious low-rise `residential` to the north, packed tall `dense` to the south, `mixed` elsewhere; wide gaps in `X_GAPS`/`Z_GAPS` form the main avenues that frame the park. Buildings are placed as a perimeter ring around each block (one row per side facing its street, `placeSide`/`buildOne`), interiors left as courtyards. When changing the layout, keep each southern block's buildable depth large enough that `maxDepth ≥ 2.5` or that side gets no buildings.

**Roads are not all straight.** A `RoadEdge` may carry an optional `curve` (`EdgeCurve` = sampled polyline `pts` + cumulative arc-length `cum`); when present, `edge.length` is the arc length and `s` is arc distance. All road geometry goes through `RoadGraph.lanePoint(edge, s)` and `RoadGraph.tangentAt(edge, s)`, which branch on `curve` (straight = fast formula, curved = sample the polyline + lateral offset along the curve normal). `VehicleSystem` derives heading from `tangentAt` and builds the intersection Bézier control point from endpoint **tangents**, so curve↔straight transitions blend correctly; car-following, stop lines, spawn and leader gaps are all in arc length and need no change. Two features build on this: **curved boulevards** (`applyCurvedBoulevards` curves the two vertical lines `i=3`/`i=4` through the widened central park — curves are tangent to the axis at the nodes so crosswalks/turns stay coherent) and **roundabouts**.

**Roundabouts** (`buildRoundabouts`/`makeRoundabout`): a few seeded interior intersections (never curve-touched) are rewired — the center node is emptied and marked in `model.roundabouts`, four **arm nodes** (extra `Intersection`s with `i=j=-1`, appended after the grid) sit on a circle of `ROUNDABOUT_RADIUS`, the approach edges reconnect to them, and one-way curved **ring edges** (`makeRingEdge`) form a CCW loop. Entry edges get `yieldTo` = the ring edge merging at their arm; `VehicleSystem.ringBusy` makes them stop unless the ring is clear (no traffic light there — `TrafficLightSystem.lightFor` and `TrafficLightMesh` both short-circuit on `model.roundabouts`). Render: `CityMesh` draws a `RingGeometry` annulus + grass island disc, **clips** the straight road boxes at `ROUNDABOUT_RADIUS` and the sidewalk strips at `ROUNDABOUT_SW_CLIP` (so nothing crosses under the island), skips the square corner pads and replaces them with **curved sidewalk arcs** built from rational quadratic Béziers (`bezierArc`, exact circle representation) at radius `ROUNDABOUT_SW_R`; lane dashes stop at `ROUNDABOUT_OUT`. `SidewalkGraph` mirrors this: roundabout corners split into two contact nodes (one per street, at `ROUNDABOUT_SW_CLIP`) joined through a diagonal node on the arc, so pedestrians walk around the ring — all these constants live in `CityModel` so render and graph never disagree.

**Crosswalks are selective.** `model.crosswalks` is a seeded `Set` of `crosswalkKey(i,j,axis,side)`; not every intersection has all four. `SidewalkGraph` only adds a crossing edge when the key is present and `CityMesh` only draws its stripes then — both read the same set, so they never disagree. Roundabout nodes get no crosswalks. Removing crossings is safe: the perimeter sidewalk network stays connected, so A* just detours.

Data flow: `CityGenerator` (seeded) → `CityModel` (pure types + geometric constants like `CORRIDOR_HALF`, `SIDEWALK_CENTER`, `roadX()`/`roadZ()`, `ROUNDABOUT_RADIUS`) → two navigation graphs built from it:

- `RoadGraph`: directed edges between adjacent intersections; right-hand traffic via lateral lane offset. Vehicles (`VehicleSystem`) use safe-speed car-following (brake for leader or stop line), decide at yellow based on braking distance, and smooth turns with a quadratic Bézier blended across the intersection (`BLEND` zone around edge transitions — a vehicle's pose near a node depends on `prevEdgeId`/`nextEdgeId`).
- `SidewalkGraph`: corner nodes + per-building door nodes chained along sidewalk segments, crosswalk edges tagged with the intersection and the axis of traffic being crossed; A* runs door-to-door. Pedestrians (`PedestrianSystem`) are a leg-based FSM (`door-out` → walk/cross legs → `door-in` → `inside` timer); they only start crossing if `TrafficLightSystem.pedCanCross` says the crossed traffic is red with enough time left.

`TrafficLightSystem` is stateless: light state is a pure function of sim time plus a per-intersection offset (cycle constants at the top of the file). Vehicles and pedestrians query the same controller, so changing cycle timings affects both — keep `PED_CROSS_TIME` consistent with crossing distance/speed.

Rendering is `InstancedMesh` everywhere (one draw call per mesh type, ~10k static instances for windows/crosswalks/sidewalks). Per-instance color via `setColorAt`; traffic-light lamps are `MeshBasicMaterial` instances recolored only when a head's phase changes. **Agent instanced meshes must set `frustumCulled = false`**: three computes an InstancedMesh bounding sphere once, lazily, at first render — for pedestrians that's when every agent is `inside` (matrices collapsed at the origin), freezing a radius-0 sphere that culls the whole mesh whenever the map center leaves the frustum (shadows still draw — the sun's frustum covers the city — which is how the bug looks like "shadows without bodies"). Picking (`src/ui/Picking.ts`) raycasts the car-body and pedestrian-body instanced meshes — `instanceId` is the agent's array index, so agent arrays must never be reordered or resized after construction.

**Custom characters** are the one sanctioned exception to "never resize": `PedestrianSystem.spawnCustom()` **appends** a pedestrian to the array (existing indices stay valid; `PedestrianMesh` freezes its instance count at construction and ignores later entries). Appearance is render-side only: `CharacterFactory.buildCharacter()` (8 hair presets + palettes, shared by the world and the creator's preview) feeds `CustomPedestrianMesh`, one non-instanced group per character whose root carries `userData.pedIndex` — `Picking` raycasts that group recursively and walks up parents to resolve the index. The creator popup (`src/ui/CharacterCreator.ts`, opened from the HUD's 👤 button) runs its own small `WebGLRenderer` turntable; its rAF loop only runs while open. On confirm, App spawns + auto-follows the new pedestrian with a close-up (`CameraRig.follow(fn, true)`). Each custom character carries a floating cyan octahedron marker (`MeshBasicMaterial`, `depthTest:false` + `renderOrder:10` so it shows through buildings, scaled with camera distance in `CustomPedestrianMesh.update`) — without it, characters are a few dark pixels easily hidden by the southern towers, whose long shadows remain visible (that read as "I can see the shadow but not the character").

Geometry conventions: XZ ground plane, Y up, units ≈ meters. Heading = `atan2(dx, dz)` so `rotation.y = heading` faces the direction of travel; meshes are modeled with length along +Z.

## Day/night cycle

`src/render/DayNightCycle.ts` derives everything (sun/moon direction, sky/fog/light colors, window emissive, lamp cones) from sim time — one day = `DAY_LENGTH` (300 s). It mutates shared materials returned by `buildCityMesh` (`windowMaterial`, `lampMaterial`, `lampConeMaterial`) every frame; don't clone those materials or night lighting breaks. The sky is a custom shader dome (`src/render/Sky.ts`, gradient + sun/moon discs + procedural stars + instanced clouds) with `fog: false`; fog and `scene.background` are recolored per frame to the horizon color.

## Post-processing

`SceneRenderer` renders through an `EffectComposer`: RenderPass → UnrealBloomPass (threshold 1.0) → OutputPass (applies ACES tone mapping) → cinematic ShaderPass (vignette + saturation, in sRGB). Bloom only catches HDR emitters, so "glowing" things must exceed color/emissive 1.0 (night windows ×1.5, lamp bulbs ×~2.2, the active traffic-light lamp ×2.2 in `TrafficLightMesh.update`, sun disc in the sky shader). `DayNightCycle` modulates `bloom.strength` (0.25 day → 0.75 night). Don't call `renderer.render()` directly — use `SceneRenderer.render()` (composer), and any resize must go through its `resize()` so the composer follows.

## Runtime configuration

Seed and agent counts come from query params (`?seed=&cars=&peds=`, parsed in `readConfig()` in `src/core/App.ts`); the HUD's ⚙ panel "regenerates" the city by navigating to a new query string (full reload — agent arrays can't be resized live because picking maps `instanceId` → array index). Hour and day length ARE live-settable via `DayNightCycle.setHour/setDayLength`, which adjust an hour offset rather than mutating `clock.time` (sim time also drives traffic-light phases, so never jump `clock.time` to change the time of day).

## Scope notes

UI strings and code comments are in Spanish — keep new ones consistent.
