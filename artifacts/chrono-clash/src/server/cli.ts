import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { applyDotEnv, assertProductionAuth, authStatusLine } from "./auth-config";
import { ChronoClashServer } from "./core";
import { listenChronoHttp } from "./listen";

applyDotEnv();

const parsedPort = Number(process.env.PORT || process.env.CHRONO_PORT || 8787);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8787;
const dbPath = resolve(process.env.CHRONO_DB || "data/chrono.db");
const staticDir = resolve(process.env.CHRONO_STATIC_DIR || "dist");
mkdirSync(dirname(dbPath), { recursive: true });

const game = new ChronoClashServer({ dbPath });
assertProductionAuth(game.authConfig);

void listenChronoHttp(game, port, "0.0.0.0", { staticDir }).then((handle) => {
  console.log(`CHRONO CLASH SERVER http://0.0.0.0:${handle.port}`);
  console.log(authStatusLine(game.authConfig));
  console.log(`static ${staticDir}`);
});
