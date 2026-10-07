// @ts-check
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOME = process.env.AGENT_HOME || path.join(os.homedir(), ".sui-agent-kit");
export const file = (/** @type {string[]} */ ...p) => path.join(HOME, ...p);

export const WALRUS = {
  testnet: {
    relayer: "https://relayer-staging.memory.walrus.xyz",
    packageId: "0x0a625e2db2af6f591a4c80a3d8551ddf11656089cc3a20c5e9e7f8fb75b9265c",
    registryId: "0x736aef9906798fca4460490ccdf8e8502ef170122dc26ecae32111b78c6b42dd",
  },
  mainnet: {
    relayer: "https://relayer.memory.walrus.xyz",
    packageId: "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5",
    registryId: "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f",
  },
};

export function readJson(/** @type {string} */ f, /** @type {any} */ fallback) {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fallback; }
}

export function writeJson(/** @type {string} */ f, /** @type {any} */ value, secret = false) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(value, null, 2), { mode: secret ? 0o600 : 0o644 });
  if (secret && process.platform !== "win32") fs.chmodSync(f, 0o600);
}

/** Load .env files (agent home, then cwd) without overriding real environment variables. */
export function loadEnv() {
  for (const f of [file(".env"), path.join(process.cwd(), ".env")]) {
    try {
      const text = fs.readFileSync(f, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!m || m[1] in process.env) continue;
        process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
      }
    } catch {}
  }
}

/**
 * @typedef {Object} Config
 * @property {"testnet"|"mainnet"} network   Sui network for the wallet, x402 and Walrus Memory
 * @property {"ask"|"auto"} approval         ask = confirm bash/write/payments; auto = no prompts
 * @property {number} maxPerCallUsd          x402: max price of a single purchase (stablecoin, 6 decimals)
 * @property {number} dailyBudgetUsd         x402: max total spend per UTC day
 * @property {string} [model]                model id override
 * @property {{provider:"walrus", accountId:string, delegateKey:string, serverUrl?:string, namespace?:string}} [memory]
 */

/** @returns {Config} */
export function loadConfig() {
  const c = readJson(file("config.json"), {});
  return {
    network: process.env.AGENT_NETWORK || c.network || "testnet",
    approval: c.approval || "ask",
    maxPerCallUsd: c.maxPerCallUsd ?? 0.05,
    dailyBudgetUsd: c.dailyBudgetUsd ?? 0.5,
    model: process.env.AGENT_MODEL || c.model,
    memory: c.memory,
  };
}

export function saveConfig(/** @type {Config} */ cfg) {
  writeJson(file("config.json"), cfg, true);
}
