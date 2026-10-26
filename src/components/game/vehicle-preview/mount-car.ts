import * as THREE from "three";
import type { LoadedCar } from "@/game/player/cars";

/**
 * Body rides on its own ground plane (y = 0), wheels centered at
 * (x, radius, z) — the same mounting the engine uses.
 */
export function mountCar(car: LoadedCar, group: THREE.Group): void {
  for (const p of car.parts) {
    group.add(new THREE.Mesh(p.geometry, p.material));
  }
  for (const w of car.wheels) {
    for (const p of w.parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.position.set(w.x, w.radius, w.z);
      group.add(m);
    }
  }
}
