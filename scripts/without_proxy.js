#!/usr/bin/env node
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const [, , command, ...args] = process.argv;

if (!command) {
  console.error("Usage: node scripts/without_proxy.js <command> [...args]");
  process.exit(2);
}

const env = { ...process.env };

for (const key of [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
  "npm_config_proxy",
  "npm_config_https_proxy",
]) {
  delete env[key];
}

env.NO_PROXY = "*";
env.no_proxy = "*";
env.npm_config_noproxy = "*";
env.GIT_CONFIG_COUNT = "2";
env.GIT_CONFIG_KEY_0 = "http.proxy";
env.GIT_CONFIG_VALUE_0 = "";
env.GIT_CONFIG_KEY_1 = "https.proxy";
env.GIT_CONFIG_VALUE_1 = "";
env.ELECTRON_MIRROR = env.ELECTRON_MIRROR || "https://npmmirror.com/mirrors/electron/";
env.ELECTRON_BUILDER_BINARIES_MIRROR =
  env.ELECTRON_BUILDER_BINARIES_MIRROR || "https://npmmirror.com/mirrors/electron-builder-binaries/";

function resolveCommand(name) {
  if (name.includes("/") || name.includes("\\")) {
    return name;
  }

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const pathDirs = [
    path.join(process.cwd(), "node_modules", ".bin"),
    ...(env[pathKey] || "").split(path.delimiter).filter(Boolean),
  ];
  const extensions =
    process.platform === "win32"
      ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
      : [""];

  for (const dir of pathDirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, name.endsWith(extension.toLowerCase()) ? name : `${name}${extension.toLowerCase()}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return name;
}

const resolvedCommand = resolveCommand(command);
const isCmdShim = process.platform === "win32" && /\.(cmd|bat)$/i.test(resolvedCommand);
const childCommand = isCmdShim ? "cmd.exe" : resolvedCommand;
const childArgs = isCmdShim
  ? ["/d", "/c", resolvedCommand, ...args]
  : args;

const child = spawn(childCommand, childArgs, {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
