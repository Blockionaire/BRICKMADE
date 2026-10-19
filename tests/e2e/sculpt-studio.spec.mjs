import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
// Version 3 sculpture artifacts compiled offline from live-pipeline fixtures.
const categoryFixtures = {};
const projectId = randomUUID(),
  jobId = randomUUID(),
  owner = randomUUID();
const CATEGORIES = ["house", "car", "animal", "flower", "free"];
test.beforeAll(() => {
  for (const category of CATEGORIES) {
    const source = `import{readFileSync}from'node:fs';import{compileSculpt}from'./server/compile-sculpt.mjs';import{DEFAULT_STUDIO_OPTIONS}from'./shared/studio.ts';const d=JSON.parse(readFileSync('tests/fixtures/sculpt/${category}.json','utf8'));const options={...DEFAULT_STUDIO_OPTIONS,category:'${category}',size:'standard'};const r=await compileSculpt(d,options);if(r.validation.status!=='passed')throw Error('Fixture failed');console.log(JSON.stringify({version:3,jobId:'${jobId}',projectId:'${projectId}',createdAt:new Date().toISOString(),moduleVersion:r.model.subject.moduleVersion,compilerVersion:r.model.revision,profileVersion:r.profileVersion,description:d,options,model:r.model,validation:r.validation,fidelity:r.fidelity,provenance:{model:'explicit-browser-fixture',inputHashes:[],repairCount:0}}));`;
    const data = execFileSync(
      process.execPath,
      [
        "--import",
        "./server/register.mjs",
        "--input-type=module",
        "-e",
        source,
      ],
      {
        encoding: "utf8",
        maxBuffer: 64000000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
    categoryFixtures[category] = {
      artifact: JSON.parse(data),
      body: data,
      hash: createHash("sha256").update(data).digest("hex"),
    };
  }
});
async function mock(
  page,
  { failure = false, configured = true, category = "house" } = {},
) {
  const { artifact, body, hash } = categoryFixtures[category];
  let submitted = false,
    polls = 0,
    uploadCount = 0,
    progress = null;
  await page.route(
    "https://fixture.supabase.co/storage/v1/**",
    async (route) => {
      if (route.request().method() === "PUT") {
        uploadCount++;
        await route.fulfill({
          status: 200,
          body: "{}",
        });
      } else
        await route.fulfill({
          contentType: "application/json",
          body,
        });
    },
  );
  await page.route("**/api/studio/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/studio/", "");
    let status = 200,
      data = {};
    if (path === "config")
      data = {
        configured,
      };
    else if (path === "session")
      data = {
        version: 1,
        user: {
          id: owner,
          anonymous: true,
        },
      };
    else if (path === "projects" && req.method() === "POST")
      data = {
        projectId,
        uploads: [
          {
            id: randomUUID(),
            url: "https://fixture.supabase.co/storage/v1/object/upload/sign/bm-inputs/photo.jpg?token=fixture",
          },
        ],
      };
    else if (path.endsWith("/generate")) {
      submitted = true;
      data = {
        job: {
          id: jobId,
          projectId,
          stage: "queued",
          progress: 0,
          options: artifact.options,
        },
      };
      status = 202;
    } else if (path === `jobs/${jobId}/artifact`)
      data = {
        url: "https://fixture.supabase.co/storage/v1/object/sign/bm-designs/model.json?token=fixture",
        bytes: Buffer.byteLength(body),
        sha256: hash,
      };
    else if (path === `jobs/${jobId}/assistant`) {
      const v = req.postDataJSON();
      expect(v.sha256).toBe(hash);
      expect(v.step).toBe(1);
      data = {
        answer:
          "Use the saved pieces in step 1, matching their listed colors and orientation.",
        stepNumbers: [1],
        pieceIds: [artifact.model.steps[0].placementIds[0]],
        action: "highlight",
      };
    } else if (path === `jobs/${jobId}`) {
      polls++;
      data = {
        job: {
          id: jobId,
          projectId,
          stage: failure ? "failed" : polls > 1 ? "completed" : "interpreting",
          progress: failure ? 15 : polls > 1 ? 100 : 15,
          options: artifact.options,
          error: failure
            ? {
                code: "provider-configuration",
                message: "The worker’s OpenAI model needs checking.",
                stage: "interpreting",
                requestId: "safe-reference-fixture",
              }
            : null,
        },
      };
    } else if (path.endsWith("/progress")) {
      if (req.method() === "POST") {
        const v = req.postDataJSON();
        progress = {
          ...v,
          artifact_sha256: v.sha256,
          completed_ids: v.completedIds,
          version: (progress?.version || 0) + 1,
        };
      }
      data = {
        progress,
      };
    } else if (path.endsWith("/jobs")) data = { jobs: [] };
    else if (path === "projects")
      data = {
        projects: [],
      };
    else {
      status = 404;
      data = {
        error: {
          message: "Unexpected fixture request: " + path,
        },
      };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return {
    uploads: () => uploadCount,
    submitted: () => submitted,
  };
}

const LABELS = {
  house: /House.*Your home/,
  car: /Car.*static display/,
  animal: /Animal.*Pets/,
  flower: /Flower.*bloom/,
  free: /Free format.*grounded/,
};
for (const category of CATEGORIES)
  test(`${category} sculpture: category guidance, levels, reference views, builder and printable manual`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    const { artifact } = categoryFixtures[category];
    await mock(page, { category });
    await page.goto("/create");
    await page.getByRole("button", { name: LABELS[category] }).click();
    await expect(page.locator(".studio-guide")).toContainText(
      /We (read|count)/,
    );
    for (const name of [
      "Simple",
      "Standard",
      "Detailed",
      "Beginner",
      "Hobbyist",
      "Advanced",
    ])
      await expect(
        page.getByRole("button", { name: new RegExp(`^${name}`) }).first(),
      ).toBeVisible();
    await page.getByRole("button", { name: /^Beginner/ }).click();
    await expect(
      page.getByRole("button", { name: /^Beginner/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByLabel("Upload your photos")
      .setInputFiles("tests/fixtures/house-upload.jpg");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/brickmade-sculpt-${category}-create.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Generate my build" }).click();
    await expect(
      page.getByRole("button", { name: "Let’s build this" }),
    ).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".studio-viewer canvas")).toHaveAttribute(
      "data-total-pieces",
      String(artifact.model.placements.length),
      { timeout: 60000 },
    );
    await page.getByText("What BrickMade understood from your photos").click();
    await expect(page.locator(".studio-reference-views canvas")).toHaveCount(
      artifact.description.reference.views.views.length,
    );
    await expect(
      page.getByText(/of the front and .* of the side reference silhouette/),
    ).toBeAttached();
    await page.screenshot({
      path: `/tmp/brickmade-sculpt-${category}-result.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Let’s build this" }).click();
    await expect(page).toHaveURL(/\/builder/);
    await page.getByRole("link", { name: /Printable manual/ }).click();
    await expect(page).toHaveURL(/\/manual/);
    await expect(
      page.getByRole("button", { name: /Print or save as PDF/ }),
    ).toBeEnabled({ timeout: 180000 });
    await expect(page.locator(".manual-step img")).toHaveCount(
      artifact.model.steps.length,
    );
    await expect(page.locator(".manual-step")).toHaveCount(
      artifact.model.steps.length,
    );
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 5)
        .map(
          (e) =>
            `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().right)}`,
        ),
    );
    expect(wide).toEqual([]);
    await page.screenshot({
      path: `/tmp/brickmade-sculpt-${category}-manual.png`,
    });
  });
