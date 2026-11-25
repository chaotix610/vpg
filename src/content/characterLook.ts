import type { AkiBoneSpec, Vec3 } from "./vpgRig";

/**
 * Pure modular character look rules, attire planning, indexed-PNG decoding,
 * and N64 palette-index slot tile composition.
 *
 * Adapted into strongly-typed TypeScript from the reference proof of concept
 * (rom-look.js + compose-core.js + data.js height/weight rules), kept free of
 * Babylon and DOM dependencies so it can run identically in browser and Node tests.
 */

// ------------------------------------------------------------------ manifest & document types

export type WrapMode = "mirror" | "repeat" | "clamp";

export interface ManifestSkeleton {
  readonly unit: number;
  readonly floor: number;
  readonly bones: readonly AkiBoneSpec[];
  readonly links: readonly (readonly [string, string])[];
  readonly headCenter: Vec3;
  readonly boneOrder: readonly string[];
  readonly seams: Readonly<Record<string, readonly [number, number]>>;
}

export interface ManifestModelEntry {
  readonly src: string;
  readonly node: string;
  readonly vertices: number;
  readonly faces: number;
  readonly influence: number;
}

export interface ManifestPictureEntry {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly format: "ci4" | "ci8";
  readonly bytes: number;
  readonly wrap?: readonly [WrapMode, WrapMode];
  readonly preview?: number;
  readonly roles?: readonly string[];
}

export interface LookFieldSpec {
  readonly name: string;
  readonly label: string;
  readonly group: string;
  readonly kind: "build" | "style" | "colour";
  readonly first: number;
  readonly last: number;
  readonly noneAtZero?: boolean;
  readonly swatch?: "skin" | "hair" | "costume";
  readonly wide?: boolean;
  readonly female?: { readonly first: number; readonly last: number };
}

export interface ManifestStyleEntry {
  readonly textures: readonly number[];
  readonly extras: number;
  readonly special?: number;
}

export interface CharacterManifest {
  readonly version: number;
  readonly kind: "rom";
  readonly skeleton: ManifestSkeleton;
  readonly slots: {
    readonly count: number;
    readonly extrasFirst: number;
    readonly names: readonly (string | null)[];
    readonly bones: readonly (number | null)[];
  };
  readonly colours: {
    readonly costume: readonly (readonly number[])[];
  };
  readonly swatches: {
    readonly costume: readonly (string | null)[];
    readonly skin: readonly string[];
    readonly hair: readonly string[];
  };
  readonly pictures: Readonly<Record<string, ManifestPictureEntry>>;
  readonly palettes: string;
  readonly models: Readonly<Record<string, ManifestModelEntry>>;
  readonly rules: {
    readonly womenRingFrom: number;
    readonly womenUpperDefault: number;
    readonly entranceDropsUpper: number;
    readonly hatsAllowed: readonly number[];
    readonly coversWaist: readonly number[];
    readonly entranceBeforeHair: readonly number[];
    readonly hairLimit: number;
    readonly faceLimit: number;
    readonly faceRowsBelow: number;
    readonly entranceHatFrom: number;
    readonly entranceHatBase: number;
    readonly skinTone: readonly number[];
    readonly layerColours: number;
    readonly costumeShades: number;
    readonly costumeColours: number;
    readonly rampMasks: readonly number[];
    readonly rampShifts: readonly number[];
  };
  readonly tables: {
    readonly typeToSet: readonly number[];
    readonly typeToSkin: readonly number[];
    readonly femaleFromSet: number;
    readonly slotOfPosition: readonly number[];
    readonly bodySets: readonly (readonly number[])[];
    readonly skinSets: readonly (readonly number[])[];
    readonly loaded: readonly number[];
    readonly layered: readonly number[];
    readonly bands: {
      readonly facialHair: number;
      readonly tattoo: number;
      readonly ring: number;
      readonly upper: number;
      readonly wristbands: number;
      readonly boots: number;
      readonly mask: number;
      readonly elbows: number;
      readonly knees: number;
      readonly gloves: number;
      readonly entrance: number;
      readonly hair: number;
      readonly hat: number;
    };
    readonly head: {
      readonly neck: { readonly model: number; readonly pixels: number };
      readonly male: { readonly palette: number; readonly pixels: number };
      readonly female: { readonly palette: number; readonly pixels: number };
      readonly lists: {
        readonly male: readonly (readonly (readonly [number, number])[])[];
        readonly female: readonly (readonly (readonly [number, number])[])[];
      };
      readonly facePalettes: readonly number[];
    };
    readonly hair: {
      readonly slots: readonly number[];
      readonly lists: readonly (readonly number[])[];
      readonly front: readonly number[];
      readonly frontLimit: readonly number[];
      readonly palettes: readonly number[];
    };
    readonly hats: {
      readonly last: number;
      readonly slot: number;
      readonly slots: readonly number[];
      readonly shapes: readonly (readonly number[])[];
      readonly hairs: readonly (readonly number[])[];
      readonly kinds: readonly number[];
      readonly models: Readonly<Record<string, readonly [number, number, number]>>;
      readonly textures: readonly (readonly number[])[];
    };
    readonly extras: {
      readonly first: number;
      readonly limit: number;
      readonly slots: readonly number[];
      readonly groups: readonly number[];
      readonly codes: Readonly<Record<string, readonly number[]>>;
      readonly models: Readonly<Record<string, readonly (readonly number[])[]>>;
      readonly counts: Readonly<Record<string, number>>;
      readonly palettes: readonly (readonly number[])[];
    };
    readonly ring: {
      readonly limit: number;
      readonly kinds: readonly number[];
      readonly models: Readonly<Record<string, readonly (readonly number[])[]>>;
      readonly modelSlots: readonly number[];
      readonly textureSlots: readonly number[];
      readonly styles: readonly ManifestStyleEntry[];
    };
    readonly upper: {
      readonly limit: number;
      readonly kinds: readonly number[];
      readonly womenRingTop: readonly number[];
      readonly models: Readonly<Record<string, readonly (readonly number[])[]>>;
      readonly modelSlots: readonly number[];
      readonly textureSlots: readonly number[];
      readonly styles: readonly ManifestStyleEntry[];
    };
    readonly entrance: {
      readonly limit: number;
      readonly kinds: readonly number[];
      readonly models: Readonly<Record<string, readonly (readonly number[])[]>>;
      readonly slots: readonly number[];
      readonly styles: readonly ManifestStyleEntry[];
    };
    readonly gloves: {
      readonly last: number;
      readonly column: readonly number[];
      readonly models: readonly (readonly (readonly number[])[])[];
      readonly modelSlots: readonly number[];
      readonly textures: readonly (readonly number[])[];
      readonly textureSlots: readonly number[];
    };
    readonly elbows: {
      readonly last: number;
      readonly left: readonly number[];
      readonly right: readonly number[];
      readonly textures: readonly (readonly number[])[];
    };
    readonly knees: {
      readonly last: number;
      readonly left: readonly number[];
      readonly right: readonly number[];
      readonly textures: readonly (readonly number[])[];
    };
    readonly tattoos: {
      readonly last: number;
      readonly slots: readonly number[];
      readonly textures: readonly (readonly number[] | null)[];
    };
    readonly wristbands: {
      readonly last: number;
      readonly slots: readonly (readonly number[])[];
      readonly textures: readonly (readonly number[])[];
    };
    readonly boots: {
      readonly limit: number;
      readonly column: readonly number[];
      readonly kinds: readonly number[];
      readonly models: Readonly<Record<string, readonly (readonly number[])[]>>;
      readonly modelSlots: readonly number[];
      readonly textures: readonly (readonly number[])[];
      readonly textureSlots: readonly number[];
    };
    readonly facialHair: {
      readonly last: number;
      readonly pictures: readonly number[];
      readonly faceRows: readonly number[];
      readonly hairRows: readonly number[];
    };
    readonly masks: {
      readonly last: number;
      readonly slots: readonly number[];
      readonly textures: readonly (readonly number[])[];
      readonly faceRows: readonly number[];
      readonly maskRows: readonly number[];
    };
    readonly order: {
      readonly upperClass: readonly number[];
      readonly ringClass: readonly number[];
      readonly table: readonly number[];
      readonly rows: readonly (readonly number[])[];
    };
  };
  readonly fields: readonly LookFieldSpec[];
}

