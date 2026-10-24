import { fmt } from "./util";

export function parkNeed(n) {
  const all = Math.max(1, Math.ceil(n * 0.1));
  const spec =
    n <= 100
      ? Math.max(1, Math.ceil(n * 0.05))
      : n <= 200
        ? Math.ceil(5 + 0.03 * (n - 100))
        : n <= 500
          ? Math.ceil(8 + 0.02 * (n - 200))
          : Math.ceil(14 + 0.01 * (n - 500));
  return { all, spec };
}
export function tiltAngles(g) {
  const z = Math.abs(g.z) || 1e-6;
  return { a: Math.atan2(g.y, z), c: Math.atan2(g.x, z) };
}
export function dirAlong(sa) {
  return Math.abs(sa) < 5
    ? "ровно"
    : sa > 0
      ? "↑ вперёд (к верху телефона) подъём"
      : "↓ вперёд (к верху телефона) спуск";
}
export function dirCross(sc) {
  return Math.abs(sc) < 5 ? "ровно" : sc > 0 ? "→ справа выше, слева ниже" : "← слева выше, справа ниже";
}
export const ratioTxt = pm => (pm > 0 ? "1:" + fmt((1000 / pm).toFixed(1)) : "—");
