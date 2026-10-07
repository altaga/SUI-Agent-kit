// @ts-check
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ANTHROPIC_DEFAULT = "claude-sonnet-5";
const BEDROCK_DEFAULT = "us.anthropic.claude-sonnet-5";

function hasAwsCreds() {
  if (process.env.AWS_BEARER_TOKEN_BEDROCK || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE) return true;
  const dir = path.join(os.homedir(), ".aws");
  return fs.existsSync(path.join(dir, "credentials")) || fs.existsSync(path.join(dir, "config"));
}

/** Anthropic-style request -> Bedrock Converse request (used for non-Claude models such as Llama). */
export function toConverse(/** @type {any} */ p) {
  const text = (/** @type {string} */ t) => ({ text: t });
  const messages = p.messages.map((/** @type {any} */ m) => {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    return {
      role: m.role,
      content: blocks.map((/** @type {any} */ b) => {
        if (b.type === "text") return text(b.text || " ");
        if (b.type === "tool_use") return { toolUse: { toolUseId: b.id, name: b.name, input: b.input } };
        if (b.type === "tool_result") return { toolResult: { toolUseId: b.tool_use_id, content: [text(String(b.content) || " ")] } };
        return text(JSON.stringify(b));
      }),
    };
  });
  return {
    system: p.system ? [text(p.system)] : undefined,
    messages,
    inferenceConfig: { maxTokens: p.max_tokens || 4096, temperature: 0.2 },
    toolConfig: p.tools?.length
      ? { tools: p.tools.map((/** @type {any} */ t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.input_schema } } })) }
      : undefined,
  };
}

/** Bedrock Converse response -> Anthropic-style message. */
export function fromConverse(/** @type {any} */ r) {
  const content = (r.output?.message?.content || []).map((/** @type {any} */ b) =>
    b.toolUse ? { type: "tool_use", id: b.toolUse.toolUseId, name: b.toolUse.name, input: b.toolUse.input } : { type: "text", text: b.text ?? "" },
  ).filter((/** @type {any} */ b) => b.type === "tool_use" || b.text);
  return { content, stop_reason: r.stopReason === "tool_use" ? "tool_use" : "end_turn" };
}

async function converse(/** @type {string} */ region, /** @type {string} */ id, /** @type {string} */ token, /** @type {any} */ p) {
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(id)}/converse`;
  for (let i = 0; ; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(toConverse(p)),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) return fromConverse(await res.json());
    if ((res.status === 429 || res.status >= 500) && i < 3) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue; }
    throw new Error(`Bedrock ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/**
 * @typedef {Object} Model
 * @property {string} provider
 * @property {string} id
 * @property {(params:any)=>Promise<any>} create   Anthropic Messages API (non-streaming)
 */

/** Auto-detect the model provider: Anthropic API key first, then AWS Bedrock. */
/** @returns {Model|null} */
export function createModel(/** @type {{model?:string}} */ cfg) {
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic();
    const id = cfg.model || ANTHROPIC_DEFAULT;
    return { provider: "anthropic", id, create: (p) => client.messages.create({ ...p, model: id }) };
  }
  if (hasAwsCreds()) {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
    const id = cfg.model || BEDROCK_DEFAULT;
    if (!/anthropic\./.test(id)) {
      const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
      if (!token) throw new Error(`Model ${id} (non-Claude) needs AWS_BEARER_TOKEN_BEDROCK, or use a Claude model id`);
      return { provider: "bedrock-converse", id, create: (p) => converse(region, id, token, p) };
    }
    const client = new AnthropicBedrock({ awsRegion: region });
    return { provider: "bedrock", id, create: (p) => client.messages.create({ ...p, model: id }) };
  }
  return null;
}
