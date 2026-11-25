# VPG handoff

The package and page are named VPG (`vpg` in package metadata). This reorganization preserves the existing animation viewer and menu/control workflow, and adds the arena viewer and editor ported from VirtualProGrappler-V2. The Git remote and checkout directory are managed separately from package naming.

## Where things live

| Location | Responsibility |
| --- | --- |
| `src/main.ts`, `src/app/` | Entry, startup hydration, Vue root, menu and scene flow |
| `src/core/` | Future fixed-timestep loop, events, seeded RNG, math, logging |
| `src/sim/{hfsm,combat,movement,match,ai}/` | Future pure game logic, with no DOM or Babylon imports |
| `src/input/` | Controller bindings and device mapping; future input buffer |
| `src/render/viewer/` | Babylon scene, camera, rig retargeting, animation playback |
| `src/render/arena/` | Arena building (ring, steps, stage pieces, ceiling, light cards, textures) and the orbiting arena scene |
| `src/audio/` | Menu cues, layered music, audio preferences |
| `src/content/` | Catalog access, runtime asset resolution, animation file lists, arena/stage/texture-slot catalogs and draft rules |
| `src/save/` | Browser JSON repository (preferences, saved arenas, editor draft), IndexedDB store for imported images; future migrations and backups |
| `src/ui/` | Vue screens, loading state, shared presentation styles |
| `data/` | Schema-validated domain JSON by feature |
| `schemas/` | Canonical JSON Schemas, draft 2020-12 |
| `public/assets/` | Runtime animations, character models/textures, environments, audio, UI |
| `local/` | Ignored authoring sources, reference CSVs, roster, placeholders, conversion inputs |
| `tests/unit/` | Node tests mirroring source modules; `sim/` reserved for headless gameplay tests |
| `tests/fixtures/` | Small synthetic test data |
| `tests/e2e/` | Playwright persistence checks and pending combat smoke |
| `scripts/` | Data validation and Blender conversion/batch processing |
| `tools/` | Vite plugins only |

## Moved material

- `src/viewer/` → `src/render/viewer/`; catalog loading moved to `src/content/animationLibrary.ts`, bookmark detection to `src/app/viewerHash.ts`.
- `src/data/` → `src/content/` and `src/input/`; `src/game/VirtualController.ts` → `src/input/VirtualController.ts`.
- `src/ui/App.vue` and `MainMenu.vue` → `src/app/`. Reusable screens remain in `src/ui/`.
- `data/schemas/` → `schemas/`; all JSON schema references are relative to the content file.
- Runtime `assets/` → `public/assets/`; menu music is now `public/assets/audio/music/`.
- Blender files → `local/blender/`; conversion inputs and source glTFs → `local/characters/`. These files remain on disk and are ignored by Git.
- `tools/blender/` → `scripts/blender/`; `vite/asset-manifest.ts` → `tools/asset-manifest.ts`.
- `VPG-RIG.md` → `docs/animations/VPG-RIG.md`; the two standalone background experiments → `docs/ui/prototypes/`.

## Arena viewer and editor

Commissioner → Arena Viewer and Arena Editor are ported from VirtualProGrappler-V2 (`src/ui/ArenaViewer.vue`, `src/ui/ArenaEditor.vue`). Both load on demand, like the animation viewer, so Babylon stays out of the menu chunk.

- **Data.** Bundled arenas are `data/environments/arenas/<id>.json` (the filename is the id). Each selectable floor, barricade and arena bowl has a definition in `data/environments/arena-parts/<id>.json` with `id`, `displayName`, `kind` and its internal `glb` path. `data/environments/stages.json` lists named stages and the part ids that fit each one; the first in each list is the default. Arenas and editor saves use these ids, and the editor shows the authored display names. The three catalogs have JSON Schemas, and `validate:data` also checks part kinds and stage compatibility. The editable texture slots and colour keys are the registry in `src/content/textureSlots.ts`; a material not listed there cannot be changed from the editor.
- **Assets.** Models and textures live under `public/assets/environments/arenas/shared/`, except the ring's own models and textures, which live in `public/assets/environments/ring/`. Player saves keep the paths they were written with, so when a folder they can reference moves, add it to `MOVED_FOLDERS` in `src/content/assetPaths.ts`. `tools/asset-manifest.ts` indexes environment GLBs alongside the non-GLB files, and `resolveModel` loads them from `VITE_ASSET_BASE` when it is set, like the animation viewer's models.
- **Player arenas.** Saved in localStorage under `vpg-arenas` and validated on load by `src/content/arenaValidation.ts` (an arena that no longer validates is skipped with a console warning). At startup, existing saved arenas automatically migrate old piece GLB paths to named ids and write the updated references back to storage. This preserves other arena settings and any skipped records; if storage is unavailable, the arenas still load with ids in memory and migration retries on the next startup. All new saves also normalize piece references to ids. The unfinished editor draft is parked under `vpg-arena-draft` on every change and restored on the next visit, including drafts using old paths. Bundled arenas are cloned under a new id before editing.
- **Imported images.** PNG/JPEG files are decoded, re-encoded within V2's limits (2048 px per side, 4 MiB each, 64 images / 64 MiB in total) and stored in the `vpg-images` IndexedDB database, keyed by the SHA-256 of the stored bytes. Arenas name them as `user-image:<sha256>`. With no image-management screen yet, images that no saved arena or draft uses are deleted when an arena is saved or deleted, or a draft is discarded.

Differences from V2: there is no multi-save workspace, `.vpg` backup or Save Data screen, so player arenas exist only in this browser; the dev-server endpoint V2 kept for writing bundled arena files (unused by its UI) was not ported; the editor adds a two-press Delete for saved arenas; and the arena scene drops the meshes of a load that a newer load superseded, rather than leaving them in the scene.

## Current limits and next steps

There is no match simulation, HFSM, combat engine, fixed-timestep gameplay loop, input buffer, general save-version migration, or backup system yet. Their directories are intentional extension points. Keep simulation code deterministic and headless as it is added; see [architecture](architecture/overview.md) and [combat notes](combat/README.md).

The viewer indexes character GLBs directly inside `public/assets/characters/models/` and animation GLBs recursively. Nested converted character models retain their original location but are not listed by the viewer, matching its existing behavior. UI and audio files are indexed separately so the menu does not preload the animation catalog.

Several menu pages referenced heading artwork that was absent. Those entries now explicitly use `null`, preserving their existing text-heading fallback while allowing asset validation to reject broken file references.

`npm run build` validates content, checks TypeScript, and builds the app with its runtime assets. `npm test` runs Vitest in Node. `npm run test:e2e` starts Vite automatically unless `PLAYWRIGHT_BASE_URL` points at an already running deployment. The combat test is marked pending until there is a playable match.

An optional `VITE_ASSET_BASE` points GLB requests to a host with the same `assets/...` layout, for example `https://cdn.example/vpg/`. The normal build uses its own copied assets and does not fall back to a repository URL. UI and audio resources always follow the app's deployment base.
