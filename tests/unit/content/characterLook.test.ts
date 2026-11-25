import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CharacterLookBook,
  composeSlots,
  decodeIndexedPng,
  dressedSlots,
  filesForPlan,
  heightInches,
  heightScaleFor,
  heightText,
  paletteBytes,
  pictureOf,
  planCostume,
  rgba5551,
  tileRgba,
  weightPounds,
  weightText,
  type CharacterManifest,
  type PicturePayload,
  type WrestlerDocument,
} from "@/content/characterLook";

const CREATOR_ROOT = path.resolve(import.meta.dirname, "../../../public/assets/characters/creator");

const manifest = JSON.parse(readFileSync(path.join(CREATOR_ROOT, "manifest.json"), "utf8")) as CharacterManifest;
const palettesJson = JSON.parse(readFileSync(path.join(CREATOR_ROOT, "palettes.json"), "utf8")) as {
  palettes: Record<string, string>;
};
const loadWrestler = (id: string): WrestlerDocument =>
  JSON.parse(readFileSync(path.join(CREATOR_ROOT, "wrestlers", `${id}.json`), "utf8")) as WrestlerDocument;

describe("character look planning & tile composition", () => {
  it("formats heights, weights, and visual height scales", () => {
    expect(heightText(13)).toBe(`6'1"`);
    expect(heightText(38)).toBe("tall");
    expect(heightInches(13)).toBe(73);
    expect(heightScaleFor(13)).toBeCloseTo(1, 5);
    expect(heightScaleFor(0)).toBeCloseTo(0.8219, 3);
    expect(heightScaleFor(35)).toBe(1.25);

    expect(weightText(140)).toBe("240 lb");
    expect(weightText(501)).toBe("heavy");
    expect(weightPounds(140)).toBe(240);
    expect(weightPounds(502)).toBe(380);
  });

  it("enforces women's default top rule and clamps male/female head & hair ranges", () => {
    const look = new CharacterLookBook(manifest);
    const doc = loadWrestler("default");
    const costume = look.normalise(structuredClone(doc.look.costumes[0]));

    // Find a women's build type
    const femaleBuild = manifest.tables.typeToSet.findIndex((set) => set >= manifest.tables.femaleFromSet);
    expect(femaleBuild).toBeGreaterThanOrEqual(0);

    look.setValue(costume, "body_type", femaleBuild);
    look.setValue(costume, "upper_attire", 0);
    expect(costume.female).toBe(true);

    const recipe = look.recipe(costume, { entrance: false });
    expect(recipe.female).toBe(true);
    expect(recipe.plan.upper).toBe(manifest.rules.womenUpperDefault);
    expect(recipe.notes.some((n) => n.includes(`style ${manifest.rules.womenUpperDefault}`))).toBe(true);

    // Switching back to male build clamps head_shape and hair_type back into male ranges
    look.setValue(costume, "body_type", 0);
    expect(costume.female).toBe(false);
    const [headMin, headMax] = look.range(costume, look.field("head_shape")!);
    expect(look.value(costume, "head_shape")).toBeGreaterThanOrEqual(headMin);
    expect(look.value(costume, "head_shape")).toBeLessThanOrEqual(headMax);
  });

  it("plans and composes real indexed-PNG slot tiles for bundled wrestlers", async () => {
    const look = new CharacterLookBook(manifest);
    const rock = loadWrestler("the-rock");
    const costume = look.normalise(structuredClone(rock.look.costumes[0]));
    const plan = planCostume(manifest, look.record(costume), { entrance: false });
    const dressed = dressedSlots(manifest, plan);

    expect(dressed.length).toBeGreaterThanOrEqual(18);

    const needed = filesForPlan(manifest, plan);
    expect(needed.pictures.length).toBeGreaterThan(0);
    expect(needed.palettes.length).toBeGreaterThan(0);

    const pictures = new Map<number, PicturePayload>();
    for (const id of needed.pictures) {
      const entry = manifest.pictures[String(id)];
      expect(entry, `manifest picture ${id}`).toBeDefined();
      const pngBytes = new Uint8Array(readFileSync(path.join(CREATOR_ROOT, entry.src)));
      pictures.set(id, pictureOf(entry, await decodeIndexedPng(pngBytes)));
    }
    const palettes = new Map<number, Uint8Array>();
    for (const id of needed.palettes) {
      const hex = palettesJson.palettes[String(id)];
      expect(hex, `palette ${id}`).toBeDefined();
      palettes.set(id, paletteBytes(hex));
    }

    const tiles = composeSlots(manifest, plan, {
      picture: (id) => pictures.get(id)!,
      palette: (id) => palettes.get(id)!,
    });

    // Every dressed slot should have a composed RGBA tile with visible pixels
    for (const entry of dressed) {
      const tile = tiles[entry.slot];
      expect(tile, `composed tile for slot ${entry.slot}`).toBeDefined();
      const rgba = tileRgba(tile);
      expect(rgba.length).toBe(tile.width * tile.height * 4);
      let opaque = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 255) opaque += 1;
      expect(opaque).toBeGreaterThan(0);
    }
  });

  it("widens N64 RGBA5551 words accurately", () => {
    // Opaque white: 0xFFFF -> 0xFFFFFFFF
    expect(rgba5551(0xffff)).toBe(0xffffffff);
    // Transparent black: 0x0000 -> 0x00000000
    expect(rgba5551(0x0000)).toBe(0x00000000);
    // Opaque pure red: (31 << 11) | 1 = 0xF801 -> 0xFF0000FF
    expect(rgba5551(0xf801)).toBe(0xff0000ff);
  });
});
