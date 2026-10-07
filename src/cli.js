// @ts-check
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { HOME, file, loadConfig, saveConfig, loadEnv, WALRUS } from "./config.js";
import { loadWallet } from "./wallet.js";
import { createModel } from "./model.js";
import { selectMemory, selectWalrus } from "./memory.js";
import { createAgent } from "./agent.js";
import { provisionWalrus } from "./provision.js";
import { suiClient } from "./x402.js";
import { startServer } from "./server.js";
import "./browser.js";

const HELP = `sui-agent-kit: an agent with persistent memory, coding tools and a Sui wallet

  agent                     interactive chat (creates a wallet on first run)
  agent run "<task>"        run one task and exit (add --auto for headless use)
  agent init [--walrus]     set up wallet; --walrus creates a Walrus Memory account for persistent memory
                            (or set MEMWAL_ACCOUNT_ID + MEMWAL_KEY to use an existing account)
  agent serve [--port 8787]  local HTTP API (127.0.0.1 only, bearer token) for the SUIde web UI
  agent install-browser     download headless Chromium (Playwright) so the agent can test web apps
  agent doctor              check this machine and the configuration
  agent wallet              show the agent's Sui address and balances
  agent memory recall <q>   search memory     |  agent memory remember "<text>"

options: --auto  --network testnet|mainnet  --model <id>  --cwd <dir>

Model credentials (any one): ANTHROPIC_API_KEY, or AWS credentials / AWS_BEARER_TOKEN_BEDROCK for Claude on Bedrock.
State lives in ${HOME} (override with AGENT_HOME).`;

const c = (/** @type {number} */ n, /** @type {string} */ s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);

function parse(/** @type {string[]} */ argv) {
  /** @type {Record<string, string|boolean>} */ const flags = {};
  /** @type {string[]} */ const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (["network", "model", "cwd", "port"].includes(a.slice(2)) && next) { flags[a.slice(2)] = next; i++; } else flags[a.slice(2)] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

async function ask(/** @type {string} */ q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(q)).trim(); } finally { rl.close(); }
}

function makeApprove() {
  return async (/** @type {string} */ what) => {
    if (!process.stdin.isTTY) { console.log(c(33, `  ! needs approval, not interactive (use --auto): ${what}`)); return false; }
    const a = (await ask(c(33, `  ? ${what}  [y/N] `))).toLowerCase();
    return a === "y" || a === "yes";
  };
}

function printEvent(/** @type {{type:string,text:string}} */ e) {
  if (e.type === "text") console.log(e.text);
  else if (e.type === "tool") console.log(c(36, `  > ${e.text}`));
  else if (e.type === "result") console.log(c(90, `    ${e.text.replace(/\n/g, " ").slice(0, 160)}`));
  else console.log(c(90, `  (${e.text})`));
}

async function setup(/** @type {Record<string,string|boolean>} */ flags) {
  loadEnv();
  const cfg = loadConfig();
  if (typeof flags.network === "string") cfg.network = /** @type {any} */ (flags.network);
  if (typeof flags.model === "string") cfg.model = flags.model;
  if (flags.auto) cfg.approval = "auto";
  return cfg;
}

async function init(/** @type {Record<string,string|boolean>} */ flags) {
  const cfg = await setup(flags);
  fs.mkdirSync(HOME, { recursive: true });
  const w = /** @type {NonNullable<ReturnType<typeof loadWallet>>} */ (loadWallet(true));
  console.log(`wallet ${w.created ? "created" : "found"}: ${w.address} (Sui ${cfg.network})`);

  if (!createModel(cfg) && process.stdin.isTTY) {
    const key = await ask("Anthropic API key (Enter to skip and use AWS Bedrock instead): ");
    if (key) {
      fs.appendFileSync(file(".env"), `ANTHROPIC_API_KEY=${key}\n`, { mode: 0o600 });
      console.log(`saved to ${file(".env")}`);
    }
  }
  if (flags.walrus) {
    try {
      cfg.memory = await provisionWalrus({ wallet: w, network: cfg.network, log: (s) => console.log(`  ${s}`) });
      console.log(`Walrus Memory account: ${cfg.memory.accountId}`);
    } catch (e) {
      console.error(c(33, `Walrus Memory not set up: ${/** @type {any} */ (e).message}\nContinuing with local memory.`));
    }
  }
  cfg.approval = loadConfig().approval;
  saveConfig(cfg);
  console.log(c(32, "ready. run: agent"));
}

function installBrowser() {
  /** @type {string} */ let cli;
  try { cli = path.join(path.dirname(createRequire(import.meta.url).resolve("playwright-core/package.json")), "cli.js"); } catch { return console.error("playwright-core is not installed. Run `npm install` in the kit folder first."); }
  console.log(`Installing Chromium into ${process.env.PLAYWRIGHT_BROWSERS_PATH} ...`);
  const r = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
  if (r.status !== 0) return console.error("Install failed. On Linux you may also need system libraries: sudo npx playwright-core install-deps chromium");
  console.log(c(32, "browser ready"));
}

