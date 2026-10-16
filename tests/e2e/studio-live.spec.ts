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
    page.getByRole("button", { name: /Car.*static display/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /House.*Your home/ }).click();
  await page
    .getByLabel("Upload your photos")
    .setInputFiles("tests/fixtures/house-upload.jpg");
  expect(uploads).toHaveLength(0);
  await page.getByRole("button", { name: "Generate my build" }).click();
  await expect(page).toHaveURL(/\/design\?job=/, { timeout: 30000 });
  const first = new URL(page.url()).searchParams.get("job")!;
  const readiness = await (
    await page.request.get("/api/studio/readiness")
  ).json();
  expect(readiness.paidCallsMade).toBe(false);
  expect(
    readiness.checks.find((c: { name: string }) => c.name === "database")
      .status,
  ).toBe("passed");
  expect(
    readiness.checks.find((c: { name: string }) => c.name === "authentication")
      .status,
  ).toBe("passed");
  // No real OpenAI secret is present in this isolated API process.
  expect(
    readiness.checks.find((c: { name: string }) => c.name === "build-assistant")
      .code,
  ).toBe("assistant-configuration");

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
  await expect(page.locator(".studio-viewer canvas")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".studio-viewer canvas")).toHaveAttribute(
    "data-total-pieces",
    String(saved.artifact.pieceCount),
  );
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
  // Navigate before the debounce expires: saving must survive leaving Builder.
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("Progress saved privately", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect
    .poll(
      async () => {
        const progress = await db.rows(
          "bm_progress",
          `project_id=eq.${saved.projectId}`,
        );
        return progress.some(
          (p: { completed_ids: string[] }) => p.completed_ids.length > 0,
        );
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/design?job=${variant}`);
  await page.getByRole("button", { name: "Let’s build this" }).click();
  await expect(page).toHaveURL(/\/builder/);
  await expect(page.getByText(/Step 2 of/)).toBeVisible();
  expect(errors).toEqual([]);
});

// Local mail capture only: no external mailbox or production SMTP is contacted.
async function capturedCode(email: string, seen: Set<string>) {
  let code = "";
  await expect
    .poll(
      async () => {
        try {
          const response = await fetch(
            "http://127.0.0.1:54324/api/v1/messages",
          );
          if (response.ok) {
            const listing = await response.json();
            for (const message of listing.messages || []) {
              if (
                seen.has(message.ID) ||
                !JSON.stringify(message.To).includes(email)
              )
                continue;
              const mail = await (
                await fetch(
                  `http://127.0.0.1:54324/api/v1/message/${message.ID}`,
                )
              ).json();
              const match = (mail.Text || mail.HTML || "").match(
                /code is (\d{6,10})/,
              );
              if (match) {
                seen.add(message.ID);
                code = match[1];
                return code;
              }
            }
          }
        } catch {
          /* Mail capture may still be starting. */
        }
        // Supabase CLI releases using Inbucket expose a different local API.
        try {
          const mailbox = encodeURIComponent(email.split("@")[0]);
          const response = await fetch(
            `http://127.0.0.1:54324/api/v1/mailbox/${mailbox}`,
          );
          if (response.ok) {
            const messages = await response.json();
            for (const message of messages) {
              if (seen.has(message.id)) continue;
              const mail = await (
                await fetch(
                  `http://127.0.0.1:54324/api/v1/mailbox/${mailbox}/${message.id}`,
                )
              ).json();
              const match = (mail.body?.text || mail.body?.html || "").match(
                /code is (\d{6,10})/,
              );
              if (match) {
                seen.add(message.id);
                code = match[1];
                return code;
              }
            }
          }
        } catch {
          /* Only local captured messages are inspected. */
        }
        return "";
      },
      { timeout: 20000, intervals: [500, 1000] },
    )
    .toBeTruthy();
  return code;
}
test("guest email linking retains ownership and email sign-in restores the same collection", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.goto("/account");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  const guest = (await (await page.request.get("/api/studio/session")).json())
    .user;
  const reserved = await page.evaluate(async () => {
    const r = await fetch("/api/studio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "house",
        photos: [{ bytes: 100, sha256: "a".repeat(64) }],
      }),
    });
    if (!r.ok) throw Error("Could not reserve guest collection fixture");
    return r.json();
  });
  const email = `brickmade-${Date.now()}@example.test`,
    seen = new Set<string>();
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send my code", exact: true }).click();
  await expect(page.getByLabel("Code from your email")).toBeVisible();
  await page
    .getByLabel("Code from your email")
    .fill(await capturedCode(email, seen));
  await page
    .getByRole("button", { name: "Verify and continue", exact: true })
    .click();
  await expect(page.getByText(/Your account is connected/)).toBeVisible();
  const linked = (await (await page.request.get("/api/studio/session")).json())
    .user;
  expect(linked.id).toBe(guest.id);
  expect(linked.anonymous).toBe(false);
  const other = await browser.newContext(),
    signedIn = await other.newPage();
  await signedIn.goto("/account");
  await signedIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await signedIn.getByLabel("Email address", { exact: true }).fill(email);
  await signedIn
    .getByRole("button", { name: "Send my code", exact: true })
    .click();
  await expect(signedIn.getByLabel("Code from your email")).toBeVisible();
  await signedIn
    .getByLabel("Code from your email")
    .fill(await capturedCode(email, seen));
  await signedIn
    .getByRole("button", { name: "Verify and continue", exact: true })
    .click();
  await expect(signedIn.getByText(/Your account is connected/)).toBeVisible();
  expect(
    (await (await signedIn.request.get("/api/studio/session")).json()).user.id,
  ).toBe(guest.id);
  const collection = (
    await (await signedIn.request.get("/api/studio/projects")).json()
  ).projects;
  expect(
    collection.some((p: { id: string }) => p.id === reserved.projectId),
  ).toBe(true);
  await signedIn
    .getByRole("button", { name: "Sign out on this device" })
    .click();
  await expect(
    signedIn.getByRole("button", { name: "Keep my guest builds" }),
  ).toBeVisible();
  expect(
    (await (await signedIn.request.get("/api/studio/session")).json()).user.id,
  ).not.toBe(guest.id);
  await other.close();
});