export interface CostumeFieldValue {
  label: string;
  group: string;
  value: number;
  display?: string;
  range?: [number, number];
  colour?: string | null;
}

export interface WrestlerCostume {
  costume?: number;
  rosterIndex?: number | null;
  female?: boolean;
  costumeSet?: number;
  portrait?: number | null;
  palette?: number | null;
  fields: Record<string, CostumeFieldValue>;
}

export interface WrestlerParam {
  index: number;
  name: string;
  label: string | null;
  value: number;
  min: number;
  max: number;
}

export interface WrestlerAttributes {
  speed: number;
  specificWeapon?: number;
  attack: {
    head: number;
    body: number;
    arms: number;
    legs: number;
    flying: number;
  };
  defence: {
    head: number;
    body: number;
    arms: number;
    legs: number;
    flying: number;
  };
}

export interface WrestlerProfile {
  fullName: string;
  shortName: string;
  ringName: string | null;
  height: string;
  weight: string;
  heightRaw: number;
  weightRaw: number;
  themeSong?: unknown;
  entranceVideo?: unknown;
  profileIndex?: number | null;
  rating?: number | null;
  attributes: WrestlerAttributes;
  style?: { index: number; name: string };
  partner?: string | null;
  rivals?: string[];
  allParams?: WrestlerParam[];
}

export interface WrestlerDocument {
  id: string;
  rosterIndex?: number | null;
  costumeIndices?: number[];
  profile: WrestlerProfile;
  moveset?: unknown;
  look: {
    costumes: WrestlerCostume[];
  };
  source?: Record<string, unknown>;
}

export interface WrestlerSummary {
  readonly id: string;
  readonly rosterIndex: number | null;
  readonly fullName: string;
  readonly shortName: string;
  readonly ringName: string | null;
  readonly heightRaw: number;
  readonly weightRaw: number;
  readonly costumeCount: number;
  readonly bodyTypes: readonly number[];
  readonly custom?: boolean;
  readonly edited?: boolean;
}

// ------------------------------------------------------------------ height & weight helpers

export const HEIGHT_CLASSES: Readonly<Record<number, string>> = {
  36: "Short (class)",
  37: "Medium (class)",
  38: "Tall (class)",
  39: "Tall, shown fake",
};

