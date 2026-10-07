// @ts-check
import fs from "node:fs";
import path from "node:path";
import { HOME } from "./config.js";

/** Headless Chromium for testing the apps the agent builds. Playwright is optional: `agent install-browser`. */
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(HOME, "browsers");

const IDLE_MS = 5 * 60_000;
/** @type {Promise<any>|null} */ let browserP = null;
/** @type {ReturnType<typeof setTimeout>|undefined} */ let idle;
/** @type {WeakMap<object, {context:any, page:any, logs:string[]}>} */ const sessions = new WeakMap();
let open = 0;

async function getBrowser() {
  if (!browserP) {
    browserP = (async () => {
      const spec = "playwright-core";
      /** @type {any} */ let pw;
      try { pw = await import(spec); } catch { throw new Error("Browser support is not installed. Ask the user to run `agent install-browser`."); }
      try { return await pw.chromium.launch({ headless: true }); }
      catch (e) { browserP = null; throw new Error(`Chromium could not start (${/** @type {Error} */ (e).message.split("\n")[0]}). Ask the user to run \`agent install-browser\`.`); }
    })();
    browserP.catch(() => { browserP = null; });
  }
  return browserP;
}

function touch() {
  clearTimeout(idle);
  idle = setTimeout(async () => {
    if (!browserP) return;
    const b = await browserP.catch(() => null);
    browserP = null;
    open = 0;
    await b?.close().catch(() => {});
  }, IDLE_MS);
  idle.unref?.();
}

async function session(/** @type {object} */ key) {
  let s = sessions.get(key);
  if (s && !s.page.isClosed()) return s;
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  /** @type {string[]} */ const logs = [];
  const add = (/** @type {string} */ l) => { logs.push(l); if (logs.length > 100) logs.shift(); };
  page.on("console", (/** @type {any} */ m) => { if (["error", "warning"].includes(m.type())) add(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (/** @type {Error} */ e) => add(`pageerror: ${e.message}`));
  page.on("requestfailed", (/** @type {any} */ r) => add(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
  s = { context, page, logs };
  sessions.set(key, s);
  open++;
  return s;
}

const isLocal = (/** @type {string} */ u) => { try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(u).hostname); } catch { return false; } };
const clip = (/** @type {string} */ s, n = 6000) => (s.length <= n ? s : `${s.slice(0, n)}\n…[${s.length - n} chars cut]`);

/** @returns {Promise<string>} */
export async function browse(/** @type {any} */ i, /** @type {import("./tools.js").Ctx} */ ctx) {
  const action = String(i.action || "");
  if (action === "close") {
    const s = sessions.get(ctx.memory);
    if (s) { await s.context.close().catch(() => {}); sessions.delete(ctx.memory); }
    return "Closed.";
  }
  const s = await session(ctx.memory);
  touch();
  const { page } = s;
  const guard = async (/** @type {string} */ what) => (isLocal(page.url()) || (await ctx.approve(`BROWSER  ${what}  on ${page.url()}`)));
  const t = { timeout: 15_000 };
  switch (action) {
    case "open": {
      const url = String(i.url || "");
      if (!/^https?:\/\//i.test(url)) return "Only http(s) URLs are allowed.";
      const r = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
      return `${r?.status() ?? "?"} ${page.url()}\ntitle: ${await page.title()}\n\n${clip(await page.locator("body").innerText(t).catch(() => ""), 3000)}`;
    }
    case "snapshot": return clip(await page.locator(i.selector || "body").ariaSnapshot(t));
    case "text": return clip(await page.locator(i.selector || "body").innerText(t));
    case "click": if (!(await guard(`click ${i.selector}`))) return "Declined by user."; await page.locator(i.selector).first().click(t); await page.waitForLoadState("load").catch(() => {}); return `Clicked. Now at ${page.url()}`;
    case "fill": if (!(await guard(`fill ${i.selector}`))) return "Declined by user."; await page.locator(i.selector).first().fill(String(i.text ?? ""), t); return "Filled.";
    case "press": if (!(await guard(`press ${i.key}`))) return "Declined by user."; await page.keyboard.press(String(i.key)); return "Pressed.";
    case "resize": await page.setViewportSize({ width: Math.min(Math.max(Number(i.width) || 1280, 200), 3000), height: Math.min(Math.max(Number(i.height) || 800, 200), 3000) }); return "Viewport set.";
    case "console": { const l = s.logs.splice(0); return l.length ? l.join("\n") : "No console errors or warnings."; }
    case "screenshot": {
      const dir = path.resolve(ctx.cwd, ".agent-shots");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
      await page.screenshot({ path: file, fullPage: !!i.full_page });
      return `Saved ${path.relative(ctx.cwd, file)}`;
    }
    default: return "Unknown action. Use open, snapshot, text, click, fill, press, resize, console, screenshot or close.";
  }
}

export const browserInUse = () => open;
