import { api, type ActionInfo, type SessionInfo, type Status } from '@/lib/api';
import { BalanceCard } from './Balance';
import { Close, Drop, Plus } from './ui';

type Mode = 'local' | 'on-demand' | 'sync';
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'local', label: 'Local', hint: 'Fresh memory on this machine only' },
  { id: 'on-demand', label: 'On demand', hint: 'Fresh local memory; the agent can search Walrus when it needs to' },
  { id: 'sync', label: 'Sync', hint: 'Everything is also saved to and read from Walrus' },
];

type Props = {
  open: boolean;
  status: Status | null;
  bal: React.ComponentProps<typeof BalanceCard>;
  sessions: SessionInfo[];
  activeId: string | null;
  view: 'chat' | 'demo';
  mode: Mode;
  actions: ActionInfo[];
  onMode: (m: Mode) => void;
  onNew: () => void;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
  onAction: (a: ActionInfo) => void;
  onDemo: () => void;
  onClose: () => void;
  onSignOut: () => void;
};

export function Sidebar(p: Props) {
  const walrus = !!p.status?.walrus;
  const modes = MODES.filter((m) => walrus || m.id === 'local');
  return (
    <aside className={`side ${p.open ? 'open' : ''}`} aria-label="Sidebar">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="brand"><Drop size={24} />SUIde</div>
        <button className="icon" style={{ display: p.open ? 'grid' : 'none' }} onClick={p.onClose} aria-label="Close sidebar"><Close /></button>
      </div>
      <BalanceCard {...p.bal} />
      <button className="btn primary" onClick={p.onNew}><Plus size={16} />New chat</button>
      {modes.length > 1 ? (
        <div className="modes" role="radiogroup" aria-label="Memory mode for new chats">
          {modes.map((m) => (
            <button key={m.id} className={p.mode === m.id ? 'on' : ''} role="radio" aria-checked={p.mode === m.id} title={m.hint} onClick={() => p.onMode(m.id)}>{m.label}</button>
          ))}
        </div>
      ) : null}
      <div className="label">Chats</div>
      <div className="list">
        {p.sessions.map((s) => (
          <div key={s.id} className={`row ${s.id === p.activeId && p.view === 'chat' ? 'on' : ''}`}>
            <button className="main" onClick={() => p.onPick(s.id)} title={`${s.name} (${s.mode})`}><span className={`mode-dot ${s.mode}`} />{s.name}</button>
            <button className="x" onClick={() => p.onDelete(s.id)} aria-label={`Delete ${s.name}`}><Close size={14} /></button>
          </div>
        ))}
      </div>
      {p.actions.length ? <div className="label">Tools</div> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 4px' }}>
        {p.actions.map((a) => (
          <button key={a.name} className="chip" title={a.description} onClick={() => p.onAction(a)}>{a.label}</button>
        ))}
      </div>
      {p.status?.demo ? (
        <button className="demo-card" onClick={p.onDemo}><b>The agent that never forgets</b><span>Wipe a machine, rebuild the agent from Walrus, verify on-chain.</span></button>
      ) : null}
      <div className="foot">
        <span title={p.status?.model}>{p.status ? `${p.status.provider} · ${p.status.model.replace(/^us\./, '').slice(0, 22)}` : ''}</span>
        <button onClick={async () => { await api.logout().catch(() => {}); p.onSignOut(); }} style={{ color: 'var(--muted)' }}>Sign out</button>
      </div>
    </aside>
  );
}
