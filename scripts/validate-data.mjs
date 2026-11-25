import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const schemaRoot = path.join(root, "schemas");
const assetRoot = path.join(root, "public", "assets");
const ajv = new Ajv2020({ allErrors: true });
const schemas = new Map();

function* jsonFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* jsonFiles(file);
    else if (entry.name.endsWith(".json")) yield file;
  }
}

// JSON Schemas are the validation source; TypeScript interfaces describe runtime APIs.
for (const file of jsonFiles(schemaRoot)) {
  const schema = JSON.parse(readFileSync(file, "utf8"));
  schemas.set(file, schema);
  ajv.addSchema(schema, file);
}

function checkAssets(value, file, errors) {
  if (typeof value === "string" && value.startsWith("assets/")) {
    const asset = path.resolve(root, "public", value);
    if (!asset.startsWith(assetRoot + path.sep) || !existsSync(asset)) {
      errors.push(`${file}: missing runtime asset ${value}`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((child) => checkAssets(child, file, errors));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((child) => checkAssets(child, file, errors));
  }
}

const errors = [];
const domainFiles = new Map();
let count = 0;
for (const file of jsonFiles(path.join(root, "data"))) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const schemaFile = typeof data.$schema === "string" ? path.resolve(path.dirname(file), data.$schema) : "";
    if (!schemas.has(schemaFile)) {
      errors.push(`${relative}: $schema must reference a file in schemas/ relative to this JSON file`);
      continue;
    }
    const validate = ajv.getSchema(schemaFile);
    if (!validate(data)) errors.push(`${relative}: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
    else domainFiles.set(relative, data);
    checkAssets(data, relative, errors);
    count++;
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
  }
}

// Schemas check shapes; these checks catch references to missing or wrong-kind parts.
const pieces = new Map();
const modelKinds = new Set();
for (const [file, piece] of domainFiles) {
  if (!file.startsWith("data/environments/arena-parts/")) continue;
  if (path.basename(file, ".json") !== piece.id) errors.push(`${file}: part id must match its filename`);
  if (pieces.has(piece.id)) errors.push(`${file}: duplicate part id ${piece.id}`);
  const modelKind = `${piece.kind}:${piece.glb}`;
  if (modelKinds.has(modelKind)) errors.push(`${file}: duplicate ${piece.kind} model makes old saved paths ambiguous`);
  modelKinds.add(modelKind);
  pieces.set(piece.id, piece);
}

const stagesFile = "data/environments/stages.json";
const stageList = domainFiles.get(stagesFile)?.stages ?? [];
const stages = new Map();
const pieceLists = { floor: "floors", barricade: "barricades", outer: "outers" };
for (const stage of stageList) {
  if (stages.has(stage.id)) errors.push(`${stagesFile}: duplicate stage id ${stage.id}`);
  stages.set(stage.id, stage);
  for (const [kind, list] of Object.entries(pieceLists)) {
    for (const id of stage[list]) {
      if (pieces.get(id)?.kind !== kind) errors.push(`${stagesFile}: stage ${stage.id} references unknown ${kind} part ${id}`);
    }
  }
}
for (const [file, arena] of domainFiles) {
  if (!file.startsWith("data/environments/arenas/") || !arena.stage) continue;
  const stage = stages.get(arena.stage);
  if (!stage) {
    errors.push(`${file}: unknown stage ${arena.stage}`);
    continue;
  }
  for (const [kind, list] of Object.entries(pieceLists)) {
    const id = arena[kind];
    if (id === undefined) continue;
    if (pieces.get(id)?.kind !== kind) errors.push(`${file}: unknown ${kind} part ${id}`);
    else if (!stage[list].includes(id)) errors.push(`${file}: ${kind} part ${id} does not fit stage ${arena.stage}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${count} domain JSON files, their asset references and arena part compatibility.`);
}
