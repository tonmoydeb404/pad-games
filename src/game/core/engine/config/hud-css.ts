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
.jj-hud { position:absolute; inset:0; z-index:20; pointer-events:none; opacity:0; transition:opacity .7s ease;
  --bone:#e6e0cb; --drab:#1f261a; --plate:rgba(24,30,19,.58); --khaki:#a9a47d; --signal:#c4432c;
  font-family:var(--font-body),"Arial Narrow",Arial,sans-serif; color:var(--bone); text-shadow:0 1px 3px rgba(0,0,0,.7); }
.jj-hud.on { opacity:1; }
.jj-compass, .jj-notice, .jj-vitals, .jj-weapon, .jj-drive, .jj-tip { backdrop-filter:blur(10px) saturate(1.1); -webkit-backdrop-filter:blur(10px) saturate(1.1); }
.jj-hurt { position:absolute; inset:0; opacity:0; transition:opacity .2s; background:radial-gradient(ellipse at center, transparent 28%, rgba(196,67,44,.45) 62%, rgba(150,32,20,.85) 100%); }
.jj-compass { position:absolute; left:50%; top:calc(16px + env(safe-area-inset-top,0px)); transform:translateX(-50%);
  padding:7px 14px; background:var(--plate); text-shadow:none; font:500 13px/1 var(--font-data),ui-monospace,monospace; letter-spacing:.14em; }
.jj-notice { position:absolute; left:50%; top:calc(54px + env(safe-area-inset-top,0px)); transform:translateX(-50%); max-width:70vw; text-align:center; padding:8px 18px; background:var(--plate); text-shadow:none;
  font:700 22px/1.1 var(--font-stencil),Impact,sans-serif; letter-spacing:.06em; text-transform:uppercase; opacity:0; transition:opacity .35s; }
.jj-notice.show { opacity:1; }
.jj-vitals { position:absolute; left:calc(24px + env(safe-area-inset-left,0px)); bottom:calc(24px + env(safe-area-inset-bottom,0px)); width:min(240px,40vw);
  display:grid; gap:6px; padding:10px 12px; background:var(--plate); text-shadow:none; }
.jj-vital { display:flex; align-items:center; gap:10px; }
.jj-vital span { font:700 15px/1 var(--font-stencil),Impact,sans-serif; letter-spacing:.08em; width:22px; flex:none; }
.jj-bar { height:10px; flex:1; border:1px solid rgba(230,224,203,.55); padding:1px; }
.jj-bar i { display:block; height:100%; width:0%; background:var(--bone); transition:width .12s linear; }
.jj-sta i { background:var(--khaki); }
.jj-weapon { position:absolute; right:calc(24px + env(safe-area-inset-right,0px)); bottom:calc(24px + env(safe-area-inset-bottom,0px)); min-width:150px; padding:10px 14px; background:var(--plate); text-align:right; text-shadow:none; }
.jj-weapon .n { font:700 14px/1 var(--font-stencil),Impact,sans-serif; letter-spacing:.1em; text-transform:uppercase; color:var(--khaki); }
.jj-weapon .a { margin-top:4px; font:700 40px/1 var(--font-stencil),Impact,sans-serif; font-variant-numeric:tabular-nums; }
.jj-weapon .a small { font-size:18px; opacity:.6; }
.jj-weapon .a.low { color:var(--signal); }
.jj-weapon .r { height:2px; margin-top:6px; background:rgba(230,224,203,.2); }
.jj-weapon .r i { display:block; height:100%; width:0; background:var(--bone); }
.jj-weapon .k { margin-top:6px; font:400 11px/1.2 var(--font-data),ui-monospace,monospace; color:var(--khaki); }
.jj-drive { position:absolute; right:calc(24px + env(safe-area-inset-right,0px)); bottom:calc(24px + env(safe-area-inset-bottom,0px)); padding:10px 16px; background:var(--plate); text-align:right; text-shadow:none; }
.jj-hud[data-mode=foot] .jj-drive { display:none; }
.jj-spd { font:800 56px/.9 var(--font-stencil),Impact,sans-serif; font-variant-numeric:tabular-nums; }
.jj-spdu { display:flex; gap:14px; justify-content:space-between; margin-top:6px; font:400 11px/1 var(--font-data),ui-monospace,monospace; color:var(--khaki); }
.jj-lamp { display:inline-flex; align-items:center; gap:6px; }
.jj-dot { display:inline-block; width:7px; height:7px; background:rgba(230,224,203,.25); }
.jj-dot.on { background:#ffd479; }
.jj-prompt { position:absolute; left:50%; bottom:calc(72px + env(safe-area-inset-bottom,0px)); transform:translateX(-50%); padding:8px 16px;
  background:var(--bone); color:var(--drab); text-shadow:none; font:600 15px/1 var(--font-body),Arial,sans-serif; letter-spacing:.02em; }
.jj-tip { position:absolute; left:50%; bottom:calc(24px + env(safe-area-inset-bottom,0px)); transform:translateX(-50%); max-width:min(1000px,84vw); text-align:center; padding:8px 16px; background:var(--plate); text-shadow:none;
  font:400 12px/1.4 var(--font-data),ui-monospace,monospace; color:var(--bone); opacity:0; transition:opacity .5s; }
.jj-tip.show { opacity:1; } .jj-tip b { font-weight:500; color:#fff; }
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
.jj-warn { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); padding:12px 22px; font:600 17px/1.2 var(--font-body),Arial,sans-serif;
  background:var(--signal); color:#fff; text-shadow:none; opacity:0; transition:opacity .3s; }
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
