import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ska-srv-"));
process.env.AGENT_HOME = path.join(tmp, "home");
process.env.AGENT_WEB_TOKEN = "test-token";
const { LocalMemory } = await import("../src/memory.js");
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

test("server: auth, status, actions, chat stream with web approval, no CORS", async () => {
  const script = [
    { content: [{ type: "tool_use", id: "t1", name: "write_file", input: { path: "w.txt", content: "x" } }] },
    { content: [{ type: "text", text: "Wrote it." }] },
  ];
  const model = { provider: "fake", id: "fake", create: async () => script.shift() };
  const cfg = { network: "mainnet", approval: "ask", maxPerCallUsd: 0.05, dailyBudgetUsd: 0.5 };
  const srv = await startServer({ model, memory: new LocalMemory(path.join(tmp, "m.json")), cfg, wallet: null, cwd: tmp, port: 0 });
  const base = `http://127.0.0.1:${srv.server.address().port}`;
  const H = { authorization: "Bearer test-token", "content-type": "application/json" };
  try {
    assert.equal((await fetch(`${base}/api/status`)).status, 401);
    assert.equal((await fetch(`${base}/api/status`, { headers: { authorization: "Bearer nope" } })).status, 401);
    const st = await (await fetch(`${base}/api/status`, { headers: H })).json();
    assert.equal(st.model, "fake");
    assert.equal(st.memory, "local");

    const names = (await (await fetch(`${base}/api/actions`, { headers: H })).json()).map((a) => a.name);
    assert.deepEqual(names, ["wallet", "recall", "remember"]);
    assert.equal((await fetch(`${base}/api/action/remember`, { method: "POST", headers: H, body: JSON.stringify({ input: "Aurora is the codename" }) })).status, 200);
    const rec = await (await fetch(`${base}/api/action/recall`, { method: "POST", headers: H, body: JSON.stringify({ input: "codename" }) })).json();
    assert.match(rec.memories[0].text, /Aurora/);

    const res = await fetch(`${base}/api/chat`, { method: "POST", headers: H, body: JSON.stringify({ message: "write a file" }) });
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const events = [];
    const reader = sse(res, events);
    for (let i = 0; i < 100 && !events.some((e) => e.type === "approval"); i++) await new Promise((r) => setTimeout(r, 20));
    const ap = events.find((e) => e.type === "approval");
    assert.ok(ap, "approval requested over the stream");
    assert.equal((await fetch(`${base}/api/approve`, { method: "POST", headers: H, body: JSON.stringify({ id: ap.id, allow: true }) })).status, 200);
    await reader;
    assert.equal(events.at(-1).type, "done");
    assert.equal(events.at(-1).text, "Wrote it.");
    assert.equal(fs.readFileSync(path.join(tmp, "w.txt"), "utf8"), "x");

    assert.equal((await fetch(`${base}/`)).status, 404);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  } finally { await srv.close(); }
});
