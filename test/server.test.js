import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ska-srv-"));
process.env.AGENT_HOME = path.join(tmp, "home");
process.env.AGENT_WEB_TOKEN = "test-token";
const { startServer } = await import("../src/server.js");

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function sse(res, events) {
  let buf = "";
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString();
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) { events.push(JSON.parse(buf.slice(0, i).replace(/^data: /, ""))); buf = buf.slice(i + 2); }
  }
}

function fakeWalrus(ns = "agent", store = [{ text: "Walrus fact: the staging host is the arm64 VM", at: "2026-10-07T00:00:00Z" }]) {
  return { kind: "walrus", ns, store, withNamespace: (n) => fakeWalrus(n, store), recall: async (q) => store.filter((m) => m.text.toLowerCase().includes(q.toLowerCase().split(" ")[0])), remember: async (t) => { store.push({ text: t, at: new Date().toISOString() }); }, rememberTurn: async () => {} };
}

test("server: auth, isolated sessions, on-demand Walrus, streaming approval, no CORS", async () => {
  const script = [
    { content: [{ type: "tool_use", id: "t1", name: "walrus_recall", input: { query: "staging", save: true } }] },
    { content: [{ type: "tool_use", id: "t2", name: "write_file", input: { path: "w.txt", content: "x" } }] },
    { content: [{ type: "text", text: "Wrote it." }] },
  ];
  const model = { provider: "fake", id: "fake", create: async () => script.shift() };
  const cfg = { network: "mainnet", approval: "ask", maxPerCallUsd: 0.05, dailyBudgetUsd: 0.5 };
  const walrus = fakeWalrus();
  const srv = await startServer({ model, walrus, cfg, wallet: null, cwd: tmp, port: 0 });
  const base = `http://127.0.0.1:${srv.port}`;
  const H = { authorization: "Bearer test-token", "content-type": "application/json" };
  const post = (p, body) => fetch(`${base}${p}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/api/status`)).status, 401);
    assert.equal((await fetch(`${base}/api/status`, { headers: { authorization: "Bearer nope" } })).status, 401);
    assert.equal((await (await fetch(`${base}/api/status`, { headers: H })).json()).walrus, true);
    assert.equal((await fetch(`${base}/`)).status, 404);

    const names = (await (await fetch(`${base}/api/actions`, { headers: H })).json()).map((a) => a.name);
    assert.ok(names.includes("walrus_recall") && names.includes("walrus_pull") && !names.includes("faucet"));

    const [first] = await (await fetch(`${base}/api/sessions`, { headers: H })).json();
    const a = await (await post("/api/sessions", { name: "Agent A" })).json();
    assert.equal(a.mode, "on-demand");
    await post("/api/action/remember", { session: a.id, input: "Aurora is the codename" });
    const inA = await (await post("/api/action/recall", { session: a.id, input: "codename" })).json();
    const inFirst = await (await post("/api/action/recall", { session: first.id, input: "codename" })).json();
    assert.equal(inA.memories.length, 1);
    assert.equal(inFirst.memories.length, 0, "a new session starts with its own empty memory");

    const w = await (await post("/api/action/walrus_recall", { input: "staging" })).json();
    assert.match(w.memories[0].text, /arm64 VM/);
    const pulled = await (await post("/api/action/walrus_pull", { session: first.id, input: "staging" })).json();
    assert.equal(pulled.copied, 1);

    const b = await (await post("/api/sessions", { name: "Agent B", mode: "local" })).json();
    assert.equal((await post("/api/action/walrus_recall", { session: b.id, input: "staging" })).status, 200);

    const res = await post("/api/chat", { session: a.id, message: "what is the staging host? then write a file" });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    const events = [];
    const reader = sse(res, events);
    for (let i = 0; i < 150 && !events.some((e) => e.type === "approval"); i++) await new Promise((r) => setTimeout(r, 20));
    const ap = events.find((e) => e.type === "approval");
    assert.ok(ap, "approval requested over the stream");
    assert.equal((await post("/api/approve", { id: ap.id, allow: true })).status, 200);
    await reader;
    assert.ok(events.some((e) => e.type === "tool" && /walrus_recall/.test(e.text)), "agent used Walrus on demand");
    assert.equal(events.at(-1).type, "done");
    assert.equal(fs.readFileSync(path.join(tmp, "w.txt"), "utf8"), "x");

    const hist = await (await fetch(`${base}/api/sessions/${a.id}`, { headers: H })).json();
    assert.equal(hist.log[0].type, "user");
    assert.equal(hist.log.at(-1).type, "done");
    assert.equal((await fetch(`${base}/api/sessions/${a.id}`, { method: "DELETE", headers: H })).status, 200);
    assert.equal((await fetch(`${base}/api/sessions/${a.id}`, { headers: H })).status, 404);
  } finally { await srv.close(); }
});
