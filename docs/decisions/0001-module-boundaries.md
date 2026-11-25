# ADR 0001: Separate simulation from browser adapters

Status: accepted.

Gameplay needs deterministic headless tests while Babylon and Vue need browser APIs. Reserve `src/sim/` for pure rules and `src/core/` for platform-independent utilities. Put rendering, audio, input devices, content loading, and persistence in their respective adapters; `src/app/` wires them together.

The current viewer remains a rendering feature. Gameplay systems will be added when required rather than inferred from preview playback.
