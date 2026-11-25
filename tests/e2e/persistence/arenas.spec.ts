import { expect, test, type Page } from "@playwright/test";

// Arena GLBs render through software GL in headless Chromium; a full arena
// load takes several seconds, and these tests load several.
test.describe.configure({ timeout: 120_000 });

/** Collects page errors so a scene that "renders" while throwing still fails. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function openCommissioner(page: Page, item: "Arena Viewer" | "Arena Editor") {
  await page.goto("./");
  await page.getByRole("button", { name: "Commissioner", exact: true }).click();
  await page.getByRole("button", { name: item, exact: true }).click();
}

/** Whether the canvas has drawn more than its clear colour. */
async function canvasHasContent(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 64;
    const ctx = probe.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return colours.size > 20;
  });
}

test("arena viewer renders a bundled arena and backs out with B", async ({ page }) => {
  const errors = trackErrors(page);
  await openCommissioner(page, "Arena Viewer");
  await expect(page.getByRole("heading", { name: "Arena Viewer" })).toBeVisible();
  await expect(page.locator(".row", { hasText: "Royal Rumble" })).toBeVisible();

  await page.locator(".row", { hasText: "RAW is WAR" }).click();
  await expect(page.locator(".hud__name")).toHaveText("RAW is WAR");
  await expect(page.locator(".loading")).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(() => canvasHasContent(page, ".viewer__canvas")).toBe(true);
  await expect(page.locator(".position")).toBeVisible();

  // The camera answers the mapped stick (D = stick right).
  const alpha = () => page.locator(".position dd").nth(2).textContent();
  const before = await alpha();
  await page.keyboard.press("KeyD");
  await expect.poll(alpha).not.toBe(before);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Arena Viewer" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Arena Editor", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("arena editor clones, saves, lists and deletes a custom arena", async ({ page }) => {
  const errors = trackErrors(page);
  await openCommissioner(page, "Arena Editor");
  await page.locator(".row", { hasText: "RAW is WAR" }).click();

  // A bundled arena opens as a clone under a free id.
  await expect(page.locator(".panel__title")).toHaveText("New arena");
  await expect(page.getByLabel("Arena ID")).toHaveValue("raw_copy");
  await expect(page.locator(".work__loading")).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(() => canvasHasContent(page, ".work__canvas")).toBe(true);

  await page.getByLabel("Display name").fill("My Test Arena");
  const environment = page.locator(".group").filter({ has: page.getByRole("heading", { name: "Stage", exact: true }) });
  await expect(environment.getByRole("combobox", { name: "Floor", exact: true }).locator("option")).toHaveText(["Standard Floor"]);
  await expect(environment.getByRole("combobox", { name: "Barricade", exact: true }).locator("option")).toHaveText(["Standard Barricade"]);
  await page.getByRole("combobox", { name: "Stage", exact: true }).selectOption("monday_nitro");
  const outer = page.getByRole("combobox", { name: "Arena outer", exact: true });
  await expect(outer.locator("option")).toHaveText(["Standard Arena Bowl", "Monday Nitro Arena Bowl"]);
  await outer.selectOption({ label: "Monday Nitro Arena Bowl" });
  await expect(outer).toHaveValue("nitro_outer");
  await page.getByRole("combobox", { name: "Stage", exact: true }).selectOption("royal_rumble");
  await expect(page.getByRole("combobox", { name: "Floor", exact: true })).toHaveValue("royal_rumble_floor");
  await expect(page.getByRole("combobox", { name: "Floor", exact: true }).locator("option")).toHaveText(["Royal Rumble Floor"]);
  await expect(outer).toHaveValue("royal_rumble_outer");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".panel__status")).toContainText("Created “My Test Arena”");
  await expect(page.getByLabel("Arena ID")).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("vpg-arenas")!).arenas[0])).toMatchObject({
    stage: "royal_rumble", floor: "royal_rumble_floor", barricade: "royal_rumble_barricade", outer: "royal_rumble_outer",
  });

  // Saved arenas survive a reload and show in the viewer.
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await openCommissioner(page, "Arena Viewer");
  const row = page.locator(".row", { hasText: "My Test Arena" });
  await expect(row.locator(".row__tag")).toHaveText("Custom");
  await row.click();
  await expect(page.locator(".loading")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".hud__warning")).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // Delete takes two presses.
  await openCommissioner(page, "Arena Editor");
  await page.locator(".row", { hasText: "My Test Arena" }).locator(".row__name").click();
  await expect(page.getByLabel("Arena ID")).toHaveValue("raw_copy");
  const del = page.getByRole("button", { name: "Delete", exact: true });
  await del.click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Arena Editor" })).toBeVisible();
  await expect(page.locator(".row", { hasText: "My Test Arena" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("arena editor recovers an unfinished draft after a reload", async ({ page }) => {
  await openCommissioner(page, "Arena Editor");
  await page.locator(".row", { hasText: "Royal Rumble" }).locator(".row__name").click();
  await page.getByLabel("Display name").fill("Half Done");

  await openCommissioner(page, "Arena Editor");
  await expect(page.locator(".panel__status")).toContainText("Recovered your unfinished arena draft");
  await expect(page.getByLabel("Display name")).toHaveValue("Half Done");

  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await openCommissioner(page, "Arena Editor");
  await expect(page.getByRole("heading", { name: "Arena Editor" })).toBeVisible();
});

test("arena editor rejects a taken id and drives fields from the pad", async ({ page }) => {
  await openCommissioner(page, "Arena Editor");
  // The editor is a lazy chunk; keys pressed before it mounts go nowhere.
  await expect(page.getByRole("heading", { name: "Arena Editor" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("KeyZ"); // Clone the highlighted arena.
  await expect(page.locator(".panel__title")).toHaveText("New arena");

  const id = page.getByLabel("Arena ID");
  await expect(id).toBeFocused();
  await page.keyboard.press("Enter"); // A: start typing.
  await page.keyboard.type("raw");
  await page.keyboard.press("Escape"); // B: stop typing.
  await expect(id).toHaveValue("raw");
  await expect(page.getByText('"raw" already exists.', { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  await page.keyboard.press("Escape"); // B again: close the draft.
  await expect(page.getByRole("heading", { name: "Arena Editor" })).toBeVisible();
});

test("arena editor imports an image into a texture slot and keeps it with the saved arena", async ({ page }) => {
  const errors = trackErrors(page);
  await openCommissioner(page, "Arena Editor");
  await page.locator(".row", { hasText: "RAW is WAR" }).locator(".row__name").click();
  await expect(page.locator(".work__loading")).toHaveCount(0, { timeout: 60_000 });

  // A 4x2 red PNG, drawn in the page so the test carries no binary fixture.
  const png = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(4, 2);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#c00";
    ctx.fillRect(0, 0, 4, 2);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  const chooser = page.waitForEvent("filechooser");
  await page.locator(".slot", { hasText: "Canvas" }).getByRole("button", { name: "Import image…" }).click();
  await (await chooser).setFiles({ name: "Red Mat.png", mimeType: "image/png", buffer: Buffer.from(png) });

  await expect(page.locator(".panel__status").first()).toContainText("Imported “Red Mat” (4×2 PNG");
  const canvasSlot = page.getByRole("combobox", { name: "Canvas", exact: true });
  await expect(canvasSlot).toHaveValue(/^user-image:[a-f0-9]{64}$/);
  await expect(canvasSlot.locator("optgroup[label='Imported images'] option")).toHaveText(["Red Mat (4×2)"]);

  await page.getByLabel("Display name").fill("Imported Canvas");
  await expect(page.locator(".work__loading")).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".panel__status").first()).toContainText("Created");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // After a reload the image is read back from IndexedDB with no warning.
  await openCommissioner(page, "Arena Viewer");
  await page.locator(".row", { hasText: "Imported Canvas" }).click();
  await expect(page.locator(".loading")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".hud__warning")).toHaveCount(0);
  expect(errors).toEqual([]);
});
