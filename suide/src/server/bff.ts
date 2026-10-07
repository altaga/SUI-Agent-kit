import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Backend-for-frontend. The browser only ever talks to this server with an HttpOnly session cookie.
// The agent token and the model keys never reach the browser. The agent is on loopback, or behind HTTPS with its bearer token.

const COOKIE = 'suide_session';
const TTL_S = 12 * 3600;
let fallbackSecret = '';
const secret = () => process.env.SUIDE_SESSION_SECRET || (fallbackSecret ||= randomBytes(32).toString('hex'));
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
  });

export function agentUrl(): URL {
  const u = new URL(process.env.AGENT_URL || 'http://127.0.0.1:8787');
  if (LOOPBACK.has(u.hostname)) return u;
  // A remote agent is only allowed over HTTPS and with an explicit token.
  if (u.protocol !== 'https:' || !process.env.AGENT_TOKEN) throw new Error('A remote AGENT_URL needs https and AGENT_TOKEN.');
  return u;
}

export async function agentToken(): Promise<string> {
  if (process.env.AGENT_TOKEN) return process.env.AGENT_TOKEN;
  try {
    const [fs, os, path] = await Promise.all([import('node:fs'), import('node:os'), import('node:path')]);
    const home = process.env.AGENT_HOME || path.join(os.homedir(), '.sui-agent-kit');
    return fs.readFileSync(path.join(home, 'web-token'), 'utf8').trim();
  } catch { return ''; }
}

const mac = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');
const safeEq = (a: string, b: string) => {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
};

function readCookie(req: Request): string | null {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

export function isAuthed(req: Request): boolean {
  const c = readCookie(req);
  if (!c) return false;
  const [exp, sig] = c.split('.');
  if (!exp || !sig || !safeEq(sig, mac(exp))) return false;
  return Number(exp) > Date.now() / 1000;
}

const secure = (req: Request) => new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';

export function sessionCookie(req: Request, on: boolean): string {
  const attrs = `Path=/; HttpOnly; SameSite=Strict${secure(req) ? '; Secure' : ''}`;
  if (!on) return `${COOKIE}=; Max-Age=0; ${attrs}`;
  const exp = String(Math.floor(Date.now() / 1000) + TTL_S);
  return `${COOKIE}=${exp}.${mac(exp)}; Max-Age=${TTL_S}; ${attrs}`;
}

/** Same-origin check for state-changing requests (defence in depth on top of SameSite=Strict). */
export function sameOrigin(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const site = req.headers.get('sec-fetch-site');
  if (site === 'same-origin') return true; // set by the browser, scripts cannot forge it
  if (site && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const o = new URL(origin).host;
      return [req.headers.get('host'), req.headers.get('x-forwarded-host'), new URL(req.url).host].includes(o);
    } catch { return false; }
  }
  return true;
}

// Login throttling: 5 failures lock the login for 5 minutes (per client key, plus a global cap).
const fails = new Map<string, { n: number; until: number }>();
const clientKey = (req: Request) => (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();

export function loginLocked(req: Request): number {
  const now = Date.now();
  for (const k of [clientKey(req), '*']) {
    const f = fails.get(k);
    if (f && f.until > now) return Math.ceil((f.until - now) / 1000);
  }
  return 0;
}

export function recordLogin(req: Request, ok: boolean) {
  for (const [k, max] of [[clientKey(req), 5], ['*', 30]] as const) {
    if (ok) { fails.delete(k); continue; }
    const f = fails.get(k) ?? { n: 0, until: 0 };
    f.n += 1;
    if (f.n >= max) { f.until = Date.now() + 5 * 60_000; f.n = 0; }
    fails.set(k, f);
  }
}

export const checkPassword = (given: string) => {
  const expected = process.env.SUIDE_PASSWORD;
  return !!expected && safeEq(given, expected);
};

export function guard(req: Request): Response | null {
  if (!sameOrigin(req)) return json({ error: 'cross-origin request blocked' }, 403);
  if (!isAuthed(req)) return json({ error: 'unauthorized' }, 401);
  return null;
}

const ALLOW: [string, RegExp][] = [
  ['GET', /^\/api\/(status|balance|actions|sessions)$/],
  ['GET', /^\/api\/sessions\/[0-9a-f]{8}$/],
  ['DELETE', /^\/api\/sessions\/[0-9a-f]{8}$/],
  ['POST', /^\/api\/(sessions|approve|chat)$/],
  ['POST', /^\/api\/action\/[a-z_]+$/],
  ['POST', /^\/api\/demo\/resurrection$/],
];

export async function proxy(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const { pathname } = new URL(req.url);
  if (!ALLOW.some(([m, re]) => m === req.method && re.test(pathname))) return json({ error: 'not found' }, 404);
  const token = await agentToken();
  if (!token) return json({ error: 'agent token not found on the server' }, 503);

  const init: RequestInit = { method: req.method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: req.signal };
  if (req.method === 'POST') {
    const body = await req.text();
    if (body.length > 200_000) return json({ error: 'body too large' }, 413);
    init.body = body;
  }
  let up: Response;
  try { up = await fetch(new URL(pathname, agentUrl()), init); }
  catch { return json({ error: 'the agent is not reachable (is `agent serve` running?)' }, 502); }
  return new Response(up.body, {
    status: up.status,
    headers: {
      'content-type': up.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-accel-buffering': 'no',
    },
  });
}
