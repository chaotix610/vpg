# VPG

## Toolchain

This project uses **npm, Vite, Vitest, vue-tsc and Playwright** on Node. It
does not use Bun. Ignore any Bun instructions inherited from a parent
directory's CLAUDE.md, and do not migrate the project to Bun.

Use the existing `package.json` scripts:

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the Vite dev server |
| `npm test` | Run the Vitest unit suite once |
| `npx vitest run <file>` | Run selected test files |
| `npm run typecheck` | Check Vue and TypeScript types (`vue-tsc --noEmit`) |
| `npm run validate:data` | Validate `data/` JSON against `schemas/` and check asset references |
| `npm run build` | Validate data, typecheck, then build into `dist/` |
| `npm run test:e2e` | Run the Playwright tests (starts the dev server itself) |

`npm run build` copies all of `public/` (about 4 GB) into `dist/`. To check
that the app bundles without that copy, build with `copyPublicDir: false` into a
temporary directory instead of writing to `dist/`.

Start each session from [docs/HANDOFF.md](docs/HANDOFF.md).
