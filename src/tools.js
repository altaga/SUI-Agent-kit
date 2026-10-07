// @ts-check
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { payFetch, suiClient } from "./x402.js";
import { listSkills, loadSkill } from "./skills.js";
import { browse } from "./browser.js";
import { HOME } from "./config.js";

const KNOWN_COINS = /** @type {[string,string,number][]} */ ([["SUI", "::sui::SUI", 9], ["WAL", "::wal::WAL", 9], ["USDC", "::usdc::USDC", 6]]);
/** @param {string} coinType @param {string} raw */
function formatBalance(coinType, raw) {
  const k = KNOWN_COINS.find(([, suffix]) => coinType.endsWith(suffix));
  if (!k) return { coinType, rawAmount: raw };
  const d = 10n ** BigInt(Number(k[2])), v = BigInt(raw);
  return { symbol: k[0], amount: `${v / d}.${(v % d).toString().padStart(Number(k[2]), "0")}`, coinType, rawAmount: raw };
}


/**
 * @typedef {Object} Ctx
 * @property {string} cwd
 * @property {import("./config.js").Config} cfg
 * @property {import("./memory.js").Memory} memory
 * @property {any} wallet
 * @property {import("./memory.js").WalrusMemory|null} [walrus]   Walrus Memory, reachable on demand even when the session memory is local
 * @property {(what:string)=>Promise<boolean>} approve   ask the human (always allowed when approval=auto)
 * @typedef {{name:string, description:string, input_schema:any, mutating?:boolean, needs?:"walrus", run:(input:any, ctx:Ctx)=>Promise<string>}} Tool
 */

const MAX = 20_000;
const clip = (/** @type {string} */ s) => (s.length <= MAX ? s : `${s.slice(0, MAX / 2)}\n…[${s.length - MAX} chars cut]…\n${s.slice(-MAX / 2)}`);
const abs = (/** @type {Ctx} */ ctx, /** @type {string} */ p) => path.resolve(ctx.cwd, p);

function killTree(/** @type {import("node:child_process").ChildProcess} */ child) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch {}
}

/** Runs a command with the platform shell (sh on Linux/macOS, cmd.exe on Windows). */
export function runShell(/** @type {string} */ command, /** @type {string} */ cwd, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: `${path.join(HOME, "bin")}${path.delimiter}${process.env.PATH ?? ""}` };
    const child = spawn(command, { shell: true, cwd, env, detached: process.platform !== "win32", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", timedOut = false;
    const add = (/** @type {Buffer} */ d) => { out += d; if (out.length > 400_000) out = out.slice(-200_000); };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); resolve(`spawn error: ${e.message}`); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(`${clip(out.trim())}\n[exit ${timedOut ? `timeout after ${timeoutMs / 1000}s` : code}]`);
    });
  });
}

