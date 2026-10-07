// @ts-check
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { file } from "./config.js";
import { createAgent } from "./agent.js";
import { suiClient } from "./x402.js";
import { requestTestnetSui } from "./faucet.js";

const APPROVAL_TIMEOUT_MS = 120_000;

function loadToken() {
  if (process.env.AGENT_WEB_TOKEN) return process.env.AGENT_WEB_TOKEN;
  const f = file("web-token");
  try { const t = fs.readFileSync(f, "utf8").trim(); if (t) return t; } catch {}
  const t = crypto.randomBytes(24).toString("base64url");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, t + "\n", { mode: 0o600 });
  return t;
}

const same = (/** @type {string} */ a, /** @type {string} */ b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Local HTTP API for the agent. Listens on loopback only and requires a bearer token.
 * @param {Object} o
 * @param {import("./model.js").Model} o.model
 * @param {import("./memory.js").Memory} o.memory
 * @param {import("./config.js").Config} o.cfg
 * @param {any} o.wallet
 * @param {string} o.cwd
 * @param {number} [o.port]
 */
export async function startServer(o) {
  const token = loadToken();
  const port = o.port ?? 8787;
  const host = "127.0.0.1";

  /** @type {null | ((e: any) => void)} */ let sink = null;
  /** @type {Map<string, (ok: boolean) => void>} */ const pending = new Map();
  let busy = false;

  const approve = (/** @type {string} */ what) => new Promise((resolve) => {
    if (!sink) return resolve(false);
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); resolve(false); }, APPROVAL_TIMEOUT_MS);
    pending.set(id, (ok) => { clearTimeout(timer); pending.delete(id); resolve(ok); });
    sink({ type: "approval", id, text: what });
  });

  const build = () => createAgent({ model: o.model, memory: o.memory, cfg: o.cfg, wallet: o.wallet, cwd: o.cwd, approve, onEvent: (e) => sink?.(e) });
  let agent = build();

  const json = (/** @type {http.ServerResponse} */ res, /** @type {number} */ code, /** @type {any} */ body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (/** @type {http.IncomingMessage} */ req) => new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (d) => { s += d; if (s.length > 1_000_000) { reject(new Error("body too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error("invalid JSON")); } });
    req.on("error", reject);
  });

  async function balances() {
    if (!o.wallet) return [];
    const { balances: b } = await suiClient(o.cfg.network).core.listBalances({ owner: o.wallet.address });
    return b.map((/** @type {any} */ x) => ({ coinType: x.coinType, balance: x.balance }));
  }

  /** @type {Record<string, {label: string, description: string, input?: string, run: (arg: string) => Promise<any>}>} */
  const actions = {
    wallet: { label: "Wallet", description: "Address and balances", run: async () => ({ address: o.wallet?.address ?? null, network: o.cfg.network, balances: await balances() }) },
    recall: { label: "Recall memory", description: "Search the agent's memory", input: "query", run: async (q) => ({ memories: await o.memory.recall(q, 10) }) },
    remember: { label: "Remember", description: "Store a note in memory", input: "text", run: async (t) => { await o.memory.remember(t); return { ok: true }; } },
    ...(o.cfg.network === "testnet" && o.wallet ? { faucet: { label: "Testnet SUI", description: "Request 1 SUI from the testnet faucet", run: async () => { const logs = []; await requestTestnetSui(o.wallet.address, (/** @type {string} */ m) => logs.push(m)); return { ok: true, logs, balances: await balances() }; } } } : {}),
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://x");
    // Only the SUIde server (same machine) calls this API: no CORS, so no browser page can reach it.
    if (!url.pathname.startsWith("/api/")) return json(res, 404, { error: "not found" });

    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ") || !same(auth.slice(7), token)) return json(res, 401, { error: "unauthorized" });

    try {
      if (req.method === "GET" && url.pathname === "/api/status") {
        return json(res, 200, { provider: o.model.provider, model: o.model.id, memory: o.memory.kind, network: o.cfg.network, address: o.wallet?.address ?? null, approval: o.cfg.approval, cwd: o.cwd, busy });
      }
      if (req.method === "GET" && url.pathname === "/api/actions") {
        return json(res, 200, Object.entries(actions).map(([name, a]) => ({ name, label: a.label, description: a.description, input: a.input })));
      }
      if (req.method === "POST" && url.pathname.startsWith("/api/action/")) {
        const a = actions[url.pathname.slice("/api/action/".length)];
        if (!a) return json(res, 404, { error: "unknown action" });
        const body = /** @type {any} */ (await readBody(req));
        if (a.input && !String(body.input || "").trim()) return json(res, 400, { error: `${a.input} required` });
        return json(res, 200, await a.run(String(body.input || "").trim()));
      }
      if (req.method === "POST" && url.pathname === "/api/approve") {
        const b = /** @type {any} */ (await readBody(req));
        const p = pending.get(String(b.id));
        if (!p) return json(res, 404, { error: "no such pending approval" });
        p(b.allow === true);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/reset") {
        if (busy) return json(res, 409, { error: "agent is busy" });
        agent = build();
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/chat") {
        const b = /** @type {any} */ (await readBody(req));
        const message = String(b.message || "").trim();
        if (!message) return json(res, 400, { error: "message required" });
        if (busy) return json(res, 409, { error: "agent is busy" });
        busy = true;
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.flushHeaders();
        const send = (/** @type {any} */ e) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`); };
        sink = send;
        res.on("close", () => { for (const p of [...pending.values()]) p(false); });
        try {
          const text = await agent.run(message);
          send({ type: "done", text });
        } catch (e) {
          send({ type: "error", text: /** @type {any} */ (e).message });
        } finally {
          sink = null; busy = false; res.end();
        }
        return;
      }
      return json(res, 404, { error: "not found" });
    } catch (e) {
      return json(res, 500, { error: /** @type {any} */ (e).message });
    }
  });

  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => resolve(undefined)); });
  return { server, token, port, host, close: () => new Promise((r) => { server.close(() => r(undefined)); server.closeAllConnections(); }) };
}
