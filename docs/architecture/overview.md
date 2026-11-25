# Architecture and data flow

`src/main.ts` delegates startup to `src/app/bootstrap.ts`. Bootstrap hydrates control/audio preferences through `src/save/`, then mounts the Vue root. The app owns menu and scene transitions; UI components render screens and send actions. Babylon rendering stays in `src/render/`, and browser audio stays in `src/audio/`.

## Simulation boundary

Future `src/sim/` modules accept plain state, authored definitions, logical inputs, and elapsed simulation ticks. They return updated state and domain events. They must not import Babylon, Vue, DOM APIs, browser storage, rendering, or audio. Platform-independent utilities belong in `src/core/`.

The intended gameplay flow is device events → logical controller/input buffer → fixed simulation tick → state/events → renderer/audio/UI. The app wires those adapters together. Save snapshots pass through `src/save/`; simulation code never reads localStorage.

## Loop

The current animation viewer uses Babylon's rendering loop for preview playback. A gameplay fixed-timestep loop is not implemented yet. Add the accumulator and tick scheduling to `src/core/`, with an explicit tick rate and an injected seeded RNG. Keep simulation updates independent of render frame duration; rendering may interpolate snapshots.

## Content and assets

Authored domain JSON lives in `data/<domain>/`. Each JSON file declares a `$schema` relative to itself, resolving into the root `schemas/` directory. `scripts/validate-data.mjs` validates every domain JSON file and checks its `assets/...` references. It runs as part of the production build.

Arena floors, barricades and bowls are named definitions in `data/environments/arena-parts/<id>.json`. Stages list compatible part ids, and arenas save those ids. The editor uses each definition's `displayName`; `src/content/arenaPieces.ts` resolves ids to models for rendering and recognizes GLB paths from older browser saves. Build validation checks ids, part kinds and stage compatibility as well as model assets. To add a selectable part, create its JSON definition and add its id to the matching stage list; no UI change is needed.

`src/content/` exposes catalog APIs and resolves asset paths. Vite's `tools/asset-manifest.ts` indexes public files without bundling binary data. Vue, audio and the arena screens use a small index of non-GLB files plus the few environment GLBs; the animation viewer loads its GLB catalog lazily. Vite serves `public/` during development and copies it into production output. No custom preview asset server is needed.

Authoring sources and private references stay in the gitignored `local/` directory. Scripts may read them and produce runtime exports in `public/assets/`. Runtime modules never import from `local/`, `scripts/`, or `tools/`.
