import type { AgentEvent } from './api';

export type Item =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; text: string; result?: string }
  | { kind: 'note'; id: string; text: string }
  | { kind: 'error'; id: string; text: string }
  | { kind: 'approval'; id: string; approvalId: string; text: string; state: 'pending' | 'allowed' | 'denied' }
  | { kind: 'action'; id: string; label: string; data: any };

let n = 0;
export const uid = () => `i${Date.now().toString(36)}${(n++).toString(36)}`;

/** Fold one agent event into the visible conversation. */
export function applyEvent(items: Item[], e: AgentEvent): Item[] {
  const text = e.text ?? '';
  switch (e.type) {
    case 'user': return [...items, { kind: 'user', id: uid(), text }];
    case 'text': return [...items, { kind: 'assistant', id: uid(), text }];
    case 'tool': return [...items, { kind: 'tool', id: uid(), text }];
    case 'result': {
      const i = [...items].reverse().findIndex((x) => x.kind === 'tool' && x.result === undefined);
      if (i < 0) return items;
      const at = items.length - 1 - i;
      return items.map((x, k) => (k === at && x.kind === 'tool' ? { ...x, result: text } : x));
    }
    case 'memory': return [...items, { kind: 'note', id: uid(), text }];
    case 'error': return [...items, { kind: 'error', id: uid(), text }];
    case 'approval': return [...items, { kind: 'approval', id: uid(), approvalId: String(e.id), text, state: 'pending' }];
    default: return items;
  }
}

export const fromLog = (log: AgentEvent[]) => log.reduce(applyEvent, [] as Item[]);
