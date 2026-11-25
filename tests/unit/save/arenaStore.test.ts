import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { arenaById, availableArenas, publishUserArenas } from "@/content/arenas";
import { cloneArena } from "@/content/arenaDraft";
import {
  ARENAS_KEY,
  DRAFT_KEY,
  clearDraft,
  deleteArena,
  imagesInUse,
  loadSavedArenas,
  readDraft,
  saveArena,
  savedArenas,
  writeDraft,
} from "@/save/arenaStore";

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  loadSavedArenas();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  publishUserArenas([]);
});

const mine = (id = "mine") => ({ id, displayName: "Mine", stage: "raw_is_war" });
const IMAGE = "b".repeat(64);
const legacy = () => ({
  ...mine(), stage: "monday_nitro",
  floor: "assets/environments/arenas/shared/models/floor/arena_floor.glb",
  barricade: "assets/environments/arenas/shared/models/barricade/barricade.glb",
  outer: "assets/environments/arenas/shared/models/outer/nitro_outer.glb",
});
const namedPieces = { floor: "standard_floor", barricade: "standard_barricade", outer: "nitro_outer" };

it("saves, lists and reloads an arena", () => {
  expect(saveArena(mine(), new Set())).toEqual({ created: true });
  expect(saveArena({ ...mine(), displayName: "Renamed" }, new Set())).toEqual({ created: false });
  expect(arenaById("mine")?.displayName).toBe("Renamed");
  expect(availableArenas().find((arena) => arena.id === "mine")?.custom).toBe(true);

  publishUserArenas([]);
  loadSavedArenas();
  expect(savedArenas().map((arena) => arena.id)).toEqual(["mine"]);
});

it("migrates old saved paths to ids on startup without changing other arena settings", () => {
  const arena = { ...legacy(), hidden: true, ringTextures: { ropeColor: "#f00", mat_canvas: `user-image:${IMAGE}` } };
  const write = vi.spyOn(localStorage, "setItem");
  store.set(ARENAS_KEY, JSON.stringify({ version: 1, arenas: [arena, mine("other")] }));
  loadSavedArenas();
  expect(savedArenas()[0]).toEqual({ ...arena, ...namedPieces });
  expect(JSON.parse(store.get(ARENAS_KEY)!)).toEqual({
    version: 1, arenas: [{ ...arena, ...namedPieces }, mine("other")],
  });
  loadSavedArenas();
  expect(arenaById("mine")?.outer).toBe("nitro_outer");
  expect(write).toHaveBeenCalledTimes(1);
});

it("moves textures saved under the old ring folder to its current location", () => {
  const arena = {
    ...mine(),
    ringTextures: {
      mat_canvas: "assets/environments/arenas/shared/ring/textures/canvas/canvas_raw.png",
      mat_apron: `user-image:${IMAGE}`,
      canvasColor: "#fff",
    },
  };
  const current = { ...arena, ringTextures: { ...arena.ringTextures, mat_canvas: "assets/environments/ring/textures/canvas/canvas_raw.png" } };
  const write = vi.spyOn(localStorage, "setItem");
  store.set(ARENAS_KEY, JSON.stringify({ version: 1, arenas: [arena] }));
  loadSavedArenas();
  expect(savedArenas()).toEqual([current]);
  expect(JSON.parse(store.get(ARENAS_KEY)!).arenas).toEqual([current]);
  loadSavedArenas();
  expect(write).toHaveBeenCalledTimes(1);
});

it("normalizes references on save without mutating the supplied arena", () => {
  const arena = legacy();
  saveArena(arena, new Set());
  expect(JSON.parse(store.get(ARENAS_KEY)!).arenas[0]).toEqual({ ...arena, ...namedPieces });
  expect(arena.outer).toBe("assets/environments/arenas/shared/models/outer/nitro_outer.glb");
  expect(arenaById("mine")?.outer).toBe("nitro_outer");
});