export const WEIGHT_CLASSES: Readonly<Record<number, string>> = {
  500: "Light heavy",
  501: "Heavy",
  502: "Super heavy",
  503: "400 lb, shown fake",
};

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function heightText(raw: number): string {
  if (raw in HEIGHT_CLASSES) return HEIGHT_CLASSES[raw].replace(" (class)", "").toLowerCase();
  const inches = 60 + Number(raw);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function heightInches(raw: number): number {
  const byClass: Record<number, number> = { 36: 67, 37: 73, 38: 78, 39: 79 };
  return byClass[raw] ?? 60 + Number(raw);
}

/** Uniform visual scale factor applied to the VPG character root for a given heightRaw. */
export function heightScaleFor(heightRaw: number): number {
  return clamp(heightInches(heightRaw) / 73, 0.82, 1.25);
}

export function weightText(raw: number): string {
  if (raw in WEIGHT_CLASSES) return WEIGHT_CLASSES[raw].toLowerCase();
  return `${Number(raw) + 100} lb`;
}

export function weightPounds(raw: number): number {
  const byClass: Record<number, number> = { 500: 230, 501: 290, 502: 380, 503: 400 };
  return byClass[raw] ?? Number(raw) + 100;
}

// ------------------------------------------------------------------ attire planning

const signed = (value: number): number => (value << 24) >> 24;

export interface SlotSpec {
  model: number;
  pixels: number;
  palette: number;
  colours: [number, number];
}

export interface LayerSlotEntry {
  slot: number;
  texture: number;
  colours: [number, number];
}

export interface CostumePlan {
  slots: SlotSpec[];
  layers: {
    hair?: LayerSlotEntry[];
    hats?: LayerSlotEntry[];
    entranceHat?: LayerSlotEntry[];
    ring?: LayerSlotEntry[];
    upper?: LayerSlotEntry[];
    entrance?: LayerSlotEntry[];
    gloves?: LayerSlotEntry[];
    elbowLeft?: LayerSlotEntry[] | null;
    elbowRight?: LayerSlotEntry[] | null;
    kneeLeft?: LayerSlotEntry[] | null;
    kneeRight?: LayerSlotEntry[] | null;
    tattoo?: LayerSlotEntry[];
    wristbands?: LayerSlotEntry[][];
    boots?: LayerSlotEntry[];
    masks?: LayerSlotEntry[];
  };
  skin: number;
  tone: number;
  hairColour: number;
  hatsAllowed: boolean;
  entrance: number;
  entranceBeforeHair: number;
  facial: { pixels: number; palette: number; offset: number } | null;
  frontHair: { pixels: number; palette: number } | null;
  maskOffset: number;
  steps: number[];
  extrasCodes: number[];
  set: number;
  skinSet: number;
  female: boolean;
  ring: number;
  upper: number;
  swaps: string[];
  entranceHat: boolean;
  hatBlocked: boolean;
}

export interface DressedSlot {
  slot: number;
  bone: number;
  model: number;
  pixels: number;
  palette: number;
}

export interface DrawnLayerInfo {
  field: string;
  label: string;
  slots: string[];
  option: string;
  src: string;
}

export interface CostumeRecipe {
  record: Record<string, number>;
  plan: CostumePlan;
  dressed: DressedSlot[];
  build: number;
  set: number;
  setName: string;
  female: boolean;
  swaps: { field: string; swap: string }[];
  layers: DrawnLayerInfo[];
  notes: string[];
  entrance: boolean;
}

const layerList = (
  list: readonly number[] | undefined | null,
  slots: readonly number[],
  colours: [number, number],
): LayerSlotEntry[] => slots.map((slot, position) => ({ slot, texture: list?.[position] ?? 0, colours }));

/** Computes every active slot model, texture and colour layer for one costume record. */
export function planCostume(
  manifest: CharacterManifest,
  record: Readonly<Record<string, number>>,
  options: { entrance?: boolean } = {},
): CostumePlan {
  const t = manifest.tables;
  const rules = manifest.rules;
  const slots: SlotSpec[] = Array.from({ length: manifest.slots.count }, () => ({
    model: 0,
    pixels: 0,
    palette: 0,
    colours: [0, 0],
  }));
  const layers: CostumePlan["layers"] = {};

  const skin = record.skin_color < 8 ? record.skin_color : 0;
  const hairColour = record.hair_color < 8 ? record.hair_color : 0;
  const bodyType = signed(record.body_type);
  const set = t.typeToSet[bodyType] ?? 0;
  const skinSet = t.typeToSkin[bodyType] ?? 0;
  const female = set >= t.femaleFromSet;
  const sex = female ? "female" : "male";

  const ring = record.ring_attire < t.ring.limit ? record.ring_attire : 0;
  let upper = record.upper_attire < t.upper.limit ? record.upper_attire : 0;
  if (female && upper === 0 && (ring < rules.womenRingFrom || t.upper.womenRingTop[ring] === 0)) {
    upper = rules.womenUpperDefault;
  }

  const entrance = options.entrance && record.entrance_attire < t.entrance.limit ? record.entrance_attire : 0;
  if (entrance === rules.entranceDropsUpper) upper = 0;
  const hatsAllowed = rules.hatsAllowed[entrance] ?? 1;
  const coversWaist = rules.coversWaist[entrance] ?? 0;

  if (record.hair_type < rules.hairLimit) {
    layers.hair = layerList(t.hair.lists[record.hair_type], t.hair.slots, [record.hair_color, 0]);
  }

  const parts = t.bodySets[set];
  const skins = t.skinSets[skinSet];
  for (let position = 0; position < t.slotOfPosition.length; position += 1) {
    const slot = t.slotOfPosition[position];
    const part = parts[position];
    const palette = skins[position];
    if (part) slots[slot].model = part;
    if (palette) {
      Object.assign(slots[slot], { palette, pixels: palette + 1, colours: [record.skin_color, 0] });
    }
  }

  Object.assign(slots[4], { model: t.head.neck.model, pixels: t.head.neck.pixels, palette: t.head[sex].palette });
  Object.assign(slots[5], { palette: t.head[sex].palette, pixels: t.head[sex].pixels });

  const placeHat = (index: number, colours: [number, number]): LayerSlotEntry[] => {
    const shape = t.hats.shapes[female ? 1 : 0][signed(record.head_shape)];
    const hair = t.hats.hairs[female ? 1 : 0][signed(record.hair_type)];
    const kind = t.hats.kinds[index];
    const [hatModel, headModel, faceModel] = t.hats.models[`${kind}/${shape}/${hair}`] ?? [0, 0, 0];
    slots[t.hats.slot].model = hatModel;
    slots[5].model = headModel;
    slots[20].model = faceModel;
    return layerList(t.hats.textures[index], t.hats.slots, colours);
  };

  const hat = record.hats_caps;
  if (hat >= 1 && hat <= t.hats.last && hatsAllowed) {
    layers.hats = placeHat(hat - 1, [record.hats_caps_color, 0]);
  } else {
    const [head, face] = t.head.lists[sex][signed(record.head_shape)]?.[signed(record.hair_type)] ?? [0, 0];
    slots[5].model = head;
    slots[20].model = face;
  }

  if (record.face_number < rules.faceLimit) {
    const palette = t.head.facePalettes[record.face_number];
    Object.assign(slots[20], { pixels: palette + 1, palette });
  }

  const extrasCodes = [0, 0, 0];
  const extras = (colours: [number, number], kind: number) => {
    if (kind === 0 || kind >= t.extras.limit) return;
    const group = t.extras.groups[kind];
    const codes = t.extras.codes[String(group)];
    const models = t.extras.models[String(group)][set];
    const count = t.extras.counts[String(group)];
    const palettes = t.extras.palettes[kind];
    for (let index = 0; index < count; index += 1) {
      const code = codes[index];
      const position = (code << 16) >> 28;
      extrasCodes[position] = code;
      if (coversWaist && position === 0) continue;
      Object.assign(slots[t.extras.first + position], {
        model: models[index],
        palette: palettes[index],
        pixels: palettes[index] + 1,
        colours,
      });
    }
  };

  const swaps: string[] = [];
  const replaceModels = (field: string, list: readonly number[] | undefined, targets: readonly number[]) => {
    if (!list) return;
    let changed = false;
    targets.forEach((slot, position) => {
      const model = list[position];
      if (model) {
        slots[slot].model = model;
        changed = true;
      }
    });
    if (changed) swaps.push(field);
  };

  const ringKind = t.ring.kinds[ring];
  replaceModels("ring_attire", t.ring.models[String(ringKind)]?.[set], t.ring.modelSlots);
  const ringStyle = t.ring.styles[ring];
  layers.ring = layerList(ringStyle.textures, t.ring.textureSlots, [record.ring_attire_color_1, record.ring_attire_color_2]);
  extras([record.ring_attire_color_1, record.ring_attire_color_2], ringStyle.extras);

  const upperKind = t.upper.kinds[upper];
  if (upper) {
    replaceModels("upper_attire", t.upper.models[String(upperKind)]?.[set], t.upper.modelSlots);
    const style = t.upper.styles[upper];
    layers.upper = layerList(style.textures, t.upper.textureSlots, [record.upper_attire_color_1, record.upper_attire_color_2]);
    extras([record.upper_attire_color_1, record.upper_attire_color_2], style.extras);
  }

  let entranceHat = false;
  if (entrance) {
    const kind = t.entrance.kinds[entrance];
    replaceModels("entrance_attire", t.entrance.models[String(kind)]?.[set], t.entrance.slots);
    const style = t.entrance.styles[entrance];
    const colours: [number, number] = [record.entrance_attire_color_1, record.entrance_attire_color_2];
    layers.entrance = layerList(style.textures, t.entrance.slots, colours);
    extras(colours, style.extras);
    if ((style.special ?? 0) >= rules.entranceHatFrom) {
      layers.entranceHat = placeHat((style.special ?? 0) - rules.entranceHatBase, colours);
      entranceHat = true;
    }
  }

  if (record.gloves >= 1 && record.gloves <= t.gloves.last) {
    replaceModels("gloves", t.gloves.models[record.gloves]?.[t.gloves.column[set]], t.gloves.modelSlots);
    layers.gloves = layerList(t.gloves.textures[record.gloves], t.gloves.textureSlots, [record.gloves_color, 0]);
  }

  const pads = (
    value: number,
    part: { last: number; textures: readonly (readonly number[])[] },
    slotsAt: readonly number[],
    colour: number,
  ): LayerSlotEntry[] | null =>
    value >= 1 && value <= part.last ? layerList(part.textures[value], slotsAt, [colour, 0]) : null;

  layers.elbowLeft = pads(record.left_elbow_pad, t.elbows, t.elbows.left, record.left_elbow_pad_color);
  layers.elbowRight = pads(record.right_elbow_pad, t.elbows, t.elbows.right, record.right_elbow_pad_color);
  layers.kneeLeft = pads(record.left_knee_pad, t.knees, t.knees.left, record.left_knee_pad_color);
  layers.kneeRight = pads(record.right_knee_pad, t.knees, t.knees.right, record.right_knee_pad_color);

  if (record.tattoo >= 1 && record.tattoo <= t.tattoos.last && t.tattoos.textures[record.tattoo]) {
    layers.tattoo = layerList(t.tattoos.textures[record.tattoo], t.tattoos.slots, [0, 0]);
  }

  if (record.wristband >= 1 && record.wristband <= t.wristbands.last) {
    const band = layerList(t.wristbands.textures[record.wristband], t.wristbands.slots[1], [record.wristband_color, 0]);
    layers.wristbands = t.wristbands.slots.map((list) => list.map((slot, position) => ({ ...band[position], slot })));
  }

  if (record.boots < t.boots.limit) {
    const kind = t.boots.kinds[record.boots];
    if (kind) replaceModels("boots", t.boots.models[String(kind)]?.[t.boots.column[set]], t.boots.modelSlots);
    layers.boots = layerList(t.boots.textures[signed(record.boots)], t.boots.textureSlots, [
      record.boots_color_1,
      record.boots_color_2,
    ]);
  }

  const face = signed(record.face_number);
  const tone = rules.skinTone[skin];
  let facial: CostumePlan["facial"] = null;
  if (record.facial_hair >= 1 && record.facial_hair <= t.facialHair.last) {
    const pixels = t.facialHair.pictures[record.facial_hair];
    const offset =
      face < rules.faceRowsBelow ? signed(t.facialHair.faceRows[face] - t.facialHair.hairRows[record.facial_hair]) : 0;
    facial = { pixels, palette: pixels + tone, offset };
  }

  let maskOffset = 0;
  if (record.masks_etc >= 1 && record.masks_etc <= t.masks.last) {
    layers.masks = layerList(t.masks.textures[record.masks_etc], t.masks.slots, [0, 0]);
    if (face < rules.faceRowsBelow && t.masks.maskRows[record.masks_etc] >= 0) {
      maskOffset = signed(t.masks.faceRows[face] - t.masks.maskRows[record.masks_etc]);
    }
  }

  const front = signed(record.front_hair);
  const frontLimit = t.hair.frontLimit[signed(record.hair_type)] ?? 0;
  const frontHair =
    front >= 0 && front < frontLimit ? { pixels: t.hair.front[front], palette: t.hair.palettes[hairColour] } : null;

  const orderRow = t.order.table[6 * t.order.upperClass[upperKind] + t.order.ringClass[ringKind]];
  const steps = [...t.order.rows[orderRow]];
  const entranceBeforeHair = rules.entranceBeforeHair[entrance];

  return {
    slots,
    layers,
    skin,
    tone,
    hairColour,
    hatsAllowed: Boolean(hatsAllowed) && Boolean(layers.hats),
    entrance,
    entranceBeforeHair,
    facial,
    frontHair,
    maskOffset,
    steps,
    extrasCodes,
    set,
    skinSet,
    female,
    ring,
    upper,
    swaps,
    entranceHat,
    hatBlocked: hat >= 1 && hat <= t.hats.last && !hatsAllowed,
  };
}

/** Active slots that have a model to draw, along with their AKI bone index. */
export function dressedSlots(manifest: CharacterManifest, plan: CostumePlan): DressedSlot[] {
  const first = manifest.slots.extrasFirst;
  const bones = manifest.slots.bones;
  const entries: DressedSlot[] = [];
  for (let slot = 1; slot < manifest.slots.count; slot += 1) {
    const entry = plan.slots[slot];
    if (!entry.model) continue;
    const bone = slot < first ? bones[slot] : bones[manifest.tables.extras.slots[plan.extrasCodes[slot - first] & 15]];
    if (bone === null || bone === undefined) continue;
    entries.push({ slot, bone, model: entry.model, pixels: entry.pixels, palette: entry.palette });
  }
  return entries;
}

function drawnLayers(manifest: CharacterManifest, plan: CostumePlan): DrawnLayerInfo[] {
  const t = manifest.tables;
  const names = manifest.slots.names;
  const out: DrawnLayerInfo[] = [];
  const add = (
    label: string,
    field: string,
    entries: readonly LayerSlotEntry[] | undefined | null,
    pictureOf: (texture: number) => number = (texture) => texture + 1,
  ) => {
    const used = (entries ?? []).filter((entry) => entry?.texture && t.layered[entry.slot]);
    if (!used.length) return;
    const slotNames = used.map((entry) => names[entry.slot] ?? `slot_${entry.slot}`);
    out.push({
      field,
      label,
      slots: slotNames,
      option: slotNames.join(", "),
      src: `textures/${pictureOf(used[0].texture)}.png`,
    });
  };
  if (plan.facial?.pixels) {
    out.push({ field: "facial_hair", label: "Facial hair", slots: ["face"], option: "face", src: `textures/${plan.facial.pixels}.png` });
  }
  add("Tattoo", "tattoo", plan.layers.tattoo, (texture) => texture);
  const steps = [
    () => add("Ring attire", "ring_attire", plan.layers.ring),
    () => add("Upper attire", "upper_attire", plan.layers.upper),
    () => add("Wristbands", "wristband", (plan.layers.wristbands ?? []).flat()),
    () => add("Boots", "boots", plan.layers.boots),
    () => add("Mask", "masks_etc", plan.layers.masks),
    () => add("Elbow pads", "left_elbow_pad", [...(plan.layers.elbowLeft ?? []), ...(plan.layers.elbowRight ?? [])]),
    () => add("Knee pads", "left_knee_pad", [...(plan.layers.kneeLeft ?? []), ...(plan.layers.kneeRight ?? [])]),
    () => add("Gloves", "gloves", plan.layers.gloves),
  ];
  for (const step of plan.steps) steps[step]?.();
  if (plan.entranceBeforeHair) add("Entrance attire", "entrance_attire", plan.layers.entrance);
  if (plan.frontHair && plan.frontHair.pixels > 0) {
    out.push({ field: "front_hair", label: "Front hair", slots: ["face"], option: "face", src: `textures/${plan.frontHair.pixels}.png` });
  }
  add("Hair", "hair_type", plan.layers.hair, (texture) => texture);
  if (!plan.entranceBeforeHair) add("Entrance attire", "entrance_attire", plan.layers.entrance);
  if (plan.hatsAllowed) add("Hat", "hats_caps", plan.layers.hats);
  return out;
}

// ------------------------------------------------------------------ CharacterLookBook

export class CharacterLookBook {
  readonly manifest: CharacterManifest;
  readonly fields: readonly LookFieldSpec[];
  readonly byName: ReadonlyMap<string, LookFieldSpec>;
  readonly swatches: CharacterManifest["swatches"];
  buildNames = new Map<number, string>();

  constructor(manifest: CharacterManifest) {
    this.manifest = manifest;
    this.fields = manifest.fields;
    this.byName = new Map(manifest.fields.map((field) => [field.name, field]));
    this.swatches = manifest.swatches;
  }

  field(name: string): LookFieldSpec | undefined {
    return this.byName.get(name);
  }

  female(costume: WrestlerCostume): boolean {
    const build = this.byName.get("body_type")!;
    const type = clamp(Number(costume?.fields?.body_type?.value ?? 0) || 0, build.first, build.last);
    return (this.manifest.tables.typeToSet[type] ?? 0) >= this.manifest.tables.femaleFromSet;
  }

  range(costume: WrestlerCostume, field: LookFieldSpec): [number, number] {
    const span = field.female && this.female(costume) ? field.female : field;
    return [span.first, span.last];
  }

  value(costume: WrestlerCostume, name: string): number {
    const field = this.byName.get(name);
    if (!field) return 0;
    const raw = Number(costume?.fields?.[name]?.value ?? 0);
    const [first, last] = this.range(costume, field);
    return clamp(Number.isFinite(raw) ? raw : first, first, last);
  }

  outOfRange(costume: WrestlerCostume, name: string): boolean {
    const raw = Number(costume?.fields?.[name]?.value ?? 0);
    return raw !== this.value(costume, name);
  }

  label(field: LookFieldSpec, value: number): string {
    if (field.kind === "colour") return value === 0 ? "Drawn" : `Colour ${value}`;
    if (field.kind === "build") return this.buildNames.get(value) ?? `Build ${value}`;
    if (field.noneAtZero && value === 0) return "None";
    return `Style ${value}`;
  }

  hint(costume: WrestlerCostume, field: LookFieldSpec): string {
    const value = this.value(costume, field.name);
    const t = this.manifest.tables;
    if (field.kind === "colour") return value ? (this.swatches.costume[value] ?? "") : "drawn colours";
    if (field.kind === "build") {
      const set = t.typeToSet[value] ?? 0;
      return `body set ${set}${set >= t.femaleFromSet ? ", women" : ""}`;
    }
    if (field.name === "ring_attire") return `kind ${t.ring.kinds[value]}`;
    if (field.name === "upper_attire" && value) return `kind ${t.upper.kinds[value]}`;
    if (field.name === "boots" && t.boots.kinds[value]) return `kind ${t.boots.kinds[value]}`;
    if (field.name === "entrance_attire" && value) {
      return `kind ${t.entrance.kinds[value]}${this.manifest.rules.hatsAllowed[value] ? "" : ", no hat"}`;
    }
    return "";
  }

  swatch(costume: WrestlerCostume, field: LookFieldSpec): { colour: string | null; fallback: boolean } | null {
    const value = this.value(costume, field.name);
    if (field.kind === "colour") {
      return value ? { colour: this.swatches.costume[value] ?? null, fallback: false } : { colour: null, fallback: true };
    }
    if (field.swatch) {
      return { colour: this.swatches[field.swatch][value] ?? null, fallback: false };
    }
    return null;
  }

  record(costume: WrestlerCostume): Record<string, number> {
    return Object.fromEntries(this.fields.map((field) => [field.name, this.value(costume, field.name)]));
  }

  recipe(costume: WrestlerCostume, { entrance = false }: { entrance?: boolean } = {}): CostumeRecipe {
    const m = this.manifest;
    const record = this.record(costume);
    const plan = planCostume(m, record, { entrance });
    const dressed = dressedSlots(m, plan);
    const notes: string[] = [];
    if (plan.female && record.upper_attire === 0 && plan.upper === m.rules.womenUpperDefault && plan.entrance !== m.rules.entranceDropsUpper) {
      notes.push(`Upper attire None on a women's build wears style ${plan.upper}`);
    }
    if (plan.entrance === m.rules.entranceDropsUpper && record.upper_attire) {
      notes.push(`entrance attire ${plan.entrance} drops the upper attire`);
    }
    if (plan.hatBlocked) notes.push("the entrance attire covers the hat");
    if (plan.entranceHat) notes.push("the entrance attire brings its own hat");
    if (m.rules.coversWaist[plan.entrance]) notes.push("the entrance attire covers the waist prop");
    const value = record.body_type;
    return {
      record,
      plan,
      dressed,
      build: value,
      set: plan.set,
      setName: this.buildNames.get(value) ?? `Build ${value}`,
      female: plan.female,
      swaps: plan.swaps.map((field) => ({ field, swap: this.byName.get(field)?.label.toLowerCase() ?? field })),
      layers: drawnLayers(m, plan),
      notes,
      entrance: plan.entrance > 0,
    };
  }

  normalise(costume: WrestlerCostume): WrestlerCostume {
    costume.fields ??= {};
    for (const field of this.fields) {
      const entry = costume.fields[field.name] ?? { label: field.label, group: field.group, value: 0 };
      entry.label = field.label;
      entry.group = field.group;
      entry.value = Number(entry.value ?? 0);
      entry.range = this.range(costume, field);
      entry.display = this.label(field, this.value(costume, field.name));
      if (field.kind === "colour" && !("colour" in entry)) entry.colour = null;
      costume.fields[field.name] = entry;
    }
    costume.female = this.female(costume);
    return costume;
  }

  setValue(costume: WrestlerCostume, name: string, value: number): void {
    const field = this.byName.get(name);
    if (!field) return;
    if (!costume.fields[name]) {
      costume.fields[name] = { label: field.label, group: field.group, value: 0 };
    }
    const entry = costume.fields[name];
    const [first, last] = this.range(costume, field);
    entry.value = clamp(Math.round(value), first, last);
    entry.display = this.label(field, entry.value);
    if (field.kind === "colour") entry.colour = entry.value ? (this.swatches.costume[entry.value] ?? null) : null;
    if (name === "body_type") {
      costume.female = this.female(costume);
      // Head shapes and hair styles have separate men/women ranges: clamp them into range.
      for (const other of this.fields) {
        if (!other.female) continue;
        const [low, high] = this.range(costume, other);
        const current = costume.fields[other.name];
        if (!current) continue;
        if (current.value < low || current.value > high) {
          current.value = clamp(current.value, low, high);
          current.display = this.label(other, current.value);
        }
        current.range = [low, high];
      }
    }
  }

  /** Labels body builds by bundled wrestlers who use them. */
  nameBuilds(summaries: readonly WrestlerSummary[]): void {
    const users = new Map<number, string[]>();
    for (const summary of summaries) {
      if (summary.id === "default" || summary.custom) continue;
      for (const value of summary.bodyTypes) {
        let list = users.get(value);
        if (!list) {
          list = [];
          users.set(value, list);
        }
        if (!list.includes(summary.fullName)) list.push(summary.fullName);
      }
    }
    this.buildNames = new Map();
    const t = this.manifest.tables;
    for (let value = 0; value < t.typeToSet.length; value += 1) {
      const names = users.get(value) ?? [];
      let text = `Build ${value} · set ${t.typeToSet[value]}${t.typeToSet[value] >= t.femaleFromSet ? " (women)" : ""}`;
      if (names.length === 1) text = names[0];
      else if (names.length === 2) text = `${names[0]}, ${names[1]}`;
      else if (names.length > 2) text = `${names[0]}, ${names[1]} and ${names.length - 2} more`;
      this.buildNames.set(value, text);
    }
  }

  /** Randomizes a costume cleanly within valid ranges (preserving male/female build ranges). */
  randomize(costume: WrestlerCostume, rng: () => number = Math.random): void {
    const pick = (low: number, high: number) => low + Math.floor(rng() * (high - low + 1));
    const bodyField = this.byName.get("body_type")!;
    this.setValue(costume, "body_type", pick(bodyField.first, bodyField.last));
    for (const field of this.fields) {
      if (field.name === "body_type") continue;
      const [low, high] = this.range(costume, field);
      if (field.noneAtZero && field.name !== "ring_attire" && field.name !== "boots" && rng() < 0.65) {
        this.setValue(costume, field.name, 0);
      } else {
        this.setValue(costume, field.name, pick(low, high));
      }
    }
  }
}

// ------------------------------------------------------------------ indexed PNG & tile composition

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface DecodedIndexedPng {
  width: number;
  height: number;
  depth: number;
  rowBytes: number;
  rows: Uint8Array;
}

/** Decode an indexed-colour (type 3) PNG to packed scanline indices, palette untouched. */
export async function decodeIndexedPng(bytes: Uint8Array): Promise<DecodedIndexedPng> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error("not a PNG");
  }
  let width = 0;
  let height = 0;
  let depth = 0;
  const parts: Uint8Array[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = data[8];
      if (data[9] !== 3) throw new Error("not an indexed-colour PNG");
      if (data[12]) throw new Error("interlaced PNGs are not supported");
    } else if (type === "IDAT") {
      parts.push(data);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  const raw = await inflate(joined);
  const rowBytes = Math.ceil((width * depth) / 8);
  const rows = new Uint8Array(rowBytes * height);
  const step = Math.max(1, depth >> 3);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (rowBytes + 1)];
    const line = raw.subarray(row * (rowBytes + 1) + 1, (row + 1) * (rowBytes + 1));
    const out = rows.subarray(row * rowBytes, (row + 1) * rowBytes);
    const above = row ? rows.subarray((row - 1) * rowBytes, row * rowBytes) : new Uint8Array(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= step ? out[x - step] : 0;
      const up = above[x];
      const corner = x >= step ? above[x - step] : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      out[x] = (line[x] + add) & 255;
    }
  }
  return { width, height, depth, rowBytes, rows };
}

