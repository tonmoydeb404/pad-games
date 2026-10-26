/** Dispatches queued one-shot input actions (camera, combat, weapons, enter/exit, horn...). */
import { MODES } from "../config/foot-constants";
import type { JeepEngine } from "../jeep-engine";

/** Drains the input action queue and performs each action for the current mode. */
export function handleActions(this: JeepEngine): void {
  for (const action of this.input.consumeActions()) {
    // knocked out: the enter / reset buttons get you back on your feet
    if (this.onFoot && this.foot.downT > 0) {
      if (action === "enter" || action === "reset") this.recoverFromKnockout();
      continue;
    }
    switch (action) {
      case "camera":
        if (this.onFoot) {
          const f = this.foot;
          if (f.downT <= 0 && f.act !== "roll" && !this.riding) {
            f.crouch = !f.crouch;
            this.notify(f.crouch ? "Crouching — animals notice you less" : "Standing");
          }
        } else this.setCameraMode(this.camMode + 1);
        break;
      case "punch":
      case "kick":
      case "roll":
        if (this.onFoot) this.startAction(action);
        break;
      case "special":
        if (this.riding) this.mountSpecial();
        break;
      case "reload":
        if (this.onFoot && this.armory.gun) this.reloadGun();
        break;
      case "weaponNext":
        if (this.onFoot) this.switchWeapon(-1);
        break;
      case "weapon0":
      case "weapon1":
      case "weapon2":
      case "weapon3":
      case "weapon4":
      case "weapon5":
        if (this.onFoot) this.switchWeapon(Number(action.slice(6)));
        break;
      case "undercam":
        if (!this.onFoot) this.setCameraMode(MODES.indexOf("under"));
        break;
      case "enter":
        if (this.onFoot) this.tryEnterOrMount();
        else this.tryExitCar();
        break;
      case "headlights":
        if (!this.onFoot) this.toggleHeadlights();
        else this.switchWeapon(-1); // dpad ↓ on foot cycles weapons
        break;
      case "horn":
        if (!this.onFoot) {
          this.audio.horn();
          this.notify("BEEP BEEP!");
        } else if (this.riding) this.mountCall();
        break;
      case "reset":
        if (this.onFoot && this.armory.gun) this.reloadGun(); // R reloads with a gun out; holster (0) to warp
        else this.resetVehicle();
        break;
      case "pause": this.pause(); break;
      case "inventory": this.pause("inventory"); break;
      case "mute": {
        const m = this.audio.toggle();
        this.notify(m ? "Audio muted" : "Audio on");
        break;
      }
    }
  }
}
