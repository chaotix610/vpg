# Scripts

`npm run validate:data` checks every JSON file under `data/` against its declared schema and verifies runtime asset references. Run this after editing domain JSON; the production build runs it automatically.

Blender scripts and the `vpg_glb_tools.py` add-on live in `scripts/blender/`. Run conversion commands from the repository root. They require Blender's Python environment.

```sh
blender --background --factory-startup --python scripts/blender/convert_n64_to_vpg.py -- [FILE.glb ...]
blender --background --factory-startup --python scripts/blender/convert_quaternius_to_vpg.py
blender --background --factory-startup --python scripts/blender/replace_hands.py -- [FILE.glb ...]
```

N64 conversion defaults to input GLBs in `local/characters/conversion-jobs/` and exports to `public/assets/characters/models/`. Quaternius conversion reads `local/characters/quarternius/` and exports under `public/assets/characters/models/quarternius/`. Both use the runtime mannequin template. Hand replacement uses the runtime `aki-man.glb` donor and rewrites explicit targets unless `--out` is supplied. Existing outputs may be overwritten, as described in each script's usage text.

Blender source files are preserved under ignored `local/blender/`, including the former model-directory source at `local/blender/characters/aki-man.blend`. Keep No Mercy reference CSVs in `local/references/`, roster files in `local/roster/`, and experimental placeholder files in `local/placeholders/`. None are build inputs. Commit only the intended runtime exports and authored domain data.
