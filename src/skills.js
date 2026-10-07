// @ts-check
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOME } from "./config.js";

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_CHARS = 30_000;

/** Folders searched for agent skills (the format installed by `npx skills add mystenlabs/skills`). */
export const skillRoots = (/** @type {string} */ cwd) => [
  path.join(cwd, ".claude", "skills"),
  path.join(cwd, ".agents", "skills"),
  path.join(HOME, "skills"),
  path.join(KIT_ROOT, ".claude", "skills"),
];

function frontmatter(/** @type {string} */ text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const block = m ? m[1] : "";
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const lines = block.split("\n");
  const i = lines.findIndex((l) => l.startsWith("description:"));
  const parts = i < 0 ? [] : [lines[i].slice("description:".length).replace(/^\s*[>|]-?\s*/, ""), ...lines.slice(i + 1).filter((_, k, arr) => arr.slice(0, k + 1).every((l) => /^\s/.test(l) || !l))];
  const description = parts.map((l) => l.trim()).filter(Boolean).join(" ");
  return { name, description };
}

/** @returns {{name:string, description:string, dir:string}[]} */
export function listSkills(/** @type {string} */ cwd) {
  const seen = new Map();
  for (const root of skillRoots(cwd)) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      const dir = path.join(root, e.name);
      let text = "";
      try { text = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"); } catch { continue; }
      const fm = frontmatter(text);
      const name = fm.name || e.name;
      if (!seen.has(name)) seen.set(name, { name, description: fm.description, dir });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Read a skill's SKILL.md, or a reference file inside the skill folder. */
export function loadSkill(/** @type {string} */ cwd, /** @type {string} */ name, /** @type {string} */ rel = "") {
  const s = listSkills(cwd).find((x) => x.name === name);
  if (!s) throw new Error(`Unknown skill "${name}". Use skills_list.`);
  const target = path.resolve(s.dir, rel || "SKILL.md");
  if (target !== s.dir && !target.startsWith(s.dir + path.sep)) throw new Error("path escapes the skill folder");
  const text = fs.readFileSync(target, "utf8");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…[truncated, ask for a specific reference file]` : text;
}
