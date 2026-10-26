"use client";

/**
 * Start-screen 3D preview of the selected ride — a small turntable renderer
 * in its own canvas.
 *
 * Kenney rides load through loadCar() (shared cache with the engine — the
 * first selection warms both). The classic "Jungle Jeep" is procedural
 * inside the engine, so the shell hands us a clone of the engine-built rig
 * via getJeepRig() — until the engine is online we show a placeholder.
 *
 * Drag horizontally to spin; otherwise it auto-rotates.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { loadCar } from "@/game/player/cars";
import { mountCar } from "./mount-car";
import { PreviewPlaceholder, PreviewStatus, type PreviewState } from "./preview-parts";

export interface VehiclePreviewProps {
  /** Kenney vehicle id; null = classic jeep (engine-built). */
  vehicleId: string | null;
  /** Returns a jeep rig clone (wheels on y=0); null while the engine boots. */
  getJeepRig?: () => THREE.Group | null;
  /** Flips true once the engine can serve rigs. */
  rigReady?: boolean;
}

export function VehiclePreview({ vehicleId, getJeepRig, rigReady }: VehiclePreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<PreviewState>("loading");
  /** Whether anything renderable exists for the current selection. */
  const hasModel = vehicleId !== null || rigReady === true;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let raf = 0;
    let cancelled = false;
    let rotY = 0.9; // pleasant 3/4 start angle
    let targetRotY = rotY;
    let dragging = false;
    let lastX = 0;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "grab";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);

    scene.add(new THREE.HemisphereLight(0xe8ffe9, 0x18220f, 1.15));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
    key.position.set(4, 6, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.7);
    fill.position.set(-4, 3, -3);
    scene.add(fill);

    const carGroup = new THREE.Group();
    scene.add(carGroup);

    // cheap fake blob shadow (a circle is rotation-symmetric, so it can
    // live inside the spinning group)
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    carGroup.add(blob);

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
        // not fatal — drag still works while the pointer stays inside
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

    const frame = (len: number, height: number) => {
      const d = len * 1.9;
      camera.position.set(d * 0.62, height * 0.9 + 0.5, d * 0.95);
      camera.lookAt(0, height * 0.45, 0);
    };

    void (async () => {
      if (vehicleId) {
        const car = await loadCar(vehicleId);
        if (cancelled) return;
        if (!car) {
          setState("failed");
          return;
        }
        mountCar(car, carGroup);
        frame(car.length, car.bodyH);
      } else {
        // classic jeep: a clone of the engine-built rig, wheels on y = 0
        const rig = getJeepRig?.() ?? null;
        if (!rig || cancelled) return;
        carGroup.add(rig);
        frame(3.55, 1.7);
      }
      if (!cancelled) setState("ready");
    })();

    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!dragging) targetRotY += 0.45 * clock.getDelta();
      rotY += (targetRotY - rotY) * 0.12;
      carGroup.rotation.y = rotY;
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
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
    };
  }, [vehicleId, rigReady, getJeepRig]);

  if (!hasModel) return <PreviewPlaceholder />;

  return (
    <div className="relative">
      <div
        ref={hostRef}
        className="h-48 w-full touch-none overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(120%_120%_at_50%_0%,#1a2617_0%,#0c120b_70%)]"
      />
      <PreviewStatus state={state} />
      <span className="pointer-events-none absolute right-2.5 top-2.5 rounded bg-black/45 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
        drag to spin
      </span>
    </div>
  );
}
