/* Which learning paths have had their completion celebrated on this device, so the confetti shows once. */
const KEY = "tc-celebrated-paths";

export function celebrated(pathId: string) {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]).includes(pathId);
  } catch {
    return false;
  }
}

export function markCelebrated(pathId: string) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
    if (!list.includes(pathId)) localStorage.setItem(KEY, JSON.stringify([...list, pathId].slice(-200)));
  } catch {}
}
