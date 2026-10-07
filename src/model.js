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
    const client = new AnthropicBedrock({ awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1" });
    const id = cfg.model || BEDROCK_DEFAULT;
    return { provider: "bedrock", id, create: (p) => client.messages.create({ ...p, model: id }) };
  }
  return null;
}
