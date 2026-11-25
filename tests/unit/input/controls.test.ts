import { afterEach, beforeEach, expect, it, vi } from "vitest";
import savedBindings from "../../fixtures/saved-bindings.json";
import {
  applyMapping,
  bindInput,
  controlForBinding,
  defaultMapping,
  keysForControl,
  loadSavedBindings,
  resetBindings,
  setMappingPersistence,
  STORAGE_KEY,
} from "@/input/controls";

let saved: Map<string, string>;

beforeEach(() => {
  saved = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  });
  setMappingPersistence(null);
  applyMapping(defaultMapping());
});

afterEach(() => vi.unstubAllGlobals());

it("restores partial saves while keeping deliberate unbindings and dropping non-string inputs", () => {
  saved.set(STORAGE_KEY, JSON.stringify(savedBindings));
  loadSavedBindings();
  expect(keysForControl("a")).toEqual(["KeyP"]);
  expect(keysForControl("l")).toEqual([]);
  expect(keysForControl("b")).toEqual(defaultMapping().bindings.b);
  expect(controlForBinding("KeyP")).toBe("a");
});

it("persists a rebind across hydration and clears it on reset", () => {
  bindInput("l", "KeyP");
  applyMapping(defaultMapping());
  loadSavedBindings();
  expect(keysForControl("l")).toContain("KeyP");
  resetBindings();
  expect(keysForControl("l")).toEqual(defaultMapping().bindings.l);
  expect(saved.has(STORAGE_KEY)).toBe(false);
});
