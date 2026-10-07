import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ska-"));
process.env.AGENT_HOME = path.join(tmp, "home");
const { LocalMemory } = await import("../src/memory.js");
const { runShell, tools } = await import("../src/tools.js");
const { createAgent } = await import("../src/agent.js");
const { loadWallet } = await import("../src/wallet.js");

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("local memory: recall by relevance, newest first", async () => {
  const m = new LocalMemory(path.join(tmp, "m.json"));
  await m.remember("The deploy server is the Jetson at home");
  await m.remember("User prefers answers in Spanish");
  await new Promise((r) => setTimeout(r, 5));
  await m.remember("The deploy server moved to an AWS VM");
  const r = await m.recall("which deploy server do we use?");
  assert.equal(r.length, 2);
  assert.match(r[0].text, /AWS VM/);
  assert.deepEqual(await m.recall("zzz unrelated"), []);
});

test("shell tool: output, exit code and timeout", async () => {
  assert.match(await runShell("echo hello", tmp), /hello[\s\S]*\[exit 0\]/);
  assert.match(await runShell("exit 3", tmp), /\[exit 3\]/);
  const t0 = Date.now();
  assert.match(await runShell("node -e \"setTimeout(()=>{},30000)\"", tmp, 500), /timeout/);
  assert.ok(Date.now() - t0 < 5000);
});

test("wallet is created once, stored with private permissions", () => {
  const a = loadWallet(true);
  assert.ok(a.created && /^0x[0-9a-f]{64}$/.test(a.address));
  assert.equal(loadWallet().address, a.address);
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(process.env.AGENT_HOME, "wallet.json")).mode & 0o077, 0);
});

test("agent loop: recalls memory, uses tools, remembers the turn, honours approval", async () => {
  const memory = new LocalMemory(path.join(tmp, "m2.json"));
  await memory.remember("Project codename is Aurora");
  let seenSystem = "";
  const script = [
    { content: [{ type: "tool_use", id: "t1", name: "write_file", input: { path: "out/a.txt", content: "hi" } }] },
    { content: [{ type: "tool_use", id: "t2", name: "bash", input: { command: "echo done" } }] },
    { content: [{ type: "text", text: "All finished." }] },
  ];
  const model = { provider: "fake", id: "fake", create: async (p) => { seenSystem = p.system; return script.shift(); } };
  const cfg = { network: "testnet", approval: "ask", maxPerCallUsd: 0.05, dailyBudgetUsd: 0.5 };
  const asked = [];
  const agent = createAgent({ model, memory, cfg, wallet: null, cwd: tmp, approve: async (w) => { asked.push(w); return !w.startsWith("RUN"); } });
  const out = await agent.run("Please create a file for the Aurora project");
  assert.equal(out, "All finished.");
  assert.match(seenSystem, /Aurora/);
  assert.equal(fs.readFileSync(path.join(tmp, "out/a.txt"), "utf8"), "hi");
  assert.equal(asked.length, 2);
  const toolResult = agent.messages.at(-2).content[0].content;
  assert.match(toolResult, /Declined/);
  assert.equal((await memory.recall("file Aurora project")).length >= 1, true);
});

test("edit_file requires a unique match", async () => {
  const f = path.join(tmp, "e.txt");
  fs.writeFileSync(f, "a a b");
  const edit = tools.find((t) => t.name === "edit_file");
  const ctx = { cwd: tmp, approve: async () => true };
  assert.match(await edit.run({ path: "e.txt", old_string: "a", new_string: "c" }, ctx), /2 times/);
  assert.match(await edit.run({ path: "e.txt", old_string: "b", new_string: "c" }, ctx), /Edited/);
  assert.equal(fs.readFileSync(f, "utf8"), "a a c");
});
