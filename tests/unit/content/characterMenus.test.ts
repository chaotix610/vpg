import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_APPEARANCE_CATEGORIES,
  APPEARANCE_LEFT_CATEGORIES,
  APPEARANCE_RIGHT_CATEGORIES,
  CHARACTER_OPTIONS_ITEMS,
  FIGHTING_STYLE_NAMES,
  MOVES_CATEGORIES,
  PARAMETER_PARTS,
  clipsForMoveCategory,
  formatMoveClipName,
  moveAppearanceFocus,
  moveParameterFocus,
  type AppearanceFocus,
  type ParameterFocus,
} from "@/content/characterMenus";
import type { CharacterManifest } from "@/content/characterLook";

const CREATOR_MANIFEST_PATH = path.resolve(
  import.meta.dirname,
  "../../../public/assets/characters/creator/manifest.json",
);
const ANIMATIONS_ROOT = path.resolve(import.meta.dirname, "../../../public/assets/animations");

const manifest = JSON.parse(readFileSync(CREATOR_MANIFEST_PATH, "utf8")) as CharacterManifest;

describe("game-style character creator menus & D-Pad navigation", () => {
  it("defines the exact Character Options and 2-column Appearance structure from the mockups", () => {
    expect(CHARACTER_OPTIONS_ITEMS.map((item) => item.label)).toEqual([
      "PROFILE",
      "APPEARANCE",
      "MOVES",
      "FIGHTING STYLE",
      "PARAMETER",
      "ALLY / ENEMY",
    ]);

    expect(APPEARANCE_LEFT_CATEGORIES.map((c) => c.label)).toEqual([
      "BODY",
      "HEAD",
      "FACE",
      "HAIR",
      "FACIAL HAIR",
      "MASKS / ETC",
      "HATS / CAPS",
      "RING ATTIRE",
      "UPPER BODY",
    ]);

    expect(APPEARANCE_RIGHT_CATEGORIES.map((c) => c.label)).toEqual([
      "TATTOO",
      "GLOVES",
      "WRIST BAND",
      "ELBOW PAD",
      "KNEE PAD",
      "FEET",
      "ENTRANCE ATTIRE",
      "WEAPONS / PROPS",
    ]);

    expect(FIGHTING_STYLE_NAMES.length).toBeGreaterThanOrEqual(6);
  });

  it("maps every manifest look field cleanly across Appearance categories with no omissions or duplicates", () => {
    const manifestFields = new Set(manifest.fields.map((f) => f.name));
    const mapped: string[] = [];

    for (const cat of ALL_APPEARANCE_CATEGORIES) {
      for (const fieldName of cat.fields) {
        expect(manifestFields.has(fieldName), `unknown look field ${fieldName}`).toBe(true);
        mapped.push(fieldName);
      }
    }

    expect(new Set(mapped).size).toBe(mapped.length);
    expect(new Set(mapped)).toEqual(manifestFields);
  });

  it("navigates the 9-left / 8-right / top-right BACK Appearance hub deterministically with D-Pad", () => {
    let focus: AppearanceFocus = { zone: "left", index: 0 };

    // Up from top-left enters BACK; Down from BACK enters top-right; Left from BACK returns to top-left
    expect(moveAppearanceFocus(focus, "up")).toEqual({ zone: "back" });
    expect(moveAppearanceFocus({ zone: "back" }, "down")).toEqual({ zone: "right", index: 0 });
    expect(moveAppearanceFocus({ zone: "back" }, "left")).toEqual({ zone: "left", index: 0 });
    expect(moveAppearanceFocus({ zone: "back" }, "up")).toEqual({ zone: "right", index: 7 });

    // Vertical wrapping inside left column (0..8)
    focus = { zone: "left", index: 8 };
    expect(moveAppearanceFocus(focus, "down")).toEqual({ zone: "left", index: 0 });
    expect(moveAppearanceFocus(focus, "up")).toEqual({ zone: "left", index: 7 });

    // Cross-column left <-> right preserves visual row alignment (including gap above Entrance Attire)
    expect(moveAppearanceFocus({ zone: "left", index: 2 }, "right")).toEqual({ zone: "right", index: 2 });
    expect(moveAppearanceFocus({ zone: "left", index: 7 }, "right")).toEqual({ zone: "right", index: 6 });
    expect(moveAppearanceFocus({ zone: "left", index: 8 }, "right")).toEqual({ zone: "right", index: 7 });
    expect(moveAppearanceFocus({ zone: "right", index: 6 }, "left")).toEqual({ zone: "left", index: 7 });
    expect(moveAppearanceFocus({ zone: "right", index: 7 }, "left")).toEqual({ zone: "left", index: 8 });

    // Right from right column reaches BACK; Up from top-right reaches BACK
    expect(moveAppearanceFocus({ zone: "right", index: 3 }, "right")).toEqual({ zone: "back" });
    expect(moveAppearanceFocus({ zone: "right", index: 0 }, "up")).toEqual({ zone: "back" });
    expect(moveAppearanceFocus({ zone: "right", index: 7 }, "down")).toEqual({ zone: "right", index: 0 });
  });

  it("maps all 10 Moves categories 1:1 to real VPG Rig 2.0 animation directories", () => {
    expect(MOVES_CATEGORIES).toHaveLength(10);
    expect(MOVES_CATEGORIES.map((c) => c.label)).toEqual([
      "GRAPPLING",
      "STANDING",
      "RUNNING",
      "GROUND",
      "TURNBUCKLE",
      "RINGSIDE",
      "APRON",
      "IRISH WHIP",
      "TAUNT",
      "DOUBLE TEAM",
    ]);

    for (const cat of MOVES_CATEGORIES) {
      const dir = path.join(ANIMATIONS_ROOT, cat.prefix);
      expect(existsSync(dir), `missing animations folder for ${cat.label}: ${dir}`).toBe(true);
      const entries = readdirSync(dir);
      expect(entries.length, `empty animations folder for ${cat.label}`).toBeGreaterThan(0);
    }
  });

  it("filters move actor clips (excluding -target.glb) and formats retro move labels", () => {
    const sample = [
      "moves/grappling/front/strong/stone-cold-stunner.glb",
      "moves/grappling/front/strong/stone-cold-stunner-target.glb",
      "moves/grappling/front/weak/arm-drag.glb",
      "moves/standing/chop-01.glb",
    ];
    expect(clipsForMoveCategory(sample, "moves/grappling/")).toEqual([
      "moves/grappling/front/strong/stone-cold-stunner.glb",
      "moves/grappling/front/weak/arm-drag.glb",
    ]);

    expect(
      formatMoveClipName("moves/grappling/front/strong/stone-cold-stunner.glb", "moves/grappling/"),
    ).toBe("STONE COLD STUNNER");
    expect(formatMoveClipName("moves/taunts/taunt_04.glb", "moves/taunts/")).toBe("TAUNT 04");
  });

  it("navigates the 2-column OFFENSE / DEFENSE / BACK Parameters hub cleanly", () => {
    expect(PARAMETER_PARTS).toEqual(["head", "body", "arms", "legs", "flying"]);

    let focus: ParameterFocus = { zone: "offense", index: 0 };
    expect(moveParameterFocus(focus, "up")).toEqual({ zone: "back" });
    expect(moveParameterFocus({ zone: "back" }, "down")).toEqual({ zone: "defense", index: 0 });
    expect(moveParameterFocus({ zone: "back" }, "leftFromBack")).toEqual({ zone: "offense", index: 0 });

    // Down past Offense FLYING crosses smoothly to Defense HEAD and back
    expect(moveParameterFocus({ zone: "offense", index: 4 }, "down")).toEqual({ zone: "defense", index: 0 });
    expect(moveParameterFocus({ zone: "defense", index: 4 }, "down")).toEqual({ zone: "offense", index: 0 });

    // L/R switches column at the same stat row
    expect(moveParameterFocus({ zone: "offense", index: 2 }, "column")).toEqual({ zone: "defense", index: 2 });
    expect(moveParameterFocus({ zone: "defense", index: 3 }, "column")).toEqual({ zone: "offense", index: 3 });
  });
});