it("does not rewrite saves that already use ids or omit optional pieces", () => {
  const write = vi.spyOn(localStorage, "setItem");
  const stored = JSON.stringify({ version: 1, arenas: [{ ...legacy(), ...namedPieces }, mine("other")] });
  store.set(ARENAS_KEY, stored);
  loadSavedArenas();
  expect(write).not.toHaveBeenCalled();
  expect(store.get(ARENAS_KEY)).toBe(stored);
  expect(savedArenas()[1]).not.toHaveProperty("floor");
});

it("preserves skipped records in storage while migrating valid arenas", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const invalid = { ...legacy(), id: "broken", floor: "missing_floor" };
  store.set(ARENAS_KEY, JSON.stringify({ version: 1, arenas: [legacy(), invalid, null] }));
  loadSavedArenas();
  expect(savedArenas()).toEqual([{ ...legacy(), ...namedPieces }]);
  expect(JSON.parse(store.get(ARENAS_KEY)!).arenas).toEqual([{ ...legacy(), ...namedPieces }, invalid, null]);
});

it("keeps arenas usable if migration cannot write and retries on the next load", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const stored = JSON.stringify({ version: 1, arenas: [legacy()] });
  store.set(ARENAS_KEY, stored);
  const write = vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  expect(() => loadSavedArenas()).not.toThrow();
  expect(arenaById("mine")).toEqual({ ...legacy(), ...namedPieces });
  expect(store.get(ARENAS_KEY)).toBe(stored);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("Could not store migrated arena references"));

  loadSavedArenas();
  expect(JSON.parse(store.get(ARENAS_KEY)!).arenas[0]).toEqual({ ...legacy(), ...namedPieces });
  expect(write).toHaveBeenCalledTimes(2);
});

it("refuses bundled ids and invalid arenas without writing", () => {
  expect(() => saveArena({ ...mine(), id: "raw" }, new Set())).toThrow(/bundled/);
  expect(() => saveArena({ ...mine(), stage: "nowhere" }, new Set())).toThrow(/Unknown stage/);
  expect(store.has(ARENAS_KEY)).toBe(false);
});

it("reports a failed write instead of losing the arena silently", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
    removeItem: () => {},
  });
  expect(() => saveArena(mine(), new Set())).toThrow(/storage is full/);
  expect(arenaById("mine")).toBeNull();
});

it("skips stored arenas that no longer validate or collide", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  store.set(ARENAS_KEY, JSON.stringify({ version: 1, arenas: [mine("good"), mine("good"), { ...mine("raw") }, { ...mine("bad"), stage: "gone" }] }));
  loadSavedArenas();
  expect(savedArenas().map((arena) => arena.id)).toEqual(["good"]);
  expect(warn).toHaveBeenCalledTimes(3);
});

it("accepts saved imported-image references before the library loads", () => {
  const arena = { ...mine(), ringTextures: { mat_canvas: `user-image:${IMAGE}` } };
  expect(() => saveArena(arena, new Set())).toThrow(/no longer stored/);
  saveArena(arena, new Set([IMAGE]));
  loadSavedArenas();
  expect(savedArenas()).toHaveLength(1);
  expect(imagesInUse()).toEqual(new Set([IMAGE]));
});

it("deletes an arena", () => {
  saveArena(mine(), new Set());
  deleteArena("mine");
  expect(arenaById("mine")).toBeNull();
  expect(() => deleteArena("mine")).toThrow(/No saved arena/);
});

it("parks and recovers a draft, resuming a deleted arena's draft as a new one", () => {
  const draft = cloneArena(arenaById("raw")!, "mine", "Mine");
  draft.arenaTextures.mat_floor_ringside = `user-image:${IMAGE}`;
  expect(writeDraft({ editingId: null, draft })).toBe(true);
  expect(readDraft()).toEqual({ editingId: null, draft });
  expect(imagesInUse()).toEqual(new Set([IMAGE]));

  writeDraft({ editingId: "mine", draft });
  expect(readDraft()?.editingId).toBeNull();
  saveArena(mine(), new Set());
  expect(readDraft()?.editingId).toBe("mine");

  clearDraft();
  expect(store.has(DRAFT_KEY)).toBe(false);
  expect(readDraft()).toBeNull();
});
