/**
 * Application entry module. Teaching focus: how this file connects one project boundary to the next.
 * File: src/input/VirtualController.ts
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
import { type PadControl, controlForBinding } from "./controls";

/**
 * The virtual controller the menus consume.
 *
 * Menus never look at key names. A keyboard event becomes a pad control via
 * the bindings, and the pad control becomes a virtual input here, so rebinding
 * a key in the mapper changes menu navigation too without any screen knowing
 * about it.
 *
 * Copied from VirtualProGrappler-V2 without its combat half (VirtualPad and
 * connectVirtualController), which depends on V2's combat engine.
 */

export type VirtualInput =
  | "up"
  | "down"
  | "left"
  | "right"
  | "stickUp"
  | "stickDown"
  | "stickLeft"
  | "stickRight"
  | "a"
  | "b"
  | "z"
  | "start"
  | "l"
  | "r"
  | "cUp"
  | "cDown"
  | "cLeft"
  | "cRight";

const VIRTUAL_BY_CONTROL: Record<PadControl, VirtualInput> = {
  dpadUp: "up",
  dpadDown: "down",
  dpadLeft: "left",
  dpadRight: "right",
  controlStickUp: "stickUp",
  controlStickDown: "stickDown",
  controlStickLeft: "stickLeft",
  controlStickRight: "stickRight",
  a: "a",
  b: "b",
  z: "z",
  start: "start",
  l: "l",
  r: "r",
  cUp: "cUp",
  cDown: "cDown",
  cLeft: "cLeft",
  cRight: "cRight",
};

/**
 * The identifier a keyboard event is bound by.
 *
 * `code` is the physical key and is what the bindings store; `key` is the
 * fallback for events that carry no code.
 */
export function eventCode(event: KeyboardEvent): string {
  return event.code || event.key;
}

export function bindingForPointer(event: PointerEvent): string | null {
  if (event.pointerType !== "mouse" || event.button < 0 || event.button > 4) {
    return null;
  }
  return `mouse:${event.button}`;
}

export function isInteractivePointerTarget(event: PointerEvent): boolean {
  return event.target instanceof Element && Boolean(
    event.target.closest("button, input, select, textarea, a, .item, .row")
  );
}

export function virtualInputForBinding(binding: string): VirtualInput | null {
  const control = controlForBinding(binding);
  return control ? VIRTUAL_BY_CONTROL[control] : null;
}

/** The virtual input a keyboard or pointer event stands for, if any. */
export function virtualInputFor(event: KeyboardEvent | PointerEvent): VirtualInput | null {
  const binding = "code" in event ? eventCode(event) : bindingForPointer(event);
  if (!binding) return null;
  return virtualInputForBinding(binding);
}

export interface GamepadPollOptions {
  /** Called once when a reported button or direction is let go. */
  onRelease?: (binding: string) => void;
  /**
   * Which held bindings auto-repeat, like a held keyboard key. Off unless
   * given, so the menus only ever see one press per press.
   */
  repeat?: (binding: string) => boolean;
  /** Hold time before the first repeat, in ms. */
  repeatDelay?: number;
  /** Time between repeats after that, in ms. */
  repeatInterval?: number;
}

/**
 * Reports each newly pressed gamepad button or stick direction once, and again
 * while held for bindings that `options.repeat` accepts (`repeat` is then true).
 */
export function pollGamepadBindings(
  onBinding: (binding: string, repeat: boolean) => void,
  options: GamepadPollOptions = {}
): () => void {
  const { onRelease, repeat, repeatDelay = 380, repeatInterval = 75 } = options;
  let previous = new Set<string>();
  /** When each held, repeating binding fires next. */
  const nextRepeat = new Map<string, number>();
  let frame = 0;

  const poll = (now: number) => {
    const active = new Set<string>();
    const seen = (binding: string) => {
      active.add(binding);
      if (!previous.has(binding)) {
        onBinding(binding, false);
        if (repeat?.(binding)) nextRepeat.set(binding, now + repeatDelay);
        return;
      }
      const due = nextRepeat.get(binding);
      if (due !== undefined && now >= due) {
        nextRepeat.set(binding, now + repeatInterval);
        onBinding(binding, true);
      }
    };
    for (const gamepad of navigator.getGamepads?.() ?? []) {
      if (!gamepad?.connected) continue;
      gamepad.buttons.forEach((button, index) => {
        if (!button.pressed && button.value < 0.5) return;
        seen(`gamepad:button:${index}`);
      });
      gamepad.axes.forEach((value, index) => {
        if (Math.abs(value) < 0.55) return;
        const direction = value > 0 ? "positive" : "negative";
        seen(`gamepad:axis:${index}:${direction}`);
      });
    }
    for (const binding of previous) {
      if (active.has(binding)) continue;
      nextRepeat.delete(binding);
      onRelease?.(binding);
    }
    previous = active;
    frame = requestAnimationFrame(poll);
  };

  frame = requestAnimationFrame(poll);
  return () => cancelAnimationFrame(frame);
}

/** Whether an input moves a menu cursor up, from either stick or d-pad. */
export function isMenuUp(input: VirtualInput): boolean {
  return input === "up" || input === "stickUp";
}

/** Whether an input moves a menu cursor down, from either stick or d-pad. */
export function isMenuDown(input: VirtualInput): boolean {
  return input === "down" || input === "stickDown";
}
