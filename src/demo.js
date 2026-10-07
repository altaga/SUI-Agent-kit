// @ts-check
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { suiClient } from "./x402.js";
import { requestTestnetSui } from "./faucet.js";

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "agent.mjs");
const PAY_MIST = 1_000_000n; // 0.001 SUI
const WORDS = ["walrus", "tide", "aurora", "kelp", "coral", "ember", "lumen", "cobalt", "drift", "nimbus", "quartz", "delta"];
const phrase = () => Array.from({ length: 3 }, () => WORDS[crypto.randomInt(WORDS.length)]).join("-") + "-" + crypto.randomInt(100, 999);
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const short = (/** @type {string} */ a) => `${a.slice(0, 8)}…${a.slice(-6)}`;

/**
 * "The agent that never forgets": Machine A acts on Sui and writes to Walrus, then a brand-new machine
 * (empty state dir, no wallet, no files) wakes up with only the Walrus delegate credentials and has to
 * recover what happened. Everything here is real: a testnet transaction, Walrus Memory, a separate agent process.
 * @param {Object} o
 * @param {import("./config.js").Config} o.cfg
 * @param {any} o.wallet
 * @param {import("./memory.js").WalrusMemory} o.walrus
 * @param {(e:any)=>void} o.emit
 * @param {AbortSignal} [o.signal]
 */
export async function runResurrection(o) {
  const { cfg, wallet, walrus, emit } = o;
  if (cfg.network !== "testnet") throw new Error("The demo only runs on testnet.");
  if (!wallet) throw new Error("No wallet. Run: agent init");
  const t0 = Date.now();
  const step = (/** @type {number} */ n, /** @type {string} */ title, /** @type {string} */ status, /** @type {string} */ detail = "") => emit({ type: "step", n, title, status, detail, ms: Date.now() - t0 });
  const client = suiClient("testnet");
  const ns = `demo-${crypto.randomBytes(3).toString("hex")}`;
  const secret = phrase();
  const demoWalrus = walrus.withNamespace(ns);

  step(1, "Machine A wakes up", "run");
  let { balances } = await client.core.listBalances({ owner: wallet.address });
  let sui = BigInt(balances.find((/** @type {any} */ b) => b.coinType.endsWith("::sui::SUI"))?.balance ?? 0);
  if (sui < 20_000_000n) {
    emit({ type: "text", text: "Wallet is low on gas, asking the testnet faucet…" });
    for (let i = 0; ; i++) { try { await requestTestnetSui(wallet.address, () => {}); break; } catch (e) { if (i >= 2) throw e; } }
    await sleep(2000);
    ({ balances } = await client.core.listBalances({ owner: wallet.address }));
    sui = BigInt(balances.find((/** @type {any} */ b) => b.coinType.endsWith("::sui::SUI"))?.balance ?? 0);
  }
  step(1, "Machine A wakes up", "ok", `${short(wallet.address)} · ${(Number(sui) / 1e9).toFixed(3)} SUI on testnet`);

  step(2, "Pays a stranger on Sui, for real", "run");
  const burner = Ed25519Keypair.generate().toSuiAddress();
  const tx = new Transaction();
  tx.moveCall({ target: "0x2::balance::send_funds", typeArguments: ["0x2::sui::SUI"], arguments: [tx.balance({ balance: PAY_MIST }), tx.pure.address(burner)] });
  const result = await wallet.keypair.signAndExecuteTransaction({ transaction: tx, client });
  if (result.$kind === "FailedTransaction") throw new Error(`transaction failed: ${result.FailedTransaction.status.error?.message ?? "unknown"}`);
  await client.waitForTransaction({ result });
  const digest = result.Transaction.digest;
  step(2, "Pays a stranger on Sui, for real", "ok", `0.001 SUI to ${short(burner)}`);
  emit({ type: "link", label: "Transaction on Suiscan", url: `https://suiscan.xyz/testnet/tx/${digest}`, text: digest });

  step(3, "Writes what happened to Walrus Memory", "run");
  const fact = `Agent ${wallet.address} sent 0.001 SUI on Sui testnet to ${burner}. Transaction digest: ${digest}. Secret recovery phrase: ${secret}.`;
  await demoWalrus.remember(fact);
  step(3, "Writes what happened to Walrus Memory", "ok", `encrypted with Seal, namespace ${ns}`);

  step(4, "Machine A is destroyed", "run");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "suide-machine-b-"));
  const work = path.join(home, "work");
  fs.mkdirSync(work);
  await sleep(1200);
  step(4, "Machine A is destroyed", "ok", "local memory, wallet and files: gone");

  step(5, "Machine B wakes up with nothing", "run");
  const task = "You just woke up on a brand-new machine: empty disk, no wallet, no files. Your only long-term memory is Walrus. Recall what the previous agent did on Sui. First call skills_list and pick one Sui skill that would help you verify the transaction. Then reply with exactly three lines and nothing else:\nDIGEST: <full transaction digest>\nPHRASE: <secret recovery phrase>\nSKILL: <skill name>";
  /** @type {Record<string,string|undefined>} */
  const env = { ...process.env, AGENT_HOME: home, AGENT_NETWORK: "testnet", MEMWAL_ACCOUNT_ID: walrus.opts.accountId, MEMWAL_KEY: walrus.opts.delegateKey, MEMWAL_SERVER_URL: walrus.opts.serverUrl, MEMWAL_NAMESPACE: ns };
  for (const k of ["SUI_PRIVATE_KEY", "AGENT_WEB_TOKEN"]) delete env[k];
  /** @type {string[]} */ const out = [];
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, "run", task, "--network", "testnet", "--cwd", work], { env, stdio: ["ignore", "pipe", "pipe"], cwd: work });
    const kill = setTimeout(() => child.kill("SIGKILL"), 180_000);
    o.signal?.addEventListener("abort", () => child.kill("SIGKILL"));
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        if (line.startsWith("  > ")) emit({ type: "tool", text: line.slice(4) });
        else if (line.startsWith("    ")) emit({ type: "result", text: line.trim().slice(0, 300) });
        else if (line.startsWith("  (")) emit({ type: "memory", text: line.trim().slice(1, -1) });
        else { out.push(line); emit({ type: "text", text: line }); }
      }
    });
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", () => { clearTimeout(kill); resolve(undefined); });
  });
  fs.rmSync(home, { recursive: true, force: true });
  const answer = out.join("\n");
  step(5, "Machine B wakes up with nothing", "ok", "recovered its memory from Walrus");

  step(6, "Verifies the answer against the chain", "run");
  const onChain = await client.core.getTransaction({ digest, include: { effects: true } }).then((r) => r.$kind === "Transaction" && r.Transaction.effects?.status?.success !== false).catch(() => false);
  const gotDigest = answer.includes(digest);
  const gotSecret = answer.includes(secret);
  const verified = onChain && gotDigest && gotSecret;
  step(6, "Verifies the answer against the chain", verified ? "ok" : "fail", verified ? "digest and phrase match, transaction confirmed on-chain" : `on-chain ${onChain ? "ok" : "not found"}, digest ${gotDigest ? "ok" : "missing"}, phrase ${gotSecret ? "ok" : "missing"}`);
  emit({ type: "proof", verified, digest, secretMatched: gotSecret, digestMatched: gotDigest, seconds: Math.round((Date.now() - t0) / 1000), url: `https://suiscan.xyz/testnet/tx/${digest}` });
  return verified;
}