export interface PicturePayload {
  width: number;
  height: number;
  eightBit: boolean;
  payload: Uint8Array;
}

export function pictureOf(entry: ManifestPictureEntry, png: DecodedIndexedPng): PicturePayload {
  return {
    width: entry.width,
    height: entry.height,
    eightBit: entry.format === "ci8",
    payload: png.rows.subarray(0, entry.bytes),
  };
}

export function paletteBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

const widen5 = (value: number): number => ((value << 3) | (value >> 2)) & 255;

/** Widens an N64 RGBA5551 16-bit word to 0xRRGGBBAA. */
export function rgba5551(word: number): number {
  return (
    ((widen5((word >> 11) & 31) << 24) |
      (widen5((word >> 6) & 31) << 16) |
      (widen5((word >> 1) & 31) << 8) |
      (word & 1 ? 255 : 0)) >>>
    0
  );
}

export interface ComposedTile {
  width: number;
  height: number;
  indices: Uint8Array;
  colours: Uint16Array;
  source: number;
  rgba?: Uint8ClampedArray;
}

export function tileRgba(tile: ComposedTile): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(tile.width * tile.height * 4);
  for (let index = 0; index < tile.indices.length; index += 1) {
    const colour = rgba5551(tile.colours[tile.indices[index]]);
    rgba[index * 4] = colour >>> 24;
    rgba[index * 4 + 1] = (colour >>> 16) & 255;
    rgba[index * 4 + 2] = (colour >>> 8) & 255;
    rgba[index * 4 + 3] = colour & 255;
  }
  return rgba;
}

