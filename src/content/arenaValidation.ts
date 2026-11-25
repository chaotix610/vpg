import type { ArenaData } from "./arenas";
import { isKnownModel, resolveAsset } from "./assets";
import { resolveArenaPiece } from "./arenaPieces";
import { pieceFitsStage, stageById } from "./stages";
import { LEGACY_COLOR_TARGETS, TEXTURE_SLOTS, pathBelongsToSlot } from "./textureSlots";

/**
 * Checks an arena saved in the browser before it is written or loaded.
 *
 * Bundled arenas are checked by schemas/arenas.schema.json at build time;
 * these rules cover the same ground for player arenas without shipping a
 * schema validator, and add what a schema cannot know: that the stage exists,
 * that the pieces fit it, that every path is a file the game ships, and that
 * each texture belongs to the slot it dresses.
 *
 * Player arenas are always in the stage form the editor writes, so the
 * legacy `arenaGlb`/`arenaParts` spellings are not accepted here.
 */

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const CSS_COLOR =
  /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgba?\(\s*(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\s*,\s*(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\s*,\s*(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})(\s*,\s*(0|1|0?\.\d+))?\s*\))$/;
const USER_IMAGE = /^user-image:([a-f0-9]{64})$/;

const ALLOWED_KEYS = new Set([
  "id",
  "displayName",
  "previewImage",
  "hidden",
  "stage",
  "floor",
  "barricade",
  "outer",
  "arenaTextures",
  "ringTextures",
]);

/**
 * Which imported images an arena may name: a set of stored ids, or `"any"`
 * for a well-formed reference whose bytes are checked when it renders (the
 * image library loads asynchronously, after saved arenas are read).
 */
export type ImageScope = ReadonlySet<string> | "any";

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function model(path: unknown, field: string): void {
  if (typeof path !== "string" || !isKnownModel(path)) fail(`${field} is not a model the game ships: ${String(path)}`);
}

export function validateArena(value: unknown, images: ImageScope = new Set()): asserts value is ArenaData {
  if (!isRecord(value)) fail("An arena must be an object.");
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) fail(`Unsupported arena field: ${key}`);
  }

  const { id, displayName, previewImage, hidden, stage } = value;
  if (typeof id !== "string" || !ID_PATTERN.test(id) || id.length > 80) {
    fail("Arena ids use lowercase letters, digits and underscores, start with a letter, and are at most 80 characters.");
  }
  if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 160) {
    fail("An arena needs a display name of at most 160 characters.");
  }
  if (hidden !== undefined && typeof hidden !== "boolean") fail("hidden must be true or false.");
  if (previewImage !== undefined) {
    if (typeof previewImage !== "string" || !resolveAsset(previewImage)) fail(`Preview image is not bundled: ${String(previewImage)}`);
  }

  if (typeof stage !== "string") fail("An arena must name a stage.");
  const stageData = stageById(stage);
  if (!stageData) fail(`Unknown stage: ${stage}`);
  model(stageData.glb, "Stage model");
  for (const kind of ["floor", "barricade", "outer"] as const) {
    const reference = value[kind];
    if (reference === undefined) continue;
    const piece = typeof reference === "string" ? resolveArenaPiece(kind, reference) : null;
    if (!piece) fail(`Unknown ${kind} part: ${String(reference)}`);
    model(piece.glb, kind);
    if (!pieceFitsStage(stage, kind, piece.id)) fail(`${kind} does not fit stage ${stage}.`);
  }

  for (const map of ["arenaTextures", "ringTextures"] as const) {
    const textures = value[map];
    if (textures === undefined) continue;
    if (!isRecord(textures)) fail(`${map} must be an object.`);
    for (const [key, texture] of Object.entries(textures)) {
      const slot = TEXTURE_SLOTS.find((s) => s.map === map && (s.materials.includes(key) || s.colors.some((c) => c.key === key)));
      const legacyColor = map === "ringTextures" && Object.hasOwn(LEGACY_COLOR_TARGETS, key);
      if (!slot && !legacyColor) fail(`Unsupported texture slot: ${map}.${key}`);
      if (typeof texture !== "string") fail(`Texture slot ${key} must be a string.`);

      if (key.endsWith("Color")) {
        if (!CSS_COLOR.test(texture)) fail(`${key} is not a colour the renderer accepts: ${texture}`);
        continue;
      }
      if (texture.startsWith("user-image:")) {
        // Any texture slot may take an imported image; the folder rule is for bundled art.
        const imageId = USER_IMAGE.exec(texture)?.[1];
        if (!imageId) fail(`Texture slot ${key} has a malformed imported-image reference.`);
        if (images !== "any" && !images.has(imageId)) fail(`Texture slot ${key} uses an imported image that is no longer stored.`);
        continue;
      }
      if (!resolveAsset(texture)) fail(`Texture is not bundled: ${texture}`);
      if (!slot || !pathBelongsToSlot(slot, texture)) fail(`Texture does not belong to slot ${key}.`);
    }
  }
}
