/** Lap-time formatting. */


/** Formats seconds as m:ss.cc. */
export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}
