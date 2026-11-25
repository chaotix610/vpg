import { describe, expect, it } from "vitest";
import { validateArena } from "@/content/arenaValidation";

const base = () => ({
  id: "mine",
  displayName: "Mine",
  stage: "raw_is_war",
  ringTextures: {
    mat_canvas: "assets/environments/ring/textures/canvas/canvas.png",
    canvasColor: "rgba(10, 20, 30, 0.5)",
  } as Record<string, string>,
});

const IMAGE = "a".repeat(64);

describe("validateArena", () => {
  it("accepts an editor-shaped arena", () => {
    expect(() => validateArena({ ...base(), floor: "standard_floor", barricade: "standard_barricade", outer: "standard_outer" })).not.toThrow();
    expect(() => validateArena(base())).not.toThrow();
  });

  it.each([
    ["a non-object", null, /object/],
    ["an unknown field", { ...base(), arenaGlb: "x.glb" }, /Unsupported arena field/],
    ["a bad id", { ...base(), id: "Mine" }, /lowercase/],
    ["a blank name", { ...base(), displayName: "  " }, /display name/],
    ["no stage", { ...base(), stage: undefined }, /stage/],
    ["an unknown stage", { ...base(), stage: "nowhere" }, /Unknown stage/],
    ["a piece from another stage", { ...base(), floor: "assets/environments/arenas/shared/models/floor/royal_rumble_floor.glb" }, /does not fit/],
    ["a named piece from another stage", { ...base(), floor: "royal_rumble_floor" }, /does not fit/],
    ["an unknown named piece", { ...base(), floor: "missing_floor" }, /Unknown floor part/],
    ["a named piece of the wrong kind", { ...base(), floor: "standard_barricade" }, /Unknown floor part/],
    ["a non-string part", { ...base(), floor: 7 }, /Unknown floor part/],
    ["an unshipped preview", { ...base(), previewImage: "assets/none.png" }, /Preview/],
  ])("rejects %s", (_label, arena, error) => {
    expect(() => validateArena(arena)).toThrow(error);
  });

  it("rejects texture keys, colours and paths the slots do not allow", () => {
    const withRing = (ringTextures: Record<string, string>) => ({ ...base(), ringTextures });
    expect(() => validateArena(withRing({ mat_unknown: "x" }))).toThrow(/Unsupported texture slot/);
    expect(() => validateArena(withRing({ canvasColor: "rgba(300, 0, 0)" }))).toThrow(/colour/);
    expect(() => validateArena(withRing({ canvasColor: "rgba(0, 0, 0, 1.0)" }))).toThrow(/colour/);
    expect(() => validateArena(withRing({ mat_canvas: "assets/environments/ring/textures/apron/apron_raw.png" }))).toThrow(
      /belong/,
    );
    // The legacy shared rope colour is still a ring key, but not an arena key.
    expect(() => validateArena(withRing({ ropeColor: "#fff" }))).not.toThrow();
    expect(() => validateArena({ ...base(), arenaTextures: { ropeColor: "#fff" } })).toThrow(/Unsupported/);
  });

  it("accepts imported images only from the given library", () => {
    const arena = { ...base(), ringTextures: { mat_canvas: `user-image:${IMAGE}` } };
    expect(() => validateArena(arena)).toThrow(/no longer stored/);
    expect(() => validateArena(arena, new Set([IMAGE]))).not.toThrow();
    expect(() => validateArena(arena, "any")).not.toThrow();
    expect(() => validateArena({ ...base(), ringTextures: { mat_canvas: "user-image:short" } }, "any")).toThrow(/malformed/);
  });
});
