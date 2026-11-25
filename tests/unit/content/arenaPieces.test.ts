import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import partSchema from "../../../schemas/arena-parts.schema.json";
import arenaSchema from "../../../schemas/arenas.schema.json";
import stagesSchema from "../../../schemas/stages.schema.json";
import stagesFile from "#data/environments/stages.json";
import { arenaPieceById, resolveArenaPiece, type ArenaPieceData } from "@/content/arenaPieces";
import { isKnownModel } from "@/content/assets";
import { availableStages, piecesFor } from "@/content/stages";

const modules = import.meta.glob("../../../data/environments/arena-parts/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ArenaPieceData>;

describe("named arena parts", () => {
  const validate = new Ajv2020().compile(partSchema);

  it.each(Object.entries(modules))("validates %s and resolves its model in a production asset index", (file, piece) => {
    expect(validate(piece), JSON.stringify(validate.errors)).toBe(true);
    expect(file.split("/").pop()).toBe(`${piece.id}.json`);
    expect(arenaPieceById(piece.id)).toMatchObject({ displayName: piece.displayName, kind: piece.kind, glb: piece.glb });
    expect(isKnownModel(piece.glb)).toBe(true);
  });

  it("requires a readable name, a supported kind and a model path", () => {
    const piece = arenaPieceById("standard_floor")!;
    for (const invalid of [{ ...piece, displayName: "  " }, { ...piece, kind: "anything" }, { ...piece, glb: "standard_floor" }]) {
      expect(validate(invalid)).toBe(false);
    }
  });

  it("resolves every stage option to a part of the right kind", () => {
    for (const stage of availableStages()) {
      for (const kind of ["floor", "barricade", "outer"] as const) {
        for (const id of piecesFor(stage.id, kind)) {
          expect(arenaPieceById(id)?.kind).toBe(kind);
        }
      }
    }
  });

  it("rejects missing parts and references to a different kind", () => {
    expect(arenaPieceById("missing")).toBeNull();
    expect(resolveArenaPiece("floor", "missing")).toBeNull();
    expect(resolveArenaPiece("floor", "standard_barricade")).toBeNull();
    expect(resolveArenaPiece("floor", arenaPieceById("standard_barricade")!.glb)).toBeNull();
  });

  it("requires authored arenas and stage options to use ids", () => {
    const arena = new Ajv2020().compile(arenaSchema);
    const stage = new Ajv2020().compile(stagesSchema);
    const base = { id: "mine", displayName: "Mine", stage: "raw_is_war" };
    expect(arena({ ...base, floor: "standard_floor" })).toBe(true);
    expect(arena({ ...base, floor: arenaPieceById("standard_floor")!.glb })).toBe(false);
    const invalid = structuredClone(stagesFile);
    invalid.stages[0].floors = [arenaPieceById("standard_floor")!.glb];
    expect(stage(invalid)).toBe(false);
  });
});
