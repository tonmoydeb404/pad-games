/** HUD DOM construction. */
import type { JeepEngine } from "../jeep-engine";

export function buildHud(this: JeepEngine): void {
  const root = this.root;
  if (!root) return;
  root.insertAdjacentHTML(
    "beforeend",
    `<div class="jj-grade"></div><div class="jj-vig"></div>
    <div class="jj-hud" data-mode="foot">
      <div class="jj-hurt" data-el="hurt"></div>
      <div class="jj-compass" data-el="compass">N</div>
      <div class="jj-notice" data-el="notice"></div>
      <div class="jj-vitals">
        <div class="jj-vital"><span>HP</span><div class="jj-bar"><i data-el="hp"></i></div></div>
        <div class="jj-vital" data-foot><span>ST</span><div class="jj-bar jj-sta"><i data-el="sta"></i></div></div>
      </div>
      <div class="jj-weapon" data-el="weapon" hidden>
        <div class="n" data-el="wName">Fists</div>
        <div class="a" data-el="wAmmo"></div>
        <div class="r"><i data-el="wReload"></i></div>
        <div class="k" data-el="wKeys"></div>
      </div>
      <div class="jj-drive">
        <div class="jj-spd" data-el="spd">0</div>
        <div class="jj-spdu"><span data-el="spdu">km/h</span><span class="jj-lamp"><i class="jj-dot" data-el="hLampDot"></i><span data-el="hLamp">Lights</span></span></div>
      </div>
      <div class="jj-prompt" data-el="prompt" hidden></div>
      <div class="jj-xhair" data-el="xhair" hidden><i></i><i></i><i></i><i></i><b data-el="hitm"></b></div>
      <div class="jj-scope" data-el="scope" hidden></div>
      <div class="jj-tip" data-el="tip"></div>
      <div class="jj-warn" data-el="warn">Jeep overturned. Press <b>RB / R</b> to recover</div>
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
