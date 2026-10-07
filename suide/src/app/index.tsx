import { useCallback, useEffect, useRef, useState } from 'react';

import { BalanceChips, useBalance } from '@/components/Balance';
import { Composer } from '@/components/Composer';
import { Demo } from '@/components/Demo';
import { Login } from '@/components/Login';
import { Sidebar } from '@/components/Sidebar';
import { Chevron, Drop, Menu, RichText, Spark } from '@/components/ui';
import { QUICK } from '@/lib/quick';
import { api, stream, type ActionInfo, type SessionInfo, type Status } from '@/lib/api';
import { applyEvent, fromLog, uid, type Item } from '@/lib/events';

type Mode = 'local' | 'on-demand' | 'sync';

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [actions, setActions] = useState<ActionInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'chat' | 'demo'>('chat');
  const [mode, setMode] = useState<Mode>('local');
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<ActionInfo | null>(null);
  const [dialogText, setDialogText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);
  const [toast, setToast] = useState('');
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const balance = useBalance(authed === true, refreshKey);
  const bal = { b: balance.b, loading: balance.loading, onRefresh: balance.refresh };

  const boot = useCallback(async () => {
    const [st, ss, ac] = await Promise.all([api.status(), api.sessions(), api.actions()]);
    setStatus(st); setActions(ac);
    if (ss.length && ss[0].messages === 0) { setSessions(ss); await open(ss[0].id); }
    else if (ss.length) { const n = await api.createSession({}); setSessions(await api.sessions()); await open(n.id); }
    else { const s = await api.createSession({}); setSessions([s]); setActiveId(s.id); setItems([]); }
  }, []);

  useEffect(() => {
    api.me().then(async (m) => {
      setConfigured(m.configured);
      setAuthed(m.authed);
      if (m.authed) await boot().catch((e) => setToast(e.message));
    }).catch(() => setAuthed(false));
  }, [boot]);

  const open = async (id: string) => {
    abort.current?.abort();
    const s = await api.session(id);
    setActiveId(id); setItems(fromLog(s.log)); setView('chat'); setDrawer(false); setBusy(false);
    pinned.current = true;
    setFocusSignal((n) => n + 1);
  };

  const refreshSessions = async () => setSessions(await api.sessions().catch(() => sessions));

  const newChat = async () => {
    try {
      const s = await api.createSession({ mode });
      await refreshSessions();
      await open(s.id);
    } catch (e: any) { setToast(e.message); }
  };

  const remove = async (id: string) => {
    await api.deleteSession(id).catch((e) => setToast(e.message));
    const rest = (await api.sessions().catch(() => [])) as SessionInfo[];
    if (!rest.length) { const s = await api.createSession({ mode }); setSessions([s]); await open(s.id); return; }
    setSessions(rest);
    if (id === activeId) await open(rest[0].id);
  };

  const send = async (text: string) => {
    if (!activeId || busy) return;
    pinned.current = true;
    setBusy(true);
    setItems((it) => applyEvent(it, { type: 'user', text }));
    abort.current = new AbortController();
    try {
      await stream('/api/chat', { session: activeId, message: text }, (e) => setItems((it) => applyEvent(it, e)), abort.current.signal);
    } catch (e: any) {
      if (e.name !== 'AbortError') setItems((it) => applyEvent(it, { type: 'error', text: e.message }));
    }
    setBusy(false);
    setRefreshKey((k) => k + 1);
    refreshSessions();
  };

  const decide = async (itemId: string, approvalId: string, allow: boolean) => {
    setItems((it) => it.map((x) => (x.id === itemId && x.kind === 'approval' ? { ...x, state: allow ? 'allowed' : 'denied' } : x)));
    await api.approve(approvalId, allow).catch((e) => setToast(e.message));
  };

  const runAction = async (a: ActionInfo, input?: string) => {
    if (!activeId) return;
    setDrawer(false); setView('chat');
    try {
      const data = await api.action(a.name, activeId, input);
      setItems((it) => [...it, { kind: 'action', id: uid(), label: a.label, data }]);
      if (a.name === 'faucet' || a.name === 'wallet') setRefreshKey((k) => k + 1);
    } catch (e: any) { setItems((it) => applyEvent(it, { type: 'error', text: `${a.label}: ${e.message}` })); }
  };

  const pickAction = (a: ActionInfo) => {
    if (a.input) { setDialog(a); setDialogText(''); setDrawer(false); }
    else runAction(a);
  };

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTo({ top: el.scrollHeight });
  }, [items, busy, view]);

  // Follow the visual viewport so the composer stays above the on-screen keyboard (iOS Safari ignores interactive-widget).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
      if (vv.offsetTop) window.scrollTo(0, 0);
      const el = scroller.current;
      if (el && pinned.current) el.scrollTo({ top: el.scrollHeight });
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
  }, [authed]);

  // Keyboard shortcuts: Ctrl/Cmd+K new chat, "/" focus composer, Esc stop or close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); }
      else if (e.key === '/' && !typing && !dialog) { e.preventDefault(); setView('chat'); setFocusSignal((n) => n + 1); }
      else if (e.key === 'Escape') {
        if (dialog) setDialog(null);
        else if (drawer) setDrawer(false);
        else if (busy) abort.current?.abort();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (authed === null) return <div className="login"><Drop size={40} /></div>;
  if (!authed) return <Login configured={configured} onDone={() => { setAuthed(true); boot().catch((e) => setToast(e.message)); }} />;

  const active = sessions.find((s) => s.id === activeId);
  const waitingApproval = items.some((x) => x.kind === 'approval' && x.state === 'pending');

  return (
    <div className="app">
      <div className={`scrim ${drawer ? 'show' : ''}`} onClick={() => setDrawer(false)} />
      <Sidebar
        open={drawer} status={status} bal={bal} sessions={sessions} activeId={activeId} view={view} mode={mode} actions={actions}
        onMode={setMode} onNew={newChat} onPick={open} onDelete={remove} onAction={pickAction}
        onDemo={() => { setView('demo'); setDrawer(false); }} onClose={() => setDrawer(false)}
        onSignOut={() => { setAuthed(false); setItems([]); setSessions([]); }}
      />
      <main className="main">
        <header className="top">
          <button className="icon" onClick={() => setDrawer(true)} aria-label="Open sidebar"><Menu /></button>
          <BalanceChips b={bal.b} onClick={bal.onRefresh} />
          <div className="title" style={{ textAlign: 'right' }}>{view === 'demo' ? 'Demo' : active?.name ?? ''}</div>
        </header>

        {view === 'demo' ? (
          <Demo onFinished={() => setRefreshKey((k) => k + 1)} />
        ) : (
          <>
            <div className="scroll" ref={scroller} onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140; }}>
              {items.length === 0 ? (
                <div className="hello">
                  <Drop size={40} />
                  <h1>What should we build?</h1>
                  <p>An agent with a Sui wallet, long-term memory on Walrus and the Sui skills. {active?.mode === 'on-demand' ? 'This chat starts with a clean memory and can search Walrus when needed.' : active?.mode === 'sync' ? 'This chat reads and writes Walrus as it goes.' : ''}</p>
                  <div className="quick-grid">
                    {QUICK.map((q) => <button key={q.id} onClick={() => send(q.prompt)} disabled={busy}><b>{q.label}</b><span>{q.hint}</span></button>)}
                    <button className="demo" onClick={() => setView('demo')}><b>Run the demo</b><span>The agent that never forgets</span></button>
                  </div>
                </div>
              ) : (
                <div className="col">
                  {items.map((it) => <Row key={it.id} it={it} onDecide={decide} />)}
                  {busy && !waitingApproval ? <div className="dots" aria-label="The agent is working"><i /><i /><i /></div> : null}
                </div>
              )}
            </div>
            {items.length > 0 && !busy ? <div className="quick-strip" aria-label="Quick commands">{QUICK.map((q) => <button key={q.id} onClick={() => send(q.prompt)}>{q.label}</button>)}</div> : null}
            <Composer busy={busy} disabled={!activeId} placeholder="Message SUIde" focusSignal={focusSignal} onSend={send} onStop={() => abort.current?.abort()} />
          </>
        )}
      </main>

      {dialog ? (
        <div className="modal-bg" onClick={() => setDialog(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); const a = dialog; setDialog(null); runAction(a, dialogText.trim()); }}>
            <h3>{dialog.label}</h3>
            <p>{dialog.description}</p>
            <input autoFocus value={dialogText} onChange={(e) => setDialogText(e.target.value)} placeholder={dialog.input === 'text' ? 'Text' : 'Query'} enterKeyHint="go" aria-label={dialog.label} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="pill" onClick={() => setDialog(null)}>Cancel</button>
              <button className="pill go" disabled={!dialogText.trim()}>Run</button>
            </div>
          </form>
        </div>
      ) : null}

      {toast ? <div className="err" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))', maxWidth: 420, margin: '0 auto', background: 'var(--card)', zIndex: 40 }} role="alert">{toast}</div> : null}
    </div>
  );
}