export interface TileAssetStore {
  picture(id: number): PicturePayload;
  palette(id: number): Uint8Array;
}

const PALETTE_SIZE = 256;
const SKIN_ROW = 16;

function loadTile(store: TileAssetStore, pixelsId: number, paletteId: number): ComposedTile {
  const { width, height, eightBit, payload } = store.picture(pixelsId);
  const palette = store.palette(paletteId);
  const indices = new Uint8Array(width * height);
  for (let index = 0; index < indices.length; index += 1) {
    if (eightBit) indices[index] = payload[index];
    else indices[index] = index & 1 ? payload[index >> 1] & 15 : payload[index >> 1] >> 4;
  }
  const colours = new Uint16Array(PALETTE_SIZE);
  for (let index = 0; index < Math.min(PALETTE_SIZE, palette.length / 2); index += 1) {
    colours[index] = (palette[index * 2] << 8) | palette[index * 2 + 1];
  }
  return { width, height, indices, colours, source: pixelsId };
}

function drawLayer(
  store: TileAssetStore,
  target: ComposedTile,
  pixelsId: number,
  paletteId: number,
  base: number,
  rowOffset: number,
  layerColours: number,
): boolean {
  if (!pixelsId || !paletteId) return false;
  const { width, height, payload } = store.picture(pixelsId);
  const palette = store.palette(paletteId);
  const colourAt = (index: number) => (palette[index * 2] << 8) | palette[index * 2 + 1];
  if (width !== target.width || target.height < rowOffset) return false;
  const rows = Math.min(target.height - Math.abs(rowOffset), height);
  let destination = rowOffset >= 0 ? rowOffset * width : 0;
  let source = rowOffset < 0 ? -rowOffset * (width >> 1) : 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < width >> 1; column += 1) {
      const byte = payload[source];
      source += 1;
      for (const nibble of [byte >> 4, byte & 15]) {
        const index = Math.min(nibble, layerColours - 1);
        if (colourAt(index) !== 0) target.indices[destination] = index + base;
        destination += 1;
      }
    }
  }
  const count = Math.min(layerColours * 2, palette.length, (PALETTE_SIZE - base) * 2) >> 1;
  for (let index = 0; index < count; index += 1) target.colours[base + index] = colourAt(index);
  return true;
}

