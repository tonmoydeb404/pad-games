import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { animalHitRumble, JeepInput } from "./input";

describe("gamepad haptics", () => {
  let now = 1000;
  const calls: { t: number; strong: number; duration: number }[] = [];

  beforeEach(() => {
    now = 1000;
    calls.length = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const actuator = {
      playEffect: (_type: string, o: { strongMagnitude: number; duration: number }) => {
        calls.push({ t: now, strong: o.strongMagnitude, duration: o.duration });
        return Promise.resolve("complete");
      },
    };
    vi.stubGlobal("navigator", {
      getGamepads: () => [{ connected: true, id: "pad", buttons: [], axes: [], vibrationActuator: actuator }],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const drive = { speed: 40, maxSpeed: 46.8, rough: 0.5 };

  it("a hit is not cut short by the sustained driving rumble", () => {
    const input = new JeepInput();
    input.rumble(0.8, 300);
    // keep driving through most of the hit (250 of 300 ms), ticking 60 Hz
    for (let i = 0; i < 15; i++) {
      now += 1000 / 60;
      input.update(1 / 60, drive);
    }
    expect(calls.length).toBe(1); // only the impact — nothing replaced it mid-hit
    expect(calls[0].strong).toBeCloseTo(0.8);
    // after it ends, the driving rumble resumes
    now += 400;
    for (let i = 0; i < 20; i++) {
      now += 1000 / 60;
      input.update(1 / 60, drive);
    }
    expect(calls.length).toBeGreaterThan(1);
  });

  it("a stronger hit replaces a weaker one still playing; a weaker one does not", () => {
    const input = new JeepInput();
    input.rumble(0.4, 300);
    now += 50;
    input.rumble(0.9, 300);
    expect(calls.map((c) => c.strong)).toEqual([0.4, 0.9]);
    now += 50;
    input.rumble(0.3, 300);
    expect(calls.length).toBe(2);
  });

  it("animal strikes are felt over the driving rumble, whatever the animal", () => {
    const drivingMax = 0.06 + 1 * 0.28 + 1 * 0.12; // top speed on the roughest ground
    // what animals.ts asks for: 0.25 + mass/2600 (kill), 0.2 + mass/3000 (wallop), 0.2 (bump)
    for (const [asked, ms] of [[0.25, 200], [0.3, 160], [0.2, 90], [0.44, 200], [0.9, 200]] as const) {
      const h = animalHitRumble(asked, ms);
      expect(h.strength).toBeGreaterThan(drivingMax + 0.05);
      expect(h.ms).toBeGreaterThanOrEqual(190);
      expect(h.strength).toBeLessThanOrEqual(1);
    }
    // bigger animals still hit harder
    expect(animalHitRumble(0.9, 200).strength).toBeGreaterThan(animalHitRumble(0.25, 200).strength);
  });

  it("a kill rumble goes through, and the driving rumble waits for it", () => {
    const input = new JeepInput();
    const h = animalHitRumble(0.25, 200);
    input.rumble(h.strength, h.ms);
    for (let i = 0; i < 10; i++) {
      now += 1000 / 60;
      input.update(1 / 60, drive);
    }
    expect(calls.length).toBe(1);
    expect(calls[0].strong).toBeGreaterThan(0.5);
  });
});
