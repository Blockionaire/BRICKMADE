import { expect, test } from "@playwright/test";
import fs from "node:fs";
const manifest = JSON.parse(
  fs.readFileSync(
    new URL("../../public/catalog/manifest.json", import.meta.url),
    "utf8",
  ),
);

test("the broad library searches real shapes and previews flowers and transparent glass", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/catalog/") && r.status() >= 400)
      failed.push(r.url());
  });
  await page.goto("/parts");
  await page.getByRole("link", { name: /Beyond the basic brick/ }).click();
  await expect(
    page.getByRole("heading", { name: "Beyond the basic brick." }),
  ).toBeVisible();
  await expect(page.locator(".library-result-count")).toContainText(
    "64,895 designs",
  );
  await expect(
    page.locator(".library-featured-grid .library-part-card"),
  ).toHaveCount(6);
  await expect(
    page.locator(".library-results-grid .library-part-card"),
  ).toHaveCount(48);
  await page
    .getByRole("group", { name: "Filter part features" })
    .getByRole("button", { name: "Plants & flowers", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search the part library" })
    .fill("24866");
  await expect(
    page.locator(".library-results-grid .library-part-card"),
  ).toHaveCount(1);
  await page.locator(".library-results-grid .library-part-card").click();
  const dialog = page.getByRole("dialog");
  const flower = dialog.locator('canvas[data-library-part="24866"]');
  await expect(flower).toBeVisible({ timeout: 15000 });
  await expect(dialog).toContainText("Rebrickable #24866");
  await expect(dialog).toContainText("Not yet validated");
  const before = await flower.screenshot();
  await dialog
    .getByRole("group", { name: "Preview render color" })
    .getByRole("button", { name: "Red", exact: true })
    .click();
  await expect(flower).toHaveAttribute("data-render-color", "4", {
    timeout: 15000,
  });
  expect((await flower.screenshot()).equals(before)).toBe(false);
  await expect(dialog).toContainText("current supplier stock is unverified");
  await page.screenshot({ path: "/tmp/brickmade-library-flower-mobile.png" });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search the part library" })
    .fill("60601");
  await page
    .locator(".library-results-grid")
    .getByRole("button", { name: /Rebrickable 60601$/ })
    .click();
  const glass = dialog.locator('canvas[data-library-part="60601"]');
  await expect(glass).toBeVisible({ timeout: 15000 });
  await expect(glass).toHaveAttribute("data-transparency", "true");
  await expect(dialog).toContainText("transparent material");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.locator(".library-result-count")).toContainText(
    "64,895 designs",
  );
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test("library filters, source attribution, non-preview records, and responsive layout stay clear", async ({
  page,
}) => {
  await page.goto("/catalog");
  await expect(page.locator(".library-result-count")).toContainText(
    "64,895 designs",
  );
  await page
    .getByRole("button", { name: "All categories", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search library categories" })
    .fill("Technic");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Technic Bricks/ })
    .click();
  await expect(
    page.locator(".library-results-grid .library-part-text > small").first(),
  ).toContainText("Technic");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search the part library" })
    .fill("10197");
  await page.locator(".library-results-grid .library-part-card").click();
  await expect(page.getByRole("dialog")).toContainText("has not been packaged");
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /Original catalog/ }),
  ).toHaveAttribute("href", /rebrickable.com\/parts\/10197\//);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Filter part features" })
    .getByRole("button", { name: "3D previews", exact: true })
    .click();
  await expect(
    page.locator(".library-results-grid .library-part-card"),
  ).toHaveCount(manifest.previewCount);
  await expect(page.locator(".library-attribution")).toContainText("CC BY 4.0");
  await expect(
    page.getByRole("link", { name: "Catalog database" }),
  ).toHaveAttribute("href", /brickmade.sqlite$/);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    if (width === 390)
      await page.screenshot({
        path: "/tmp/brickmade-library-mobile.png",
        fullPage: true,
      });
    if (width === 1440)
      await page.screenshot({ path: "/tmp/brickmade-library-desktop.png" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Library at ${width}px`,
    ).toBe(true);
  }
});
