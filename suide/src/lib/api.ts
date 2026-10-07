export type AgentEvent = { type: string; text?: string; id?: string; [k: string]: any };
export type Status = { provider: string; model: string; walrus: boolean; demo: boolean; network: string; address: string | null; approval: string };
export type SessionInfo = { id: string; name: string; mode: 'local' | 'on-demand' | 'sync'; namespace: string; busy: boolean; messages: number };
export type ActionInfo = { name: string; label: string; description: string; input?: string };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data as T;
}

export const api = {
  me: () => call<{ authed: boolean; configured: boolean }>('GET', '/api/auth/me'),
  login: (password: string) => call('POST', '/api/auth/login', { password }),
  logout: () => call('POST', '/api/auth/logout', {}),
  status: () => call<Status>('GET', '/api/status'),
  balance: () => call<{ network: string; address: string | null; sui: string; wal: string; usdc: string }>('GET', '/api/balance'),
  actions: () => call<ActionInfo[]>('GET', '/api/actions'),
  sessions: () => call<SessionInfo[]>('GET', '/api/sessions'),
  createSession: (b: { name?: string; mode?: string }) => call<SessionInfo>('POST', '/api/sessions', b),
  session: (id: string) => call<SessionInfo & { log: AgentEvent[] }>('GET', `/api/sessions/${id}`),
  deleteSession: (id: string) => call('DELETE', `/api/sessions/${id}`),
  action: (name: string, session: string, input?: string) => call<any>('POST', `/api/action/${name}`, { session, input }),
  approve: (id: string, allow: boolean) => call('POST', '/api/approve', { id, allow }),
};

/** POST and read a text/event-stream response, calling onEvent for each `data:` message. */
export async function stream(path: string, body: unknown, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = block.split('\n').find((l) => l.startsWith('data: '));
      if (line) { try { onEvent(JSON.parse(line.slice(6))); } catch {} }
    }
  }
}
