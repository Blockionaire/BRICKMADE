import { test, expect } from "@playwright/test";
import { supabaseClient } from "../../server/supabase.mjs";
test.skip(
  process.env.STUDIO_FULL_STACK !== "1",
  "Requires isolated real Supabase; the provider alone is an explicit CI fixture.",
);
test("real private uploads, durable recovery, checked artifact, variants, frozen builder and owner isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const uploads: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/object/upload/sign/") && r.method() === "PUT")
      uploads.push(r.url());
  });
  await page.goto("/create");
  await expect(
    page.getByRole("button", { name: /Car.*In the making/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /House.*Your home/ }).click();
  await page
    .getByLabel("Upload your photos")
    .setInputFiles("tests/fixtures/house-upload.jpg");
  expect(uploads).toHaveLength(0);
  await page.getByRole("button", { name: "Generate my build" }).click();
  await expect(page).toHaveURL(/\/design\?job=/, { timeout: 30000 });
  const first = new URL(page.url()).searchParams.get("job")!;
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Let’s build this" }),
  ).toBeVisible({ timeout: 150000 });
  expect(uploads).toHaveLength(1);
  const job = await page.request.get(`/api/studio/jobs/${first}`);
  expect(job.ok()).toBe(true);
  const saved = (await job.json()).job;
  expect(saved.stage).toBe("completed");
  expect(saved.artifact.pieceCount).toBeGreaterThan(100);
  const db = supabaseClient();
  const events = await db.rows("bm_job_events", `job_id=eq.${first}`);
  expect(events.map((x: { stage: string }) => x.stage)).toEqual(
    expect.arrayContaining([
      "interpreting",
      "planning",
      "compiling",
      "checking",
      "completed",
    ]),
  );
  const ticket = await (
    await page.request.get(`/api/studio/jobs/${first}/artifact`)
  ).json();
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto("/create");
  await strangerPage.evaluate(async () => {
    await fetch("/api/studio/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });
  expect(
    (await stranger.request.get(`/api/studio/jobs/${first}/artifact`)).status(),
  ).toBe(404);
  expect(
    (
      await stranger.request.get(
        ticket.url.split("?")[0].replace("/object/sign/", "/object/public/"),
      )
    ).ok(),
  ).toBe(false);
  await stranger.close();
  await page.getByRole("button", { name: "More detail", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(first));
  await expect(
    page.getByRole("button", { name: "Let’s build this" }),
  ).toBeVisible({ timeout: 150000 });
  const variant = new URL(page.url()).searchParams.get("job")!;
  const variantEvents = await db.rows("bm_job_events", `job_id=eq.${variant}`);
  expect(
    variantEvents.some((x: { stage: string }) => x.stage === "interpreting"),
  ).toBe(false);
  expect(uploads).toHaveLength(1);
  await page.getByRole("button", { name: "Let’s build this" }).click();
  await expect(page).toHaveURL(/\/builder/);
  await expect(
    page.getByRole("button", { name: "Next step", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("brickmade.private-demo.v1") || "null"),
  );
  expect(before).toBeTruthy();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(
    page.getByText("Progress saved privately", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const progress = await db.rows(
    "bm_progress",
    `project_id=eq.${saved.projectId}`,
  );
  expect(
    progress.some(
      (p: { completed_ids: string[] }) => p.completed_ids.length > 0,
    ),
  ).toBe(true);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/design?job=${variant}`);
  await page.getByRole("button", { name: "Let’s build this" }).click();
  await expect(page).toHaveURL(/\/builder/);
  await expect(page.getByText(/Step 2 of/)).toBeVisible();
  expect(errors).toEqual([]);
});
