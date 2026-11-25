import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import arenaSchema from "../../../schemas/arenas.schema.json";
import stagesSchema from "../../../schemas/stages.schema.json";
import stagesFile from "#data/environments/stages.json";
import { type ArenaData, arenaById, arenaParts, availableArenas, publishUserArenas } from "@/content/arenas";
import { missingAssets } from "@/content/assets";
import { arenaPieceById } from "@/content/arenaPieces";
import { defaultPiece, piecesFor, pieceFitsStage, stageById } from "@/content/stages";
import { colorTargets, pathBelongsToSlot, slotById, slotSections } from "@/content/textureSlots";

const arenaDir = fileURLToPath(new URL("../../../data/environments/arenas/", import.meta.url));
const arenaFiles = readdirSync(arenaDir).filter((file) => file.endsWith(".json"));
const readArena = (file: string) => JSON.parse(readFileSync(`${arenaDir}${file}`, "utf8")) as ArenaData;

function assetReferences(value: unknown): string[] {
  if (typeof value === "string") return value.startsWith("assets/") ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(assetReferences);
  if (value && typeof value === "object") return Object.values(value).flatMap(assetReferences);
  return [];
}

describe("bundled arena data", () => {
  const validate = new Ajv2020({ allErrors: true }).compile(arenaSchema);

  it("validates the stage list", () => {
    const check = new Ajv2020().compile(stagesSchema);
    expect(check(stagesFile), JSON.stringify(check.errors)).toBe(true);
  });

  it.each(arenaFiles)("validates %s and its stage compatibility", (file) => {
    const arena = readArena(file);
    expect(validate(arena), JSON.stringify(validate.errors)).toBe(true);
    expect(arena.id).toBe(file.replace(/\.json$/, ""));
    expect(stageById(arena.stage!)).not.toBeNull();
    for (const kind of ["floor", "barricade", "outer"] as const) {
      if (arena[kind]) expect(pieceFitsStage(arena.stage!, kind, arena[kind]!)).toBe(true);
    }
  });

  it("discovers every authored arena through the runtime loader", () => {
    expect(arenaFiles.length).toBeGreaterThan(0);
    expect(availableArenas({ includeHidden: true })).toHaveLength(arenaFiles.length);
    expect(availableArenas().every((arena) => !arena.custom)).toBe(true);
  });

  it("resolves every arena and stage asset reference through the runtime index", () => {
    const refs = [...assetReferences(stagesFile), ...arenaFiles.flatMap((file) => assetReferences(readArena(file)))];
    expect(refs.length).toBeGreaterThan(0);
    expect(missingAssets(refs)).toEqual([]);
  });
});

describe("arenaParts", () => {
  it("fills unnamed pieces from the stage defaults and loads the stage last", () => {
    const parts = arenaParts({ id: "x", displayName: "X", stage: "monday_nitro" }).map((part) => part.glb);
    expect(parts).toEqual([
      arenaPieceById(defaultPiece("monday_nitro", "floor"))!.glb,
      arenaPieceById(defaultPiece("monday_nitro", "barricade"))!.glb,
      arenaPieceById(defaultPiece("monday_nitro", "outer"))!.glb,
      stageById("monday_nitro")!.glb,
    ]);
  });

  it("resolves a named alternative and its old saved GLB path to the same model", () => {
    const base = { id: "x", displayName: "X", stage: "monday_nitro" };
    const glb = "assets/environments/arenas/shared/models/outer/nitro_outer.glb";
    const named = arenaParts({ ...base, outer: "nitro_outer" });
    expect(named[2]).toEqual({ glb, position: [0, 0, 0], rotation: [0, 0, 0] });
    expect(arenaParts({ ...base, outer: glb })).toEqual(named);
  });

  it("normalises the legacy spellings", () => {
    expect(arenaParts({ id: "x", displayName: "X", arenaGlb: "a.glb" })).toEqual([
      { glb: "a.glb", position: [0, 0, 0], rotation: [0, 0, 0] },
    ]);
    expect(
      arenaParts({ id: "x", displayName: "X", arenaParts: ["a.glb", "", { glb: "b.glb", position: [1, 2, 3] }] }),
    ).toEqual([
      { glb: "a.glb", position: [0, 0, 0], rotation: [0, 0, 0] },
      { glb: "b.glb", position: [1, 2, 3], rotation: [0, 0, 0] },
    ]);
  });
});

describe("user arenas", () => {
  it("are listed as custom and take precedence by id", () => {
    publishUserArenas([{ id: "mine", displayName: "Aaa Mine", stage: "raw_is_war" }]);
    try {
      expect(availableArenas()[0]).toMatchObject({ id: "mine", custom: true });
      expect(arenaById("mine")?.displayName).toBe("Aaa Mine");
    } finally {
      publishUserArenas([]);
    }
    expect(arenaById("mine")).toBeNull();
  });
});

describe("stage and slot registries", () => {
  it("offers nothing for an unknown stage", () => {
    expect(piecesFor("nope", "floor")).toEqual([]);
    expect(defaultPiece("nope", "floor")).toBe("");
  });

  it("maps colour keys, including the legacy shared rope key, to materials", () => {
    expect(colorTargets("ropeTopColor")).toEqual(["mat_rope_top"]);
    expect(colorTargets("ropeColor")).toEqual(["mat_rope_top", "mat_rope_middle", "mat_rope_bottom"]);
    expect(colorTargets("unknownColor")).toEqual([]);
  });

  it("keeps _wip art out of a slot's folders", () => {
    const canvas = slotById("canvas")!;
    const folder = canvas.folders[0];
    expect(pathBelongsToSlot(canvas, `${folder}/canvas.png`)).toBe(true);
    expect(pathBelongsToSlot(canvas, `${folder}/_wip/canvas.png`)).toBe(false);
    expect(pathBelongsToSlot(canvas, "assets/elsewhere/canvas.png")).toBe(false);
  });

  it("groups slots under their section headings in order", () => {
    expect(slotSections().map((section) => section.title)).toEqual(["Ringside", "Ceiling", "Ring"]);
  });
});
