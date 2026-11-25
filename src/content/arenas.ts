import { shallowRef } from "vue";
import { resolveArenaPiece } from "./arenaPieces";
import { resolveAsset } from "./assets";
import { type PieceKind, defaultPiece, stageById } from "./stages";

/**
 * Arena definitions: the bundled ones from data/environments/arenas/*.json,
 * plus whatever the player has saved in this browser.
 *
 * Bundled arenas are imported rather than fetched: `data/` is bundled with the
 * application, so fetching these paths at runtime would 404 in a production
 * build. Their shape is checked against schemas/arenas.schema.json by
 * `npm run validate:data`, so this loader trusts it and only normalises the
 * parts that vary between spellings.
 *
 * User arenas are published here by src/save/arenaStore.ts, which validates
 * them on the way in, so this module never touches browser storage.
 */

/** A texture path, or a CSS colour for the `*Color` keys. */
export type MaterialTextures = Record<string, string>;

export interface ArenaPartSpec {
  glb: string;
  /** World offset, in the ring's units. */
  position?: [number, number, number];
  /** Euler radians, ordered [x, y, z]. Not a quaternion. */
  rotation?: [number, number, number];
}

export interface ArenaData {
  id: string;
  displayName: string;
  previewImage?: string;
  /** Leaves the arena out of the viewer and editor menus. It still loads by id. */
  hidden?: boolean;
  /** Stage id from data/environments/stages.json. The current way to describe an arena. */
  stage?: string;
  /** Named floor id. Older saves may still use its GLB path. */
  floor?: string;
  /** Named barricade id. Older saves may still use its GLB path. */
  barricade?: string;
  /** Named outer bowl id, crowd included. Older saves may still use its GLB path. */
  outer?: string;
  /** Legacy single-GLB field, superseded by the stage fields. */
  arenaGlb?: string;
  /** Legacy free-form part list, superseded by the stage fields. */
  arenaParts?: (string | ArenaPartSpec)[];
  arenaTextures?: MaterialTextures;
  ringTextures?: MaterialTextures;
}

/** One entry in the viewer's selection list. */
export interface ArenaSummary {
  id: string;
  displayName: string;
  /** Resolved URL for the preview, or null when there is no art for it. */
  previewUrl: string | null;
  /** True for an arena saved in this browser rather than shipped with the game. */
  custom: boolean;
}

const modules = import.meta.glob("../../data/environments/arenas/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ArenaData & { $schema?: string }>;

const byId = new Map<string, ArenaData>();
for (const [path, { $schema: _schema, ...data }] of Object.entries(modules)) {
  // The filename is the id, so a mismatched `id` field cannot hide an arena.
  const id = path.split("/").pop()?.replace(/\.json$/i, "") ?? data.id;
  byId.set(id, { ...data, id });
}

const userArenas = shallowRef<readonly ArenaData[]>([]);

/** Replaces the user arenas the menus list. Called by the save layer only. */
export function publishUserArenas(arenas: readonly ArenaData[]): void {
  userArenas.value = structuredClone(arenas) as ArenaData[];
}

export function isBundledArena(id: string): boolean {
  return byId.has(id);
}

export function bundledArenaIds(): string[] {
  return [...byId.keys()];
}

/**
 * Every arena, ordered by display name.
 *
 * Arenas marked `hidden` are left out unless asked for, so they stay off the
 * menus while still counting when an id needs to be unique.
 */
export function availableArenas({ includeHidden = false }: { includeHidden?: boolean } = {}): ArenaSummary[] {
  return [...byId.values(), ...userArenas.value]
    .filter((arena) => includeHidden || arena.hidden !== true)
    .map((arena) => ({
      id: arena.id,
      displayName: arena.displayName ?? arena.id,
      previewUrl: arena.previewImage ? resolveAsset(arena.previewImage) : null,
      custom: !byId.has(arena.id),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function arenaById(id: string): ArenaData | null {
  return userArenas.value.find((arena) => arena.id === id) ?? byId.get(id) ?? null;
}

/** The piece fields an arena fills in, in the order they are loaded. */
const PIECE_FIELDS: PieceKind[] = ["floor", "barricade", "outer"];

/**
 * The GLB parts of an arena, in a single shape.
 *
 * Three spellings reach this function. The current one names a `stage` and its
 * three pieces, which is what the editor writes. Before that an arena listed
 * `arenaParts` freely - a bare path or an object with a placement - and before
 * that a single `arenaGlb`. All three collapse into one placed list, so nothing
 * downstream needs to know which spelling a file happened to use.
 *
 * The stage form is checked first, so an arena carrying both (a file migrated
 * by hand, say) renders from the fields the editor maintains.
 */
export function arenaParts(arena: ArenaData): Required<ArenaPartSpec>[] {
  if (arena.stage) {
    const stage = stageById(arena.stage);
    const paths: string[] = [];
    for (const field of PIECE_FIELDS) {
      // A piece the arena does not name falls back to the stage's default, so
      // a file that only sets `stage` still renders as a complete arena.
      const piece = resolveArenaPiece(field, arena[field] || defaultPiece(arena.stage, field));
      if (piece) paths.push(piece.glb);
    }
    // The stage loads last, matching the order the old arenaParts lists used.
    if (stage?.glb) paths.push(stage.glb);
    return paths.map((glb) => ({ glb, position: [0, 0, 0], rotation: [0, 0, 0] }));
  }

  const normalise = (part: string | ArenaPartSpec): Required<ArenaPartSpec> | null => {
    if (typeof part === "string") {
      return part ? { glb: part, position: [0, 0, 0], rotation: [0, 0, 0] } : null;
    }
    if (!part?.glb) return null;
    return { glb: part.glb, position: part.position ?? [0, 0, 0], rotation: part.rotation ?? [0, 0, 0] };
  };

  if (Array.isArray(arena.arenaParts)) {
    return arena.arenaParts.map(normalise).filter((p): p is Required<ArenaPartSpec> => p !== null);
  }

  if (arena.arenaGlb) {
    return [{ glb: arena.arenaGlb, position: [0, 0, 0], rotation: [0, 0, 0] }];
  }

  return [];
}
