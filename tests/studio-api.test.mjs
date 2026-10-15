import { afterEach, describe, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { makeStudioHandler } from "../server/studio-handler.mjs";
import {
  supabaseClient,
  cloudConfig,
  StudioError,
} from "../server/supabase.mjs";
import { interpretStudioPhotos } from "../server/studio-vision.mjs";
import { HOUSE_EXAMPLE, DEFAULT_STUDIO_OPTIONS } from "../shared/studio";
const servers = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(() => r()))),
  );
});
async function api() {
  const user = {
    id: randomUUID(),
    is_anonymous: true,
  };
  const db = {
    request: vi.fn(async (path) =>
      path === "/auth/v1/signup"
        ? {
            access_token: "access-fixture",
            refresh_token: "refresh-fixture",
            expires_in: 3600,
            user,
          }
        : user,
    ),
    rows: vi.fn(async () => []),
    rpc: vi.fn(),
    signedUpload: vi.fn(),
  };
  const logger = vi.fn(),
    server = createServer(
      makeStudioHandler({
        env: {
          NODE_ENV: "test",
        },
        dbFactory: () => db,
        logger,
      }),
    );
  servers.push(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error();
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path, body, headers = {}) =>
    fetch(`${base}/api/studio/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: base,
        ...(body !== undefined
          ? {
              "Content-Type": "application/json",
            }
          : {}),
        ...headers,
      },
      ...(body !== undefined
        ? {
            body: JSON.stringify(body),
          }
        : {}),
    });
  return {
    request,
    db,
    user,
    base,
    logger,
  };
}
describe("Studio API boundaries", () => {
  it("creates a server-managed private guest without exposing tokens in JSON", async () => {
    const a = await api();
    const r = await a.request("session", {});
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("HttpOnly");
    expect(r.headers.get("set-cookie")).toContain("Path=/api/studio");
    const text = await r.text();
    expect(text).toContain(a.user.id);
    expect(text).not.toContain("access-fixture");
  });
  it("rejects foreign-origin writes before starting identity or storage work", async () => {
    const a = await api();
    const r = await a.request(
      "session",
      {},
      {
        Origin: "https://elsewhere.invalid",
      },
    );
    expect(r.status).toBe(403);
    expect(a.db.request).not.toHaveBeenCalled();
    expect((await r.json()).error).toMatchObject({
      code: "app-origin",
      stage: "session",
    });
    expect(r.headers.get("x-brickmade-request-id")).toBeTruthy();
  });
  it("does not create identities for read-only collection requests", async () => {
    const a = await api();
    expect((await a.request("projects")).status).toBe(401);
    expect(a.db.request).not.toHaveBeenCalled();
  });
  it("reserves only validated private JPEG metadata and rejects placeholder categories", async () => {
    const a = await api();
    const headers = {
      Cookie: "bm_access=fixture-" + randomUUID(),
    };
    expect(
      (
        await a.request(
          "projects",
          {
            category: "car",
            photos: [],
          },
          headers,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await a.request(
          "projects",
          {
            category: "house",
            photos: [
              {
                bytes: 999999,
                sha256: "a".repeat(64),
              },
            ],
          },
          headers,
        )
      ).status,
    ).toBe(400);
    expect(a.db.rpc).not.toHaveBeenCalled();
  });
  it("never reveals another owner’s job or issues an artifact ticket", async () => {
    const a = await api();
    expect(
      (
        await a.request(`jobs/${randomUUID()}/artifact`, undefined, {
          Cookie: "bm_access=fixture-" + randomUUID(),
        })
      ).status,
    ).toBe(404);
    expect(a.db.rows.mock.calls[0][1]).toContain(`owner_id=eq.${a.user.id}`);
  });
  it("requires consent and supported options before submitting paid analysis", async () => {
    const a = await api();
    const r = await a.request(
      `projects/${randomUUID()}/generate`,
      {
        assetIds: [randomUUID()],
        options: DEFAULT_STUDIO_OPTIONS,
        requestKey: randomUUID(),
        consent: false,
      },
      {
        Cookie: "bm_access=fixture-" + randomUUID(),
      },
    );
    expect(r.status).toBe(400);
    expect(a.db.rpc).not.toHaveBeenCalled();
  });
  it("logs safe stage references without provider secrets or raw messages", async () => {
    const a = await api();
    a.db.request.mockRejectedValueOnce(new Error("secret-photo-and-key"));
    const r = await a.request("session", {});
    const body = await r.text();
    expect(r.status).toBe(500);
    expect(body).not.toContain("secret-photo");
    expect(JSON.stringify(a.logger.mock.calls)).not.toContain("secret-photo");
    expect(a.logger.mock.calls[0][0]).toMatchObject({
      action: "session",
      code: "studio-error",
    });
  });
});
describe("Saved project versions", () => {
  it("scopes version history to the verified owner and omits private checkpoints", async () => {
    const a = await api(),
      project = randomUUID(),
      id = randomUUID();
    a.db.rows.mockResolvedValue([
      {
        id,
        project_id: project,
        owner_id: a.user.id,
        stage: "completed",
        options: DEFAULT_STUDIO_OPTIONS,
        checkpoint: {
          description: HOUSE_EXAMPLE,
          private: "private-checkpoint-fixture",
        },
      },
    ]);
    const response = await a.request(`projects/${project}/jobs`, undefined, {
      Cookie: "bm_access=fixture-" + randomUUID(),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain(id);
    expect(text).not.toContain("private-checkpoint-fixture");
    expect(a.db.rows.mock.calls[0][1]).toContain(`owner_id=eq.${a.user.id}`);
    expect(a.db.rows.mock.calls[0][1]).toContain(`project_id=eq.${project}`);
  });
});
describe("Cloud transport", () => {
  const env = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_fixture",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture",
  };
  it("scopes database reads and writes to BrickMade without changing Auth or Storage", async () => {
    const fetcher = vi.fn(async () => new Response("[]"));
    const db = supabaseClient({ env, fetcher });
    await db.rows("bm_projects", "limit=1");
    await db.rpc("bm_valid_options", { v: DEFAULT_STUDIO_OPTIONS });
    await db.patch("bm_assets", "id=eq.fixture", { state: "deleted" });
    await db.request("/auth/v1/user", { token: "user-token", service: false });
    await db.upload(
      "bm-inputs",
      "owner/photo.jpg",
      new Uint8Array([1]),
      "image/jpeg",
    );
    const headers = fetcher.mock.calls.map((call) => call[1].headers);
    expect(headers[0]["Accept-Profile"]).toBe("brickmade");
    expect(headers[0]["Content-Profile"]).toBeUndefined();
    for (const h of headers.slice(1, 3)) {
      expect(h["Accept-Profile"]).toBe("brickmade");
      expect(h["Content-Profile"]).toBe("brickmade");
    }
    for (const h of headers.slice(3)) {
      expect(h["Accept-Profile"]).toBeUndefined();
      expect(h["Content-Profile"]).toBeUndefined();
    }
  });
  it.each([
    ["PGRST106", "database-schema"],
    ["PGRST202", "database-migration"],
    ["PGRST205", "database-migration"],
    ["42P01", "database-migration"],
    ["42883", "database-migration"],
  ])(
    "explains %s setup failures without exposing database responses",
    async (providerCode, code) => {
      const db = supabaseClient({
        env,
        fetcher: async () =>
          new Response(
            JSON.stringify({
              code: providerCode,
              message: "private-database-detail",
            }),
            { status: 406 },
          ),
      });
      const failure = await db.rpc("bm_valid_options", {}).catch((e) => e);
      expect(failure).toMatchObject({ status: 503, code });
      expect(failure.message).not.toContain("private-database-detail");
    },
  );
  it("keeps HTTP forbidden except explicitly enabled loopback fixtures", () => {
    expect(() =>
      cloudConfig({
        ...env,
        SUPABASE_URL: "http://cloud.invalid",
      }),
    ).toThrow();
    expect(() =>
      cloudConfig({
        ...env,
        SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toThrow();
    expect(
      cloudConfig({
        ...env,
        SUPABASE_URL: "http://127.0.0.1:54321",
        BRICKMADE_LOCAL_SUPABASE: "1",
      }).url,
    ).toContain("127.0.0.1");
  });
  it("uses opaque keys as apikey rather than invalid JWT Authorization and preserves user tokens", async () => {
    const f = vi.fn(async () => new Response("{}"));
    const db = supabaseClient({
      env,
      fetcher: f,
    });
    await db.request("/auth/v1/signup", {
      service: false,
      method: "POST",
      body: {},
    });
    expect(f.mock.calls[0][1].headers).toMatchObject({
      apikey: env.SUPABASE_ANON_KEY,
    });
    expect(f.mock.calls[0][1].headers.Authorization).toBeUndefined();
    await db.request("/auth/v1/user", {
      service: false,
      token: "real-user-token",
    });
    expect(f.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer real-user-token",
    );
  });
  it("maps optimistic conflicts without leaking raw database responses", async () => {
    const db = supabaseClient({
      env,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            message: "progress-conflict",
            details: "private-secret",
          }),
          {
            status: 400,
          },
        ),
    });
    await expect(db.rpc("bm_save_progress", {})).rejects.toMatchObject({
      code: "progress-conflict",
      status: 409,
    });
  });
  it("rejects off-path signed upload responses", async () => {
    const db = supabaseClient({
      env,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            url: "https://external.invalid/path",
          }),
        ),
    });
    await expect(db.signedUpload("bm-inputs", "path")).rejects.toMatchObject({
      code: "upload-ticket",
    });
  });
});
describe("Category photo interpretation", () => {
  const env = {
    OPENAI_API_KEY: "private-key-fixture",
    OPENAI_MODEL: "gpt-5.2",
  };
  it("supplies versioned House knowledge and strict schema, with provider storage disabled", async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(HOUSE_EXAMPLE),
                  },
                ],
              },
            ],
          }),
        ),
    );
    const result = await interpretStudioPhotos(
      ["data:image/jpeg;base64,fixture"],
      {
        env,
        fetcher: f,
      },
    );
    expect(result.description).toEqual(HOUSE_EXAMPLE);
    const request = JSON.parse(f.mock.calls[0][1].body);
    expect(request.store).toBe(false);
    expect(request.text.format.strict).toBe(true);
    expect(request.instructions).toContain("Category: House");
    expect(request.input[0].content[1].type).toBe("input_image");
  });
  it.each([
    [
      "unsupported-subject",
      {
        ...HOUSE_EXAMPLE,
        subject: "unsupported",
      },
    ],
    [
      "invalid-description",
      {
        ...HOUSE_EXAMPLE,
        storeys: 99,
      },
    ],
  ])(
    "rejects %s without creating a substitute house",
    async (code, description) => {
      await expect(
        interpretStudioPhotos(["fixture"], {
          env,
          fetcher: async () =>
            new Response(
              JSON.stringify({
                status: "completed",
                output: [
                  {
                    type: "message",
                    role: "assistant",
                    content: [
                      {
                        type: "output_text",
                        text: JSON.stringify(description),
                      },
                    ],
                  },
                ],
              }),
            ),
        }),
      ).rejects.toMatchObject({
        code,
      });
    },
  );
  it("returns an actionable configuration error without echoing provider bodies", async () => {
    await expect(
      interpretStudioPhotos(["fixture"], {
        env,
        fetcher: async () =>
          new Response("raw-provider-private-key", {
            status: 401,
          }),
      }),
    ).rejects.toEqual(
      new StudioError(
        503,
        "provider-configuration",
        "The worker's OpenAI key, model or structured-output configuration needs checking.",
      ),
    );
  });
});
