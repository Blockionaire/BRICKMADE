import { expect, test } from "@playwright/test";

test("private demo runs from photos through model and parts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your world, one brick at a time." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create new build" }).click();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Use demo photos" }).click();
  await expect(page.getByAltText("Demo house front view")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Give your build a name").fill("Our little home");
  await page.getByRole("radio", { name: /Hard/ }).check();
  await page.getByRole("button", { name: "Create my preview" }).click();
  await expect(
    page.getByText("Demo generation · Your photos are not analyzed."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/review\?new=1/, { timeout: 15000 });
  await expect(
    page.getByRole("heading", { name: "Our little home" }),
  ).toBeVisible();
  await expect(page.locator("canvas[data-model=house]")).toBeVisible();
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Top", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Explore the parts" }).click();
  await page
    .getByRole("textbox", { name: "Search parts" })
    .fill("impossible part");
  await expect(
    page.getByRole("heading", { name: "No pieces here just yet." }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search parts" }).fill("3010");
  await page
    .getByRole("combobox", { name: "Filter by color" })
    .selectOption("sand");
  await expect(page.locator(".parts-grid .part-card")).toHaveCount(0); // Hard uses smaller wall pieces.
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await page.locator(".parts-grid .part-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Go to builder" }).click();
  await expect(
    page.getByRole("heading", { name: "A place to begin" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("builder saves progress, gives contextual help, and completes the walkthrough", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/builder");
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(
    page.getByRole("heading", { name: "The path home" }),
  ).toBeVisible();
  const highlighted = await page.locator("canvas").screenshot();
  await page.getByRole("button", { name: /New in this step/ }).click();
  await expect(
    page.getByRole("button", { name: /New in this step/ }),
  ).toHaveAttribute("aria-pressed", "false");
  const unhighlighted = await page.locator("canvas").screenshot();
  expect(highlighted.equals(unhighlighted)).toBe(false);
  await page.getByRole("button", { name: /New in this step/ }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The path home" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /A little help/ }).click();
  await page.getByRole("button", { name: "Which parts?" }).click();
  await expect(page.getByRole("log")).toContainText("#3068b");
  await page.getByRole("button", { name: "Another angle" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Top", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Front", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/review");
  await page.getByRole("radio", { name: /Easy/ }).click();
  await expect(page.getByRole("dialog")).toContainText("progress");
  await page.getByRole("button", { name: "Keep my progress" }).click();
  await page.getByRole("link", { name: "Continue building" }).click();
  await page.getByRole("button", { name: /Step 2 of/ }).click();
  await page.locator(".step-picker button").last().click();
  await page.getByRole("button", { name: "Finish build" }).click();
  await expect(
    page.getByRole("heading", { name: "Home, made by you." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Home, made by you." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("uploads remain local, can be removed, and generation can be cancelled", async ({
  page,
}) => {
  await page.goto("/create");
  await page.getByLabel("Upload photos").setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI7kAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByAltText("sample.png")).toBeVisible();
  await page.getByRole("button", { name: "Remove sample.png" }).click();
  await expect(page.getByAltText("sample.png")).toHaveCount(0);
  await page.getByRole("button", { name: "Use demo photos" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Create my preview" }).click();
  await page.getByRole("button", { name: "Cancel and go back" }).click();
  await expect(page.getByLabel("Give your build a name")).toBeVisible();
  await page.waitForTimeout(5000);
  await expect(page).toHaveURL(/\/create$/);
  await page.getByRole("button", { name: "Create my preview" }).click();
  await expect(page).toHaveURL(/\/review/, { timeout: 15000 });
});

test("mobile and desktop screens fit without horizontal overflow", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of [
      "/",
      "/create",
      "/review",
      "/builder",
      "/parts",
      "/account",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(fits, `${route} at ${viewport.width}px`).toBe(true);
    }
  }
});

test("renaming and resetting local builds work", async ({ page }) => {
  await page.goto("/review");
  await page.getByRole("button", { name: "Rename build" }).click();
  await page.getByLabel("Build name", { exact: true }).fill("My first house");
  await page.getByRole("button", { name: "Save name" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My first house" }),
  ).toBeVisible();
  await page.goto("/account");
  await page.getByRole("button", { name: "Reset this demo" }).click();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(page.getByRole("link", { name: /Compact House/ })).toBeVisible();
});

test("different designs keep model counts, thumbnails, parts and saved progress in sync", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "brickmade.private-demo.v1",
      JSON.stringify({
        version: 2,
        activeId: "simple",
        projects: [
          {
            id: "simple",
            name: "Simple cottage",
            createdAt: "2026-10-13",
            settings: { detail: "easy", size: "compact" },
            currentStep: 1,
            completed: false,
          },
          {
            id: "detailed",
            name: "Detailed cottage",
            createdAt: "2026-10-13",
            settings: { detail: "hard", size: "compact" },
            currentStep: 8,
            completed: false,
          },
        ],
      }),
    ),
  );
  await page.reload();
  const thumbnails = page.locator(".model-thumbnail");
  await expect(thumbnails).toHaveCount(2);
  const counts: number[] = [];
  for (let i = 0; i < 2; i++) {
    const thumbnail = thumbnails.nth(i);
    const count = Number(await thumbnail.getAttribute("data-total-pieces"));
    counts.push(count);
    await expect(thumbnail.locator("[data-piece-id]")).toHaveCount(count);
  }
  expect(counts[1]).toBeGreaterThan(counts[0] * 3);
  await page.goto("/builder");
  await expect(
    page.getByRole("heading", { name: "Simple cottage", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Step 1 of/ }).click();
  await page.locator(".step-picker button").last().click();
  await expect(page.locator("canvas[data-model=house]")).toHaveAttribute(
    "data-piece-count",
    String(counts[0]),
  );
  await expect(page.locator(".builder-piece-count")).toContainText(
    `${counts[0]} of ${counts[0]} pieces shown`,
  );
  await page.getByRole("button", { name: "Finish build" }).click();
  await page
    .getByRole("combobox", { name: "Choose a build" })
    .selectOption("detailed");
  await expect(page.getByRole("button", { name: /Step 8 of/ })).toBeVisible();
  await expect(page.locator("canvas[data-model=house]")).toHaveAttribute(
    "data-total-pieces",
    String(counts[1]),
  );
  await page.getByRole("button", { name: "Next step" }).click();
  await page.goto("/parts");
  await expect(page.locator(".parts-summary")).toContainText(String(counts[1]));
  await page.getByRole("textbox", { name: "Search parts" }).fill("3005");
  await page.locator(".parts-grid .part-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Choose a build" })
    .selectOption("simple");
  await expect(page.getByRole("textbox", { name: "Search parts" })).toHaveValue(
    "",
  );
  await expect(page.locator(".parts-summary")).toContainText(String(counts[0]));
  await page.getByRole("link", { name: "Go to builder" }).click();
  await expect(
    page.getByRole("heading", { name: "Home, made by you." }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Choose a build" })
    .selectOption("detailed");
  await expect(page.getByRole("button", { name: /Step 9 of/ })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Choose a build" }),
  ).toHaveValue("detailed");
  await expect(page.getByRole("button", { name: /Step 9 of/ })).toBeVisible();
});

test.describe("touch brick inspection", () => {
  test.use({ hasTouch: true });
  test("tapping a visible brick highlights it and identifies its exact catalog part", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/builder");
    await page.getByRole("button", { name: "Top", exact: true }).click();
    const canvas = page.locator("canvas[data-model=house]");
    await expect(canvas).toHaveAttribute("data-piece-count", "40");
    const before = await canvas.screenshot();
    const box = (await canvas.boundingBox())!;
    await page.touchscreen.tap(
      box.x + box.width * 0.52,
      box.y + box.height * 0.52,
    );
    await expect(
      page.getByRole("status", { name: "Selected brick" }),
    ).toContainText("Plate 2 × 4 · #3020");
    await expect(
      page.getByRole("status", { name: "Selected brick" }),
    ).toContainText("Sage green · Added in step 1 · Bag 1");
    const after = await canvas.screenshot();
    expect(before.equals(after)).toBe(false);
    await page.getByRole("button", { name: "Clear brick selection" }).click();
    await expect(
      page.getByRole("status", { name: "Selected brick" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Next step" }).click();
    await page.getByRole("button", { name: "Top", exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const nextBox = (await canvas.boundingBox())!;
    await page.touchscreen.tap(
      nextBox.x + nextBox.width * 0.52,
      nextBox.y + nextBox.height * 0.52,
    );
    await expect(
      page.getByRole("status", { name: "Selected brick" }),
    ).toContainText("Tile 2 × 2 · #3068b");
    expect(errors).toEqual([]);
  });
});
