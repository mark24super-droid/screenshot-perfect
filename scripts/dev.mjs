import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

const server = spawn(npm, ["run", "dev:server"], { stdio: "inherit", shell: isWindows });
const client = spawn(npm, ["run", "dev:client"], { stdio: "inherit", shell: isWindows });

function shutdown(code = 0) {
  server.kill("SIGTERM");
  client.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}

server.on("exit", (code) => {
  if (code && code !== 0) shutdown(code);
});
client.on("exit", (code) => {
  if (code && code !== 0) shutdown(code);
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