function doctor(/** @type {import("./config.js").Config} */ cfg) {
  const ok = (/** @type {boolean} */ b) => (b ? c(32, "ok  ") : c(31, "FAIL"));
  const major = Number(process.versions.node.split(".")[0]);
  /** @type {any} */ let model = null, modelErr = "";
  try { model = createModel(cfg); } catch (e) { modelErr = /** @type {any} */ (e).message; }
  const w = loadWallet();
  const mem = selectMemory(cfg);
  const has = (/** @type {string} */ bin) => spawnSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "ignore" }).status === 0;
  console.log(`${ok(major >= 22)} node ${process.versions.node} (needs >= 22)`);
  console.log(`${ok(true)} ${process.platform}/${os.arch()}  state: ${HOME}`);
  console.log(`${ok(!!model)} model: ${model ? `${model.provider} ${model.id}` : modelErr || "none (set ANTHROPIC_API_KEY or AWS credentials)"}`);
  console.log(`${ok(!!w)} wallet: ${w ? w.address : "not created (run: agent init)"} on ${cfg.network}`);
  console.log(`${ok(true)} memory: ${mem.kind}${mem.kind === "local" ? " (run: agent init --walrus for persistent Walrus Memory)" : ""}`);
  console.log(`${ok(has("git"))} git ${has("git") ? "" : "(optional, used by coding tasks)"}`);
  const hasPw = (() => { try { createRequire(import.meta.url).resolve("playwright-core"); return fs.existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH || file("browsers")) && fs.readdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH || file("browsers")).some((d) => d.startsWith("chromium")); } catch { return false; } })();
  console.log(`${ok(hasPw)} browser (Playwright) ${hasPw ? "" : "(optional: run `agent install-browser` to let the agent test web apps)"}`);
  console.log(`${ok(has("sui"))} sui CLI ${has("sui") ? "" : "(optional: needed to build and publish Move packages)"}`);
  console.log(`budget: <= ${cfg.maxPerCallUsd} USD/call, ${cfg.dailyBudgetUsd} USD/day, approval=${cfg.approval}`);
}

async function wallet(/** @type {import("./config.js").Config} */ cfg) {
  const w = loadWallet();
  if (!w) return console.log("No wallet. Run: agent init");
  console.log(`address: ${w.address}\nnetwork: ${cfg.network}`);
  const { balances } = await suiClient(cfg.network).core.listBalances({ owner: w.address });
  for (const b of balances) console.log(`  ${b.coinType}: ${b.balance}`);
  if (!balances.length) console.log("  (no funds)");
}

export async function main(/** @type {string[]} */ argv) {
  const { flags, rest } = parse(argv);
  const cmd = rest[0] && ["init", "run", "serve", "doctor", "wallet", "memory", "install-browser", "help"].includes(rest[0]) ? rest.shift() : "chat";
  if (flags.help || cmd === "help") return console.log(HELP);
  const cfg = await setup(flags);

  if (cmd === "install-browser") return installBrowser();
  if (cmd === "init") return init(flags);
  if (cmd === "doctor") return doctor(cfg);
  if (cmd === "wallet") return wallet(cfg);
  if (cmd === "memory") {
    const mem = selectMemory(cfg);
    const [sub, ...text] = rest;
    if (sub === "remember" && text.length) { await mem.remember(text.join(" ")); return console.log("remembered"); }
    if (sub === "recall" && text.length) {
      const r = await mem.recall(text.join(" "), 10);
      return console.log(r.length ? r.map((m) => `- ${m.at ? `[${m.at.slice(0, 10)}] ` : ""}${m.text}`).join("\n") : "no memories");
    }
    return console.log('usage: agent memory recall <query> | agent memory remember "<text>"');
  }

  const model = createModel(cfg);
  if (!model) {
    console.error("No model credentials found.\nSet ANTHROPIC_API_KEY, or AWS credentials (Claude on Bedrock), then retry. Run `agent doctor` to check.");
    process.exitCode = 1;
    return;
  }
  const w = loadWallet(true);
  if (w?.created) console.log(c(90, `created agent wallet ${w.address} (Sui ${cfg.network}), state in ${HOME}`));
  const memory = selectMemory(cfg);
  const cwd = typeof flags.cwd === "string" ? flags.cwd : process.cwd();
  if (cmd === "serve") {
    const srv = await startServer({ model, walrus: selectWalrus(cfg), cfg, wallet: w, cwd, port: typeof flags.port === "string" ? Number(flags.port) : undefined });
    console.log(`${c(1, "sui-agent-kit")} API on http://127.0.0.1:${srv.port} (loopback only) | ${model.provider} ${model.id} | walrus: ${memory.kind === "walrus" ? "on" : "off"}
token file: ${file("web-token")} (or AGENT_WEB_TOKEN)`);
    return;
  }
  const agent = createAgent({
    model, memory, cfg, wallet: w, cwd,
    approve: makeApprove(), onEvent: printEvent,
  });

  if (cmd === "run") {
    const task = rest.join(" ");
    if (!task) { console.error('usage: agent run "<task>" [--auto]'); process.exitCode = 1; return; }
    await agent.run(task);
    return;
  }

  console.log(c(1, "sui-agent-kit") + c(90, ` | ${model.provider} ${model.id} | memory: ${memory.kind} | /exit to quit`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("close", () => process.exit(0));
  for (;;) {
    const line = (await rl.question(c(35, "\n> "))).trim();
    if (!line) continue;
    if (line === "/exit" || line === "/quit") break;
    rl.pause();
    try { await agent.run(line); } catch (e) { console.error(c(31, `error: ${/** @type {any} */ (e).message}`)); }
    rl.resume();
  }
  rl.close();
}
