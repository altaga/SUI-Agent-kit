export const CSS = `
:root{--bg:#FAF9F5;--side:#F3F1EA;--card:#fff;--border:#E6E3D9;--strong:#D6D2C4;--text:#1F1E1D;--muted:#6F6E67;--faint:#A19F95;--bubble:#EFECE2;--hover:#EAE7DC;--accent:#2B8DF5;--on-accent:#fff;--soft:#E4F0FE;--ok:#2E9E6B;--bad:#D2503C;--code:#F1EEE4;--shadow:0 1px 2px rgba(31,30,29,.06),0 6px 24px rgba(31,30,29,.06);--serif:ui-serif,"Iowan Old Style","Source Serif 4",Georgia,"Times New Roman",serif;--sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
@media (prefers-color-scheme:dark){:root{--bg:#262624;--side:#1F1E1D;--card:#30302E;--border:#3B3A36;--strong:#4A4944;--text:#ECEAE3;--muted:#A3A197;--faint:#77756C;--bubble:#33322F;--hover:#2D2C2A;--accent:#4DA2FF;--on-accent:#0B1B2E;--soft:#1D3047;--ok:#4BC08A;--bad:#EE7B68;--code:#1C1B1A;--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 24px rgba(0,0,0,.35)}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body,#root{height:100%;margin:0}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow:hidden;overscroll-behavior:none}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
button:disabled{cursor:default;opacity:.45}
input,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.app{display:flex;height:100vh;height:100dvh;height:var(--vvh,100dvh);position:relative}
.side{width:288px;flex:none;background:var(--side);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:14px 12px calc(12px + env(safe-area-inset-bottom));gap:12px;overflow:hidden}
.brand{display:flex;align-items:center;gap:9px;padding:2px 6px;font-family:var(--serif);font-size:21px;letter-spacing:-.01em}
.brand svg{flex:none}
.bal{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 12px;text-align:left;width:100%}
.bal:hover{border-color:var(--strong)}
.bal-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.tag{font-size:10px;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--border);border-radius:99px;padding:1px 7px;color:var(--muted)}
.tag.net{color:var(--accent);border-color:var(--accent)}
.bal-row{display:flex;justify-content:space-between;align-items:baseline;font-variant-numeric:tabular-nums;font-size:14px;padding:1px 0}
.bal-row b{font-weight:600}.bal-row span{color:var(--muted);font-size:12px}
.bal-addr{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:6px}
.chips{display:none;gap:6px;align-items:center;min-width:0}
.chip{font-variant-numeric:tabular-nums;font-size:12.5px;border:1px solid var(--border);background:var(--card);border-radius:99px;padding:3px 9px;white-space:nowrap}
.chip i{font-style:normal;color:var(--muted);margin-left:3px;font-size:11px}
.btn{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border-radius:9px;text-align:left}
.btn:hover:not(:disabled){background:var(--hover)}
.btn.primary{background:var(--accent);color:var(--on-accent);font-weight:600;justify-content:center}
.btn.primary:hover:not(:disabled){background:var(--accent);filter:brightness(1.07)}
.modes{display:flex;background:var(--hover);border-radius:9px;padding:2px;gap:2px}
.modes button{flex:1;font-size:12px;padding:5px 4px;border-radius:7px;color:var(--muted)}
.modes button.on{background:var(--card);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);padding:4px 8px 0}
.list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:1px}
.row{display:flex;align-items:center;border-radius:9px}
.row:hover,.row.on{background:var(--hover)}
.row .main{flex:1;min-width:0;padding:7px 10px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .x{opacity:0;padding:6px 8px;color:var(--muted)}
.row:hover .x,.row .x:focus-visible{opacity:1}
.mode-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:8px;background:var(--faint)}
.mode-dot.on-demand{background:var(--accent)}.mode-dot.sync{background:var(--ok)}
.demo-card{border:1px solid var(--accent);background:var(--soft);border-radius:12px;padding:10px 12px;text-align:left;width:100%}
.demo-card b{display:block;font-family:var(--serif);font-weight:500;font-size:15px}
.demo-card span{font-size:12px;color:var(--muted)}
.foot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted);padding:2px 6px}.foot span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.foot button{white-space:nowrap;flex:none}
.main{flex:1;min-width:0;display:flex;flex-direction:column;height:100%}
.top{display:none;align-items:center;gap:10px;padding:8px 12px;padding-top:calc(8px + env(safe-area-inset-top));border-bottom:1px solid var(--border);background:var(--bg)}
.icon{width:36px;height:36px;border-radius:9px;display:grid;place-items:center;flex:none}
.icon:hover:not(:disabled){background:var(--hover)}
.title{font-family:var(--serif);font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.scroll{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scroll-behavior:smooth}
.col{max-width:760px;margin:0 auto;padding:28px 20px 12px;display:flex;flex-direction:column;gap:18px}
.hello{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 20px;gap:14px;min-height:100%}
.hello h1{font-family:var(--serif);font-weight:400;font-size:clamp(28px,5vw,40px);letter-spacing:-.02em;margin:0}
.hello p{margin:0;color:var(--muted);max-width:460px}
.suggest{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px}
.suggest button{border:1px solid var(--border);background:var(--card);border-radius:99px;padding:7px 14px;font-size:13.5px}
.suggest button:hover{border-color:var(--strong);background:var(--hover)}
.msg-user{align-self:flex-end;max-width:85%;background:var(--bubble);border-radius:16px;padding:9px 14px;white-space:pre-wrap;overflow-wrap:anywhere}
.msg-ai{font-family:var(--serif);font-size:16.5px;line-height:1.65;overflow-wrap:anywhere}
.msg-ai p{margin:0 0 .8em}.msg-ai p:last-child{margin:0}
.msg-ai code{font-family:var(--mono);font-size:.82em;background:var(--code);border-radius:5px;padding:1px 5px}
.msg-ai pre{font-family:var(--mono);font-size:13px;line-height:1.5;background:var(--code);border:1px solid var(--border);border-radius:10px;padding:12px 14px;overflow-x:auto;margin:.6em 0}
.msg-ai pre code{background:none;padding:0;font-size:inherit}
.msg-ai a{color:var(--accent)}
.tool{font-family:var(--sans);font-size:13px;border:1px solid var(--border);border-radius:10px;background:var(--card);overflow:hidden}
.tool summary{cursor:pointer;padding:7px 11px;display:flex;gap:8px;align-items:center;color:var(--muted);list-style:none;min-width:0}
.tool summary::-webkit-details-marker{display:none}
.tool summary span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--mono);font-size:12px}
.tool pre{margin:0;padding:8px 11px;border-top:1px solid var(--border);font-family:var(--mono);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted);max-height:240px;overflow:auto}
.note{font-size:12.5px;color:var(--muted);display:flex;gap:6px;align-items:center}
.err{font-size:13.5px;color:var(--bad);border:1px solid var(--bad);border-radius:10px;padding:8px 12px}
.approval{border:1px solid var(--accent);background:var(--soft);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;font-size:14px}
.approval pre{margin:0;font-family:var(--mono);font-size:12.5px;white-space:pre-wrap;overflow-wrap:anywhere}
.approval .acts{display:flex;gap:8px}
.pill{border:1px solid var(--strong);border-radius:99px;padding:6px 16px;font-size:13.5px;background:var(--card)}
.pill.go{background:var(--accent);color:var(--on-accent);border-color:var(--accent);font-weight:600}
.dots{display:inline-flex;gap:4px;padding:6px 0}
.dots i{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 1.2s infinite ease-in-out}
.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes pulse{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
.dock{padding:6px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(to top,var(--bg) 70%,transparent)}
.composer{max-width:760px;margin:0 auto;background:var(--card);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow);padding:10px 10px 8px 16px;display:flex;flex-direction:column;gap:4px}
.composer:focus-within{border-color:var(--strong)}
.composer textarea{width:100%;border:0;outline:0;resize:none;background:none;font-size:16px;line-height:1.5;max-height:200px;min-height:26px;padding:4px 0;font-family:var(--sans)}
.composer textarea::placeholder{color:var(--faint)}
.cbar{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--muted);font-size:12px}
.send{width:34px;height:34px;border-radius:10px;background:var(--accent);color:var(--on-accent);display:grid;place-items:center}
.send.stop{background:var(--text);color:var(--bg)}
.hint{text-align:center;font-size:11.5px;color:var(--faint);padding-top:6px}
.scrim{display:none}
.login{height:100dvh;display:grid;place-items:center;padding:20px}
.login form{width:100%;max-width:360px;display:flex;flex-direction:column;gap:14px;text-align:center}
.login h1{font-family:var(--serif);font-weight:400;font-size:34px;margin:0}
.login input{width:100%;font-size:16px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--card);outline:0}
.login input:focus{border-color:var(--accent)}
.login .pill{padding:11px 16px;font-size:15px}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);display:grid;place-items:end center;z-index:30}
.modal{width:100%;max-width:460px;background:var(--card);border:1px solid var(--border);border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;box-shadow:var(--shadow)}
.modal h3{margin:0;font-family:var(--serif);font-weight:500;font-size:19px}
.modal p{margin:0;color:var(--muted);font-size:13.5px}
.modal input{width:100%;font-size:16px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);outline:0}
.modal input:focus{border-color:var(--accent)}
.result{font-family:var(--mono);font-size:12.5px;background:var(--code);border:1px solid var(--border);border-radius:10px;padding:10px 12px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto}
.demo{max-width:980px;margin:0 auto;padding:28px 20px;display:flex;flex-direction:column;gap:18px}
.demo h2{font-family:var(--serif);font-weight:400;font-size:clamp(24px,4vw,34px);letter-spacing:-.02em;margin:0}
.demo .lead{color:var(--muted);margin:0;max-width:640px}
.machines{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.machine{border:1px solid var(--border);background:var(--card);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;min-width:0}
.machine.gone{opacity:.9}
.machine h4{margin:0;font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);display:flex;justify-content:space-between}
.step{display:flex;gap:10px;align-items:flex-start;font-size:14px;min-width:0}
.step .dot{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--strong);flex:none;display:grid;place-items:center;font-size:11px;margin-top:1px}
.step.run .dot{border-color:var(--accent);animation:pulse 1.2s infinite}
.step.ok .dot{background:var(--ok);border-color:var(--ok);color:#fff}
.step.fail .dot{background:var(--bad);border-color:var(--bad);color:#fff}
.step small{display:block;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.step.wait{opacity:.5}
.term{font-family:var(--mono);font-size:12px;background:var(--code);border:1px solid var(--border);border-radius:10px;padding:10px 12px;min-height:90px;max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:3px}
.term .t{color:var(--accent)}.term .r{color:var(--muted)}.term .m{color:var(--ok)}.term .a{color:var(--text)}
.proof{border:1px solid var(--ok);background:var(--card);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow)}
.proof.bad{border-color:var(--bad)}
.proof h3{margin:0;font-family:var(--serif);font-weight:500;font-size:24px;color:var(--ok)}.proof.bad h3{color:var(--bad)}
.proof a{color:var(--accent);overflow-wrap:anywhere}
.proof .grid{display:flex;gap:18px;flex-wrap:wrap;font-size:13.5px;color:var(--muted)}
.proof .grid b{color:var(--text)}
@media (max-width:860px){
 .side{position:fixed;z-index:20;inset:0 auto 0 0;width:min(86vw,320px);transform:translateX(-102%);transition:transform .22s ease;box-shadow:var(--shadow)}
 .side.open{transform:none}
 .scrim.show{display:block;position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:15}
 .top{display:flex}.chips{display:flex}
 .machines{grid-template-columns:1fr}
 .col{padding:18px 14px 8px}
 .dock{padding:6px 10px calc(10px + env(safe-area-inset-bottom))}
 .hint{display:none}
 .modal-bg{place-items:end stretch}.modal{max-width:none}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
