import { test, expect } from "@playwright/test";
import manifest from "../../public/catalog/manifest.json" with { type: "json" };
test("expanded library is paged, filtered and truthful about supported ports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/connections");
  await page
    .getByRole("button", { name: "Change moving piece", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".connection-picker-count")).toContainText(
    "327 packaged shapes",
  );
  await expect(dialog.locator(".connection-picker-grid button")).toHaveCount(
    48,
  );
  await dialog.getByRole("button", { name: "Show more shapes" }).click();
  await expect(dialog.locator(".connection-picker-grid button")).toHaveCount(
    96,
  );
  await dialog.getByRole("button", { name: "Show supported ports" }).click();
  await expect(dialog.locator(".connection-picker-count")).toContainText(
    `${manifest.portedBuilderPartCount} packaged shapes`,
  );
  await dialog
    .getByRole("textbox", { name: "Search builder shapes" })
    .fill("60608");
  await expect(dialog.locator(".connection-picker-grid button")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Showing supported ports" }).click();
  await expect(dialog.locator(".connection-picker-grid button")).toHaveCount(1);
  await expect(dialog.locator(".connection-picker-grid button")).toContainText(
    "Geometry only",
  );
  await dialog.locator(".connection-picker-grid button").click();
  await expect(page.locator(".builder-admission-label")).toContainText(
    "connection rules pending",
  );
  await expect(
    page.getByRole("button", { name: "Connect pieces", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
test("new wide, curved, arch and plant examples render source geometry and align real ports", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/connections");
  for (const name of ["Wide brick", "Curved roof", "Arch cap", "Leaf detail"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.locator("canvas[data-connection-canvas=true]"),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Connect pieces", exact: true })
      .click();
    await expect(page.locator(".connection-feedback")).not.toHaveAttribute(
      "data-mate-count",
      "0",
    );
  }
  await page.screenshot({
    path: "/tmp/brickmade-expanded-leaf-mobile.png",
    fullPage: true,
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
