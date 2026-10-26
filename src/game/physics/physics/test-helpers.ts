import { HeightGrid } from "../ground";
import { IDLE_INTENT, PhysicsWorld, PropStreamer, TerrainStreamer, VehicleRig, type DriveIntent, type VehicleSpec } from "./index";

export const SPEC: VehicleSpec = {
  mass: 1000,
  length: 3.55,
  width: 1.9,
  wheelR: 0.5,
  axleOff: 0.42,
  wheels: [
    { x: -0.86, z: -1.28 },
    { x: 0.86, z: -1.28 },
    { x: -0.86, z: 1.32 },
    { x: 0.86, z: 1.32 },
  ],
  spring: 130,
  damp: 11,
  comY: -0.3,
  gravity: 20,
};
export const DT = 1 / 60;

export function grid(fn: (x: number, z: number) => number, size = 800, seg = 400): HeightGrid {
  const n = seg + 1;
  const H = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) H[j * n + i] = fn(-size / 2 + (i * size) / seg, -size / 2 + (j * size) / seg);
  return new HeightGrid(size, seg, H);
}

export interface Row {
  t: number;
  x: number;
  y: number;
  z: number;
  fwd: number;
  lat: number;
  wy: number;
  up: number;
  contacts: number;
  clear: number;
}

export interface World {
  pw: PhysicsWorld;
  rig: VehicleRig;
  props: PropStreamer;
  g: HeightGrid;
  run: (secs: number, intent: (t: number, rig: VehicleRig) => Partial<DriveIntent>) => Row[];
}

export function world(
  fn: (x: number, z: number) => number,
  opts: { start?: { x: number; y: number; z: number }; speed?: number; spec?: VehicleSpec } = {},
): World {
  const pw = new PhysicsWorld(20);
  const g = grid(fn);
  const ts = new TerrainStreamer(pw, g, 32, 1);
  const props = new PropStreamer(pw);
  const start = opts.start ?? { x: 0, y: 0, z: 0 };
  start.y = (opts.start ? start.y : g.sample(start.x, start.z) + 0.95) as number;
  ts.update(start.x, start.z, true);
  const rig = new VehicleRig(pw, opts.spec ?? SPEC, start);
  if (opts.speed) rig.body.setLinvel({ x: 0, y: 0, z: -opts.speed }, true);
  const run: World["run"] = (secs, intent) => {
    const rows: Row[] = [];
    for (let t = 0; t < secs; t += DT) {
      const p0 = rig.body.translation();
      ts.update(p0.x, p0.z);
      props.update(p0.x, p0.z);
      rig.drive({ ...IDLE_INTENT, ...intent(t, rig) }, DT);
      pw.step(DT);
      const p = rig.body.translation();
      const s = rig.speeds();
      rows.push({
        t,
        x: p.x,
        y: p.y,
        z: p.z,
        fwd: s.forward,
        lat: s.lateral,
        wy: rig.body.angvel().y,
        up: rig.up().y,
        contacts: rig.contacts,
        clear: p.y - g.sample(p.x, p.z),
      });
    }
    return rows;
  };
  return { pw, rig, props, g, run };
}
