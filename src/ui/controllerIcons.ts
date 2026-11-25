import { requireAsset } from "@/content/assets";

/** Shared N64 controller button SVG icons used by both Main Menus and Configuration Menus. */
export type ControllerIconKey = "dPad" | "stick" | "a" | "b" | "c" | "l" | "r" | "z" | "start";

export interface ControllerIconMeta {
  readonly src: string;
  readonly alt: string;
}

export function loadControllerIcons(): Record<ControllerIconKey, ControllerIconMeta> {
  return {
    dPad: { src: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-D-Pad.svg"), alt: "D-Pad" },
    stick: { src: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-Control_Stick.svg"), alt: "Control Stick" },
    a: { src: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-A.svg"), alt: "A button" },
    b: { src: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-B.svg"), alt: "B button" },
    c: { src: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-C.svg"), alt: "C buttons" },
    l: { src: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-L.svg"), alt: "L button" },
    r: { src: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-R.svg"), alt: "R button" },
    z: { src: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-D-Z.svg"), alt: "Z button" },
    start: { src: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-Start.svg"), alt: "Start button" },
  };
}

export interface ControllerHintItem {
  /** One or more controller icons rendered before the label (e.g. `["l", "r"]`). */
  readonly icons: readonly ControllerIconKey[];
  readonly label: string;
}