/** @type {Tool[]} */
export const tools = [
  {
    name: "walrus_recall",
    description: "Search the agent's long-term memory on Walrus (shared across sessions and machines), even though this session starts with an empty local memory. Use `namespace` to read another agent's memories on the same account; `save` copies the results into this session's local memory.",
    input_schema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" }, namespace: { type: "string" }, save: { type: "boolean" } }, required: ["query"] },
    needs: "walrus",
    run: async (i, ctx) => {
      const w = i.namespace ? /** @type {any} */ (ctx.walrus).withNamespace(String(i.namespace)) : ctx.walrus;
      const r = await /** @type {any} */ (w).recall(i.query, Math.min(Number(i.limit) || 5, 20));
      if (i.save) for (const m of r) await ctx.memory.remember(m.text);
      return r.length ? r.map((/** @type {any} */ m) => `- ${m.at ? `[${m.at.slice(0, 10)}] ` : ""}${m.text}`).join("\n") + (i.save ? "\n(copied to this session's memory)" : "") : "Nothing found on Walrus.";
    },
  },
  {
    name: "walrus_remember",
    description: "Store a fact in long-term memory on Walrus so every future session and machine can recall it.",
    input_schema: { type: "object", properties: { text: { type: "string" }, namespace: { type: "string" } }, required: ["text"] },
    needs: "walrus",
    run: async (i, ctx) => {
      const w = i.namespace ? /** @type {any} */ (ctx.walrus).withNamespace(String(i.namespace)) : ctx.walrus;
      await /** @type {any} */ (w).remember(i.text);
      return "Stored on Walrus.";
    },
  },
  {
    name: "skills_list",
    description: "List the agent skills installed for this project (e.g. the Sui skills from mystenlabs/skills) with a one-line description each. Check this before writing Sui or Move code.",
    input_schema: { type: "object", properties: {} },
    run: async (_i, ctx) => listSkills(ctx.cwd).map((s) => `- ${s.name}: ${s.description.slice(0, 160)}`).join("\n") || "No skills installed. Install with: npx skills add mystenlabs/skills --all",
  },
  {
    name: "skill_load",
    description: "Load a skill's instructions (SKILL.md), or one of its reference files via `file` (relative path inside the skill, e.g. bootstrap.md). Follow what it says instead of guessing Sui APIs.",
    input_schema: { type: "object", properties: { name: { type: "string" }, file: { type: "string" } }, required: ["name"] },
    run: async (i, ctx) => loadSkill(ctx.cwd, i.name, i.file || ""),
  },
  {
    name: "bash",
    description: `Run a shell command on this machine (${process.platform}; sh on Unix, cmd.exe on Windows) in the working directory. Returns combined stdout/stderr and the exit code.`,
    input_schema: { type: "object", properties: { command: { type: "string" }, timeout_s: { type: "number", description: "default 120" } }, required: ["command"] },
    mutating: true,
    run: async (i, ctx) => {
      if (typeof i.command !== "string" || !i.command.trim()) return "Error: bash needs a non-empty \"command\" string.";
      if (!(await ctx.approve(`RUN  ${i.command}`))) return "Declined by user.";
      return runShell(i.command, ctx.cwd, Math.min(i.timeout_s || 120, 1800) * 1000);
    },
  },
  {
    name: "browser",
    description: "Drive a headless Chromium (Playwright) to test web apps you build or read pages. Actions: open {url}, snapshot {selector?} (accessibility tree, best for finding elements), text {selector?}, click {selector}, fill {selector, text}, press {key}, resize {width,height} (try 390x844 for mobile), console (errors since last call), screenshot {full_page?} (saved under .agent-shots/), close. Selectors are Playwright selectors, e.g. `text=Sign in`, `role=button[name=\"Send\"]`, `#id`. Localhost pages are fully automatic; actions on other sites ask the user first.",
    input_schema: { type: "object", properties: { action: { type: "string" }, url: { type: "string" }, selector: { type: "string" }, text: { type: "string" }, key: { type: "string" }, width: { type: "number" }, height: { type: "number" }, full_page: { type: "boolean" } }, required: ["action"] },
    run: async (i, ctx) => { try { return await browse(i, ctx); } catch (e) { return `browser error: ${/** @type {Error} */ (e).message.split("\n")[0]}`; } },
  },
  {
    name: "read_file",
    description: "Read a text file. Optional 1-based line offset and line limit.",
    input_schema: { type: "object", properties: { path: { type: "string" }, offset: { type: "number" }, limit: { type: "number" } }, required: ["path"] },
    run: async (i, ctx) => {
      const lines = fs.readFileSync(abs(ctx, i.path), "utf8").split("\n");
      const from = Math.max((i.offset || 1) - 1, 0);
      return clip(lines.slice(from, i.limit ? from + i.limit : undefined).map((l, n) => `${from + n + 1}\t${l}`).join("\n"));
    },
  },
  {
    name: "list_dir",
    description: "List files in a directory (directories end with /).",
    input_schema: { type: "object", properties: { path: { type: "string" } } },
    run: async (i, ctx) =>
      fs.readdirSync(abs(ctx, i.path || "."), { withFileTypes: true }).map((e) => e.name + (e.isDirectory() ? "/" : "")).join("\n") || "(empty)",
  },
  {
    name: "write_file",
    description: "Create or overwrite a file with the given content (parent directories are created).",
    input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    mutating: true,
    run: async (i, ctx) => {
      if (!(await ctx.approve(`WRITE ${i.path} (${i.content.length} chars)`))) return "Declined by user.";
      fs.mkdirSync(path.dirname(abs(ctx, i.path)), { recursive: true });
      fs.writeFileSync(abs(ctx, i.path), i.content);
      return `Wrote ${i.path}`;
    },
  },
  {
    name: "edit_file",
    description: "Replace old_string with new_string in a file. old_string must be unique unless replace_all is true.",
    input_schema: { type: "object", properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } }, required: ["path", "old_string", "new_string"] },
    mutating: true,
    run: async (i, ctx) => {
      const f = abs(ctx, i.path);
      const text = fs.readFileSync(f, "utf8");
      const n = text.split(i.old_string).length - 1;
      if (n === 0) return "old_string not found.";
      if (n > 1 && !i.replace_all) return `old_string appears ${n} times; add context or set replace_all.`;
      if (!(await ctx.approve(`EDIT ${i.path} (${n} replacement${n > 1 ? "s" : ""})`))) return "Declined by user.";
      fs.writeFileSync(f, i.replace_all ? text.split(i.old_string).join(i.new_string) : text.replace(i.old_string, () => i.new_string));
      return `Edited ${i.path}`;
    },
  },
  {
    name: "web_fetch",
    description: "HTTP GET a URL and return status and body text. Does not pay; if the answer is 402 use fetch_paid.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    run: async (i) => {
      const r = await fetch(i.url, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "sui-agent-kit" } });
      return `HTTP ${r.status}${r.status === 402 ? " (payment required: use fetch_paid)" : ""}\n${clip(await r.text())}`;
    },
  },
  {
    name: "fetch_paid",
    description: "Call an x402 paid HTTP service: if the server asks for payment, pay it from the agent's Sui wallet (USDC, gas sponsored) within the configured budget, then return the response. Use for buying services/APIs/hardware actions.",
    input_schema: { type: "object", properties: { url: { type: "string" }, method: { type: "string" }, headers: { type: "object" }, body: { type: "string", description: "JSON string" } }, required: ["url"] },
    mutating: true,
    run: async (i, ctx) => {
      const r = await payFetch(ctx, i);
      return clip(JSON.stringify({ ...r, body: undefined }) + "\n" + r.body);
    },
  },
  {
    name: "wallet_info",
    description: "Show the agent's Sui address, network and token balances, plus the payment budget.",
    input_schema: { type: "object", properties: {} },
    run: async (_i, ctx) => {
      if (!ctx.wallet) return "No wallet. Run: agent init";
      const { balances } = await suiClient(ctx.cfg.network).core.listBalances({ owner: ctx.wallet.address });
      return JSON.stringify({ address: ctx.wallet.address, network: ctx.cfg.network, balances: balances.map((b) => formatBalance(b.coinType, b.balance)), maxPerCallUsd: ctx.cfg.maxPerCallUsd, dailyBudgetUsd: ctx.cfg.dailyBudgetUsd });
    },
  },
  {
    name: "memory_remember",
    description: "Save an important fact to long-term memory (persists across sessions and machines when Walrus Memory is configured).",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    run: async (i, ctx) => { await ctx.memory.remember(i.text); return "Remembered."; },
  },
  {
    name: "memory_recall",
    description: "Search long-term memory for facts relevant to a query.",
    input_schema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
    run: async (i, ctx) => {
      const r = await ctx.memory.recall(i.query, i.limit || 5);
      return r.length ? r.map((m) => `- ${m.at ? `[${m.at.slice(0, 10)}] ` : ""}${m.text}`).join("\n") : "No memories found.";
    },
  },
];
