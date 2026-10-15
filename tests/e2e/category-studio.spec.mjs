import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
let artifact, body, hash;
const projectId = randomUUID(), jobId = randomUUID(), owner = randomUUID();
test.beforeAll(()=>{
    const source = `import{compileHouse}from'./server/compile-house.mjs';import{HOUSE_EXAMPLE,DEFAULT_STUDIO_OPTIONS,HOUSE_MODULE_VERSION}from'./shared/studio.ts';const r=await compileHouse(HOUSE_EXAMPLE,DEFAULT_STUDIO_OPTIONS);if(r.validation.status!=='passed')throw Error('Fixture assembly failed');console.log(JSON.stringify({version:1,jobId:'${jobId}',projectId:'${projectId}',createdAt:new Date().toISOString(),moduleVersion:HOUSE_MODULE_VERSION,compilerVersion:r.model.revision,profileVersion:r.profileVersion,description:HOUSE_EXAMPLE,options:DEFAULT_STUDIO_OPTIONS,model:r.model,validation:r.validation,fidelity:r.fidelity,provenance:{model:'explicit-browser-fixture',inputHashes:[],repairCount:0}}));`;
    body = execFileSync(process.execPath, [
        "--import",
        "./server/register.mjs",
        "--input-type=module",
        "-e",
        source
    ], {
        encoding: "utf8",
        maxBuffer: 16000000,
        stdio: [
            "ignore",
            "pipe",
            "pipe"
        ]
    }).trim();
    artifact = JSON.parse(body);
    hash = createHash("sha256").update(body).digest("hex");
});
async function mock(page, { failure = false, configured = true } = {}) {
    let submitted = false, polls = 0, uploadCount = 0, progress = null;
    await page.route("https://fixture.supabase.co/storage/v1/**", async (route)=>{
        if (route.request().method() === "PUT") {
            uploadCount++;
            await route.fulfill({
                status: 200,
                body: "{}"
            });
        } else await route.fulfill({
            contentType: "application/json",
            body
        });
    });
    await page.route("**/api/studio/**", async (route)=>{
        const req = route.request(), path = new URL(req.url()).pathname.replace("/api/studio/", "");
        let status = 200, data = {};
        if (path === "config") data = {
            configured
        };
        else if (path === "session") data = {
            version: 1,
            user: {
                id: owner,
                anonymous: true
            }
        };
        else if (path === "projects" && req.method() === "POST") data = {
            projectId,
            uploads: [
                {
                    id: randomUUID(),
                    url: "https://fixture.supabase.co/storage/v1/object/upload/sign/bm-inputs/photo.jpg?token=fixture"
                }
            ]
        };
        else if (path.endsWith("/generate")) {
            submitted = true;
            data = {
                job: {
                    id: jobId,
                    projectId,
                    stage: "queued",
                    progress: 0,
                    options: artifact.options
                }
            };
            status = 202;
        } else if (path === `jobs/${jobId}/artifact`) data = {
            url: "https://fixture.supabase.co/storage/v1/object/sign/bm-designs/model.json?token=fixture",
            bytes: Buffer.byteLength(body),
            sha256: hash
        };
        else if (path === `jobs/${jobId}`) {
            polls++;
            data = {
                job: {
                    id: jobId,
                    projectId,
                    stage: failure ? "failed" : polls > 1 ? "completed" : "interpreting",
                    progress: failure ? 15 : polls > 1 ? 100 : 15,
                    options: artifact.options,
                    error: failure ? {
                        code: "provider-configuration",
                        message: "The worker’s OpenAI model needs checking.",
                        stage: "interpreting",
                        requestId: "safe-reference-fixture"
                    } : null
                }
            };
        } else if (path.endsWith("/progress")) {
            if (req.method() === "POST") {
                const v = req.postDataJSON();
                progress = {
                    ...v,
                    artifact_sha256: v.sha256,
                    completed_ids: v.completedIds,
                    version: (progress?.version || 0) + 1
                };
            }
            data = {
                progress
            };
        } else if (path === "projects") data = {
            projects: []
        };
        else {
            status = 404;
            data = {
                error: {
                    message: "Unexpected fixture request: " + path
                }
            };
        }
        await route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(data)
        });
    });
    return {
        uploads: ()=>uploadCount,
        submitted: ()=>submitted
    };
}
test("category-first mobile flow previews locally, submits once and opens the exact saved brick model", async ({ page })=>{
    const fixture = await mock(page);
    await page.goto("/create");
    await expect(page.getByRole("button", {
        name: /Car.*In the making/
    })).toBeDisabled();
    await page.getByRole("button", {
        name: /House.*Your home/
    }).click();
    await page.getByLabel("Upload your photos").setInputFiles("tests/fixtures/house-upload.jpg");
    expect(fixture.uploads()).toBe(0);
    expect(fixture.submitted()).toBe(false);
    await page.screenshot({
        path: "/tmp/brickmade-category-mobile.png",
        fullPage: true
    });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", {
        name: "Generate my build"
    }).click();
    await expect(page).toHaveURL(new RegExp(jobId));
    await expect(page.getByRole("button", {
        name: "Let’s build this"
    })).toBeVisible({
        timeout: 30000
    });
    expect(fixture.uploads()).toBe(1);
    await page.screenshot({
        path: "/tmp/brickmade-result-mobile.png",
        fullPage: true
    });
    await page.getByRole("button", {
        name: "Let’s build this"
    }).click();
    await expect(page).toHaveURL(/\/builder/);
    const stored = await page.evaluate(()=>JSON.parse(localStorage.getItem("brickmade.private-demo.v1") || "{}"));
    const cloud = stored.projects.find((p)=>p.cloud?.jobId === jobId);
    expect(cloud.artifact.model.placements).toEqual(artifact.model.placements);
    expect(cloud.artifact.model.stats.pieceCount).toBe(artifact.model.placements.length);
    await expect(page.getByRole("button", {
        name: "Next step",
        exact: true
    })).toBeVisible();
    await page.getByRole("button", {
        name: "Next step",
        exact: true
    }).click();
    await expect(page.getByText("Progress saved privately", {
        exact: true
    })).toBeVisible({
        timeout: 15000
    });
});
test("generation failures expose the stage and reference in view and allow a deliberate retry", async ({ page })=>{
    await mock(page, {
        failure: true
    });
    await page.goto(`/design?job=${jobId}`);
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("OpenAI model needs checking");
    await expect(alert).toContainText("safe-reference-fixture");
    await expect(alert).toBeFocused();
    await expect(page.getByRole("button", {
        name: "Retry this build"
    })).toBeEnabled();
});
test("an unconfigured deployment explains availability before accepting a submission", async ({ page })=>{
    const fixture = await mock(page, {
        configured: false
    });
    await page.goto("/create");
    await page.getByRole("button", {
        name: /House.*Your home/
    }).click();
    await page.getByLabel("Upload your photos").setInputFiles("tests/fixtures/house-upload.jpg");
    await expect(page.getByRole("button", {
        name: "Generate my build"
    })).toBeDisabled();
    await expect(page.getByText(/The private cloud studio is being connected/)).toBeVisible();
    expect(fixture.submitted()).toBe(false);
    expect(fixture.uploads()).toBe(0);
});
