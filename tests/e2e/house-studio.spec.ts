import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { HOUSE_PRESETS } from "../../shared/house-brief";
import { createModel } from "../../src/domain/models";
const go = (page: Page, path: string) =>
  page.goto(`${process.env.E2E_ROUTE_PREFIX || ""}${path}`);
const endpoint = "https://brickmade-test.vercel.app",
  code = "private-test-code-for-browser-fixtures-only";
async function connect(page: Page) {
  await go(page, "/account");
  await page.getByLabel("Vercel service address").fill(endpoint);
  await page.getByLabel("Private test code").fill(code);
  await page.getByRole("button", { name: "Check & connect" }).click();
  await expect(
    page.getByRole("button", { name: "Connected", exact: true }),
  ).toBeVisible();
}
async function photoStudio(page: Page) {
  await go(page, "/create");
  await page.getByLabel("Upload photos").setInputFiles(
    [1, 2, 3].map((i) => ({
      name: `view-${i}.jpg`,
      mimeType: "image/jpeg",
      buffer: readFileSync("tests/fixtures/house-upload.jpg"),
    })),
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /House studio/ }).click();
}
async function mockApi(
  page: Page,
  analyze: (
    body: Record<string, unknown>,
  ) => Promise<{ status: number; body: unknown }>,
) {
  await page.route(`${endpoint}/api/**`, async (route) => {
    const request = route.request();
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization,content-type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    expect(request.headers().authorization).toBe(`Bearer ${code}`);
    const result = request.url().endsWith("/status")
      ? {
          status: 200,
          body: {
            version: 1,
            ready: true,
            scope: "simple-houses",
            storesPhotos: false,
          },
        }
      : await analyze(request.postDataJSON());
    try {
      await route.fulfill({
        status: result.status,
        headers,
        contentType: "application/json",
        body: JSON.stringify(result.body),
      });
    } catch {
      /* A cancelled browser request must not resurrect an interpretation. */
    }
  });
}
test("manual house description generates a checked, persistent build with actual source-mesh thumbnails", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await go(page, "/create");
  await page
    .getByRole("button", { name: "Design a house", exact: true })
    .click();
  await page.getByRole("button", { name: /City home/ }).click();
  await page.getByLabel("Give your build a name").fill("Our city home");
  await page.getByRole("button", { name: "Generate my house" }).click();
  await expect(page).toHaveURL(/\/review/, { timeout: 60000 });
  const model = createModel({
    houseBrief: HOUSE_PRESETS[1].brief,
    detail: "normal",
    size: "compact",
    buildDifficulty: "medium",
  });
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-total-pieces",
    String(model.stats.pieceCount),
    { timeout: 30000 },
  );
  await expect(
    page.getByRole("region", { name: "Assembly review" }),
  ).toHaveAttribute("data-validation-status", "passed", { timeout: 30000 });
  await expect(
    page.getByText("GENERATED HOUSE", { exact: true }),
  ).toBeVisible();
  await go(page, "/parts");
  await expect(page.locator(".parts-summary")).toContainText(
    String(model.stats.pieceCount),
    { timeout: 30000 },
  );
  await go(page, "/");
  const card = page.locator(".build-card").filter({ hasText: "Our city home" });
  await expect(
    card.locator('[data-thumbnail-source="real-mesh"]'),
  ).toHaveAttribute("data-total-pieces", String(model.stats.pieceCount));
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator("img")).toHaveAttribute("src", /^data:image\/png/, {
    timeout: 30000,
  });
  await go(page, "/builder");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-total-pieces",
    String(model.stats.pieceCount),
    { timeout: 30000 },
  );
  await page.reload();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-total-pieces",
    String(model.stats.pieceCount),
    { timeout: 30000 },
  );
  await page.screenshot({
    path: "/tmp/brickmade-generated-house-builder.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("mocked photo interpretation requires consent, produces an editable brief, and never persists images", async ({
  page,
}) => {
  test.setTimeout(150000);
  let uploads = 0;
  await mockApi(page, async (body) => {
    uploads++;
    expect(body.consent).toBe(true);
    expect(body.version).toBe(1);
    expect(body.photos).toHaveLength(3);
    for (const photo of body.photos as string[])
      expect(photo).toMatch(/^data:image\/jpeg;base64,/);
    return {
      status: 200,
      body: {
        version: 1,
        brief: {
          ...HOUSE_PRESETS[0].brief,
          confidence: "medium",
          observations: ["A warm house with a pitched roof."],
          uncertainties: ["Rear elevation is not visible."],
        },
      },
    };
  });
  await connect(page);
  await photoStudio(page);
  await expect(
    page.getByRole("button", { name: "Interpret my photos" }),
  ).toBeDisabled();
  expect(uploads).toBe(0);
  await page
    .getByRole("checkbox", { name: /Send up to three resized photos/ })
    .check();
  await page.getByRole("button", { name: "Interpret my photos" }).click();
  await expect(
    page.getByText("A warm house with a pitched roof.", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByText("Rear elevation is not visible.", { exact: true }),
  ).toBeVisible();
  expect(uploads).toBe(1);
  await page
    .getByRole("group", { name: "Roof shape" })
    .getByRole("button", { name: "Flat roof", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate my house" }).click();
  await expect(page).toHaveURL(/\/review/, { timeout: 60000 });
  await expect(
    page.getByText("PHOTO-ASSISTED PROTOTYPE", { exact: true }),
  ).toBeVisible();
  const raw = await page.evaluate(() =>
    localStorage.getItem("brickmade.private-demo.v1")!,
  );
  expect(raw).not.toContain("data:image");
  expect(raw).not.toContain("view-1.jpg");
  expect(raw).not.toContain(code);
  const saved = JSON.parse(raw).projects[0];
  expect(saved.settings.houseBrief.roof).toBe("flat");
  expect(saved.settings.designSource).toBe("openai");
  await page.screenshot({
    path: "/tmp/brickmade-photo-assisted-review.png",
    fullPage: true,
  });
});
test("unsupported and failed AI responses leave the editable description and collection intact", async ({
  page,
}) => {
  let response: { status: number; body: unknown } = {
    status: 200,
    body: {
      version: 1,
      brief: { ...HOUSE_PRESETS[0].brief, subject: "unsupported" },
    },
  };
  await mockApi(page, async () => response);
  await connect(page);
  await photoStudio(page);
  for (const result of [
    response,
    { status: 429, body: { error: { code: "provider-limit" } } },
    { status: 200, body: { version: 1, brief: { placements: [] } } },
  ]) {
    response = result;
    await page
      .getByRole("checkbox", { name: /Send up to three resized photos/ })
      .check();
    await page.getByRole("button", { name: "Interpret my photos" }).click();
    await expect(page.locator('.form-error[role="alert"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole("button", { name: "Generate my house" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/create/);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("brickmade.private-demo.v1") ||
              '{"projects":[]}',
          ).projects.length,
      ),
    ).toBeLessThanOrEqual(1);
  }
});
test("cancelling photo interpretation cannot apply a late response", async ({
  page,
}) => {
  let finish: () => void = () => {};
  let started = false;
  await mockApi(page, async () => {
    started = true;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { status: 200, body: { version: 1, brief: HOUSE_PRESETS[1].brief } };
  });
  await connect(page);
  await photoStudio(page);
  await page
    .getByRole("checkbox", { name: /Send up to three resized photos/ })
    .check();
  await page.getByRole("button", { name: "Interpret my photos" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel interpretation" }),
  ).toBeVisible();
  await expect.poll(() => started).toBe(true);
  await page.getByRole("button", { name: "Cancel interpretation" }).click();
  finish();
  await expect(
    page.getByRole("button", { name: "Generate my house" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Roof shape" })
      .getByRole("button", { name: "Stepped gable" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("checkbox", { name: /Send up to three resized photos/ }),
  ).not.toBeChecked();
});
test("house generation refuses tampered collision evidence before saving", async ({
  page,
}) => {
  await page.route("**/catalog/collision/*.bvox*", (route) =>
    route.fulfill({ status: 200, body: Buffer.from("invalid evidence") }),
  );
  await go(page, "/create");
  await page
    .getByRole("button", { name: "Design a house", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate my house" }).click();
  await expect(page.locator('.form-error[role="alert"]')).toBeVisible({
    timeout: 15000,
  });
  await expect(page).toHaveURL(/\/create/);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("brickmade.private-demo.v1"),
    ),
  ).toBeNull();
});
test("OpenAI keys cannot be pasted into the browser connection", async ({
  page,
}) => {
  let requests = 0;
  await page.route(`${endpoint}/**`, (route) => {
    requests++;
    return route.abort();
  });
  await go(page, "/account");
  await page.getByLabel("Vercel service address").fill(endpoint);
  await page.getByLabel("Private test code").fill("sk-".padEnd(50, "x"));
  await page.getByRole("button", { name: "Check & connect" }).click();
  await expect(page.locator('.form-error[role="alert"]')).toContainText(
    "Keep your OpenAI key in Vercel",
  );
  expect(requests).toBe(0);
});
test("house studio and connection controls fit small phones and desktop", async ({
  page,
}) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await go(page, "/create");
    await page
      .getByRole("button", { name: "Design a house", exact: true })
      .click();
    await page
      .getByText("Connect your private photo service", { exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `House studio at ${width}px`,
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: "/tmp/brickmade-house-studio-mobile.png",
        fullPage: true,
      });
    await go(page, "/account");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Connection at ${width}px`,
    ).toBe(true);
  }
});

test("editing a saved house checks the replacement and confirms the progress reset", async ({
  page,
}) => {
  test.setTimeout(120000);
  const settings = {
    houseBrief: HOUSE_PRESETS[1].brief,
    designSource: "manual" as const,
    modelKind: "house" as const,
    detail: "normal" as const,
    size: "compact" as const,
    buildDifficulty: "easy" as const,
  };
  await go(page, "/");
  await page.evaluate(
    (value) =>
      localStorage.setItem("brickmade.private-demo.v1", JSON.stringify(value)),
    {
      version: 5,
      activeId: "edited-house",
      projects: [
        {
          id: "edited-house",
          name: "My edited home",
          createdAt: "2026-10-14T00:00:00Z",
          settings,
          currentStep: 3,
          completed: false,
        },
      ],
    },
  );
  await go(page, "/review");
  await page.getByRole("button", { name: "Edit house description" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Stepped gable" })
    .click();
  await page.getByRole("button", { name: "Check & apply description" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Try a different version?",
    { timeout: 30000 },
  );
  const before = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("brickmade.private-demo.v1")!)
        .projects[0],
  );
  expect(before.settings.houseBrief.roof).toBe("flat");
  expect(before.currentStep).toBe(3);
  await page
    .getByRole("button", { name: "Switch version", exact: true })
    .click();
  const after = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("brickmade.private-demo.v1")!)
        .projects[0],
  );
  expect(after.settings.houseBrief.roof).toBe("stepped");
  expect(after.currentStep).toBe(1);
  const expected = createModel({
    ...settings,
    houseBrief: { ...settings.houseBrief, roof: "stepped" },
  });
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-total-pieces",
    String(expected.stats.pieceCount),
    { timeout: 30000 },
  );
  await expect(
    page.getByRole("region", { name: "Assembly review" }),
  ).toHaveAttribute("data-validation-status", "passed", { timeout: 30000 });
});

test("changing the private service clears the connection and photo consent before any upload", async ({
  page,
}) => {
  let uploads = 0;
  await mockApi(page, async () => {
    uploads++;
    return { status: 200, body: { version: 1, brief: HOUSE_PRESETS[0].brief } };
  });
  await connect(page);
  await photoStudio(page);
  await page
    .getByRole("checkbox", { name: /Send up to three resized photos/ })
    .check();
  await page
    .getByText("Connect your private photo service", { exact: true })
    .click();
  await page
    .getByLabel("Vercel service address")
    .fill("https://different-service.vercel.app");
  await expect(
    page.getByRole("checkbox", { name: /Send up to three resized photos/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Interpret my photos" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("brickmade.private-ai.connection.v1"),
    ),
  ).toBeNull();
  expect(uploads).toBe(0);
});
