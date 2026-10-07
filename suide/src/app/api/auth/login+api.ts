import { checkPassword, json, loginLocked, recordLogin, sameOrigin, sessionCookie } from '../../../server/bff';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin request blocked' }, 403);
  if (!process.env.SUIDE_PASSWORD) return json({ error: 'SUIDE_PASSWORD is not set on the server' }, 503);
  const wait = loginLocked(request);
  if (wait) return json({ error: `Too many attempts. Try again in ${wait}s.` }, 429);
  let password = '';
  try { password = String((await request.json()).password ?? ''); } catch {}
  const ok = checkPassword(password);
  recordLogin(request, ok);
  if (!ok) { await new Promise((r) => setTimeout(r, 400)); return json({ error: 'Wrong password' }, 401); }
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, true) });
}
