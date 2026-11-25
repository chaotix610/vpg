import { expect, test, type Page } from "@playwright/test";

async function openMapper(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "Commissioner", exact: true }).click();
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await expect(page.locator('[data-mapper-nav="bindings:dpadUp"]')).toBeFocused();
}

async function focusedOption(page: Page) {
  return page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.mapperNav);
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`arrows reach every mapper option at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openMapper(page);

    const option = (id: string) => page.locator(`[data-mapper-nav="${id}"]`);
    await page.keyboard.press("ArrowRight");
    await expect(option("bindings:dpadDown")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(option("bindings:dpadRight")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(option("bindings:dpadLeft")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(option("bindings:dpadUp")).toBeFocused();

    // Explore only options discovered by an arrow press, checking that neither
    // the diagram nor the two-column binding list contains unreachable buttons.
    const expected = await page.locator("[data-mapper-nav]").evaluateAll((buttons) =>
      buttons.map((button) => (button as HTMLElement).dataset.mapperNav!),
    );
    const reachable = new Set(["bindings:dpadUp"]);
    const queue = [...reachable];
    for (let i = 0; i < queue.length; i++) {
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
        await option(queue[i]).focus();
        await page.keyboard.press(key);
        const next = await focusedOption(page);
        expect(next, `${key} from ${queue[i]} must keep focus in the mapper`).toBeTruthy();
        if (next && !reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    expect([...reachable].sort()).toEqual(expected.sort());
    await expect(page.locator(".row--active, .controller__target--active")).toHaveCount(1);
  });
}

test("mapped stick directions and Tab keep mapper focus in sync", async ({ page }) => {
  await openMapper(page);
  await page.keyboard.press("KeyD");
  await expect(page.locator('[data-mapper-nav="bindings:dpadDown"]')).toBeFocused();
  await page.keyboard.press("KeyS");
  await expect(page.locator('[data-mapper-nav="bindings:dpadRight"]')).toBeFocused();
  await page.keyboard.press("KeyA");
  await page.keyboard.press("KeyW");
  await expect(page.locator('[data-mapper-nav="bindings:dpadUp"]')).toBeFocused();

  await page.locator('[data-mapper-nav="controller:l"]').focus();
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-mapper-nav="controller:r"]')).toBeFocused();
  await expect(page.locator(".controller__target--active")).toHaveAttribute("data-mapper-nav", "controller:r");
  await page.keyboard.press("Enter");
  await expect(page.locator(".row--listening")).toHaveAttribute("data-mapper-nav", "bindings:r");
  await page.keyboard.press("KeyP");
  await expect(page.getByRole("button", { name: /^R: P\. Click to rebind/ })).toBeFocused();

  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Cancel rebinding", exact: true }).click();
  await expect(page.locator(".row--listening")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^R: P\. Click to rebind/ })).toBeFocused();
});

test("rebinding captures arrow keys and restores selection after a conflict", async ({ page }) => {
  await openMapper(page);
  const shoulder = page.locator('[data-mapper-nav="controller:l"]');
  await shoulder.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel (Esc)", exact: true }).click();
  await expect(shoulder).toBeFocused();
  await expect(shoulder).toHaveAttribute("aria-label", /^L: Q\./);

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(shoulder).toHaveAttribute("aria-label", /^L: Right Arrow\./);
  await expect(shoulder).toBeFocused();
});

test("submenu Back buttons return through the menu hierarchy", async ({ page }) => {
  await page.goto("./");
  const back = page.getByRole("button", { name: "Back", exact: true });
  await expect(back).toHaveCount(0);

  for (const name of ["Multi Play", "Single Play", "Commissioner"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(back).toBeVisible();
    // The click leaves the pointer over whatever the new page puts there; on a
    // busy machine its late mouseenter would move the cursor after ArrowDown.
    await page.mouse.move(0, 0);
    await page.keyboard.press("ArrowDown");
    const selected = page.locator(".item--active");
    await expect(selected).toHaveCSS("border-top-style", "none");
    await expect(selected).toHaveCSS("outline-style", "none");
    await expect(selected).toHaveCSS("box-shadow", "none");
    await back.click();
    await expect(back).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Multi Play", exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "Commissioner", exact: true }).click();
  await page.getByRole("button", { name: "Options", exact: true }).click();
  await back.click();
  await expect(page.getByRole("button", { name: "Controls", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(back).toBeFocused();
  await expect(back).toHaveCSS("border-top-style", "solid");
  await page.keyboard.press("Enter");
  await expect(back).toHaveCount(0);
});

test("animation viewer has a clickable Back to Menu button", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Commissioner", exact: true }).click();
  await page.getByRole("button", { name: "Animation Viewer", exact: true }).click();
  await page.getByRole("button", { name: "Back to Menu", exact: true }).click();
  await expect(page.getByRole("button", { name: "Controls", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("button", { name: "Multi Play", exact: true })).toBeVisible();
});
