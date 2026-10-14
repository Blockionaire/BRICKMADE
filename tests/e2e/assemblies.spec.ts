import { test, expect } from "@playwright/test";
import { createModel, MODEL_KINDS } from "../../src/domain/models";

test("four real model families retain assembly checks, exact totals and independently selectable builds", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const kind of MODEL_KINDS) {
    await page.goto("/models");
    const card = page.locator(".collection-card").filter({
      has: page.getByRole("heading", { name: kind.name, exact: true }),
    });
    const expected = createModel({
      modelKind: kind.id,
      detail: "normal",
      size: "compact",
    });
    await expect(card.locator(".model-thumbnail")).toHaveAttribute(
      "data-total-pieces",
      String(expected.stats.pieceCount),
    );
    await card.getByRole("button", { name: "Make this build" }).click();
    await expect(page).toHaveURL(/\/review$/, { timeout: 30000 });
    await expect(
      page.getByRole("heading", { name: kind.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Assembly review" }),
    ).toHaveAttribute("data-validation-status", "passed", { timeout: 30000 });
    await expect(page.locator("canvas")).toHaveAttribute("data-kind", kind.id);
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-total-pieces",
      String(expected.stats.pieceCount),
    );
    await page.goto("/parts");
    await expect(page.locator(".parts-summary")).toContainText(
      String(expected.stats.pieceCount),
    );
    if (kind.id === "plant") {
      await page.getByRole("textbox", { name: "Search parts" }).fill("2423");
      await expect(page.locator(".parts-grid .part-card")).toHaveCount(1);
    }
  }
  await page.goto("/builder");
  await page.getByRole("button", { name: "Choose a build" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Bloom Pot/ })
    .click();
  await expect(page.locator("canvas")).toHaveAttribute("data-kind", "plant");
  await expect(
    page.getByRole("region", { name: "Assembly review" }),
  ).toHaveAttribute("data-validation-status", "passed", { timeout: 20000 });
  await page.screenshot({
    path: "/tmp/brickmade-plant-builder-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("structure migration retains the raw previous save and explains the progress reset", async ({
  page,
}) => {
  await page.goto("/");
  const original = JSON.stringify({
    version: 4,
    activeId: "old",
    projects: [
      {
        id: "old",
        name: "My old home",
        createdAt: "2026-10-13",
        settings: { detail: "hard", size: "compact" },
        currentStep: 8,
        completed: true,
      },
    ],
  });
  await page.evaluate(
    (raw) => localStorage.setItem("brickmade.private-demo.v1", raw),
    original,
  );
  await page.goto("/builder");
  await expect(page.locator(".migration-notice")).toContainText(
    "progress starts fresh",
  );
  await expect(page.getByRole("button", { name: /Step 1 of/ })).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("brickmade.private-demo.v1.before-structure-v2"),
    ),
  ).toBe(original);
  const migrated = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("brickmade.private-demo.v1")!),
  );
  expect(migrated.version).toBe(5);
  expect(migrated.projects[0].name).toBe("My old home");
  expect(migrated.projects[0].completed).toBe(false);
  await page.getByRole("button", { name: "Dismiss design update" }).click();
  await page.reload();
  await expect(page.locator(".migration-notice")).toHaveCount(0);
});

test("the collection and assembly review fit mobile and desktop without native dropdowns", async ({
  page,
}) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/models");
    await expect(page.locator(".collection-card")).toHaveCount(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await page.locator("select").count()).toBe(0);
    if (width === 390)
      await page.screenshot({
        path: "/tmp/brickmade-collection-mobile.png",
        fullPage: true,
      });
    if (width === 1440)
      await page.screenshot({
        path: "/tmp/brickmade-collection-desktop.png",
        fullPage: true,
      });
  }
});

test("tampered collision evidence cannot create an approved project", async ({
  page,
}) => {
  await page.route("**/catalog/collision/*.bvox*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: Buffer.alloc(40),
    }),
  );
  await page.goto("/models");
  await page
    .locator(".collection-house")
    .getByRole("button", { name: "Make this build" })
    .click();
  await expect(page.locator(".form-error[role=alert]")).toContainText(
    "checksum mismatch",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("brickmade.private-demo.v1"),
    ),
  ).toBeNull();
});

test("window fitting instructions are visible and identify the actual pane", async ({
  page,
}) => {
  const model = createModel({
      modelKind: "house",
      detail: "normal",
      size: "compact",
    }),
    step = model.steps.find((s) => s.procedures?.length)!;
  await page.goto("/builder");
  await page.getByRole("button", { name: /Step \d+ of/ }).click();
  await page
    .getByRole("dialog")
    .locator(".step-bag-tabs button")
    .nth(1)
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: `Go to step ${step.number}`, exact: true })
    .click();
  await expect(page.locator(".manual-procedure")).toContainText(
    "seat the end tabs",
  );
  await page
    .locator(".step-parts .part-card")
    .filter({ hasText: "60601" })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected brick" }),
  ).toContainText("60601");
});
