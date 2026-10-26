/**
 * Building footprints + heights, kit units (w × d × h, from the build
 * script's dimension report). Width = X extent, depth = Z extent; house
 * fronts face kit −Z.
 */
export const BUILDING_DIMS: Record<string, [w: number, d: number, h: number]> = {
  "building-type-a": [1.3, 1.028, 0.834],
  "building-type-b": [1.828, 1.14, 1.138],
  "building-type-c": [1.286, 1.028, 1.034],
  "building-type-d": [1.756, 1.028, 1.238],
  "building-type-e": [1.3, 1.028, 1.138],
  "building-type-f": [1.428, 1.406, 1.138],
  "building-type-g": [1.45, 1.178, 0.768],
  "building-type-h": [1.3, 0.916, 0.737],
  "building-type-i": [1.286, 1.028, 0.737],
  "building-type-j": [1.37, 0.916, 1.038],
  "building-type-k": [0.921, 1.02, 1.15],
  "building-type-l": [1.034, 1.02, 1.049],
  "building-type-m": [1.428, 1.428, 0.737],
  "building-type-n": [1.784, 1.378, 1.138],
  "building-type-o": [1.27, 1.028, 1.138],
  "building-type-p": [1.24, 0.99, 0.918],
  "building-type-q": [1.24, 0.886, 0.918],
  "building-type-r": [1.028, 1.02, 1.141],
  "building-type-s": [1.406, 1.086, 1.138],
  "building-type-t": [1.314, 1.406, 1.156],
  "building-type-u": [1.428, 1.087, 1.138],
};

/**
 * Road-piece connection tables, kit space: the tile edges that carry
 * asphalt. (+X is right, +Z is "up" in this table — the resolver rotates
 * them, nothing else in the module ever assumes an orientation.)
 */
export const TILE_LINKS: Record<string, [number, number][]> = {
  "road-straight": [
    [1, 0],
    [-1, 0],
  ],
  "road-crossing": [
    [1, 0],
    [-1, 0],
  ],
  "road-crossroad": [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  "road-bend": [
    [1, 0],
    [0, -1],
  ],
  "road-end": [[1, 0]],
};