function Row({ it, onDecide }: { it: Item; onDecide: (id: string, approvalId: string, allow: boolean) => void }) {
  switch (it.kind) {
    case 'user': return <div className="msg-user">{it.text}</div>;
    case 'assistant': return <div className="msg-ai"><RichText text={it.text} /></div>;
    case 'tool':
      return (
        <details className="tool">
          <summary><Chevron /><span>{it.text}</span>{it.result === undefined ? <i className="dots"><i /><i /><i /></i> : null}</summary>
          {it.result !== undefined ? <pre>{it.result}</pre> : null}
        </details>
      );
    case 'note': return <div className="note"><Spark size={14} />{it.text}</div>;
    case 'error': return <div className="err" role="alert">{it.text}</div>;
    case 'approval':
      return (
        <div className="approval" role="alertdialog" aria-label="Approval needed">
          <div><b>The agent wants to run this</b></div>
          <pre>{it.text}</pre>
          {it.state === 'pending' ? (
            <div className="acts">
              <button className="pill go" onClick={() => onDecide(it.id, it.approvalId, true)}>Allow once</button>
              <button className="pill" onClick={() => onDecide(it.id, it.approvalId, false)}>Deny</button>
            </div>
          ) : <div style={{ color: 'var(--muted)' }}>{it.state === 'allowed' ? 'Allowed' : 'Denied'}</div>}
        </div>
      );
    case 'action':
      return <div><div className="note" style={{ marginBottom: 6 }}><Spark size={14} />{it.label}</div><div className="result">{JSON.stringify(it.data, null, 2)}</div></div>;
  }
}
