# Combat extension point

Add move execution, slots, damage, reversals, and grapples in `src/sim/combat/`. Put match rules, pins, rope breaks, and win conditions in `src/sim/match/`; state-machine execution belongs in `src/sim/hfsm/`.

All of these modules must run under Node without Babylon or DOM APIs. Author future definitions in `data/combat/`, validate them against `schemas/`, and add synthetic fixtures and tests under `tests/unit/sim/`. Connect the pending Playwright combat smoke test when a playable match exists.

`data/combat/MOVE-SLOTS.json` declares the [move slot schema](../../schemas/move-slots.schema.json) (version 2), and `data/combat/MOVES.json` declares the [move catalog schema](../../schemas/moves.schema.json) (version 3). Run `npm run validate:data` after editing either catalog.

The move catalog preserves its imported string encoding: `ko` and `bleed` use `"true"` / `"false"`, absent values use `"null"`, and `groups` / `slot_ids` are comma-separated strings. Animation ids are GLB filenames or `"null"`; `slot_animation_overrides` is empty or a semicolon-separated list of `slot_id:animation_id` pairs. Slot input patterns use JSON booleans and nulls.
