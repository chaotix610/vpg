# Settings and persistence

`data/settings/control-mappings.json` provides default keyboard bindings. Its `$schema` resolves to `schemas/control-mappings.schema.json`. Logical controls and device mapping live in `src/input/`.

Bindings remain saved under `vpg-control-mappings`; audio preferences remain under `vpg-audio`. The rename preserves these storage keys and existing saves. Bootstrap hydrates both before Vue mounts. `src/save/storage.ts` handles browser JSON access and tolerates blocked storage or corrupt JSON; each settings module validates and merges its own saved values.

An explicitly empty binding list remains unbound when defaults change. Missing controls receive current defaults. Repository migrations, backups, and a full save coordinator are future additions under `src/save/`.
