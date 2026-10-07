// @ts-check
import os from "node:os";
import { tools as defaultTools } from "./tools.js";

/** Some models (Llama) wrap tool arguments as {type, value}; unwrap them. */
export function unwrapArgs(/** @type {any} */ v) {
  if (Array.isArray(v)) return v.map(unwrapArgs);
  if (v && typeof v === "object") {
    const k = Object.keys(v);
    if (k.length === 2 && k.includes("type") && k.includes("value")) return unwrapArgs(v.value);
    return Object.fromEntries(Object.entries(v).map(([a, b]) => [a, unwrapArgs(b)]));
  }
  return v;
}

const BASE_PROMPT = `You are an autonomous agent running on the user's own machine, with persistent long-term memory, coding tools (bash, files), web access and a Sui wallet to buy x402-priced services.
Work step by step, use tools instead of guessing, and keep answers short. Before spending money say what and why; stay inside the configured budget.
For Sui, Move or Walrus work, call skills_list and skill_load first and follow the skill instead of guessing APIs.
Memories from earlier sessions may appear below: treat the newest as authoritative when they conflict.`;

/**
 * @param {Object} o
 * @param {import("./model.js").Model} o.model
 * @param {import("./memory.js").Memory} o.memory
 * @param {import("./config.js").Config} o.cfg
 * @param {any} o.wallet
 * @param {import("./memory.js").WalrusMemory|null} [o.walrus]  Walrus Memory available on demand (tools walrus_recall / walrus_remember)
 * @param {string} [o.cwd]
 * @param {(what:string)=>Promise<boolean>} [o.approve]
 * @param {(e:{type:"text"|"tool"|"result"|"memory", text:string})=>void} [o.onEvent]
 * @param {import("./tools.js").Tool[]} [o.tools]
 * @param {string} [o.system]   extra system prompt
 * @param {number} [o.maxSteps]
 */
export function createAgent(o) {
  const cwd = o.cwd || process.cwd();
  const toolset = (o.tools || defaultTools).filter((t) => t.needs !== "walrus" || o.walrus);
  const emit = o.onEvent || (() => {});
  const approve = async (/** @type {string} */ what) => (o.cfg.approval === "auto" ? true : (o.approve ? o.approve(what) : false));
  /** @type {any[]} */
  const messages = [];

  /** Run one user turn: recall -> think/act loop -> remember. Returns the final text. */
  async function run(/** @type {string} */ input) {
    let recalled = [];
    try { recalled = await o.memory.recall(input, 5); } catch (e) { emit({ type: "memory", text: `recall failed: ${/** @type {any} */ (e).message}` }); }
    if (recalled.length) emit({ type: "memory", text: `recalled ${recalled.length} memories` });
    const system = [
      BASE_PROMPT,
      o.system || "",
      o.walrus ? "This session's own memory may be empty, but long-term memory lives on Walrus: when the user refers to earlier work, decisions or facts, call walrus_recall before saying you don't know. Save durable facts with walrus_remember." : "",
      `Date: ${new Date().toISOString()} | OS: ${process.platform}/${os.arch()} | cwd: ${cwd} | Sui ${o.cfg.network} wallet: ${o.wallet?.address ?? "none"}`,
      recalled.length ? `Relevant memories (newest first):\n${recalled.map((m) => `- ${m.at ? `[${m.at.slice(0, 10)}] ` : ""}${m.text}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    messages.push({ role: "user", content: input });
    const ctx = { cwd, cfg: o.cfg, memory: o.memory, wallet: o.wallet, walrus: o.walrus || null, approve };
    const specs = toolset.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
    let final = "";

    for (let step = 0; step < (o.maxSteps || 25); step++) {
      const res = await o.model.create({ max_tokens: 4096, system, tools: specs, messages });
      messages.push({ role: "assistant", content: res.content });
      const text = res.content.filter((/** @type {any} */ b) => b.type === "text").map((/** @type {any} */ b) => b.text).join("\n");
      if (text) { emit({ type: "text", text }); final = text; }
      const calls = res.content.filter((/** @type {any} */ b) => b.type === "tool_use");
      if (!calls.length) break;
      const results = [];
      for (const c of calls) {
        emit({ type: "tool", text: `${c.name} ${JSON.stringify(c.input).slice(0, 200)}` });
        let out;
        try {
          const t = toolset.find((x) => x.name === c.name);
          out = t ? await t.run(unwrapArgs(c.input), ctx) : `Unknown tool ${c.name}`;
        } catch (e) { out = `Error: ${/** @type {any} */ (e).message}`; }
        emit({ type: "result", text: String(out).slice(0, 300) });
        results.push({ type: "tool_result", tool_use_id: c.id, content: String(out) || "(no output)" });
      }
      messages.push({ role: "user", content: results });
    }

    try { await o.memory.rememberTurn(input, final); } catch (e) { emit({ type: "memory", text: `remember failed: ${/** @type {any} */ (e).message}` }); }
    return final;
  }

  return { run, messages };
}
