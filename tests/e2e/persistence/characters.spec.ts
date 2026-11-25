import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function openCharacterEditor(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "Commissioner", exact: true }).click();
  await page.getByRole("button", { name: "Character Editor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CHARACTER EDITOR", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SELECT WRESTLER", exact: true })).toBeVisible();
  await expect(page.locator('.stage-canvas[data-active="true"]')).toBeVisible({ timeout: 60_000 });
}

async function canvasHasContent(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 64;
    const ctx = probe.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 20) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return colours.size > 15;
  });
}

test("character editor renders a 71-bone VPG Rig 2.0 wrestler and navigates all console screens with D-Pad", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openCharacterEditor(page);

  // Uses the 71-bone VPG Rig 2.0 (not the 19-bone AKI rig)
  await expect(page.locator("[data-rig-bones]")).toHaveAttribute("data-rig-bones", "71");
  await expect(page.locator("[data-model-facts]")).toContainText("71 VPG BONES");
  await expect.poll(() => canvasHasContent(page, ".stage-canvas")).toBe(true);

  // Select The Rock from roster -> enters CHARACTER OPTIONS
  await page.locator('[data-wrestler-id="the-rock"]').click();
  await expect(page.getByRole("heading", { name: "CHARACTER OPTIONS", exact: true })).toBeVisible();
  await expect(page.locator("[data-wrestler-title]")).toHaveText("THE ROCK");

  // Analog stick (WASD by default) rotates model left/right and zooms in/out without moving menu cursor
  const readCam = async () =>
    page.locator(".stage-canvas").evaluate((el: HTMLCanvasElement) => ({
      alpha: Number(el.dataset.camAlpha),
      radius: Number(el.dataset.camRadius),
    }));
  const cam0 = await readCam();
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(220);
  await page.keyboard.up("KeyA");
  const camLeft = await readCam();
  expect(camLeft.alpha).toBeGreaterThan(cam0.alpha + 0.15);

  await page.keyboard.down("KeyD");
  await page.waitForTimeout(420);
  await page.keyboard.up("KeyD");
  const camRight = await readCam();
  expect(camRight.alpha).toBeLessThan(cam0.alpha - 0.1);

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyW");
  const camIn = await readCam();
  expect(camIn.radius).toBeLessThan(cam0.radius - 0.25);

  await page.keyboard.down("KeyS");
  await page.waitForTimeout(450);
  await page.keyboard.up("KeyS");
  const camOut = await readCam();
  expect(camOut.radius).toBeGreaterThan(camIn.radius + 0.4);
  await expect(page.locator('[data-option-id="profile"]')).toHaveClass(/game-bar--active/);

  // D-Pad Right reaches top-right BACK bar; Left returns to options list
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-nav-back]")).toHaveClass(/game-bar--active/);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-option-id="profile"]')).toHaveClass(/game-bar--active/);

  // D-Pad Down to APPEARANCE and Enter -> 2-column Appearance hub
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-option-id="appearance"]')).toHaveClass(/game-bar--active/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "APPEARANCE", exact: true })).toBeVisible();
  await expect(page.locator('[data-appearance-cat="body"]')).toHaveClass(/game-bar--active/);

  // 2D D-Pad across left column -> right column -> top-right BACK -> back to BODY
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-appearance-cat="head"]')).toHaveClass(/game-bar--active/);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-appearance-cat="gloves"]')).toHaveClass(/game-bar--active/);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('[data-appearance-cat="tattoo"]')).toHaveClass(/game-bar--active/);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("[data-nav-back]")).toHaveClass(/game-bar--active/);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-appearance-cat="body"]')).toHaveClass(/game-bar--active/);

  // Open BODY detail, step value with D-Pad Right, open/close Quick Picker with Enter/Escape
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "BODY", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator(".picker-box")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".picker-box")).toHaveCount(0);

  // B/Escape returns APPEARANCE DETAIL -> APPEARANCE -> CHARACTER OPTIONS
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-appearance-cat="body"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-option-id="appearance"]')).toBeVisible();

  // Navigate to MOVES (10 categories + 3D ring + real VPG Rig 2.0 animations)
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-option-id="moves"]')).toHaveClass(/game-bar--active/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "MOVES", exact: true })).toBeVisible();
  await expect(page.locator("[data-move-cat]")).toHaveCount(10);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-move-cat="standing"]')).toHaveClass(/game-bar--active/);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('[data-move-cat="grappling"]')).toHaveClass(/game-bar--active/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "GRAPPLING", exact: true })).toBeVisible();
  await expect(page.locator('[role="listbox"] [role="option"]').first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => canvasHasContent(page, ".stage-canvas")).toBe(true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Open FIGHTING STYLE -> toggle 71-bone VPG Rig overlay and verify 71 (52 DEF)
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-option-id="fightingStyle"]')).toHaveClass(/game-bar--active/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "FIGHTING STYLE", exact: true })).toBeVisible();
  await expect(page.getByText("71 (52 DEF)")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-style-row="rig"]')).toContainText("BODY 52 BONES");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-style-row="rig"]')).toContainText("ALL 71 BONES");
  await page.keyboard.press("Escape");

  // Open PARAMETERS (2-column OFFENSE / DEFENSE sliders) -> adjust Offense HEAD & switch column with R to Defense HEAD
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-option-id="parameter"]')).toHaveClass(/game-bar--active/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "PARAMETERS", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OFFENSE", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DEFENSE", exact: true })).toBeVisible();
  const offenseHead = page.locator('[data-param-row="attack.head"]');
  await expect(offenseHead).toHaveClass(/cfg-param-slider--active/);
  const beforeOffenseHead = Number(await offenseHead.locator(".cfg-param-slider__knob").textContent());
  await page.keyboard.press("ArrowRight");
  await expect(offenseHead.locator(".cfg-param-slider__knob")).toHaveText(String(Math.min(5, beforeOffenseHead + 1)));
  await page.keyboard.press("KeyE"); // R: jump to DEFENSE column
  await expect(page.locator('[data-param-row="defence.head"]')).toHaveClass(/cfg-param-slider--active/);
  await page.keyboard.press("Escape");

  // Back out to SELECT WRESTLER -> Commissioner menu
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "SELECT WRESTLER", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Character Editor", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("character editor creates via D-Pad, persists, exports 71-bone VPG GLB, plays in Animation Viewer, and deletes", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openCharacterEditor(page);

  // Roster starts on slot 1 (DEFAULT WRESTLER); D-Pad Up reaches + CREATE NEW WRESTLER
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "CHARACTER OPTIONS", exact: true })).toBeVisible();
  await expect(page.locator("[data-wrestler-title]")).toContainText("NEW WRESTLER");

  // Enter PROFILE (option 0) and edit FULL NAME inline
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "PROFILE", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  const fullNameInput = page.locator(".inline-text");
  await expect(fullNameInput).toBeVisible();
  await fullNameInput.fill("VPG CHAMPION");
  await fullNameInput.press("Enter");
  await expect(page.locator("[data-wrestler-title]")).toHaveText("VPG CHAMPION");

  // Back to CHARACTER OPTIONS -> APPEARANCE -> RING ATTIRE -> adjust attire & colour
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.locator('[data-appearance-cat="ring_attire"]').click();
  await expect(page.getByRole("heading", { name: "RING ATTIRE", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => canvasHasContent(page, ".stage-canvas")).toBe(true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Open PROFILE -> EXPORT VPG GLB and verify its 71-bone skin
  await page.locator('[data-option-id="profile"]').click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-profile-row="exportGlb"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^vpg-champion-c1-vpg\.glb$/);
  const glbPath = await download.path();
  expect(glbPath).toBeTruthy();
  const glbBuf = readFileSync(glbPath!);
  expect(glbBuf.readUInt32LE(0)).toBe(0x46546c67);
  const jsonLen = glbBuf.readUInt32LE(12);
  const gltf = JSON.parse(glbBuf.subarray(20, 20 + jsonLen).toString("utf8"));
  expect(gltf.skins[0].joints).toHaveLength(71);

  // Reload page and confirm custom wrestler persisted in SELECT WRESTLER
  await openCharacterEditor(page);
  const customRow = page.locator(".game-bar--roster", { hasText: "VPG CHAMPION" });
  await expect(customRow).toBeVisible();

  // Confirm custom wrestler can also be opened in Animation Viewer
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Animation Viewer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Animation Viewer" })).toBeVisible();
  await page.locator(".row", { hasText: "Character" }).click();
  await expect(page.getByRole("option", { name: "VPG CHAMPION (Custom)" })).toBeVisible();
  await page.getByRole("option", { name: "VPG CHAMPION (Custom)" }).click();
  await expect(page.locator(".row", { hasText: "Character" })).toContainText("VPG CHAMPION (Custom)");
  await page.getByRole("button", { name: "Back to Menu", exact: true }).click();

  // Delete custom wrestler (two-press confirmation inside PROFILE)
  await page.getByRole("button", { name: "Character Editor", exact: true }).click();
  await expect(page.locator('.stage-canvas[data-active="true"]')).toBeVisible({ timeout: 60_000 });
  await page.locator(".game-bar--roster", { hasText: "VPG CHAMPION" }).click();
  await page.locator('[data-option-id="profile"]').click();
  const deleteRow = page.locator('[data-profile-row="delete"]');
  await deleteRow.click();
  await expect(deleteRow).toContainText("CONFIRM DELETE");
  await deleteRow.click();
  await expect(page.getByRole("heading", { name: "SELECT WRESTLER", exact: true })).toBeVisible();
  await expect(page.locator(".game-bar--roster", { hasText: "VPG CHAMPION" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
