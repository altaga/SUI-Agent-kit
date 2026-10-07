import { json, sameOrigin, sessionCookie } from '../../../server/bff';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin request blocked' }, 403);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, false) });
}
