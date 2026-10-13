import { expect, test, type Page } from "@playwright/test";
import { createHouse } from "../../src/domain/house";
const normal = createHouse({ detail: "normal", size: "compact" });
const floorStep = normal.steps.find((s) => s.phaseNumber === 2)!.number;
async function jump(page: Page, step: number, bag: number) {
  await page.getByRole("button", { name: /Step \d+ of/ }).click();
  await page
    .getByRole("dialog")
    .locator(".step-bag-tabs button")
    .nth(bag - 1)
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: `Go to step ${step}`, exact: true })
    .click();
}
async function chooseBuild(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Choose a build", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(name) })
    .click();
}

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
  ).toBeDisabled({ timeout: 15000 });
  await page.getByRole("button", { name: "Use demo photos" }).click();
  await expect(page.getByAltText("Demo house front view")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Give your build a name").fill("Our little home");
  await page
    .getByRole("group", { name: "Model detail" })
    .getByRole("radio", { name: /Hard/ })
    .check();
  await page
    .getByRole("group", { name: "Building difficulty" })
    .getByRole("radio", { name: /^Easy/ })
    .check();
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
    .getByRole("group", { name: "Filter by color" })
    .getByRole("button", { name: "Warm sand", exact: true })
    .click();
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
  await expect(page.getByRole("button", { name: /Step 2 of/ })).toBeVisible();
  await jump(page, floorStep, 1);
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
  await page
    .getByRole("group", { name: "Model detail" })
    .getByRole("radio", { name: /Easy/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("progress");
  await page.getByRole("button", { name: "Keep my progress" }).click();
  await page.getByRole("link", { name: "Continue building" }).click();
  await jump(page, normal.steps.length, 4);
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
        version: 4,
        activeId: "simple",
        projects: [
          {
            id: "simple",
            name: "Simple cottage",
            createdAt: "2026-10-13",
            settings: {
              detail: "easy",
              size: "compact",
              buildDifficulty: "medium",
            },
            currentStep: 1,
            completed: false,
          },
          {
            id: "detailed",
            name: "Detailed cottage",
            createdAt: "2026-10-13",
            settings: {
              detail: "hard",
              size: "compact",
              buildDifficulty: "medium",
            },
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
  const easy = createHouse({ detail: "easy", size: "compact" });
  await jump(page, easy.steps.length, 4);
  await expect(page.locator("canvas[data-model=house]")).toHaveAttribute(
    "data-piece-count",
    String(counts[0]),
  );
  await expect(page.locator(".builder-piece-count")).toContainText(
    `${counts[0]} of ${counts[0]} pieces shown`,
  );
  await page.getByRole("button", { name: "Finish build" }).click();
  await chooseBuild(page, "Detailed cottage");
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
  await chooseBuild(page, "Simple cottage");
  await expect(page.getByRole("textbox", { name: "Search parts" })).toHaveValue(
    "",
  );
  await expect(page.locator(".parts-summary")).toContainText(String(counts[0]));
  await page.getByRole("link", { name: "Go to builder" }).click();
  await expect(
    page.getByRole("heading", { name: "Home, made by you." }),
  ).toBeVisible();
  await chooseBuild(page, "Detailed cottage");
  await expect(page.getByRole("button", { name: /Step 9 of/ })).toBeVisible();
  await page.reload();
  await expect(page.locator(".active-build")).toContainText("Detailed cottage");
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
    await jump(page, floorStep - 1, 1);
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
      page.getByRole("region", { name: "Selected brick" }),
    ).toContainText("Plate 2 × 4 · #3020");
    await expect(
      page.getByRole("region", { name: "Selected brick" }),
    ).toContainText("Sage green · Added in step");
    const after = await canvas.screenshot();
    expect(before.equals(after)).toBe(false);
    await page.getByRole("button", { name: "Clear brick selection" }).click();
    await expect(
      page.getByRole("region", { name: "Selected brick" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Next step" }).click();
    await page.getByRole("button", { name: "Top", exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const nextBox = (await canvas.boundingBox())!;
    await page.touchscreen.tap(
      nextBox.x + nextBox.width * 0.52,
      nextBox.y + nextBox.height * 0.48,
    );
    await expect(
      page.getByRole("region", { name: "Selected brick" }),
    ).toContainText("Tile 2 × 2 · #3068b");
    expect(errors).toEqual([]);
  });
});

test("spotlight links to the correct parts and matches only visible pieces", async ({
  page,
}) => {
  await page.goto("/builder");
  const canvas = page.locator("canvas[data-model=house]");
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await expect(canvas).toHaveAttribute("data-piece-count", "16");
  await page.locator(".step-parts .part-card").first().click();
  const spotlight = page.getByRole("region", { name: "Selected brick" });
  await expect(spotlight).toContainText("#3020");
  await spotlight
    .getByRole("button", { name: /Highlight matching pieces/ })
    .click();
  await expect(canvas).toHaveAttribute("data-matched-pieces", "16");
  await expect(spotlight).toContainText(
    "16 matching pieces visible · 40 in this build",
  );
  await spotlight.getByRole("link", { name: "Find in parts" }).click();
  await expect(page.getByRole("textbox", { name: "Search parts" })).toHaveValue(
    "3020",
  );
  await expect(
    page.getByRole("button", { name: "Sage green", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".parts-grid .part-card")).toHaveCount(1);
  await expect(page.locator(".parts-grid .part-card")).toContainText("×40");
  expect(await page.locator("select").count()).toBe(0);
});

test.describe("animated build guidance", () => {
  test.use({ reducedMotion: "no-preference" });
  test("placement replay returns to the exact assembled model and camera guidance stays optional", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/builder");
    const canvas = page.locator("canvas[data-model=house]");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    await expect(canvas).toHaveAttribute("data-placement-state", "settled");
    await expect(canvas).toHaveAttribute("data-camera-state", "settled");
    const assembledPose = await canvas.getAttribute("data-placement-pose");
    const assembled = await canvas.screenshot();
    await page
      .getByRole("button", { name: "Replay placement", exact: true })
      .click();
    await expect(canvas).toHaveAttribute(
      "data-placement-state",
      /lifting|placing/,
    );
    expect(await canvas.getAttribute("data-placement-pose")).not.toBe(
      assembledPose,
    );
    const floating = await canvas.screenshot();
    expect(floating.equals(assembled)).toBe(false);
    await expect(canvas).toHaveAttribute("data-placement-state", "settled");
    // The screenshot includes page overlays; actual instance matrices establish exact placement.
    await expect(canvas).toHaveAttribute("data-placement-pose", assembledPose!);
    const renderCount = Number(await canvas.getAttribute("data-render-count"));
    await page.waitForTimeout(300); // Verify that settled 3D rendering becomes idle.
    expect(
      Number(await canvas.getAttribute("data-render-count")),
    ).toBeLessThanOrEqual(renderCount + 1);
    await page
      .getByRole("button", { name: "Auto camera", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Auto camera", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Front", exact: true }).click();
    await page.getByRole("button", { name: "Next step" }).click();
    await expect(
      page.getByRole("button", { name: "Front", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const frontWall = normal.steps.find(
      (s) => s.bag === 2 && s.suggestedView === "front",
    )!;
    await jump(page, frontWall.number, 2);
    await page
      .getByRole("button", { name: "Auto camera", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Front", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const backWall = normal.steps.find(
      (s) => s.bag === 2 && s.suggestedView === "back",
    )!;
    await jump(page, backWall.number, 2);
    await expect(
      page.getByRole("button", { name: "Back", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Top", exact: true }).click();
    await page
      .getByRole("button", { name: "Suggested angle", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Back", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .getByRole("button", { name: "Replay placement", exact: true })
      .click();
    await expect(canvas).toHaveAttribute("data-placement-state", "settled");
    await page.getByRole("button", { name: "Assembled", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-placement-state", "settled");
    expect(errors).toEqual([]);
  });
});

test("expanded studio keeps all camera controls interactive", async ({
  page,
}) => {
  await page.goto("/builder");
  await page.getByRole("button", { name: "Expand model", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(
    dialog.getByRole("button", { name: "Expand model", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Front", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Front", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Top", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Top", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.getByRole("button", { name: /Step 2 of/ })).toBeVisible();
});

test("building difficulty changes instructions independently and retains a partly completed layer", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/builder");
  const pace = page.getByRole("group", { name: "Building difficulty" });
  const canvas = page.locator("canvas[data-model=house]");
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await expect(pace.getByRole("radio", { name: /Medium/ })).toBeChecked();
  await expect(canvas).toHaveAttribute("data-total-pieces", "342");
  const choosePace = async (name: string) =>
    pace.getByRole("radio", { name: new RegExp(`^${name}`) }).check();
  await choosePace("Easy");
  await expect(canvas).toHaveAttribute("data-piece-count", "6");
  await jump(page, 5, 1); // Four small groups, 24 pieces, are complete.
  await choosePace("Hard");
  await expect(page.getByRole("button", { name: /Step 1 of/ })).toBeVisible();
  await expect(canvas).toHaveAttribute("data-piece-count", "40");
  await expect(canvas).toHaveAttribute("data-total-pieces", "342");
  await expect(page.locator(".instruction-kicker")).toContainText("LAYER");
  await choosePace("Medium");
  await expect(page.getByRole("button", { name: /Step 2 of/ })).toBeVisible();
  await page.reload();
  await expect(pace.getByRole("radio", { name: /Medium/ })).toBeChecked();
  await choosePace("Easy");
  await expect(page.getByRole("button", { name: /Step 5 of/ })).toBeVisible();
  await choosePace("Hard");
  const hard = createHouse({
    detail: "normal",
    size: "compact",
    buildDifficulty: "hard",
  });
  const wall = hard.steps.find((s) => s.bag === 2)!;
  await jump(page, wall.number, 2);
  await expect(page.locator(".instruction-kicker")).toContainText(
    "Full wall layer",
  );
  await expect(page.locator(".step-parts-heading h3")).toContainText(
    String(wall.placementIds.length),
  );
  await page.locator(".step-parts .part-card").first().click();
  await expect(
    page.getByRole("region", { name: "Selected brick" }),
  ).toContainText(`step ${wall.number}`);
  await page.goto("/parts");
  await expect(page.locator(".parts-summary")).toContainText("342");
  await page.goto("/review");
  await expect(
    page
      .getByRole("group", { name: "Model detail" })
      .getByRole("radio", { name: /Normal/ }),
  ).toBeChecked();
  await page
    .getByRole("group", { name: "Building difficulty" })
    .getByRole("radio", { name: /^Easy/ })
    .check();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Continue building" }).click();
  await expect(pace.getByRole("radio", { name: /^Easy/ })).toBeChecked();
  await expect(canvas).toHaveAttribute("data-total-pieces", "342");
  expect(await page.locator("select").count()).toBe(0);
  expect(errors).toEqual([]);
});

test.describe("whole-layer animation", () => {
  test.use({ reducedMotion: "no-preference" });
  test("large hard layers finish their replay in a short wave", async ({
    page,
  }) => {
    await page.goto("/builder");
    await page.evaluate(() =>
      localStorage.setItem(
        "brickmade.private-demo.v1",
        JSON.stringify({
          version: 4,
          activeId: "layers",
          projects: [
            {
              id: "layers",
              name: "Layer house",
              createdAt: "2026-10-13",
              settings: {
                detail: "hard",
                size: "compact",
                buildDifficulty: "hard",
              },
              currentStep: 1,
              completed: false,
            },
          ],
        }),
      ),
    );
    await page.reload();
    const model = createHouse({
      detail: "hard",
      size: "compact",
      buildDifficulty: "hard",
    });
    const roof = model.steps.find((s) => s.bag === 3)!;
    expect(roof.placementIds.length).toBeGreaterThan(100);
    await jump(page, roof.number, 3);
    const canvas = page.locator("canvas[data-model=house]");
    await expect(canvas).toHaveAttribute("data-placement-state", "settled");
    const pose = await canvas.getAttribute("data-placement-pose");
    await page
      .getByRole("button", { name: "Replay placement", exact: true })
      .click();
    await expect(canvas).toHaveAttribute(
      "data-placement-state",
      /lifting|placing/,
    );
    await expect(canvas).toHaveAttribute("data-placement-state", "settled", {
      timeout: 4000,
    });
    await expect(canvas).toHaveAttribute("data-placement-pose", pose!);
    await expect(canvas).toHaveAttribute("data-total-pieces", "1116");
  });
});
