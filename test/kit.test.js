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

test("converse adapter maps tools, tool results and responses", async () => {
  const { toConverse, fromConverse } = await import("../src/model.js");
  const req = toConverse({
    system: "sys", max_tokens: 100,
    tools: [{ name: "bash", description: "d", input_schema: { type: "object", properties: {} } }],
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "bash", input: { command: "ls" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "a.txt" }] },
    ],
  });
  assert.equal(req.toolConfig.tools[0].toolSpec.inputSchema.json.type, "object");
  assert.equal(req.messages[1].content[0].toolUse.toolUseId, "t1");
  assert.equal(req.messages[2].content[0].toolResult.content[0].text, "a.txt");
  const res = fromConverse({ stopReason: "tool_use", output: { message: { content: [{ text: "ok" }, { toolUse: { toolUseId: "t2", name: "bash", input: { command: "pwd" } } }] } } });
  assert.equal(res.content[1].type, "tool_use");
  assert.equal(res.content[1].id, "t2");
});

test("skills: list and load Sui skills, reject path traversal", async () => {
  const { listSkills, loadSkill } = await import("../src/skills.js");
  const dir = path.join(tmp, "proj/.claude/skills/demo-skill");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: demo-skill\ndescription: >\n  Does a demo\n  thing.\n---\n# Demo\nbody");
  fs.writeFileSync(path.join(dir, "ref.md"), "reference");
  const cwd = path.join(tmp, "proj");
  const s = listSkills(cwd).find((x) => x.name === "demo-skill");
  assert.equal(s.description, "Does a demo thing.");
  assert.match(loadSkill(cwd, "demo-skill"), /# Demo/);
  assert.equal(loadSkill(cwd, "demo-skill", "ref.md"), "reference");
  assert.throws(() => loadSkill(cwd, "demo-skill", "../../../../etc/passwd"), /escapes/);
  assert.throws(() => loadSkill(cwd, "nope"), /Unknown skill/);
});

test("tool arguments wrapped as {type,value} (Llama quirk) are unwrapped", async () => {
  const { unwrapArgs } = await import("../src/agent.js");
  assert.deepEqual(unwrapArgs({ name: { type: "string", value: "x" }, n: { type: "number", value: 3 }, keep: { type: "t", value: 1, extra: 2 } }), { name: "x", n: 3, keep: { type: "t", value: 1, extra: 2 } });
  assert.deepEqual(unwrapArgs({ list: [{ type: "string", value: "a" }] }), { list: ["a"] });
});