for (const category of ["flower", "car", "animal", "free"]) {
  test(`real ${category} upload, capable-worker claim, native checks and private saved artifact`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.goto("/create");
    const labels: Record<string, RegExp> = {
      flower: /Flower.*bloom/,
      car: /Car.*static display/,
      animal: /Animal.*Cats/,
      free: /Free format.*grounded/,
    };
    await page.getByRole("button", { name: labels[category] }).click();
    await page
      .getByLabel("Upload your photos")
      .setInputFiles("tests/fixtures/house-upload.jpg");
    await page.getByRole("button", { name: "Generate my build" }).click();
    await expect(page).toHaveURL(/\/design\?job=/, { timeout: 30000 });
    await expect(
      page.getByRole("button", { name: "Let’s build this" }),
    ).toBeVisible({ timeout: 120000 });
    const id = new URL(page.url()).searchParams.get("job")!;
    const job = (
      await (await page.request.get(`/api/studio/jobs/${id}`)).json()
    ).job;
    expect(job.options.category).toBe(category);
    const ticket = await (
      await page.request.get(`/api/studio/jobs/${id}/artifact`)
    ).json();
    const artifact = await (await page.request.get(ticket.url)).json();
    expect(artifact.version).toBe(2);
    expect(artifact.description.category).toBe(category);
    expect(artifact.validation.status).toBe("passed");
    expect(artifact.provenance.model).toBe("explicit-ci-photo-fixture");
    expect(artifact.provenance.inputHashes).toHaveLength(1);
    expect(
      artifact.model.parts.reduce(
        (n: number, p: { quantity: number }) => n + p.quantity,
        0,
      ),
    ).toBe(artifact.model.placements.length);
    await page.getByRole("button", { name: "Let’s build this" }).click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("brickmade.private-demo.v1") || "{}"),
    );
    expect(
      saved.projects.find(
        (p: { cloud?: { jobId: string } }) => p.cloud?.jobId === id,
      ).artifact.model.placements,
    ).toEqual(artifact.model.placements);
    await page.goto("/parts");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save full parts list" }).click();
    expect((await download).suggestedFilename()).toBe("brickmade-parts.csv");
  });
}
