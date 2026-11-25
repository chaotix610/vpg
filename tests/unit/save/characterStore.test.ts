import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrestlerDocument } from "@/content/characterLook";
import {
  CHARACTERS_KEY,
  characterChanges,
  deleteCreatedWrestler,
  discardAllCharacterChanges,
  hasBundledEdit,
  isValidWrestlerDocument,
  loadSavedCharacters,
  revertBundledWrestler,
  saveWrestler,
  savedBundledEdit,
  savedCreatedById,
  savedCreatedWrestlers,
  savedCustomCharactersForViewer,
} from "@/save/characterStore";

function makeMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => {
      data.delete(k);
    },
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

function sampleWrestler(id: string, fullName: string): WrestlerDocument {
  return {
    id,
    rosterIndex: null,
    profile: {
      fullName,
      shortName: fullName.slice(0, 6),
      ringName: null,
      height: `6'1"`,
      weight: "240 lb",
      heightRaw: 13,
      weightRaw: 140,
      attributes: {
        speed: 3,
        attack: { head: 4, body: 4, arms: 4, legs: 4, flying: 4 },
        defence: { head: 4, body: 4, arms: 4, legs: 4, flying: 4 },
      },
    },
    look: {
      costumes: [
        {
          fields: {
            body_type: { label: "Build", group: "Body", value: 0 },
            ring_attire: { label: "Ring attire", group: "Attire", value: 5 },
          },
        },
      ],
    },
  };
}

describe("characterStore", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeMemoryStorage());
    loadSavedCharacters();
  });

  it("saves, reloads, lists for viewer, and deletes custom wrestlers", () => {
    const custom = sampleWrestler("created-66", "VPG HERO");
    expect(saveWrestler(custom, true, "VPG HERO created")).toBe(true);
    expect(savedCreatedWrestlers()).toHaveLength(1);
    expect(savedCreatedById("created-66")?.profile.fullName).toBe("VPG HERO");

    // Reload from localStorage
    loadSavedCharacters();
    expect(savedCreatedWrestlers()).toHaveLength(1);
    expect(savedCustomCharactersForViewer()).toEqual([
      { id: "created-66", name: "VPG HERO", custom: true },
    ]);

    expect(deleteCreatedWrestler("created-66")).toBe(true);
    expect(savedCreatedWrestlers()).toHaveLength(0);
    expect(characterChanges().length).toBeGreaterThanOrEqual(2);
  });

  it("stores and reverts bundled wrestler edits separately from created wrestlers", () => {
    const rock = sampleWrestler("the-rock", "THE ROCK CUSTOM");
    saveWrestler(rock, false, "edited the rock");
    expect(hasBundledEdit("the-rock")).toBe(true);
    expect(savedBundledEdit("the-rock")?.profile.fullName).toBe("THE ROCK CUSTOM");

    loadSavedCharacters();
    expect(hasBundledEdit("the-rock")).toBe(true);

    expect(revertBundledWrestler("the-rock")).toBe(true);
    expect(hasBundledEdit("the-rock")).toBe(false);
  });

  it("discards all saved changes and tolerates corrupt storage", () => {
    saveWrestler(sampleWrestler("created-70", "TEMP"), true, "created temp");
    discardAllCharacterChanges();
    expect(localStorage.getItem(CHARACTERS_KEY)).toBeNull();
    expect(savedCreatedWrestlers()).toHaveLength(0);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(CHARACTERS_KEY, "{not-valid-json");
    loadSavedCharacters();
    expect(savedCreatedWrestlers()).toHaveLength(0);
    warn.mockRestore();
  });

  it("validates wrestler documents for JSON import/paste", () => {
    expect(isValidWrestlerDocument(sampleWrestler("x", "VALID"))).toBe(true);
    expect(isValidWrestlerDocument({ id: "x", profile: {} })).toBe(false);
    expect(isValidWrestlerDocument(null)).toBe(false);
  });
});
