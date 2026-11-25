# Create-A-Wrestler (VPG)

A proof of concept static web page for a modular character creater for Virtual Pro Grappler. The 3D wrestler is put together in Babylon.js from GLB meshes and PNG texture layers stored in this folder, and the roster comes from JSON data.

## Run it

The page loads its data with `fetch`, so it needs a local web server rather than `file://`:

```bash
cd create-a-wrestler-proof-of-concept
python3 -m http.server 8000
# then open http://localhost:8000
```

Babylon.js 9.29.0 (core and glTF loader) and the Inter / JetBrains Mono fonts come from CDNs, so the browser needs internet access.

## The three panes

1. **Stage**
   - The wrestler on a turntable.
   - Toggles for the stick figure, the 3D model, Textured or Clay, Front or Side view, bone thickness, auto-turn and the idle motion.
   - A Ring/Entrance switch in the corner.
   - Costumes 1–4 underneath.
2. **Editor**
   - **Profile:** names, height and weight, attributes, and all parameter fields.
   - **Look:** every appearance field, plus a preview of the texture atlas and its layers.
   - **Moves** and **Entrance** are shown but disabled (cursor `not-allowed`). Move data stays in the JSON.
3. **Roster**
   - 65 entries: slot 1 is `DEFAULT WRESTLER`, with every Look field on its first option. Slots 2–65 are the 64 wrestlers in game order.
   - **Add wrestler** appends a new wrestler that starts from the default. There is no slot limit.

Edits are saved in this browser (localStorage) as you make them. The **Changes** button lists them and can discard them. **Export roster** downloads every wrestler in the same shape as `_all-wrestlers.json`. In the header, **Download** saves the current wrestler as its own JSON file, and **Copy** / **Paste** move a wrestler through the clipboard.

## Folder layout

```
index.html               the page (three panes)
css/app.css              styling
js/main.js               wiring: roster, tabs, events, persistence
js/look.js               reads the manifest and turns a costume into a recipe
js/compose-core.js       texture maths with no DOM (shared with the parity check)
js/composer.js           loads layers and draws them: one atlas (starter) or one tile per slot (ROM)
js/stage.js              Babylon scene: armature, mesh assembly, stick figure
js/data.js               roster loading, saving, export
js/views.js              HTML for the panes
js/icons.js              Lucide icons (ISC licence)
assets/manifest.json     every Look field and option -> meshes, layers, colours
assets/meshes/...        GLB: bodies, swaps, heads, hair, hats
assets/textures/...      PNG layers, one folder per field
data/roster.json         roster order (default first)
data/wrestlers/*.json    one file per wrestler, plus _all-wrestlers.json
```

```text

├── index.html            the page (three panes)
├── css/                  Styling
├── js/                   
│   ├── main.js           Animation metadata
│   ├── look.js           Character definitions
│   ├── combat/           Moves, move slots, and combat configuration
│   ├── environments/     Stages, arenas, and props
│   ├── reference/        Temporary No Mercy research inputs (roster and CSVs; do not edit)
│   ├── schemas/          JSON Schema files for validating data
│   ├── settings/         User-facing and application settings
│   └── ui/               Menu and interface definitions
├── assets/               Models, textures, audio, and other runtime resources
│   ├── animations/       Move, shared, and unidentified animation assets
│   ├── characters/       Character models and related resources
│   ├── combat/           Combat-related resources
│   ├── environments/     Arena, stage, and prop resources
│   ├── settings/         Settings-related resources
│   └── ui/               Fonts, audio, controller textures, and artwork
├── docs/                 Design notes and implementation documentation
│   ├── animations/       Animation catalog and workflow notes
│   ├── characters/       Character documentation (empty locally; not in Git)
│   ├── combat/           Combat, movement, moves, and reversal specifications
│   ├── settings/         Save-system plan and storage contract
│   ├── HANDOFF.md        Current status and next steps
│   └── resource-layout.md
├── tests/                Vitest tests for data, controls, catalogs, and systems
│   ├── combat/           Combat engine, data adapters, and preview tests
│   ├── save/             Save repository, migration, image, and backup tests
│   └── browser/          Playwright production-build persistence checks
├── tools/                Vite development-server extensions and tooling
├── index.html            Vite application entry HTML
├── package.json          npm scripts and dependencies
├── vite.config.ts        Vite configuration
├── vitest.config.ts      Vitest configuration
├── playwright.config.ts  Playwright browser-test configuration
└── tsconfig.json         TypeScript configuration
```




