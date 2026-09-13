import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const www = path.join(root, "www");
const indexPath = path.join(www, "index.html");
const bridgeSrc = path.join(root, "scripts", "native-bridge.js");
const bridgeDest = path.join(www, "native-bridge.js");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

await run("pnpm", ["exec", "vite", "build", "--config", "vite.config.ts"]);

const html = await readFile(indexPath, "utf8");
if (html.includes("native-bridge.js")) {
  console.log("iOS native bridge already present in www/index.html");
} else {
  if (!html.includes('<div id="app"></div>')) {
    throw new Error("Unexpected Chrono Clash index.html — refusing to patch a non-game bundle.");
  }
  await copyFile(bridgeSrc, bridgeDest);
  const next = html.replace(
    '<div id="app"></div>',
    '<div id="app"></div>\n    <script src="/native-bridge.js"></script>',
  );
  if (next === html) {
    throw new Error("Failed to inject iOS native-bridge.js into the copied web bundle.");
  }
  await writeFile(indexPath, next);
  console.log("Injected iOS native-bridge.js into the copied web bundle only.");
}

console.log("Chrono Clash iOS web bundle is ready in artifacts/chrono-clash-ios-test/www");
