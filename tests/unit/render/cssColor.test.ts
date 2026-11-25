import { expect, it } from "vitest";
import { cssColorToRgb } from "@/render/arena/cssColor";

it("parses the colour forms the arena schema allows", () => {
  expect(cssColorToRgb("#f00")).toEqual({ r: 1, g: 0, b: 0 });
  expect(cssColorToRgb("#00FF00")).toEqual({ r: 0, g: 1, b: 0 });
  expect(cssColorToRgb(" rgb(0, 0, 255) ")).toEqual({ r: 0, g: 0, b: 1 });
  expect(cssColorToRgb("rgba(255, 0, 0, 0.4)")).toEqual({ r: 1, g: 0, b: 0 });
});

it("refuses anything else rather than guessing", () => {
  for (const value of ["red", "#ff00", "rgb(256, 0, 0)", "hsl(0, 100%, 50%)", ""]) {
    expect(cssColorToRgb(value)).toBeNull();
  }
});
