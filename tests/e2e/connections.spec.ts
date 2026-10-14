import { expect, test } from "@playwright/test";

test("real shapes snap, rotate, support sideways studs and Technic pins, and report unknown fits", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [],
    failed: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/catalog/") && r.status() >= 400)
      failed.push(r.url());
  });
  await page.goto("/catalog");
  await page.getByRole("link", { name: /Make the connection/ }).click();
  await expect(
    page.getByRole("heading", { name: "Make the connection." }),
  ).toBeVisible();
  const canvas = page.locator("canvas[data-connection-canvas=true]"),
    feedback = page.locator(".connection-feedback");
  await expect(canvas).toBeVisible({ timeout: 20000 });
  const separate = await canvas.getAttribute("data-poses");
  await page
    .getByRole("button", { name: "Connect pieces", exact: true })
    .click();
  await expect(feedback).toHaveAttribute("data-mate-count", "4");
  await expect.poll(() => canvas.getAttribute("data-poses")).not.toBe(separate);
  await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
  await expect(feedback).not.toHaveAttribute("data-mate-count", "0");
  await page
    .getByRole("button", { name: "Next attachment", exact: true })
    .click();
  await expect(feedback).not.toHaveAttribute("data-mate-count", "0");
  await page
    .getByRole("button", { name: "Build sideways", exact: true })
    .click();
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Connect pieces", exact: true })
    .click();
  await expect(feedback).toHaveAttribute("data-mate-count", "1");
  await page.getByRole("button", { name: "Technic fit", exact: true }).click();
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Connect pieces", exact: true })
    .click();
  await expect(feedback).toHaveAttribute("data-mate-count", "1");
  await page
    .getByRole("button", { name: "Curved finish", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect pieces", exact: true })
    .click();
  await expect(feedback).toHaveAttribute("data-mate-count", "1");
  await page
    .getByRole("button", { name: "A little flower", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect pieces", exact: true })
    .click();
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await expect(feedback).toHaveAttribute("data-mate-count", "1");
  await page
    .getByRole("button", { name: "Attachment points", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Attachment points", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({
    path: "/tmp/brickmade-connections-flower-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Window pane", exact: true }).click();
  await expect(feedback).toContainText("This fit needs a connection profile");
  await expect(
    page.getByRole("button", { name: "Connect pieces", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".connection-inspection")).toContainText(
    "0 reviewed attachment points",
  );
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test("the shape chooser and connection studio fit small screens", async ({
  page,
}) => {
  await page.goto("/connections");
  await page
    .getByRole("button", { name: "Change moving piece", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".connection-picker-grid button")).toHaveCount(
    47,
  );
  await dialog
    .getByRole("textbox", { name: "Search builder shapes" })
    .fill("3023");
  await expect(dialog.locator(".connection-picker-grid button")).toHaveCount(1);
  await dialog.locator(".connection-picker-grid button").click();
  await expect(
    page.getByRole("button", { name: "Change moving piece", exact: true }),
  ).toContainText("3023b");
  await page
    .getByRole("button", { name: "Connect pieces", exact: true })
    .click();
  await expect(page.locator(".connection-feedback")).not.toHaveAttribute(
    "data-mate-count",
    "0",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.locator("canvas[data-connection-canvas=true]"),
    ).toBeVisible({ timeout: 15000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px studio`,
    ).toBe(true);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `/tmp/brickmade-connections-${width}.png`,
        fullPage: true,
      });
  }
  expect(await page.locator("select").count()).toBe(0);
});

test("the house builder uses real meshes and retains picking, counts and exact placement replay", async ({
  page,
}) => {
  await page.goto("/builder");
  const canvas = page.locator("canvas[data-model=house]");
  await expect(canvas).toHaveAttribute("data-geometry", "ldraw", {
    timeout: 20000,
  });
  await expect(canvas).toHaveAttribute("data-total-pieces", "342");
  await expect(canvas).toHaveAttribute("data-placement-state", "settled");
  const pose = await canvas.getAttribute("data-placement-pose");
  await page.locator(".step-parts .part-card").first().click();
  await expect(
    page.getByRole("region", { name: "Selected brick" }),
  ).toContainText("reviewed attachment points");
  await page
    .getByRole("button", { name: "Replay placement", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-placement-pose", pose!);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-geometry", "ldraw");
  await page.screenshot({
    path: "/tmp/brickmade-real-builder-mobile.png",
    fullPage: true,
  });
});
