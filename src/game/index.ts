/**
 * Entry point for the game engine. Loaded via dynamic import from the client
 * component so PixiJS and the whole engine stay out of the initial bundle.
 */

import { Game } from "./core/game";
import type { Settings } from "./core/types";

export type { Game } from "./core/game";
export type { Settings } from "./core/types";

export async function createGame(opts: {
  canvas: HTMLCanvasElement;
  settings: Settings;
}): Promise<Game> {
  return Game.create(opts);
}
