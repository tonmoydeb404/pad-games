import type * as THREE from "three";

export const FOLIAGE_RE = /leaf|leaves|flower|grass|petal|plant|fruit/i;

/**
 * Recolour the pack's OBJ-derived GLBs, whose MTLs are Blender-gray (Kd 0.64).
 * Names follow the pack's material naming: `<Family>_Bark`, `<Family>_Leaves`,
 * plain `Flowers` on plants/petals, plain `Rock`. Returns true when matched.
 */
export function recolorConverted(name: string, material: THREE.MeshStandardMaterial): boolean {
  if (/leaves/i.test(name)) {
    if (/pine/i.test(name)) {
      // conifer needles: deep blue-green
      material.color.setHSL(0.33 + Math.random() * 0.03, 0.55, 0.17 + Math.random() * 0.05);
    } else {
      material.color.setHSL(0.28 + Math.random() * 0.05, 0.62, 0.3 + Math.random() * 0.08);
    }
    material.roughness = 0.85;
    return true;
  }
  if (/trunk|bark/i.test(name)) {
    material.color.setHex(/pine/i.test(name) ? 0x50402a : 0x6a5738);
    material.roughness = 0.95;
    return true;
  }
  if (/rock|stone/i.test(name)) {
    material.color.setHSL(0.09, 0.08, 0.45 + Math.random() * 0.1);
    material.roughness = 0.94;
    return true;
  }
  if (/flower|petal/i.test(name)) {
    // untextured plant sprigs / petals → pastel, hue keyed by mesh so a
    // scatter of one model doesn't come out one flat colour
    material.color.setHSL(Math.random(), 0.6, 0.68 + Math.random() * 0.08);
    material.roughness = 0.8;
    return true;
  }
  return false;
}
