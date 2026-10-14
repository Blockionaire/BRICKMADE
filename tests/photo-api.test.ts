import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { makeHandler, MAX_REQUEST_BYTES } from "../server/handler.mjs";
import { HOUSE_PRESETS, parseHouseBrief } from "../shared/house-brief";
import { validateAiConnection } from "@/services/photo-interpretation";
const photo = `data:image/jpeg;base64,${readFileSync("tests/fixtures/house-upload.jpg").toString("base64")}`;
const payload = { version: 1, consent: true, photos: [photo] };
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});
const completed = (brief = HOUSE_PRESETS[0].brief) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(brief) }],
        },
      ],
    }),
  );
async function service(
  fetcher = vi.fn(async () => completed()),
  patch: Record<string, string | undefined> = {},
) {
  const token = randomBytes(32).toString("hex");
  const env = {
    NODE_ENV: "test" as const,
    OPENAI_API_KEY: "server-only-key-do-not-leak",
    OPENAI_MODEL: "gpt-5.2",
    BRICKMADE_ACCESS_TOKEN: token,
    BRICKMADE_ALLOWED_ORIGINS: "https://blockionaire.github.io",
    ...patch,
  };
  const server = createServer(makeHandler({ env, fetcher }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing test server");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (
    body: unknown = payload,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: {
        Origin: env.BRICKMADE_ALLOWED_ORIGINS,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { base, token, fetcher, request };
}
describe("Private photo API boundaries", () => {
  it("requires private authorization before invoking OpenAI", async () => {
    const api = await service();
    const r = await api.request(payload, { Authorization: "Bearer wrong" });
    expect(r.status).toBe(401);
    expect(api.fetcher).not.toHaveBeenCalled();
    expect(await r.text()).not.toContain("server-only-key");
  });
  it("rejects a foreign origin and gives only the configured origin preflight access", async () => {
    const api = await service();
    expect(
      (await api.request(payload, { Origin: "https://foreign.example" }))
        .status,
    ).toBe(403);
    const r = await fetch(`${api.base}/api/analyze`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://blockionaire.github.io",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe(
      "https://blockionaire.github.io",
    );
    expect(api.fetcher).not.toHaveBeenCalled();
  });
  it("fails closed when secrets are missing or the test code is too short", async () => {
    for (const patch of [
      { OPENAI_API_KEY: "" },
      { BRICKMADE_ACCESS_TOKEN: "short" },
    ]) {
      const api = await service(undefined, patch);
      expect((await api.request()).status).toBe(503);
      expect(api.fetcher).not.toHaveBeenCalled();
    }
  });
  it("checks connectivity without a billed provider call or exposing server secrets", async () => {
    const api = await service();
    const r = await fetch(`${api.base}/api/status`, {
      headers: { Authorization: `Bearer ${api.token}` },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({
      version: 1,
      ready: true,
      model: "gpt-5.2",
      scope: "simple-houses",
      storesPhotos: false,
    });
    expect(api.fetcher).not.toHaveBeenCalled();
  });
  it("sends one image request with a strict description schema and storage disabled", async () => {
    const api = await service();
    const r = await api.request();
    expect(r.status).toBe(200);
    expect(parseHouseBrief((await r.json()).brief)).toEqual(
      HOUSE_PRESETS[0].brief,
    );
    expect(api.fetcher).toHaveBeenCalledOnce();
    const [url, init] = api.fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const sent = JSON.parse(init.body as string);
    expect(sent.store).toBe(false);
    expect(sent.text.format.strict).toBe(true);
    expect(sent.text.format.schema.additionalProperties).toBe(false);
    expect(sent.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: photo,
      detail: "high",
    });
    expect(sent.instructions).toContain("untrusted");
    expect(sent).not.toHaveProperty("tools");
  });
  it("rejects missing consent, empty images, excess views and unexpected fields", async () => {
    const api = await service();
    for (const body of [
      { ...payload, consent: false },
      { ...payload, photos: [] },
      { ...payload, photos: Array(4).fill(photo) },
      { ...payload, key: "leak" },
      null,
    ])
      expect((await api.request(body)).status).toBe(400);
    expect(api.fetcher).not.toHaveBeenCalled();
  });
  it("rejects remote URLs, SVG, wrong signatures, corrupt base64 and oversized dimensions", async () => {
    const api = await service();
    const huge = Buffer.from(readFileSync("tests/fixtures/house-upload.jpg"));
    let i = 2;
    while (i + 9 < huge.length) {
      const marker = huge[i + 1],
        length = huge.readUInt16BE(i + 2);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        huge.writeUInt16BE(5000, i + 5);
        break;
      }
      i += length + 2;
    }
    for (const item of [
      "https://private.example/photo.jpg",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/jpeg;base64,AAAA",
      `${photo}x`,
      `data:image/jpeg;base64,${huge.toString("base64")}`,
    ])
      expect((await api.request({ ...payload, photos: [item] })).status).toBe(
        400,
      );
    expect(api.fetcher).not.toHaveBeenCalled();
  });
  it("bounds request bytes and rejects malformed JSON and content types", async () => {
    const api = await service();
    expect((await api.request("x".repeat(MAX_REQUEST_BYTES + 1))).status).toBe(
      413,
    );
    expect((await api.request("{")).status).toBe(400);
    expect(
      (await api.request(payload, { "Content-Type": "text/plain" })).status,
    ).toBe(415);
    expect(api.fetcher).not.toHaveBeenCalled();
  });
  it("preserves unsupported classifications rather than substituting a demo", async () => {
    const brief = {
      ...HOUSE_PRESETS[0].brief,
      subject: "unsupported" as const,
      summary: "A vehicle is outside the house compiler.",
    };
    const api = await service(vi.fn(async () => completed(brief)));
    const r = await api.request();
    expect(r.status).toBe(200);
    expect((await r.json()).brief.subject).toBe("unsupported");
  });
  it("rejects malformed, incomplete and refused interpretations before returning a usable brief", async () => {
    for (const data of [
      { status: "incomplete", output: [] },
      {
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "refusal", refusal: "private upstream text" }],
          },
        ],
      },
      {
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: '{"placements":[]}' }],
          },
        ],
      },
    ]) {
      const api = await service(
        vi.fn(async () => new Response(JSON.stringify(data))),
      );
      const r = await api.request();
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(await r.text()).not.toContain("private upstream text");
    }
  });
  it("maps provider quota/configuration errors without exposing raw errors or retrying", async () => {
    for (const [upstream, status] of [
      [429, 429],
      [401, 503],
      [404, 503],
      [500, 502],
    ]) {
      const api = await service(
        vi.fn(
          async () =>
            new Response("server-only-key-do-not-leak", { status: upstream }),
        ),
      );
      const r = await api.request();
      expect(r.status).toBe(status);
      expect(await r.text()).not.toContain("server-only-key");
      expect(api.fetcher).toHaveBeenCalledOnce();
    }
  });
  it("enforces the instance test limit before more provider calls", async () => {
    const api = await service();
    for (let i = 0; i < 12; i++) expect((await api.request()).status).toBe(200);
    const r = await api.request();
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(api.fetcher).toHaveBeenCalledTimes(12);
  });
  it("aborts in-flight provider work when the browser disconnects", async () => {
    let started!: () => void;
    const upstreamStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let aborted = false;
    const fetcher = vi.fn(
      (...args: Parameters<typeof fetch>) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = args[1]?.signal;
          signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(Error("Fixture provider cancelled"));
            },
            { once: true },
          );
          started();
        }),
    );
    const token = randomBytes(32).toString("hex");
    const server = createServer(
      makeHandler({
        env: {
          NODE_ENV: "test",
          OPENAI_API_KEY: "fixture-key",
          BRICKMADE_ACCESS_TOKEN: token,
        },
        fetcher,
      }),
    );
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Missing address");
    const controller = new AbortController();
    const result = fetch(`http://127.0.0.1:${address.port}/api/analyze`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }).catch((error) => error);
    await upstreamStarted;
    controller.abort();
    expect((await result).name).toBe("AbortError");
    await expect.poll(() => aborted).toBe(true);
  });
  it("never accepts an OpenAI key as a browser test code or an insecure remote endpoint", () => {
    for (const connection of [
      { endpoint: "https://api.example", accessCode: "sk-".padEnd(50, "x") },
      { endpoint: "http://api.example", accessCode: "test".repeat(10) },
      { endpoint: "https://api.example/path", accessCode: "test".repeat(10) },
      {
        endpoint: "https://user:pass@api.example",
        accessCode: "test".repeat(10),
      },
    ])
      expect(() => validateAiConnection(connection)).toThrow();
    expect(
      validateAiConnection({
        endpoint: "https://example.vercel.app/",
        accessCode: "test".repeat(10),
      }).endpoint,
    ).toBe("https://example.vercel.app");
  });
});
