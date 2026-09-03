import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ChronoClashServer } from "../src/server/core";
import { listenChronoHttp } from "../src/server/listen";

describe("same-origin static hosting", () => {
  it("serves the web client and keeps /v1/health on the same origin", async () => {
    const dir = join("/tmp", `chrono-static-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>CHRONO CLASH</title>");
    const game = new ChronoClashServer({
      dbPath: ":memory:",
      auth: { allowGuest: true, allowDevAuth: false },
    });
    const handle = await listenChronoHttp(game, 0, "127.0.0.1", { staticDir: dir });
    const base = `http://127.0.0.1:${handle.port}`;
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    expect(await page.text()).toContain("CHRONO CLASH");
    const spa = await fetch(`${base}/ready`);
    expect(spa.status).toBe(200);
    expect(spa.headers.get("content-type")).toMatch(/text\/html/);
    expect(await spa.text()).toContain("CHRONO CLASH");
    const health = await fetch(`${base}/v1/health`);
    expect(health.status).toBe(200);
    const body = (await health.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("chrono-clash");
    const missingApi = await fetch(`${base}/v1/does-not-exist`);
    expect(missingApi.status).toBe(404);
    const missing = (await missingApi.json()) as { error?: string };
    expect(missing.error).toBe("not found");
    await handle.close();
    game.close();
  });

  it("pins the Render blueprint to this repo's real start/build scripts", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string>; engines: { node: string } };
    const yaml = readFileSync("render.yaml", "utf8");
    expect(pkg.scripts.start).toBe("tsx src/server/cli.ts");
    expect(pkg.scripts.build).toContain("vite build");
    expect(pkg.engines.node).toContain("22");
    expect(yaml).toContain("buildCommand: npm ci --include=dev && npm run build");
    expect(yaml).toContain("startCommand: npm start");
    expect(yaml).toContain("healthCheckPath: /v1/health");
    expect(yaml).toContain("CHRONO_STATIC_DIR");
    expect(yaml).toContain("value: dist");
    expect(yaml).toContain("CHRONO_DB");
    expect(yaml).toContain("/var/data/chrono.db");
    expect(yaml).toContain("numInstances: 1");
    expect(yaml).toContain("CHRONO_AUTH_MODE");
    expect(yaml).toContain("CHRONO_ALLOW_GUEST");
    expect(yaml).not.toContain("rootDir:");
    expect(yaml).not.toContain("honestly-ai");
    expect(yaml).not.toMatch(/^\s+- key: GOOGLE_/m);
    expect(yaml).not.toContain("GOOGLE_CLIENT_SECRET");
  });
});
