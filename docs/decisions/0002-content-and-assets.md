# ADR 0002: JSON Schema source and public runtime assets

Status: accepted.

Use handwritten JSON Schemas in `schemas/` as the validation source for authored domain data. Standardize on draft 2020-12 and validate all `data/**/*.json` during builds with Ajv. TypeScript interfaces describe runtime APIs; do not introduce a second TypeScript validation schema system. See [Ajv's schema support](https://ajv.js.org/json-schema).

Keep exported runtime files under `public/assets/`, with browser paths starting at `assets/`. Vite copies them unchanged, keeping the app deployable without the source checkout or a hardcoded repository fallback. The cost is a large build output; GLBs are fetched only when selected. An explicit `VITE_ASSET_BASE` can host GLBs elsewhere.

Keep Blender authoring files and conversion inputs under ignored `local/`, conversion scripts under `scripts/`, and Vite plugins under `tools/`.
