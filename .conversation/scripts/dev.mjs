import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];

function start(args, extraEnv = {}) {
  const child = spawn(npm, args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);
  return child;
}

const server = start(["run", "server"], {
  CHRONO_AUTH_MODE: "development",
  CHRONO_ALLOW_GUEST: "1",
});
const vite = start(["exec", "vite", "--host", "0.0.0.0", "--port", "5173"]);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 150);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
server.on("exit", (code) => {
  if (!shuttingDown && code !== 0) shutdown(code ?? 1);
});
vite.on("exit", (code) => {
  if (!shuttingDown && code !== 0) shutdown(code ?? 1);
});
