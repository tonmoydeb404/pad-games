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
.jj-hud { position:absolute; inset:0; z-index:20; pointer-events:none; opacity:0; transition:opacity .7s ease; }
.jj-hud.on { opacity:1; }
.jj-panel { background:rgba(10,14,10,.46); border:1px solid rgba(255,255,255,.14); border-radius:14px;
  backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); box-shadow:0 8px 26px rgba(0,0,0,.3);
  color:#f3efe6; font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
.jj-speedo { position:absolute; right:calc(22px + env(safe-area-inset-right,0px)); bottom:calc(22px + env(safe-area-inset-bottom,0px)); padding:14px 20px 12px; min-width:168px; text-align:right; }
.jj-spd { font-size:44px; font-weight:800; line-height:.92; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.jj-spdu { font-size:11px; letter-spacing:.22em; color:rgba(243,239,230,.62); margin-top:5px; }
.jj-gears { display:flex; gap:6px; justify-content:flex-end; margin-top:11px; }
.jj-gears div { font-size:11px; font-weight:800; color:rgba(255,255,255,.26); width:20px; text-align:center; }
.jj-gears div.on { color:#ff7a5c; }
.jj-bars { margin-top:11px; display:grid; gap:5px; }
.jj-bwrap { height:5px; background:rgba(255,255,255,.11); border-radius:3px; overflow:hidden; }
.jj-bwrap i { display:block; height:100%; width:0%; border-radius:3px; transition:width .08s linear; }
.jj-thr i { background:#78d18a; } .jj-brk i { background:#ef5b45; }
.jj-hp i { background:#78d18a; }
.jj-brow { display:flex; align-items:center; gap:7px; }
.jj-blbl { font-size:9px; font-weight:800; letter-spacing:.16em; color:rgba(243,239,230,.62); width:20px; text-align:left; flex:none; }
.jj-topleft { position:absolute; left:calc(22px + env(safe-area-inset-left,0px)); top:calc(20px + env(safe-area-inset-top,0px)); padding:12px 16px; font-size:12.5px; line-height:1.75; min-width:180px; }
.jj-topleft .k { color:rgba(243,239,230,.62); display:inline-block; min-width:74px; }
.jj-topleft .v { font-weight:700; }
.jj-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,.2); margin-right:6px; vertical-align:middle; }
.jj-dot.on { background:#ffd479; box-shadow:0 0 9px #ffd479; }
.jj-notice { position:absolute; left:50%; top:34px; transform:translateX(-50%); padding:9px 20px; font-size:13px;
  font-weight:700; letter-spacing:.08em; text-transform:uppercase; opacity:0; transition:opacity .35s; }
.jj-notice.show { opacity:1; }
.jj-tip { position:absolute; left:50%; bottom:26px; transform:translateX(-50%); padding:10px 20px; font-size:12.5px;
  color:rgba(243,239,230,.62); opacity:0; transition:opacity .5s; text-align:center; }
.jj-tip.show { opacity:1; } .jj-tip b { color:#f3efe6; }
.jj-weapon { position:absolute; right:calc(22px + env(safe-area-inset-right,0px)); bottom:calc(172px + env(safe-area-inset-bottom,0px)); padding:10px 16px; min-width:168px; text-align:right; }
.jj-weapon .n { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:rgba(243,239,230,.55); }
.jj-weapon .a { font-size:26px; font-weight:800; line-height:1.1; font-variant-numeric:tabular-nums; }
.jj-weapon .a small { font-size:13px; font-weight:700; opacity:.55; }
.jj-weapon .a.low { color:#ff8a70; }
.jj-weapon .r { height:3px; margin-top:7px; border-radius:2px; background:rgba(255,255,255,.12); overflow:hidden; }
.jj-weapon .r i { display:block; height:100%; width:0; background:#ffb84a; }
.jj-weapon .k { margin-top:6px; font-size:10.5px; color:rgba(243,239,230,.4); }
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
.jj-compass { position:absolute; left:50%; top:calc(18px + env(safe-area-inset-top,0px)); transform:translateX(-50%); padding:6px 16px; font-size:12px;
  letter-spacing:.18em; font-weight:700; color:rgba(243,239,230,.62); }
.jj-pad { position:absolute; left:calc(22px + env(safe-area-inset-left,0px)); bottom:calc(22px + env(safe-area-inset-bottom,0px)); padding:8px 14px; font-size:11px; letter-spacing:.14em;
  text-transform:uppercase; color:rgba(243,239,230,.55); }
.jj-prompt { position:absolute; left:50%; bottom:84px; transform:translateX(-50%); padding:10px 22px; font-size:14px;
  font-weight:800; letter-spacing:.06em; color:#eaffea; border-color:rgba(120,209,138,.45);
  background:rgba(12,42,18,.62); box-shadow:0 0 24px rgba(80,200,110,.25); }
.jj-count { position:absolute; left:50%; top:36%; transform:translate(-50%,-50%); z-index:25; pointer-events:none;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:clamp(72px,14vw,140px); font-weight:900; color:#fff; letter-spacing:-.03em;
  text-shadow:0 8px 44px rgba(0,0,0,.65), 0 0 34px rgba(255,150,60,.4); opacity:0; }
.jj-count.jj-pop { animation:jj-pop 1s cubic-bezier(.2,.8,.3,1) forwards; }
@keyframes jj-pop { 0% { opacity:0; transform:translate(-50%,-50%) scale(1.9); } 14% { opacity:1; transform:translate(-50%,-50%) scale(1); } 72% { opacity:1; } 100% { opacity:0; transform:translate(-50%,-50%) scale(.92); } }
.jj-time-best .v { font-variant-numeric:tabular-nums; }
.jj-touch { position:absolute; inset:0; z-index:22; pointer-events:none; }
.jj-tbtn { position:absolute; pointer-events:auto; width:74px; height:74px; border-radius:50%;
  background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.14); backdrop-filter:blur(6px);
  display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:#f3efe6;
  user-select:none; -webkit-user-select:none; touch-action:none; }
.jj-tbtn:active { background:rgba(226,69,47,.55); }
`;
