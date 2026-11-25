import { describe, expect, it } from "vitest";
import { currentAssetPath, publicAssetUrl } from "@/content/assetPaths";

describe("currentAssetPath", () => {
  it("follows a moved folder and leaves everything else alone", () => {
    expect(currentAssetPath("assets/environments/arenas/shared/ring/textures/rope/rope.png"))
      .toBe("assets/environments/ring/textures/rope/rope.png");
    for (const unchanged of [
      "assets/environments/ring/textures/rope/rope.png",
      "assets/environments/arenas/shared/textures/ring_steps.png",
      "user-image:abc",
      "#ff0000",
    ]) {
      expect(currentAssetPath(unchanged)).toBe(unchanged);
    }
  });
});

describe("public asset paths", () => {
  it("preserves subpath deployments and encodes filenames", () => {
    expect(publicAssetUrl("assets/animations/move #1.glb", "/vpg/"))
      .toBe("/vpg/assets/animations/move%20%231.glb");
  });

  it("supports relative deployment bases and explicit asset hosts", () => {
    expect(publicAssetUrl("assets/ui/logo.png", "./")).toBe("./assets/ui/logo.png");
    expect(publicAssetUrl("assets/characters/model.glb", "https://cdn.example/vpg"))
      .toBe("https://cdn.example/vpg/assets/characters/model.glb");
  });
});
