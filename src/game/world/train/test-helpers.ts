import * as THREE from "three";
import { RailPath } from "./rail-path";
import type { TrainHost } from "./types";

export const flat = (): RailPath => RailPath.build(() => 0);

export interface Spy {
  puffs: number;
  whistles: number;
  rams: { closing: number }[];
  boxes: { added: number; moved: number; removed: number };
}

export function makeSpyHost(rail: RailPath, crossings: { x: number; z: number }[] = []): { host: TrainHost; spy: Spy } {
  const spy: Spy = { puffs: 0, whistles: 0, rams: [], boxes: { added: 0, moved: 0, removed: 0 } };
  const host: TrainHost = {
    scene: new THREE.Scene(),
    rail,
    crossings,
    puff: () => {
      spy.puffs++;
    },
    whistle: () => {
      spy.whistles++;
    },
    onRam: (closing) => {
      spy.rams.push({ closing });
    },
    addBox: () => {
      spy.boxes.added++;
    },
    moveBox: () => {
      spy.boxes.moved++;
    },
    removeBox: () => {
      spy.boxes.removed++;
    },
    camRight: (out) => out.set(1, 0, 0),
  };
  return { host, spy };
}
