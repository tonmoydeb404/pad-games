"use client";

/**
 * Start-screen turntable of the selected explorer — the same rigged model
 * and skins the game uses (loadJungleCharacter), idling in its own canvas.
 * Drag horizontally to spin; otherwise it slowly turns.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { loadJungleCharacter, type JungleCharacter, type SkinId } from "@/game/player/character";

type PreviewState = "loading" | "ready" | "failed";

export function CharacterPreview({ skin }: { skin: SkinId }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const charRef = useRef<JungleCharacter | null>(null);
  const skinRef = useRef(skin);
  const [state, setState] = useState<PreviewState>("loading");

  useEffect(() => {
    skinRef.current = skin;
    // live swap once the model exists (initial load picks the current skin up)
    void charRef.current?.setSkin(skin);
  }, [skin]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let raf = 0;
    let cancelled = false;
    let rotY = Math.PI + 0.5; // the model faces -Z: start turned toward the camera
    let targetRotY = rotY;
    let dragging = false;
    let lastX = 0;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;cursor:grab";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    camera.position.set(0, 1.25, 5.2);
    camera.lookAt(0, 0.88, 0);
    scene.add(new THREE.HemisphereLight(0xe8ffe9, 0x18220f, 1.35));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.6);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 1.1);
    rim.position.set(-4, 3, -3);
    scene.add(rim);

    const stage = new THREE.Group();
    scene.add(stage);
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.01;
    stage.add(blob);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        // drag still works while the pointer stays inside
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      targetRotY += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    };
    const onUp = () => {
      dragging = false;
    };
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);

    void (async () => {
      const ch = await loadJungleCharacter(skinRef.current);
      if (cancelled) {
        ch?.dispose();
        return;
      }
      if (!ch) {
        setState("failed");
        return;
      }
      charRef.current = ch;
      stage.add(ch.root);
      ch.setSpeed(0);
      void ch.setSkin(skinRef.current); // the user may have switched while loading
      setState("ready");
    })();

    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      if (!dragging) targetRotY += 0.5 * dt;
      rotY += (targetRotY - rotY) * 0.12;
      stage.rotation.y = rotY;
      charRef.current?.update(dt);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      charRef.current?.dispose();
      charRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={hostRef}
        className="h-64 w-full touch-none overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(120%_120%_at_50%_0%,#1a2617_0%,#0c120b_70%)]"
      />
      {state !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-lg bg-black/55 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
            {state === "loading" ? "Loading character…" : "Model unavailable"}
          </span>
        </div>
      )}
      <span className="pointer-events-none absolute right-2.5 top-2.5 rounded bg-black/45 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
        drag to spin
      </span>
    </div>
  );
}
