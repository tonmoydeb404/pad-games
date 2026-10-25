"use client";

/**
 * GameShell: owns the game lifecycle, the gamepad-navigable menus, the HUD
 * and the bridge between the engine's event emitter and React state. Only
 * slow-changing values cross the boundary (~10 Hz HUD, state changes).
 */

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Game } from "@/game/core/game";
import type {
  GameState,
  HudData,
  MenuAction,
  RunSummary,
  Settings,
  ToastEvent,
} from "@/game/core/types";
import { HUD_SCALES, initialHud } from "@/game/core/types";
import { settingsStore } from "@/lib/settings";
import { backendKind, submitScore } from "@/lib/supabase";
import DebugPanel from "./DebugPanel";
import { Hud } from "./Hud";
import {
  BootOverlay,
  GameOverMenu,
  PauseMenu,
  SettingsPanel,
  StartMenu,
  type MenuItem,
} from "./Menus";

// SSR disabled: the engine touches window/navigator at init.
const GameCanvas = dynamic(() => import("./GameCanvas"), { ssr: false });

type Overlay = "none" | "settings";
type SubmitState = "idle" | "saving" | "saved" | "error";

/** Hydration probe: false on the server render, true on the client. */
const subscribeNever = () => () => {};

export default function GameShell() {
  const router = useRouter();
  const gameRef = useRef<Game | null>(null);
  const unsubRef = useRef<Array<() => void>>([]);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<HudData>(initialHud);
  const [state, setState] = useState<GameState>("booting");
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [toasts, setToasts] = useState<ToastEvent[]>([]);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [focusIndex, setFocusIndex] = useState(0);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | undefined>();

  // Settings live in an external store (hydration-safe, no boot effect).
  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.get,
    settingsStore.getServer,
  );
  // True only after hydration — for client-only derived strings.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const dailyLabel = hydrated
    ? new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const debugUrl =
    hydrated &&
    new URLSearchParams(window.location.search).get("debug") === "1";

  // Latest-values mirror for the (stable) menu-nav handler.
  const navRef = useRef({ state, overlay, focus: 0, items: [] as MenuItem[] });
  const settingsRef = useRef(settings);
  const lastModeRef = useRef<"daily" | "free">("daily");

  const updateSettings = useCallback((next: Settings) => {
    settingsStore.set(next);
    gameRef.current?.applySettings(next);
  }, []);

  const pushToast = useCallback((t: ToastEvent) => {
    setToasts((prev) => [...prev.slice(-2), t]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 2400);
  }, []);

  // ------------------------------------------------------------------
  // Run actions
  // ------------------------------------------------------------------

  const startRun = useCallback(
    (mode: "daily" | "free") => {
      const g = gameRef.current;
      if (!g) return;
      lastModeRef.current = mode;
      setSummary(null);
      setSubmitState("idle");
      setSubmitError(undefined);
      setOverlay("none");
      setFocusIndex(0);
      g.uiSound("confirm");
      g.startRun(mode);
    },
    [],
  );

  const restartRun = useCallback(() => {
    startRun(lastModeRef.current);
  }, [startRun]);

  const quitToMenu = useCallback(() => {
    setSummary(null);
    setOverlay("none");
    setFocusIndex(0);
    gameRef.current?.quitToMenu();
  }, []);

  // ------------------------------------------------------------------
  // Menu wiring
  // ------------------------------------------------------------------

  const settingsItems = useMemo<MenuItem[]>(
    () => [
      {
        label: "Music",
        onSelect: () =>
          updateSettings({ ...settingsRef.current, music: !settingsRef.current.music }),
        value: () => (settings.music ? "On" : "Off"),
      },
      {
        label: "Sound FX",
        onSelect: () =>
          updateSettings({ ...settingsRef.current, sfx: !settingsRef.current.sfx }),
        value: () => (settings.sfx ? "On" : "Off"),
      },
      {
        label: "Rumble",
        onSelect: () =>
          updateSettings({ ...settingsRef.current, rumble: !settingsRef.current.rumble }),
        value: () => (settings.rumble ? "On" : "Off"),
      },
      {
        label: "Screen shake",
        onSelect: () =>
          updateSettings({ ...settingsRef.current, shake: !settingsRef.current.shake }),
        value: () => (settings.shake ? "On" : "Off"),
      },
      {
        label: "Reduce motion",
        hint: "Freezes & squash",
        onSelect: () =>
          updateSettings({
            ...settingsRef.current,
            reducedMotion: !settingsRef.current.reducedMotion,
          }),
        value: () => (settings.reducedMotion ? "On" : "Off"),
      },
      {
        label: "High contrast orbs",
        hint: "Colorblind",
        onSelect: () =>
          updateSettings({
            ...settingsRef.current,
            highContrast: !settingsRef.current.highContrast,
          }),
        value: () => (settings.highContrast ? "On" : "Off"),
      },
      {
        label: "HUD text size",
        onSelect: () => {
          const opts = HUD_SCALES;
          const idx = opts.indexOf(
            settingsRef.current.hudScale as (typeof opts)[number],
          );
          const next = opts[(Math.max(0, idx) + 1) % opts.length] ?? opts[0];
          updateSettings({ ...settingsRef.current, hudScale: next });
        },
        value: () => `${Math.round(settings.hudScale * 100)}%`,
      },
      {
        label: "Show FPS",
        onSelect: () =>
          updateSettings({ ...settingsRef.current, showFps: !settingsRef.current.showFps }),
        value: () => (settings.showFps ? "On" : "Off"),
      },
      {
        label: "Debug sliders",
        onSelect: () =>
          updateSettings({ ...settingsRef.current, debug: !settingsRef.current.debug }),
        value: () => (settings.debug ? "On" : "Off"),
      },
      {
        label: "Back",
        onSelect: () => {
          setOverlay("none");
          setFocusIndex(0);
        },
      },
    ],
    [settings, updateSettings],
  );

  const menuItems = useMemo<MenuItem[]>(
    () => [
      { label: "Daily Run", hint: "One seed, everyone", onSelect: () => startRun("daily") },
      { label: "Free Ride", hint: "Random dunes", onSelect: () => startRun("free") },
      {
        label: "Settings",
        onSelect: () => {
          setOverlay("settings");
          setFocusIndex(0);
        },
      },
      { label: "Input Test", hint: "Pad check", onSelect: () => router.push("/input-test") },
      { label: "Leaderboard", onSelect: () => router.push("/leaderboard") },
    ],
    [router, startRun],
  );

  const pauseItems = useMemo<MenuItem[]>(
    () => [
      {
        label: "Resume",
        onSelect: () => {
          gameRef.current?.uiSound("confirm");
          gameRef.current?.resume();
        },
      },
      { label: "Restart", onSelect: restartRun },
      {
        label: "Settings",
        onSelect: () => {
          setOverlay("settings");
          setFocusIndex(0);
        },
      },
      { label: "Quit to Menu", onSelect: quitToMenu },
    ],
    [quitToMenu, restartRun],
  );

  const gameoverItems = useMemo<MenuItem[]>(
    () => [
      { label: "Ride Again", onSelect: restartRun },
      { label: "Menu", onSelect: quitToMenu },
      { label: "Leaderboard", onSelect: () => router.push("/leaderboard") },
    ],
    [quitToMenu, restartRun, router],
  );

  const items = useMemo<MenuItem[]>(
    () =>
      overlay === "settings"
        ? settingsItems
        : state === "menu"
          ? menuItems
          : state === "paused"
            ? pauseItems
            : state === "gameover"
              ? gameoverItems
              : [],
    [overlay, state, settingsItems, menuItems, pauseItems, gameoverItems],
  );

  // Sync the nav mirror after commit — never during render.
  useEffect(() => {
    navRef.current = { state, overlay, focus: focusIndex, items };
    settingsRef.current = settings;
  }, [state, overlay, focusIndex, items, settings]);

  const activate = useCallback((item: MenuItem) => {
    item.onSelect();
  }, []);

  const handleMenuAction = useCallback(
    (action: MenuAction) => {
      const nav = navRef.current;
      if (nav.state === "running" || nav.state === "booting") return;
      const items = nav.items;
      if (!items.length) return;

      if (action === "up" || action === "down") {
        setFocusIndex((i) => {
          const dir = action === "up" ? -1 : 1;
          return (i + dir + items.length) % items.length;
        });
        gameRef.current?.uiSound("move");
        return;
      }
      if ((action === "left" || action === "right") && nav.overlay === "settings") {
        const item = items[nav.focus];
        if (item) activate(item);
        return;
      }
      if (action === "confirm") {
        const item = items[nav.focus];
        if (item) activate(item);
        return;
      }
      if (action === "back") {
        if (nav.overlay === "settings") {
          setOverlay("none");
          setFocusIndex(0);
          gameRef.current?.uiSound("back");
        } else if (nav.state === "paused") {
          gameRef.current?.resume();
        } else if (nav.state === "gameover") {
          quitToMenu();
        }
      }
    },
    [activate, quitToMenu],
  );

  // ------------------------------------------------------------------
  // Game lifecycle
  // ------------------------------------------------------------------

  const onGameReady = useCallback(
    (game: Game) => {
      gameRef.current = game;
      const unsubs = unsubRef.current;
      unsubs.push(
        game.events.on("hud", setHud),
        game.events.on("state", setState),
        game.events.on("toast", pushToast),
        game.events.on("menu", handleMenuAction),
        game.events.on("runEnd", (run) => {
          setSummary(run);
          setFocusIndex(0);
          if (run.mode !== "daily" && run.mode !== "free") return;
          lastModeRef.current = run.mode;
          setSubmitState("saving");
          void submitScore({
            name: settingsRef.current.name,
            score: run.score,
            distance: run.distance,
            mode: run.mode,
            seed: run.seed,
            duration: run.duration,
          })
            .then((res) => {
              if (res.ok) setSubmitState("saved");
              else {
                setSubmitState("error");
                setSubmitError(res.error);
              }
            })
            .catch((err: unknown) => {
              setSubmitState("error");
              setSubmitError(err instanceof Error ? err.message : String(err));
            });
        }),
      );
      game.applySettings(settingsRef.current);
      // create() emitted its first state before we subscribed — catch up.
      setState(game.getState());
      setReady(true);
    },
    [handleMenuAction, pushToast],
  );

  // Unsubscribe + drop the game if the shell unmounts.
  useEffect(() => {
    return () => {
      for (const un of unsubRef.current) un();
      unsubRef.current = [];
      gameRef.current = null;
    };
  }, []);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="relative h-dvh w-full select-none overflow-hidden bg-slate-950">
      <GameCanvas onReady={onGameReady} settings={settings} />

      {!ready && <BootOverlay visible />}

      {ready && (state === "running" || state === "paused" || state === "crashing") && (
        <Hud hud={hud} toasts={toasts} showFps={settings.showFps} scale={settings.hudScale} />
      )}

      {ready && state === "menu" && (
        <StartMenu
          items={menuItems}
          focusIndex={focusIndex % Math.max(1, menuItems.length)}
          onFocus={setFocusIndex}
          padConnected={hud.padConnected}
          dailyLabel={dailyLabel}
        />
      )}

      {ready && state === "paused" && overlay === "none" && (
        <PauseMenu
          items={pauseItems}
          focusIndex={focusIndex % Math.max(1, pauseItems.length)}
          onFocus={setFocusIndex}
        />
      )}

      {ready && state === "gameover" && summary && (
        <GameOverMenu
          items={gameoverItems}
          focusIndex={focusIndex % Math.max(1, gameoverItems.length)}
          onFocus={setFocusIndex}
          summary={summary}
          submitState={submitState}
          submitError={submitError}
          backend={backendKind}
          name={settings.name}
          onNameChange={(name) => updateSettings({ ...settings, name })}
        />
      )}

      {ready && overlay === "settings" && (
        <SettingsPanel
          items={settingsItems}
          focusIndex={focusIndex % Math.max(1, settingsItems.length)}
          onFocus={setFocusIndex}
          settings={settings}
          onNameChange={(name) => updateSettings({ ...settings, name })}
        />
      )}

      <DebugPanel open={ready && (settings.debug || debugUrl)} />
    </div>
  );
}
