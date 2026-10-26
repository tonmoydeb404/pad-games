/** HUD DOM construction. */
import type { JeepEngine } from "../jeep-engine";

export function buildHud(this: JeepEngine): void {
  const root = this.root;
  if (!root) return;
  root.insertAdjacentHTML(
    "beforeend",
    `<div class="jj-grade"></div><div class="jj-vig"></div>
    <div class="jj-hud">
      <div class="jj-panel jj-compass" data-el="compass">N</div>
      <div class="jj-panel jj-topleft">
        <div data-car><span class="k">Camera</span><span class="v" data-el="hCam">Chase</span></div>
        <div data-car><span class="k">Lights</span><span class="v"><span class="jj-dot" data-el="hLampDot"></span><span data-el="hLamp">Off</span></span></div>
        <div><span class="k">Surface</span><span class="v" data-el="hSurf">Dirt</span></div>
        <div data-car><span class="k">Loop</span><span class="v" data-el="hLap">0 · 0%</span></div>
        <div><span class="k">Wildlife</span><span class="v" data-el="hKills">0</span></div>
        <div class="jj-time-best" data-car><span class="k">Time</span><span class="v" data-el="hTime">0:00.00</span></div>
        <div class="jj-time-best" data-car><span class="k">Best</span><span class="v" data-el="hBest">—</span></div>
      </div>
      <div class="jj-panel jj-speedo">
        <div class="jj-spd" data-el="spd">0</div>
        <div class="jj-spdu" data-el="spdu">KM / H</div>
        <div class="jj-gears">
          <div data-g="P">P</div><div data-g="R">R</div><div data-g="N">N</div><div data-g="D" class="on">D</div>
        </div>
        <div class="jj-bars">
          <div class="jj-brow"><span class="jj-blbl">HP</span><div class="jj-bwrap jj-hp"><i data-el="hp"></i></div></div>
          <div class="jj-bwrap jj-thr" data-el="thrRow"><i data-el="thr"></i></div>
          <div class="jj-bwrap jj-brk" data-el="brkRow"><i data-el="brk"></i></div>
        </div>
      </div>
      <div class="jj-panel jj-notice" data-el="notice">Chase camera</div>
      <div class="jj-panel jj-prompt" data-el="prompt" hidden>F — enter the jeep</div>
      <div class="jj-panel jj-weapon" data-el="weapon" hidden>
        <div class="n" data-el="wName">Fists</div>
        <div class="a" data-el="wAmmo"></div>
        <div class="r"><i data-el="wReload"></i></div>
        <div class="k" data-el="wKeys">1–5 draw a gun</div>
      </div>
      <div class="jj-xhair" data-el="xhair" hidden><i></i><i></i><i></i><i></i><b data-el="hitm"></b></div>
      <div class="jj-scope" data-el="scope" hidden></div>
      <div class="jj-panel jj-tip" data-el="tip"><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>J</b> punch · <b>K</b> kick · <b>F</b> vehicle</div>
      <div class="jj-panel jj-warn" data-el="warn">Jeep overturned — press <b>RB / R</b> to recover</div>
      <div class="jj-panel jj-pad" data-el="pad">Keyboard · plug in a gamepad</div>
    </div>
    <div class="jj-count" data-el="count"></div>
    <div class="jj-touch" data-el="touch" hidden>
      <div class="jj-tbtn" data-t="left" style="left:24px;bottom:34px;">◀</div>
      <div class="jj-tbtn" data-t="right" style="left:118px;bottom:34px;">▶</div>
      <div class="jj-tbtn" data-t="gas" style="right:24px;bottom:120px;">▲</div>
      <div class="jj-tbtn" data-t="brake" style="right:24px;bottom:34px;">▼</div>
      <div class="jj-tbtn" data-t="cam" style="right:118px;bottom:34px;font-size:14px;">CAM</div>
      <div class="jj-tbtn" data-t="punch" data-foot style="right:212px;bottom:120px;font-size:12px;" hidden>PUNCH</div>
      <div class="jj-tbtn" data-t="kick" data-foot style="right:212px;bottom:34px;font-size:12px;" hidden>KICK</div>
      <div class="jj-tbtn" data-t="enter" style="right:118px;bottom:120px;font-size:13px;">CAR</div>
    </div>`,
  );
  for (const el of root.querySelectorAll<HTMLElement>("[data-el]")) {
    this.el[el.dataset.el as string] = el;
  }
  this.gearEls = [...root.querySelectorAll<HTMLElement>(".jj-gears div")];
  this.updatePadChip(this.input.connected, this.input.padId);
  const touchBox = root.querySelector<HTMLElement>("[data-el=touch]");
  if (touchBox && this.input.touchActive) {
    touchBox.hidden = false;
    const bind = (sel: string, down: () => void, up?: () => void) => {
      const b = touchBox.querySelector<HTMLElement>(`[data-t=${sel}]`);
      if (b) this.input.bindTouchButton(b, down, up);
    };
    bind("gas", () => this.input.setTouchPedal("gas", true), () => this.input.setTouchPedal("gas", false));
    bind("brake", () => this.input.setTouchPedal("brake", true), () => this.input.setTouchPedal("brake", false));
    bind("left", () => this.input.setTouchSteer(-1), () => this.input.setTouchSteer(0));
    bind("right", () => this.input.setTouchSteer(1), () => this.input.setTouchSteer(0));
    bind("cam", () => {
      if (this.onFoot) this.input.pushAction("camera"); // crouch
      else this.setCameraMode(this.camMode + 1);
    });
    bind("punch", () => this.input.pushAction(this.riding ? "special" : "punch"));
    bind("kick", () => this.input.pushAction(this.riding ? "special" : "kick"));
    bind("enter", () => this.input.pushAction("enter"));
  }
}
