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
  await expect(page.getByRole("log")).toContainText("#3068b");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The path home" }),
  ).toBeVisible();
  for (const route of ["", "review", "parts", "account", "builder", "create"]) {
    const response = await page.goto(`${site}/${route ? `${route}/` : ""}`);
    assert.equal(response.status(), 200);
    await expect(page.locator("h1")).toBeVisible();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  console.log(
    "Pages smoke check passed: six routes, photos, 3D model, parts filter, assistant, and saved progress. No browser errors or failed requests.",
  );
} finally {
  await browser.close();
}
