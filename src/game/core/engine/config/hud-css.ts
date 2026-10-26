/** Scoped HUD styles. */
/* -------------------------------------------------------------------------
   Scoped HUD styles (prefix jj-) so the engine owns its DOM like the
   original standalone build, without leaking anything globally.
   ------------------------------------------------------------------------- */
export const HUD_CSS = `
.jj-root { position:absolute; inset:0; overflow:hidden; }
.jj-root canvas { display:block; }
.jj-root [hidden] { display:none !important; }
.jj-grade, .jj-vig { position:absolute; inset:0; pointer-events:none; }
.jj-grade { z-index:10; mix-blend-mode:soft-light; background:
  radial-gradient(130% 100% at 50% 42%, transparent 50%, rgba(18,14,4,.40) 100%),
  radial-gradient(65% 42% at 72% 10%, rgba(255,200,100,.18), transparent 60%),
  linear-gradient(180deg, rgba(255,230,170,.08), rgba(30,50,20,.08)); }
.jj-vig { z-index:11; background:radial-gradient(110% 85% at 50% 50%, transparent 55%, rgba(4,8,2,.52) 100%); }
.jj-hud { position:absolute; inset:0; z-index:20; pointer-events:none; opacity:0; transition:opacity .7s ease; --amber:#f2a33a; --moss:#8fd18a; --ink:#f3efe6; --dim:rgba(243,239,230,.58); }
.jj-hud.on { opacity:1; }
.jj-panel { background:linear-gradient(180deg,rgba(14,19,14,.62),rgba(9,13,9,.5)); border:1px solid rgba(255,255,255,.1); border-radius:12px;
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); box-shadow:0 10px 30px rgba(0,0,0,.28);
  color:var(--ink); font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
.jj-compass { position:absolute; left:50%; top:calc(18px + env(safe-area-inset-top,0px)); transform:translateX(-50%); padding:6px 18px; font-size:11.5px;
  letter-spacing:.24em; font-weight:700; color:var(--dim); border-radius:999px; }
.jj-notice { position:absolute; left:50%; top:calc(62px + env(safe-area-inset-top,0px)); transform:translate(-50%,-6px); padding:9px 22px; font-size:12.5px;
  font-weight:700; letter-spacing:.12em; text-transform:uppercase; opacity:0; transition:opacity .35s, transform .35s; border-radius:999px; border-color:rgba(242,163,58,.35); }
.jj-notice.show { opacity:1; transform:translate(-50%,0); }
.jj-place { position:absolute; left:calc(24px + env(safe-area-inset-left,0px)); top:calc(20px + env(safe-area-inset-top,0px)); padding:8px 14px; font-size:12px;
  display:flex; align-items:center; gap:10px; color:var(--dim); letter-spacing:.04em; }
.jj-place i { width:3px; height:3px; border-radius:50%; background:var(--dim); }
.jj-place b { color:var(--ink); font-variant-numeric:tabular-nums; }
.jj-vitals { position:absolute; left:calc(24px + env(safe-area-inset-left,0px)); bottom:calc(60px + env(safe-area-inset-bottom,0px)); width:min(300px,34vw); display:grid; gap:9px; }
.jj-vital { display:flex; align-items:center; gap:10px; padding:0 2px; filter:drop-shadow(0 2px 6px rgba(0,0,0,.55)); }
.jj-vl { font-size:10px; font-weight:800; letter-spacing:.2em; color:var(--ink); width:30px; flex:none; opacity:.85; }
.jj-bwrap { height:8px; background:rgba(0,0,0,.45); border:1px solid rgba(255,255,255,.14); border-radius:5px; overflow:hidden; flex:1; }
.jj-bwrap i { display:block; height:100%; width:0%; border-radius:4px; transition:width .12s linear; }
.jj-hp i { background:var(--moss); } .jj-sta i { background:#6cb6e8; }
.jj-thr i { background:#78d18a; } .jj-brk i { background:#ef5b45; }
.jj-hud[data-mode=car] .jj-vital:nth-child(2) { display:none; }
.jj-pad { font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:rgba(243,239,230,.4); padding-left:2px; }
.jj-right { position:absolute; right:calc(24px + env(safe-area-inset-right,0px)); bottom:calc(24px + env(safe-area-inset-bottom,0px)); display:flex; flex-direction:column; gap:10px; align-items:flex-end; }
.jj-speedo { padding:14px 20px 12px; min-width:176px; text-align:right; }
.jj-hud[data-mode=foot] .jj-speedo { display:none; }
.jj-spd { font-size:46px; font-weight:800; line-height:.92; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.jj-spdu { font-size:10.5px; letter-spacing:.24em; color:var(--dim); margin-top:5px; }
.jj-gears { display:flex; gap:6px; justify-content:flex-end; margin-top:10px; }
.jj-gears div { font-size:11px; font-weight:800; color:rgba(255,255,255,.26); width:20px; text-align:center; }
.jj-gears div.on { color:var(--amber); }
.jj-lamp { margin-top:9px; font-size:11px; color:var(--dim); letter-spacing:.06em; }
.jj-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,.2); margin-right:6px; vertical-align:middle; }
.jj-dot.on { background:#ffd479; box-shadow:0 0 9px #ffd479; }
.jj-bars { margin-top:10px; display:grid; gap:5px; }
.jj-bars .jj-bwrap { height:5px; }
.jj-weapon { padding:11px 16px; min-width:176px; text-align:right; border-color:rgba(242,163,58,.28); }
.jj-weapon .n { font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--amber); font-weight:700; }
.jj-weapon .a { font-size:28px; font-weight:800; line-height:1.1; font-variant-numeric:tabular-nums; }
.jj-weapon .a small { font-size:13px; font-weight:700; opacity:.55; }
.jj-weapon .a.low { color:#ff8a70; }
.jj-weapon .r { height:3px; margin-top:7px; border-radius:2px; background:rgba(255,255,255,.12); overflow:hidden; }
.jj-weapon .r i { display:block; height:100%; width:0; background:var(--amber); }
.jj-weapon .k { margin-top:6px; font-size:10.5px; color:rgba(243,239,230,.4); }
.jj-tip { position:absolute; left:50%; bottom:26px; transform:translateX(-50%); padding:10px 20px; font-size:12.5px;
  color:var(--dim); opacity:0; transition:opacity .5s; text-align:center; border-radius:999px; }
.jj-tip.show { opacity:1; } .jj-tip b { color:var(--ink); }
.jj-prompt { position:absolute; left:50%; bottom:92px; transform:translateX(-50%); padding:10px 22px; font-size:13.5px;
  font-weight:800; letter-spacing:.06em; color:#fff6e4; border-radius:999px; border-color:rgba(242,163,58,.5);
  background:rgba(44,28,8,.66); box-shadow:0 0 26px rgba(242,163,58,.25); }
.jj-xhair { position:absolute; left:50%; top:50%; width:0; height:0; pointer-events:none; z-index:21; --s:10px; }
.jj-xhair i { position:absolute; background:#fff; box-shadow:0 0 3px rgba(0,0,0,.85); opacity:0; transition:opacity .12s; }
.jj-xhair::before { content:""; position:absolute; left:-2px; top:-2px; width:4px; height:4px; border-radius:50%; background:#fff; box-shadow:0 0 3px rgba(0,0,0,.9); }
.jj-xhair.target::before { background:#ff5a45; }
.jj-xhair.target i { background:#ff5a45; }
.jj-xhair i:nth-child(1) { width:2px; height:9px; left:-1px; top:calc(-9px - var(--s)); }
.jj-xhair i:nth-child(2) { width:2px; height:9px; left:-1px; top:var(--s); }
.jj-xhair i:nth-child(3) { width:9px; height:2px; top:-1px; left:calc(-9px - var(--s)); }
.jj-xhair i:nth-child(4) { width:9px; height:2px; top:-1px; left:var(--s); }
.jj-xhair.aim i { opacity:1; }
.jj-xhair b { position:absolute; left:-13px; top:-13px; width:26px; height:26px; opacity:0; transition:opacity .15s; }
.jj-xhair b::before, .jj-xhair b::after { content:""; position:absolute; left:12px; top:-2px; width:2px; height:30px; background:#ff5a45; box-shadow:0 0 4px #000; transform:rotate(45deg); }
.jj-xhair b::after { transform:rotate(-45deg); }
.jj-xhair b.on { opacity:1; transition:none; }
.jj-xhair b.kill::before, .jj-xhair b.kill::after { background:#fff; }
.jj-scope { position:absolute; inset:0; pointer-events:none; z-index:19;
  background:radial-gradient(circle at 50% 50%, transparent 0, transparent 30vmin, #000 30.4vmin); }
.jj-scope::before, .jj-scope::after { content:""; position:absolute; background:rgba(0,0,0,.7); }
.jj-scope::before { left:50%; top:calc(50% - 30vmin); width:1px; height:60vmin; }
.jj-scope::after { top:50%; left:calc(50% - 30vmin); height:1px; width:60vmin; }
.jj-warn { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); padding:14px 26px; font-size:15px;
  font-weight:700; color:#ffd0c4; border-color:rgba(226,69,47,.5); background:rgba(60,12,6,.6); opacity:0; transition:opacity .3s; }
.jj-warn.show { opacity:1; }
.jj-count { position:absolute; left:50%; top:36%; transform:translate(-50%,-50%); z-index:25; pointer-events:none;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:clamp(72px,14vw,140px); font-weight:900; color:#fff; letter-spacing:-.03em;
  text-shadow:0 8px 44px rgba(0,0,0,.65), 0 0 34px rgba(255,150,60,.4); opacity:0; }
.jj-count.jj-pop { animation:jj-pop 1s cubic-bezier(.2,.8,.3,1) forwards; }
@keyframes jj-pop { 0% { opacity:0; transform:translate(-50%,-50%) scale(1.9); } 14% { opacity:1; transform:translate(-50%,-50%) scale(1); } 72% { opacity:1; } 100% { opacity:0; transform:translate(-50%,-50%) scale(.92); } }
.jj-touch { position:absolute; inset:0; z-index:22; pointer-events:none; }
.jj-tbtn { position:absolute; pointer-events:auto; width:74px; height:74px; border-radius:50%;
  background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.14); backdrop-filter:blur(6px);
  display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:#f3efe6;
  user-select:none; -webkit-user-select:none; touch-action:none; }
.jj-tbtn:active { background:rgba(226,69,47,.55); }
`;
