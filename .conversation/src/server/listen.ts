import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { ChronoClashServer } from "./core";
import { HttpRequest, routeServer } from "./http";

export interface ListenHandle {
  port: number;
  close(): Promise<void>;
}

export type ListenOptions = {
  staticDir?: string;
};

export function listenChronoHttp(
  game: ChronoClashServer,
  port = 0,
  host = "127.0.0.1",
  opts: ListenOptions = {},
): Promise<ListenHandle> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void handle(game, req, res, opts.staticDir);
    });
    server.listen(port, host, () => {
      const addr = server.address();
      const bound = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        port: bound,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
    server.on("error", reject);
  });
}

function isApiPath(path: string): boolean {
  return path === "/v1" || path.startsWith("/v1/");
}

async function handle(
  game: ChronoClashServer,
  req: IncomingMessage,
  res: ServerResponse,
  staticDir?: string,
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors());
    res.end();
    return;
  }
  const url = new URL(req.url || "/", "http://chrono.local");
  if (!isApiPath(url.pathname) && staticDir && (req.method === "GET" || req.method === "HEAD")) {
    if (serveStatic(res, url.pathname, staticDir, req.method === "HEAD")) return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    void (async () => {
      let body: unknown = null;
      const raw = Buffer.concat(chunks).toString();
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      const mapped: HttpRequest = {
        method: req.method || "GET",
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: flatten(req.headers),
        body,
      };
      const out = await routeServer(game, mapped);
      res.writeHead(out.status, { ...cors(), "content-type": "application/json" });
      res.end(JSON.stringify(out.body));
    })();
  });
}

function flatten(headers: IncomingMessage["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join(",");
  }
  return out;
}

function cors(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function serveStatic(res: ServerResponse, pathname: string, staticDir: string, head: boolean): boolean {
  const root = resolve(staticDir);
  if (!existsSync(root)) return false;
  const raw = decodeURIComponent(pathname.split("?")[0] || "/");
  const rel = normalize(raw).replace(/^[/\\]+/, "");
  const candidate = resolve(join(root, rel));
  if (candidate !== root && !candidate.startsWith(root + sep)) return false;
  let file = candidate;
  try {
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) {
      const fallback = join(root, "index.html");
      if (!existsSync(fallback)) return false;
      file = fallback;
    }
    const body = readFileSync(file);
    const headers = { ...cors(), "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream" };
    res.writeHead(200, headers);
    res.end(head ? undefined : body);
    return true;
  } catch {
    return false;
  }
}