/** Extracts the colour ramp shade for key code `code` on channel `layer` (1 or 2), or -1. */
export function shadeOf(rules: CharacterManifest["rules"], code: number, layer: number): number {
  const mask = rules.rampMasks[layer];
  return (code & ~mask & 0xffff) !== 0 || code < 2 ? -1 : ((code & mask) >> rules.rampShifts[layer]) >> 1;
}

function recolour(
  manifest: CharacterManifest,
  target: ComposedTile,
  colours: readonly [number, number],
  base: number,
): void {
  const { rules } = manifest;
  const ramps = manifest.colours.costume;
  const shades = rules.costumeShades;
  for (let which = 0; which < 2; which += 1) {
    const colour = signed(colours[which]);
    if (colour <= 0) continue;
    for (let index = base; index < base + shades; index += 1) {
      const shade = shadeOf(rules, target.colours[(index + shades) & 255], which + 1);
      if (shade < 0) continue;
      target.colours[index & 255] = colour < rules.costumeColours ? ramps[colour][shades - 1 - shade] : 1;
    }
  }
}

/** Composes every active slot tile for a plan in palette-index space. */
export function composeSlots(
  manifest: CharacterManifest,
  plan: CostumePlan,
  store: TileAssetStore,
): Record<number, ComposedTile> {
  const t = manifest.tables;
  const bands = t.bands;
  const layerColours = manifest.rules.layerColours;
  const first = manifest.slots.extrasFirst;
  const out: Record<number, ComposedTile> = {};

  for (let slot = 1; slot < first; slot += 1) {
    if (!t.loaded[slot]) continue;
    const entry = plan.slots[slot];
    if (!entry.pixels || !entry.palette) continue;
    const tile = loadTile(store, entry.pixels, entry.palette);
    if (plan.skin > 0) {
      for (let index = 0; index < SKIN_ROW; index += 1) {
        tile.colours[index] = tile.colours[plan.skin * SKIN_ROW + index];
      }
    }
    out[slot] = tile;
  }

  for (let slot = first; slot < manifest.slots.count; slot += 1) {
    const entry = plan.slots[slot];
    if (!entry.pixels) continue;
    const tile = loadTile(store, entry.pixels, entry.palette);
    recolour(manifest, tile, entry.colours, 0);
    out[slot] = tile;
  }

  const hat = plan.layers.entranceHat?.[0] ?? (plan.hatsAllowed ? plan.layers.hats?.[0] : null);
  if (hat?.texture) {
    const tile = loadTile(store, hat.texture + 1, hat.texture);
    recolour(manifest, tile, hat.colours, 0);
    out[t.hats.slot] = tile;
  }

  const layered = (slot: number) => Boolean(t.layered[slot] && out[slot]);
  const draw = (target: ComposedTile, pixels: number, palette: number, base: number, offset: number) =>
    drawLayer(store, target, pixels, palette, base, offset, layerColours);

  const face = out[20];
  if (plan.facial && face) draw(face, plan.facial.pixels, plan.facial.palette, bands.facialHair, plan.facial.offset);

  for (const entry of plan.layers.tattoo ?? []) {
    if (!entry.texture || !layered(entry.slot)) continue;
    if (draw(out[entry.slot], entry.texture, entry.texture + plan.tone, bands.tattoo, 0)) {
      recolour(manifest, out[entry.slot], entry.colours, bands.tattoo);
    }
  }

  const apply = (entries: readonly LayerSlotEntry[] | undefined | null, base: number, offset = 0) => {
    for (const entry of entries ?? []) {
      if (!entry.texture || !layered(entry.slot)) continue;
      if (draw(out[entry.slot], entry.texture + 1, entry.texture, base, entry.slot === 20 ? offset : 0)) {
        recolour(manifest, out[entry.slot], entry.colours, base);
      }
    }
  };

  const steps = [
    () => apply(plan.layers.ring, bands.ring),
    () => apply(plan.layers.upper, bands.upper),
    () => (plan.layers.wristbands ?? []).forEach((list) => apply(list, bands.wristbands)),
    () => apply(plan.layers.boots, bands.boots),
    () => apply(plan.layers.masks, bands.mask, plan.maskOffset),
    () => {
      apply(plan.layers.elbowLeft, bands.elbows);
      apply(plan.layers.elbowRight, bands.elbows);
    },
    () => {
      apply(plan.layers.kneeLeft, bands.knees);
      apply(plan.layers.kneeRight, bands.knees);
    },
    () => apply(plan.layers.gloves, bands.gloves),
  ];

  for (const step of plan.steps) if (step < steps.length) steps[step]();
  if (plan.entranceBeforeHair) apply(plan.layers.entrance, bands.entrance);
  if (plan.frontHair && face && plan.frontHair.pixels > 0) {
    draw(face, plan.frontHair.pixels, plan.frontHair.palette, bands.hair, 0);
  }
  const hairPalette = t.hair.palettes[plan.hairColour];
  for (const entry of plan.layers.hair ?? []) {
    if (!entry.texture || !layered(entry.slot)) continue;
    if (draw(out[entry.slot], entry.texture, hairPalette, bands.hair, 0)) {
      recolour(manifest, out[entry.slot], entry.colours, bands.hair);
    }
  }
  if (!plan.entranceBeforeHair) apply(plan.layers.entrance, bands.entrance);
  if (plan.hatsAllowed) apply(plan.layers.hats, bands.hat);
  return out;
}

/** Collects every picture and palette id that composeSlots will read for `plan`. */
export function filesForPlan(
  manifest: CharacterManifest,
  plan: CostumePlan,
): { pictures: number[]; palettes: number[] } {
  const pictures = new Set<number>();
  const palettes = new Set<number>();
  const empty = new Uint8Array(0);
  const store: TileAssetStore = {
    picture: (id) => {
      pictures.add(id);
      return { width: 0, height: 0, eightBit: true, payload: empty };
    },
    palette: (id) => {
      palettes.add(id);
      return empty;
    },
  };
  composeSlots(manifest, plan, store);
  return { pictures: [...pictures], palettes: [...palettes] };
}
