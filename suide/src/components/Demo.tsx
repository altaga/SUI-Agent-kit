import { useEffect, useRef, useState } from 'react';

import { stream, type AgentEvent } from '@/lib/api';

type Step = { n: number; title: string; status: 'wait' | 'run' | 'ok' | 'fail'; detail: string; ms?: number };
type Proof = { verified: boolean; digest: string; secretMatched: boolean; digestMatched: boolean; seconds: number; url: string };

const PLAN: Step[] = [
  { n: 1, title: 'Wakes up and checks its wallet', status: 'wait', detail: '' },
  { n: 2, title: 'Pays on-chain', status: 'wait', detail: '' },
  { n: 3, title: 'Writes what it learned to Walrus', status: 'wait', detail: '' },
  { n: 4, title: 'Machine A is destroyed', status: 'wait', detail: '' },
  { n: 5, title: 'Machine B boots with nothing', status: 'wait', detail: '' },
  { n: 6, title: 'Verifies against the chain', status: 'wait', detail: '' },
];

type Line = { c: string; t: string };

export function Demo({ onFinished }: { onFinished: () => void }) {
  const [steps, setSteps] = useState<Step[]>(PLAN);
  const [feed, setFeed] = useState<Line[]>([]);
  const [link, setLink] = useState<{ url: string; text: string } | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');
  const ac = useRef<AbortController | null>(null);
  const term = useRef<HTMLDivElement>(null);

  useEffect(() => () => ac.current?.abort(), []);
  useEffect(() => { term.current?.scrollTo({ top: term.current.scrollHeight }); }, [feed]);

  const on = (e: AgentEvent) => {
    if (e.type === 'step') setSteps((s) => s.map((x) => (x.n === e.n ? { n: e.n, title: e.title ?? '', status: e.status, detail: e.detail || '', ms: e.ms } : x)));
    else if (e.type === 'link') setLink({ url: e.url, text: e.text ?? '' });
    else if (e.type === 'proof') setProof(e as unknown as Proof);
    else if (e.type === 'tool') setFeed((f) => [...f, { c: 't', t: `> ${e.text}` }]);
    else if (e.type === 'result') setFeed((f) => [...f, { c: 'r', t: `  ${e.text}` }]);
    else if (e.type === 'memory') setFeed((f) => [...f, { c: 'm', t: `~ ${e.text}` }]);
    else if (e.type === 'text') setFeed((f) => [...f, { c: 'a', t: e.text ?? '' }]);
    else if (e.type === 'error') setErr(e.text ?? 'error');
  };

  const run = async () => {
    setSteps(PLAN); setFeed([]); setLink(null); setProof(null); setErr(''); setRunning(true);
    ac.current = new AbortController();
    try { await stream('/api/demo/resurrection', {}, on, ac.current.signal); }
    catch (x: any) { if (x.name !== 'AbortError') setErr(x.message); }
    setRunning(false);
    onFinished();
  };

  const col = (from: number, to: number) => steps.filter((s) => s.n >= from && s.n <= to);
  const renderStep = (s: Step) => (
    <div className={`step ${s.status}`} key={s.n}>
      <div className="dot">{s.status === 'ok' ? '✓' : s.status === 'fail' ? '!' : s.n}</div>
      <div>
        {s.title}
        {s.detail ? <small>{s.detail}</small> : null}
        {s.n === 2 && link ? <small><a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Open the transaction on Suiscan</a></small> : null}
      </div>
    </div>
  );

  return (
    <div className="scroll">
      <div className="demo">
        <h2>The agent that never forgets</h2>
        <p className="lead">Machine A does real work on Sui testnet and saves what it learned to Walrus. Then it is wiped. Machine B starts with an empty disk and only a memory key, and has to prove what happened.</p>
        <div><button className="pill go" onClick={run} disabled={running}>{running ? 'Running…' : proof || err ? 'Run again' : 'Run the demo'}</button></div>
        {err ? <div className="err">{err}</div> : null}
        <div className="machines">
          <div className="machine gone"><h4><span>Machine A</span><span>{steps[3].status === 'ok' ? 'destroyed' : running ? 'alive' : 'idle'}</span></h4>{col(1, 4).map(renderStep)}</div>
          <div className="machine"><h4><span>Machine B</span><span>{steps[4].status === 'run' ? 'booting' : 'fresh disk'}</span></h4>{col(5, 6).map(renderStep)}
            <div className="term" ref={term} aria-live="polite">{feed.length ? feed.map((l, i) => <div key={i} className={l.c}>{l.t}</div>) : <div className="r">Machine B output appears here.</div>}</div>
          </div>
        </div>
        {proof ? (
          <div className={`proof ${proof.verified ? '' : 'bad'}`}>
            <h3>{proof.verified ? 'Verified' : 'Not verified'}</h3>
            <div>{proof.verified ? 'A machine with no local state recovered the transaction digest and the secret phrase from Walrus, and the digest exists on-chain.' : 'Machine B could not reproduce the facts from Walrus.'}</div>
            <div className="grid">
              <span>Time <b>{proof.seconds}s</b></span>
              <span>Digest match <b>{proof.digestMatched ? 'yes' : 'no'}</b></span>
              <span>Secret match <b>{proof.secretMatched ? 'yes' : 'no'}</b></span>
            </div>
            <a href={proof.url} target="_blank" rel="noopener noreferrer">{proof.digest}</a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
