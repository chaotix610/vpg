import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import slotsSchema from "../../../schemas/move-slots.schema.json";
import movesSchema from "../../../schemas/moves.schema.json";
import slotsFile from "#data/combat/MOVE-SLOTS.json";
import movesFile from "#data/combat/MOVES.json";

const ajv = new Ajv2020({ allErrors: true });
const validateSlots = ajv.compile(slotsSchema);
const validateMoves = ajv.compile(movesSchema);
const slot = slotsFile.slots[0];
const pattern = slot.input_pattern!;
const move = movesFile.moves[0];

const withSlot = (changes: Record<string, unknown>) => ({
  ...slotsFile,
  slots: [{ ...slot, ...changes }],
});
const withMove = (changes: Record<string, unknown>) => ({
  ...movesFile,
  moves: [{ ...move, ...changes }],
});

describe("combat catalog schemas", () => {
  it("validates every authored slot and move", () => {
    expect(validateSlots(slotsFile), ajv.errorsText(validateSlots.errors)).toBe(true);
    expect(validateMoves(movesFile), ajv.errorsText(validateMoves.errors)).toBe(true);
  });

  it("rejects unsupported versions, missing fields and unexpected properties", () => {
    expect(validateSlots({ ...slotsFile, schema_version: 3 })).toBe(false);
    expect(validateMoves({ ...movesFile, schema_version: 2 })).toBe(false);
    expect(validateSlots(withSlot({ actor_state: undefined }))).toBe(false);
    expect(validateMoves(withMove({ move_id: undefined }))).toBe(false);
    expect(validateSlots(withSlot({ requires_run: true }))).toBe(false);
    expect(validateMoves(withMove({ slot_id: "front_weak_grapple_1" }))).toBe(false);
    expect(validateMoves({ ...movesFile, unexpected: true })).toBe(false);
  });

  it("preserves numeric move ids, string sentinels, comma-separated lists and repeated variants", () => {
    const variant = {
      ...move,
      move_id: "450_splash",
      groups: "flying_attack,flying_attack_special",
      slot_ids: "flying_attack_1,flying_attack_2",
      power: "null",
      actor_animation_id: "null",
      target_animation_id: "null",
    };
    expect(validateMoves({ ...movesFile, moves: [variant, { ...variant, power: "S" }] })).toBe(true);
  });

  it("accepts populated animation overrides", () => {
    expect(validateMoves(withMove({
      slot_animation_overrides: "front_weak_grapple_1:arm-drag.glb;front_weak_grapple_2:null",
    }))).toBe(true);
  });

  it.each([
    ["native booleans instead of imported strings", { ko: true }],
    ["native null instead of a string sentinel", { power: null }],
    ["an unsupported power grade", { power: "H" }],
    ["an unsupported feature", { feature: "finisher" }],
    ["arrays instead of comma-separated slot ids", { slot_ids: ["front_weak_grapple_1"] }],
    ["malformed group lists", { groups: "front_weak_grapple_a," }],
    ["asset paths instead of animation filenames", { actor_animation_id: "assets/animations/arm-drag.glb" }],
    ["an animation without a GLB extension", { target_animation_id: "arm-drag-target" }],
    ["malformed animation override pairs", { slot_animation_overrides: "front_weak_grapple_1=arm-drag.glb" }],
  ])("rejects %s", (_label, changes) => {
    expect(validateMoves(withMove(changes))).toBe(false);
  });

  it("accepts automatic slots and direction-only manual inputs", () => {
    for (const input of [null, "Automatic"]) {
      expect(validateSlots(withSlot({ trigger: "automatic", input, input_pattern: null }))).toBe(true);
    }
    expect(validateSlots(withSlot({
      input_pattern: { ...pattern, buttons: [], control_stick: ["any"] },
    }))).toBe(true);
  });

  it("accepts mash pools, button alternatives and run-release inputs", () => {
    expect(validateSlots(withSlot({
      input_pattern: {
        dpad: null, control_stick: null, modifier: "rapid_tap",
        requires_run: false, release_run: false, mash_buttons: ["a", "b"],
      },
    }))).toBe(true);
    expect(validateSlots(withSlot({
      input_pattern: { ...pattern, buttons: [], button_alternatives: [["a", "b"]] },
    }))).toBe(true);
    expect(validateSlots(withSlot({
      input_pattern: { ...pattern, requires_run: true, release_run: true },
    }))).toBe(true);
  });

  it.each([
    ["empty actor states", { actor_state: [] }],
    ["string special flags", { requires_special: "false" }],
    ["an unsupported range", { range: "far" }],
    ["a manual slot without a matcher", { input_pattern: null }],
    ["an automatic slot with a matcher", { trigger: "automatic" }],
    ["a matcher without buttons or a mash pool", { input_pattern: { ...pattern, buttons: undefined } }],
    ["simultaneous buttons and a mash pool", { input_pattern: { ...pattern, mash_buttons: ["a", "b"] } }],
    ["unknown controller buttons", { input_pattern: { ...pattern, buttons: ["punch"] } }],
    ["unknown directions", { input_pattern: { ...pattern, dpad: ["diagonal"] } }],
    ["any mixed with a cardinal direction", { input_pattern: { ...pattern, dpad: ["any", "up"] } }],
    ["empty button alternatives", { input_pattern: { ...pattern, button_alternatives: [[]] } }],
    ["run release without holding run", { input_pattern: { ...pattern, release_run: true } }],
  ])("rejects %s", (_label, changes) => {
    expect(validateSlots(withSlot(changes))).toBe(false);
  });
});
