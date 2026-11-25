import { expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import controlSchema from "../../../schemas/control-mappings.schema.json";
import menuSchema from "../../../schemas/main-menu.schema.json";
import mapping from "#data/settings/control-mappings.json";
import menu from "#data/ui/main-menu.json";

it("accepts shipped content and rejects invalid control inputs", () => {
  const validate = new Ajv2020().compile(controlSchema);
  expect(validate(mapping)).toBe(true);
  expect(validate({ ...mapping, bindings: { ...mapping.bindings, a: ["gamepad:button:bad"] } })).toBe(false);
});

it("rejects a menu page whose required image reference was removed", () => {
  const validate = new Ajv2020().compile(menuSchema);
  expect(validate(menu)).toBe(true);
  const invalid = structuredClone(menu);
  Reflect.deleteProperty(invalid.pages.mainMenu, "headingImage");
  expect(validate(invalid)).toBe(false);
});
