import { RING } from "./constants";
import { addProp, faceYaw, xAxisYaw, type TownCtx } from "./placement";
import type { CityHooks, RoadPose } from "./types";

/**
 * Street furniture: lamps, stop signs, the traffic light, the highway board
 * at the trail junction and power poles along the access road.
 */
export function layoutFurniture(
  ctx: TownCtx,
  junction: CityHooks["junction"],
  roadLength: number,
  roadPose: (d: number) => RoadPose,
): void {
  const prop = (
    model: string,
    dir: "town" | "roads",
    u: number,
    v: number,
    yaw: number,
    cast: boolean,
  ): void => addProp(ctx, model, dir, u, v, yaw, cast);

  // --- street furniture ------------------------------------------------
  // curved lamps outside the ring corners + two at the centre crossing
  for (const su of [-1, 1])
    for (const sv of [-1, 1]) prop("light-curved", "roads", su * (RING + 5.4), sv * (RING + 5.4), faceYaw(-su, -sv), true);
  prop("light-curved", "roads", 4.8, -4.8, faceYaw(-1, 0), true);
  prop("light-curved", "roads", -4.8, 4.8, faceYaw(1, 0), true);

  // stop signs at the ring crossroads: parked at the corner off BOTH
  // street bands (the old offset slid along the cross street, dead centre)
  const stops: [number, number, number, number][] = [
    [RING, 0, -1, 0],
    [-RING, 0, 1, 0],
    [0, RING, 0, -1],
    [0, -RING, 0, 1],
  ];
  for (const [u, v, fx, fz] of stops) {
    const su = -fz;
    const sv = fx;
    prop("road-sign-stop", "roads", u + fx * 5.2 + su * 5.6, v + fz * 5.2 + sv * 5.6, faceYaw(fx, fz), true);
  }

  // traffic light at the centre crossing
  prop("traffic-light", "roads", 4.6, 4.6, faceYaw(-1, 0), true);

  // highway board at the junction, readable from the trail
  {
    const j = junction;
    const nx = -j.tz;
    const nz = j.tx;
    ctx.props.push({
      model: "sign-highway",
      dir: "roads",
      x: j.x + nx * 7.6,
      y: j.y,
      z: j.z + nz * 7.6,
      yaw: Math.atan2(j.tz, -j.tx),
      cast: true,
    });
  }

  // power poles along the access road, crossarms across the road
  for (let d = 26; d < roadLength - 22; d += 42) {
    const pose = roadPose(d);
    const side = Math.floor(d / 42) % 2 === 0 ? 1 : -1;
    const nx = -pose.tz * side;
    const nz = pose.tx * side;
    ctx.props.push({
      model: "electricity-pole",
      dir: "roads",
      x: pose.x + nx * 6.4,
      y: pose.y,
      z: pose.z + nz * 6.4,
      yaw: xAxisYaw(nx, nz),
      cast: true,
    });
  }
}
