import { describe, expect, it } from "vitest";
import { arenaById, bundledArenaIds } from "@/content/arenas";
import {
  availablePreviews,
  cloneArena,
  draftFromArena,
  draftToJson,
  idProblem,
  parseDraft,
  pieceOptions,
  selectStage,
  texturesForSlot,
  unknownKeys,
} from "@/content/arenaDraft";
import { validateArena } from "@/content/arenaValidation";
import { defaultPiece, piecesFor } from "@/content/stages";
import { TEXTURE_SLOTS } from "@/content/textureSlots";

describe("idProblem", () => {
  it("requires a free id in the schema's pattern", () => {
    expect(idProblem("", [])).toMatch(/required/);
    expect(idProblem("Bad-Id", [])).toMatch(/lowercase/);
    expect(idProblem("1raw", [])).toMatch(/lowercase/);
    expect(idProblem("raw", ["raw"])).toMatch(/already exists/);
    expect(idProblem("my_arena_2", ["raw"])).toBeNull();
  });
});

describe("drafts", () => {
  it("expands the legacy shared rope colour, keeping explicit per-rope keys", () => {
    const draft = draftFromArena({
      id: "x",
      displayName: "X",
      stage: "raw_is_war",
      ringTextures: { ropeColor: "#ff0000", ropeTopColor: "#00ff00" },
    });
    expect(draft.ringTextures).toEqual({ ropeTopColor: "#00ff00", ropeMiddleColor: "#ff0000", ropeBottomColor: "#ff0000" });
  });

  it("repairs pieces that do not fit the stage", () => {
    const draft = draftFromArena({ id: "x", displayName: "X", stage: "royal_rumble", floor: "assets/not-a-floor.glb" });
    expect(draft.floor).toBe(defaultPiece("royal_rumble", "floor"));
  });

  it("re-picks the pieces when the stage changes", () => {
    const draft = draftFromArena(arenaById("raw")!);
    selectStage(draft, "royal_rumble");
    expect(draft.stage).toBe("royal_rumble");
    for (const kind of ["floor", "barricade", "outer"] as const) {
      expect(piecesFor("royal_rumble", kind)).toContain(draft[kind]);
    }
  });

  it("migrates old paths to ids without losing an alternative piece", () => {
    const draft = parseDraft({
      id: "mine", displayName: "Mine", stage: "monday_nitro",
      floor: "assets/environments/arenas/shared/models/floor/arena_floor.glb",
      barricade: "assets/environments/arenas/shared/models/barricade/barricade.glb",
      outer: "assets/environments/arenas/shared/models/outer/nitro_outer.glb",
    })!;
    expect(draftToJson(draft)).toMatchObject({ floor: "standard_floor", barricade: "standard_barricade", outer: "nitro_outer" });
    expect(pieceOptions(draft, "outer").map(({ id, displayName }) => ({ id, displayName }))).toEqual([
      { id: "standard_outer", displayName: "Standard Arena Bowl" },
      { id: "nitro_outer", displayName: "Monday Nitro Arena Bowl" },
    ]);
    expect(() => validateArena(draftToJson(draft))).not.toThrow();
  });

  it("keeps a shared named piece when moving between compatible stages", () => {
    const draft = draftFromArena(arenaById("raw")!);
    selectStage(draft, "monday_nitro");
    expect(draft).toMatchObject({ floor: "standard_floor", barricade: "standard_barricade", outer: "standard_outer" });
  });

  it("clones everything but the preview art", () => {
    const source = arenaById("raw")!;
    const clone = cloneArena(source, "raw_copy", "RAW copy");
    expect(clone).toMatchObject({ id: "raw_copy", displayName: "RAW copy", previewImage: "", stage: source.stage });
    expect(clone.ringTextures.mat_canvas).toBe(source.ringTextures!.mat_canvas);
  });

  it("drops blank values and keys no slot owns when saving", () => {
    const draft = draftFromArena(arenaById("raw")!);
    draft.ringTextures.turnbuckleBoltCoverColor = "rgba(0, 0, 0, 0)";
    draft.arenaTextures.mat_floor_ringside = "  ";
    expect(unknownKeys(draft)).toContain("turnbuckleBoltCoverColor");
    const json = draftToJson(draft);
    expect(json.ringTextures).not.toHaveProperty("turnbuckleBoltCoverColor");
    expect(json.arenaTextures).not.toHaveProperty("mat_floor_ringside");
    expect(json).not.toHaveProperty("$schema");
  });

  it.each(bundledArenaIds())("turns a clone of %s into an arena the browser store accepts", (id) => {
    const json = draftToJson(cloneArena(arenaById(id)!, `${id}_copy`, "Copy"));
    expect(() => validateArena(json)).not.toThrow();
  });
});

describe("parseDraft", () => {
  it("rejects anything that is not an object", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("draft")).toBeNull();
  });

  it("keeps an unfinished identity but repairs the arena around it", () => {
    const draft = parseDraft({ id: "", displayName: "", stage: "gone", floor: 3, ringTextures: { mat_canvas: 7, canvasColor: "#fff" } })!;
    expect(draft.id).toBe("");
    expect(draft.displayName).toBe("");
    expect(draft.stage).toBe("raw_is_war");
    expect(draft.floor).toBe(defaultPiece("raw_is_war", "floor"));
    expect(draft.ringTextures).toEqual({ canvasColor: "#fff" });
  });

  it("moves textures parked under the old ring folder to its current location", () => {
    const draft = parseDraft({
      id: "mine", displayName: "Mine", stage: "raw_is_war",
      ringTextures: { mat_rope_top: "assets/environments/arenas/shared/ring/textures/rope/rope_2.png" },
    })!;
    expect(draft.ringTextures).toEqual({ mat_rope_top: "assets/environments/ring/textures/rope/rope_2.png" });
    expect(() => validateArena(draftToJson(draft))).not.toThrow();
  });
});

describe("pickers", () => {
  it("offers each slot only art from its own folders", () => {
    for (const slot of TEXTURE_SLOTS) {
      const options = texturesForSlot(slot);
      if (!slot.folders.length) expect(options).toEqual([]);
      for (const path of options) expect(slot.folders.some((folder) => path.startsWith(`${folder}/`))).toBe(true);
    }
    expect(texturesForSlot(TEXTURE_SLOTS.find((slot) => slot.id === "canvas")!).length).toBeGreaterThan(0);
  });

  it("offers the preview thumbnails", () => {
    expect(availablePreviews()).toContain("assets/environments/arenas/shared/textures/previews/preview-rawiswar.png");
  });
});
