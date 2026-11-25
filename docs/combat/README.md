# Combat extension point

Add move execution, slots, damage, reversals, and grapples in `src/sim/combat/`. Put match rules, pins, rope breaks, and win conditions in `src/sim/match/`; state-machine execution belongs in `src/sim/hfsm/`.

All of these modules must run under Node without Babylon or DOM APIs. Author future definitions in `data/combat/`, validate them against `schemas/`, and add synthetic fixtures and tests under `tests/unit/sim/`. Connect the pending Playwright combat smoke test when a playable match exists.
