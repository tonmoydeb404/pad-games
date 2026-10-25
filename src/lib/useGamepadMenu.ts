"use client";

/**
 * Gamepad menu navigation for React overlays (store grid, start/pause menus).
 * Polls the Gamepad API on a rAF loop and reports high-level actions with
 * edge detection + key repeat for held directions. Keyboard focus still works
 * natively: focused elements are real <button>/<a> elements, and this hook
 * only *moves* focus / clicks — it never swallows keyboard events.
 *
 * Standard mapping: dpad 12-15, A = 0, B = 1, Start = 9, left stick axes 0/1.
 */

import { useEffect, useRef } from "react";

export type PadMenuAction = "up" | "down" | "left" | "right" | "confirm" | "back";

const STICK_EDGE = 0.55;
const FIRST_REPEAT_MS = 340;
const REPEAT_MS = 150;

interface PadPrev {
  buttons: boolean[];
  stick: { x: number; y: number };
}

export function useGamepadMenu(
  enabled: boolean,
  onAction: (action: PadMenuAction) => void,
): void {
  const handlerRef = useRef(onAction);
  useEffect(() => {
    handlerRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator.getGamepads !== "function") return;

    const prevs = new Map<number, PadPrev>();
    const repeatAt: Record<string, number> = {};
    let raf = 0;
    const poll = (now: number) => {
      raf = requestAnimationFrame(poll);

      const pads = [...navigator.getGamepads()].filter(
        (gp): gp is Gamepad => gp !== null && gp.connected,
      );
      if (pads.length === 0) {
        prevs.clear();
        return;
      }
      const gp = pads[0];
      // First frame for a pad: record state without firing edges, so a button
      // that is already held when the overlay mounts (e.g. Start) doesn't
      // immediately trigger an action.
      if (!prevs.has(gp.index)) {
        prevs.set(gp.index, {
          buttons: gp.buttons.map((b) => b.pressed),
          stick: {
            x: (gp.axes[0] ?? 0) > STICK_EDGE ? 1 : (gp.axes[0] ?? 0) < -STICK_EDGE ? -1 : 0,
            y: (gp.axes[1] ?? 0) > STICK_EDGE ? 1 : (gp.axes[1] ?? 0) < -STICK_EDGE ? -1 : 0,
          },
        });
        return;
      }
      const btn = (i: number) => !!gp.buttons[i] && gp.buttons[i].pressed;
      const prev = prevs.get(gp.index)!;

      const lx = gp.axes[0] ?? 0;
      const ly = gp.axes[1] ?? 0;
      const stickDir = {
        x: lx > STICK_EDGE ? 1 : lx < -STICK_EDGE ? -1 : 0,
        y: ly > STICK_EDGE ? 1 : ly < -STICK_EDGE ? -1 : 0,
      };

      const dirs: {
        action: "up" | "down" | "left" | "right";
        held: boolean;
      }[] = [
        { action: "up", held: btn(12) || stickDir.y < 0 },
        { action: "down", held: btn(13) || stickDir.y > 0 },
        { action: "left", held: btn(14) || stickDir.x < 0 },
        { action: "right", held: btn(15) || stickDir.x > 0 },
      ];
      const prevDir = {
        up: prev.buttons[12] || prev.stick.y < 0,
        down: prev.buttons[13] || prev.stick.y > 0,
        left: prev.buttons[14] || prev.stick.x < 0,
        right: prev.buttons[15] || prev.stick.x > 0,
      };

      for (const { action, held } of dirs) {
        if (!held) {
          delete repeatAt[action];
          continue;
        }
        const edge = !prevDir[action];
        if (edge) {
          handlerRef.current(action);
          repeatAt[action] = now + FIRST_REPEAT_MS;
        } else if (repeatAt[action] !== undefined && now >= repeatAt[action]) {
          handlerRef.current(action);
          repeatAt[action] = now + REPEAT_MS;
        }
      }

      const fireEdge = (index: number, action: PadMenuAction) => {
        const pressed = btn(index);
        if (pressed && !prev.buttons[index]) handlerRef.current(action);
        return pressed;
      };
      fireEdge(0, "confirm"); // A
      fireEdge(1, "back"); // B
      fireEdge(9, "confirm"); // Start

      prevs.set(gp.index, {
        buttons: gp.buttons.map((b) => b.pressed),
        stick: stickDir,
      });
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}

/** Fire a light rumble pulse on menu actions (feature-detected, best effort). */
export function padMenuRumble(kind: "move" | "confirm" = "move"): void {
  if (typeof navigator.getGamepads !== "function") return;
  const gp = [...navigator.getGamepads()].find(
    (g): g is Gamepad => g !== null && g.connected,
  );
  if (!gp) return;
  const act = (
    gp as Gamepad & {
      vibrationActuator?: {
        playEffect: (t: string, o: Record<string, number>) => Promise<string>;
      };
    }
  ).vibrationActuator;
  if (!act || typeof act.playEffect !== "function") return;
  try {
    void act.playEffect("dual-rumble", {
      startDelay: 0,
      duration: kind === "confirm" ? 70 : 35,
      weakMagnitude: kind === "confirm" ? 0.3 : 0.12,
      strongMagnitude: kind === "confirm" ? 0.22 : 0,
    });
  } catch {
    // Unsupported pad — silence is the correct fallback.
  }
}
