import type { StageViewPreset } from "@/render/character/CharacterStage";

/**
 * Pure menu hierarchy and D-Pad navigation layout for VPG's game-style
 * Character Creator (matching the console mockups).
 *
 * Kept free of Vue and Babylon so every menu path, category mapping, and
 * 2D D-Pad transition can be unit-tested deterministically.
 */

export type CharacterOptionId =
  | "profile"
  | "appearance"
  | "moves"
  | "fightingStyle"
  | "parameter"
  | "allyEnemy";

export interface CharacterOptionEntry {
  readonly id: CharacterOptionId;
  readonly label: string;
}

export const CHARACTER_OPTIONS_ITEMS: readonly CharacterOptionEntry[] = [
  { id: "profile", label: "PROFILE" },
  { id: "appearance", label: "APPEARANCE" },
  { id: "moves", label: "MOVES" },
  { id: "fightingStyle", label: "FIGHTING STYLE" },
  { id: "parameter", label: "PARAMETER" },
  { id: "allyEnemy", label: "ALLY / ENEMY" },
] as const;

export type AppearanceCategoryId =
  | "body"
  | "head"
  | "face"
  | "hair"
  | "facial_hair"
  | "masks_etc"
  | "hats_caps"
  | "ring_attire"
  | "upper_body"
  | "tattoo"
  | "gloves"
  | "wristband"
  | "elbow_pad"
  | "knee_pad"
  | "feet"
  | "entrance_attire"
  | "weapons_props";

export interface AppearanceCategorySpec {
  readonly id: AppearanceCategoryId;
  readonly label: string;
  readonly column: "left" | "right";
  /** Row index inside its column (0..8 left, 0..7 right). */
  readonly row: number;
  /** Visual spacing break above this item (right column: Entrance Attire sits below a gap). */
  readonly gapBefore?: boolean;
  /** Look field names from manifest.json edited in this category. */
  readonly fields: readonly string[];
  /** Suggested camera framing when editing this category. */
  readonly camera: StageViewPreset;
  /** Switches preview into Entrance attire while editing. */
  readonly entrance?: boolean;
}

export const APPEARANCE_LEFT_CATEGORIES: readonly AppearanceCategorySpec[] = [
  { id: "body", label: "BODY", column: "left", row: 0, fields: ["body_type", "skin_color"], camera: "front" },
  { id: "head", label: "HEAD", column: "left", row: 1, fields: ["head_shape"], camera: "head" },
  { id: "face", label: "FACE", column: "left", row: 2, fields: ["face_number"], camera: "head" },
  { id: "hair", label: "HAIR", column: "left", row: 3, fields: ["hair_type", "hair_color", "front_hair"], camera: "head" },
  { id: "facial_hair", label: "FACIAL HAIR", column: "left", row: 4, fields: ["facial_hair"], camera: "head" },
  { id: "masks_etc", label: "MASKS / ETC", column: "left", row: 5, fields: ["masks_etc"], camera: "head" },
  { id: "hats_caps", label: "HATS / CAPS", column: "left", row: 6, fields: ["hats_caps", "hats_caps_color"], camera: "head" },
  {
    id: "ring_attire",
    label: "RING ATTIRE",
    column: "left",
    row: 7,
    fields: ["ring_attire", "ring_attire_color_1", "ring_attire_color_2"],
    camera: "front",
  },
  {
    id: "upper_body",
    label: "UPPER BODY",
    column: "left",
    row: 8,
    fields: ["upper_attire", "upper_attire_color_1", "upper_attire_color_2"],
    camera: "front",
  },
] as const;

export const APPEARANCE_RIGHT_CATEGORIES: readonly AppearanceCategorySpec[] = [
  { id: "tattoo", label: "TATTOO", column: "right", row: 0, fields: ["tattoo"], camera: "front" },
  { id: "gloves", label: "GLOVES", column: "right", row: 1, fields: ["gloves", "gloves_color"], camera: "front" },
  { id: "wristband", label: "WRIST BAND", column: "right", row: 2, fields: ["wristband", "wristband_color"], camera: "front" },
  {
    id: "elbow_pad",
    label: "ELBOW PAD",
    column: "right",
    row: 3,
    fields: ["left_elbow_pad", "left_elbow_pad_color", "right_elbow_pad", "right_elbow_pad_color"],
    camera: "front",
  },
  {
    id: "knee_pad",
    label: "KNEE PAD",
    column: "right",
    row: 4,
    fields: ["left_knee_pad", "left_knee_pad_color", "right_knee_pad", "right_knee_pad_color"],
    camera: "front",
  },
  {
    id: "feet",
    label: "FEET",
    column: "right",
    row: 5,
    fields: ["boots", "boots_color_1", "boots_color_2"],
    camera: "feet",
  },
  {
    id: "entrance_attire",
    label: "ENTRANCE ATTIRE",
    column: "right",
    row: 6,
    gapBefore: true,
    fields: ["entrance_attire", "entrance_attire_color_1", "entrance_attire_color_2"],
    camera: "front",
    entrance: true,
  },
  {
    id: "weapons_props",
    label: "WEAPONS / PROPS",
    column: "right",
    row: 7,
    fields: [],
    camera: "front",
  },
] as const;

export const ALL_APPEARANCE_CATEGORIES: readonly AppearanceCategorySpec[] = [
  ...APPEARANCE_LEFT_CATEGORIES,
  ...APPEARANCE_RIGHT_CATEGORIES,
];

export type AppearanceFocus =
  | { zone: "left"; index: number }
  | { zone: "right"; index: number }
  | { zone: "back" };

