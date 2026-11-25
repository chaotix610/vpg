# VPG

Vue and Babylon workspace for Virtual Pro Grappler. The current app provides menu navigation, control mapping, saved preferences, an animation viewer, and an arena viewer and editor. The simulation directories reserve space for future game systems.

```sh
npm install
npm run dev
npm run build
npm run preview
```

```sh
npm run validate:data
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

Unit tests run in Node. Playwright has `persistence` and `combat` projects; combat is explicitly pending until gameplay exists. Production builds copy all of `public/assets/` into `dist/assets/` (currently about 4 GB). The output is self-contained and works under a deployment subpath.

Start with [the handoff](docs/HANDOFF.md) for the directory map and [the architecture](docs/architecture/overview.md) for module boundaries. JSON Schemas in `schemas/` are the authored-data validation source. Domain JSON belongs in `data/`; browser-fetchable files belong in `public/assets/` and use `assets/...` paths in content.

Blender sources, conversion inputs, local references, roster files, and placeholders belong in the gitignored `local/` tree. See [asset processing](scripts/README.md) before running conversion scripts.

Animations in `public/assets/animations/` are GLB files mapped to the VPG 2.0 skeleton rig. See [VPG Rig 2.0](docs/animations/VPG-RIG.md) for the skeleton hierarchy, bone groups, and converted animation conventions.
