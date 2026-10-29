import { readFile as readFileAsync } from "node:fs/promises";
import { join } from "node:path";

// Let Chrome allocate a free port unless an explicit override is valid.
export function portArg(env) {
  const value = env.CDP_PORT;
  if (value === undefined || value === "") {
    return { arg: "--remote-debugging-port=0", fixed: null };
  }
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid CDP_PORT: ${value} (expected an integer from 1024 to 65535)`);
  }
  return { arg: `--remote-debugging-port=${port}`, fixed: port };
}

// Read only this run's profile; retry while Chrome creates its port file.
export async function readActivePort(profileDir, {
  timeoutMs = 10000,
  pollMs = 50,
  readFile = readFileAsync,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const file = join(profileDir, "DevToolsActivePort");
  const deadline = now() + timeoutMs;
  for (;;) {
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error(`Timed out waiting for ${file}`);
      await sleep(Math.min(pollMs, remaining));
      continue;
    }
    const line = content.split(/\r?\n/, 1)[0];
    const port = Number(line);
    if (!/^\d+$/.test(line) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid DevTools port in ${file}: ${line}`);
    }
    return port;
  }
}
