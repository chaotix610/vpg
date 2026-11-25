import { afterEach, expect, it, vi } from "vitest";
import { readJson, removeSavedValue, writeJson } from "@/save/storage";

afterEach(() => vi.unstubAllGlobals());

it("ignores corrupt stored JSON", () => {
  vi.stubGlobal("localStorage", { getItem: () => "{bad json" });
  expect(readJson("settings")).toBeNull();
});

it("remains usable when browser storage is blocked", () => {
  const blocked = () => { throw new Error("Storage blocked"); };
  vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
  expect(readJson("settings")).toBeNull();
  expect(() => writeJson("settings", { volume: 0.5 })).not.toThrow();
  expect(() => removeSavedValue("settings")).not.toThrow();
});