## How the look is built

Each costume is a set of field values (`head_shape`, `ring_attire`, `boots_color_1` and so on). `js/look.js` turns those values into a recipe using `assets/manifest.json`, the same way AKI Anvil's `attirePlan` turns a costume record into slots and layers. A recipe has three parts.

### Meshes

- **Body:** Build picks a body set GLB from `meshes/bodies/`. It holds 18 parts, one per slot: pelvis, lower abdomen, upper body, neck, and each arm and leg part.
- **Mesh swaps:** Some options carry a `swap` (`pants`, `shirt`, `jacket`, `mitts`, `boots_high`, `boots_tall`, `boots_low`, `robe`, `entrance_jacket`, `entrance_vest`, `skirt`). The app then loads `meshes/swaps/<swap>-<body set>.glb`, and each node in that file replaces the slot with the same name. Swaps apply in `swapOrder`.
- **Head:** Head shape picks `meshes/heads/head-NN.glb`.
- **Hair and hats:** These are attachments on the head bone, scaled by the head shape's `fit`. Most hats hide the hair mesh (`hidesHair`).

Every part is bound rigidly to one bone of the No Mercy armature. That armature has 19 bones, the same flat roots, and the same joints as AKI Anvil, in AKI units scaled by `skeleton.unit`. Animations from that armature can therefore drive a created wrestler.

### Texture layers

- **One shared atlas:** All parts share one 512 × 512 atlas. `atlas.regions` in the manifest gives each slot its rectangle, so a layer PNG is a full-size transparent image that paints only the regions it covers.
- **Draw order:** Layers are drawn in `layerOrder`: body, face, facial hair, tattoo, ring attire, upper attire, wristbands, boots, mask, elbow pads, knee pads, gloves, front hair, hair, entrance attire, hat.
- **Colour keys:** Layers mark recolourable areas with single-channel shades:
  - **Red** `(v, 0, 0)` takes the skin tone.
  - **Green** `(0, v, 0)` takes colour 1 of the field (the hair colour on hair, front hair, facial hair and brows).
  - **Blue** `(0, 0, v)` takes colour 2.
  - Shade 170 is the colour itself, with darker below and lighter above, snapped to 16 steps like an N64 ramp.
  - Any other colour (white trim, black laces, tattoo ink) is drawn as it is.
- **Default colours:** A colour field on **Default** uses the option's `defaults` (palette indices). Colours 1–31 come from the No Mercy costume palette.

### Rules

- **Women's default top:** A women's build with Upper attire None wears style 56, like the game's default top. A singlet counts as a top already.
- **Entrance attire** only shows when the stage is set to Entrance:
  - Robes (styles 1–10) cover the upper attire.
  - Hooded robes (8–10) also cover the hat.

## Changing or adding assets

- **Replace a file:** Write over any GLB or PNG with your own and keep the path.
- **Edit the manifest:** Point an option at a different file, or add options to a field. The dropdowns follow the manifest, so a field can have as many options as you like.
- **GLB nodes:** Name each node after its slot (`left_forearm`, `head`, `hair`, `hat`, `coat`…). Use AKI units, with the wrestler facing +Z and their left on +X.
- **Regenerate:** `python3 tools/generate_assets.py` rebuilds every starter asset and the manifest. It needs numpy and Pillow. It overwrites `assets/meshes` and `assets/textures`, so keep your own files elsewhere, or change the generator.

The starter assets are original placeholder art built from simple shapes. They follow the game's field ranges so every value in the roster JSON has something to show.


