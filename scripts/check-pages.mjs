import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const site = (
  process.env.PAGES_SMOKE_URL || "http://127.0.0.1:4173/BRICKMADE"
).replace(/\/$/, "");
const origin = new URL(site).origin;
const prefix = new URL(site).pathname;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const errors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(origin))
      failedRequests.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${site}/create/`);
  await page.getByRole("button", { name: "Use demo photos" }).click();
  await expect(page.getByAltText("Demo house front view")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".photo-tile img")
        .evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  assert.equal(
    await page.getByAltText("Demo house front view").getAttribute("src"),
    `${prefix}/demo/house-front.svg`,
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Give your build a name").fill("Our home on Pages");
  await page.getByRole("button", { name: "Create my preview" }).click();
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15000 })
    .toBe(`${prefix}/review/`);
  await expect(
    page.getByRole("heading", { name: "Our home on Pages" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Assembly review" }),
  ).toHaveAttribute("data-validation-status", "passed", { timeout: 20000 });
  await page.getByRole("link", { name: "Explore the parts" }).click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`${prefix}/parts/`);
  await page.getByRole("textbox", { name: "Search parts" }).fill("3010");
  await expect(page.locator(".parts-grid .part-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Go to builder" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Builder", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const pace = page.getByRole("group", { name: "Building difficulty" });
  await pace.getByRole("radio", { name: /^Hard/ }).check();
  await expect(page.locator("canvas")).toHaveAttribute("data-piece-count", "9");
  await page.reload();
  await expect(pace.getByRole("radio", { name: /^Hard/ })).toBeChecked();
  await pace.getByRole("radio", { name: /^Easy/ }).check();
  await expect(page.locator("canvas")).toHaveAttribute("data-piece-count", "6");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-total-pieces",
    "126",
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-geometry",
    "ldraw",
  );
  await page.getByRole("button", { name: /Step 1 of/ }).click();
  await page
    .getByRole("dialog")
    .locator(".step-picker button")
    .filter({ hasText: "The path home" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "The path home" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /A little help/ }).click();
  await page.getByRole("button", { name: "Which parts?" }).click();
  await expect(page.getByRole("log")).toContainText("#3020");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The path home" }),
  ).toBeVisible();
  await page.goto(`${site}/catalog/`);
  await expect(page.locator(".library-result-count")).toContainText(
    "64,895 designs",
    { timeout: 20000 },
  );
  await page
    .getByRole("textbox", { name: "Search the part library" })
    .fill("60601");
  await page
    .locator(".library-results-grid")
    .getByRole("button", { name: /Rebrickable 60601$/ })
    .click();
  await expect(
    page.getByRole("dialog").locator('canvas[data-library-part="60601"]'),
  ).toHaveAttribute("data-transparency", "true", { timeout: 15000 });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.goto(`${site}/connections/`);
  await expect(page.locator("canvas[data-connection-canvas=true]")).toBeVisible(
    { timeout: 15000 },
  );
  await page
    .getByRole("button", { name: "Connect pieces", exact: true })
    .click();
  await expect(page.locator(".connection-feedback")).toHaveAttribute(
    "data-mate-count",
    "4",
  );
  await page.getByRole("button", { name: "Technic fit", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect pieces", exact: true })
    .click();
  await expect(page.locator(".connection-feedback")).toHaveAttribute(
    "data-mate-count",
    "1",
  );
  for (const route of [
    "",
    "review",
    "parts",
    "account",
    "builder",
    "create",
    "catalog",
    "connections",
    "models",
  ]) {
    const response = await page.goto(`${site}/${route ? `${route}/` : ""}`);
    assert.equal(response.status(), 200);
    await expect(page.locator("h1")).toBeVisible();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  console.log(
    "Pages smoke check passed: nine routes, photos, real builder meshes, connection snapping and Technic fit, parts filter, independent instruction difficulty, broad part catalog, glass geometry, assistant, and saved progress. No browser errors or failed requests.",
  );
} finally {
  await browser.close();
}
