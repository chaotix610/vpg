import { expect, test } from "@playwright/test";

test("control bindings survive reload after rebinding through the UI", async ({ page }) => {
  await page.goto("./");
  await page.getByText("Commissioner", { exact: true }).click();
  await page.getByText("Controls", { exact: true }).click();
  await page.getByRole("button", { name: /^L:.*Click to rebind/ }).click();
  await page.keyboard.press("KeyP");
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("vpg-control-mappings") || "null");
    return saved?.bindings.l;
  })).toContain("KeyP");

  await page.reload();
  await page.getByText("Commissioner", { exact: true }).click();
  await page.getByText("Controls", { exact: true }).click();
  await expect(page.getByRole("button", { name: /^L:.*Click to rebind/ })).toHaveAttribute("aria-label", /P/);
});