/**
 * Deterministic 2D D-Pad transitions across the 9-left / 8-right / top-right BACK
 * Appearance Hub (matching Mockups 4, 5, 6).
 */
export function moveAppearanceFocus(
  current: AppearanceFocus,
  dir: "up" | "down" | "left" | "right",
): AppearanceFocus {
  const leftCount = APPEARANCE_LEFT_CATEGORIES.length; // 9
  const rightCount = APPEARANCE_RIGHT_CATEGORIES.length; // 8

  if (current.zone === "back") {
    if (dir === "down") return { zone: "right", index: 0 };
    if (dir === "left") return { zone: "left", index: 0 };
    if (dir === "up") return { zone: "right", index: rightCount - 1 };
    return current;
  }

  if (current.zone === "left") {
    if (dir === "up") {
      return current.index === 0 ? { zone: "back" } : { zone: "left", index: current.index - 1 };
    }
    if (dir === "down") {
      return { zone: "left", index: (current.index + 1) % leftCount };
    }
    if (dir === "right") {
      // Map rows 0..8 cleanly onto 0..7 (rows 7..8 align with Entrance Attire & Weapons/Props).
      const mapped = current.index <= 5 ? current.index : Math.min(rightCount - 1, current.index - 1);
      return { zone: "right", index: mapped };
    }
    return current;
  }

  // current.zone === "right"
  if (dir === "up") {
    return current.index === 0 ? { zone: "back" } : { zone: "right", index: current.index - 1 };
  }
  if (dir === "down") {
    return { zone: "right", index: (current.index + 1) % rightCount };
  }
  if (dir === "left") {
    const mapped = current.index <= 5 ? current.index : Math.min(leftCount - 1, current.index + 1);
    return { zone: "left", index: mapped };
  }
  if (dir === "right") {
    return { zone: "back" };
  }
  return current;
}

export const PARAMETER_PARTS = ["head", "body", "arms", "legs", "flying"] as const;
export type ParameterPart = (typeof PARAMETER_PARTS)[number];

export type ParameterFocus =
  | { zone: "offense"; index: number }
  | { zone: "defense"; index: number }
  | { zone: "back" };

/**
 * Deterministic D-Pad vertical & L/R column transitions for the 2-column
 * OFFENSE (5) / DEFENSE (5) / top-right BACK Parameters screen.
 */
export function moveParameterFocus(
  current: ParameterFocus,
  dir: "up" | "down" | "column" | "leftFromBack",
): ParameterFocus {
  const count = PARAMETER_PARTS.length; // 5

  if (dir === "leftFromBack") {
    return current.zone === "back" ? { zone: "offense", index: 0 } : current;
  }

  if (dir === "column") {
    if (current.zone === "offense") return { zone: "defense", index: current.index };
    if (current.zone === "defense") return { zone: "offense", index: current.index };
    return { zone: "offense", index: 0 };
  }

  if (current.zone === "back") {
    if (dir === "down") return { zone: "defense", index: 0 };
    return { zone: "defense", index: count - 1 };
  }

  if (dir === "up") {
    return current.index === 0 ? { zone: "back" } : { zone: current.zone, index: current.index - 1 };
  }

  // dir === "down": walk down current column, then smoothly cross into the opposite column.
  if (current.index < count - 1) {
    return { zone: current.zone, index: current.index + 1 };
  }
  return { zone: current.zone === "offense" ? "defense" : "offense", index: 0 };
}

export interface MoveCategorySpec {
  readonly id: string;
  readonly label: string;
  /** Prefix inside public/assets/animations/ */
  readonly prefix: string;
}

/** Exact 10 move categories shown in Mockups 2, 3, 11, 12 mapped 1:1 to VPG's animation folders. */
export const MOVES_CATEGORIES: readonly MoveCategorySpec[] = [
  { id: "grappling", label: "GRAPPLING", prefix: "moves/grappling/" },
  { id: "standing", label: "STANDING", prefix: "moves/standing/" },
  { id: "running", label: "RUNNING", prefix: "moves/running/" },
  { id: "ground", label: "GROUND", prefix: "moves/ground/" },
  { id: "turnbuckle", label: "TURNBUCKLE", prefix: "moves/turnbuckle/" },
  { id: "ringside", label: "RINGSIDE", prefix: "moves/ringside/" },
  { id: "apron", label: "APRON", prefix: "moves/apron/" },
  { id: "irish_whip", label: "IRISH WHIP", prefix: "moves/irish-whip/" },
  { id: "taunt", label: "TAUNT", prefix: "moves/taunts/" },
  { id: "double_team", label: "DOUBLE TEAM", prefix: "moves/double-team/" },
] as const;

export const FIGHTING_STYLE_NAMES: readonly string[] = [
  "Wrestling",
  "Brawler",
  "High Flyer",
  "Technician",
  "Powerhouse",
  "Martial Arts",
  "Hardcore",
  "Showman",
] as const;

/** Formats an animation clip filename into a crisp retro move label. */
export function formatMoveClipName(path: string, categoryPrefix: string): string {
  const rel = path.startsWith(categoryPrefix) ? path.slice(categoryPrefix.length) : path;
  const noExt = rel.replace(/\.glb$/i, "");
  const parts = noExt.split("/");
  const leaf = parts[parts.length - 1] ?? noExt;
  return leaf.replace(/[-_]+/g, " ").toUpperCase();
}

/** Filters VPG's animation list to actor clips belonging to a Moves category. */
export function clipsForMoveCategory(allClips: readonly string[], prefix: string): string[] {
  return allClips.filter((clip) => clip.startsWith(prefix) && !/-target\.glb$/i.test(clip));
}
