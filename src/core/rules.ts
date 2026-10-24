import { db } from "./storage";
import { fmt } from "./util";
import rulesData from "../data/rules.json";
import type { Kind, Obj, Rule } from "./types";

export const RULES = rulesData as unknown as Rule[];

export const NORMS_VERSION =
  "справка от 24.10.2026: СП 59.13330.2020 (изм. 1–4), СП 140.13330.2024, СП 136.13330.2012, ГОСТ Р 51261-2025, ГОСТ 33652-2019";
export const STATUS = {
  ok: "Подтверждено по тексту СП",
  chk: "Требует сверки с полным текстом",
  empty: "Значение не внесено",
};
export const BST = {
  new: "Новое строительство, завершено после 01.07.2016",
  recon: "Реконструкция завершена после 01.07.2016",
  old: "Введено до 01.07.2016, не реконструировалось",
  unknown: "Статус не уточнён",
};
export const bRelax = (o: Obj | null | undefined) =>
  !!o && (o.bstatus === "recon" || o.bstatus === "unknown");
export function exampleVal(r: Rule) {
  const lo = r.min,
    hi = r.max;
  const v = lo != null && hi != null ? (lo + hi) / 2 : lo != null ? lo : hi;
  return v == null ? "" : String(Math.round(v * 100) / 100).replace(".", ",");
}
const RULE_BY_ID = new Map<string, Rule>(RULES.map(r => [r.id, r]));
export function rule(id: string): Rule | null {
  const r = RULE_BY_ID.get(id);
  if (!r) return null;
  const o = db.overrides[id];
  return o ? Object.assign({}, r, o) : r;
}
/** Заглушка для замера, чьей нормы больше нет в справке: показываем его, но не проверяем. */
export function unknownRule(id: string): Rule {
  return {
    id,
    group: "",
    name: id,
    unit: "",
    min: null,
    max: null,
    amin: null,
    amax: null,
    clause: "",
    doc: "",
    status: "empty",
    note: "",
    cond: "",
  };
}
export function allRules(): Rule[] {
  return RULES.map(r => rule(r.id));
}
export function normText(r: Rule) {
  if (r.min == null && r.max == null) return "нет значения нормы";
  if (r.max == null) return "не менее " + fmt(r.min) + " " + r.unit;
  if (r.min == null) return "не более " + fmt(r.max) + " " + r.unit;
  if (r.min === r.max) return "ровно " + fmt(r.min) + " " + r.unit;
  return "от " + fmt(r.min) + " до " + fmt(r.max) + " " + r.unit;
}
export function relaxText(r: Rule) {
  if (r.amin == null && r.amax == null) return "";
  const lo = r.amin != null ? r.amin : r.min,
    hi = r.amax != null ? r.amax : r.max;
  if (hi == null) return "не менее " + fmt(lo) + " " + r.unit;
  if (lo == null) return "не более " + fmt(hi) + " " + r.unit;
  return "от " + fmt(lo) + " до " + fmt(hi) + " " + r.unit;
}
export function check(r: Rule, v: number, o?: Obj | null): Kind {
  if (r.min == null && r.max == null) return "nonorm";
  const within = (lo, hi) => (lo == null || v >= lo - 1e-9) && (hi == null || v <= hi + 1e-9);
  if (within(r.min, r.max)) return "ok";
  if (o && o.bstatus === "old") return "old";
  if (bRelax(o) && (r.amin != null || r.amax != null)) {
    const lo = r.amin != null ? r.amin : r.min,
      hi = r.amax != null ? r.amax : r.max;
    if (within(lo, hi)) return "relax";
  }
  return "bad";
}
export const RES: Record<Kind, [string, string]> = {
  ok: ["Соответствует", "ok"],
  bad: ["Не соответствует", "bad"],
  relax: ["Допустимо при условии — проверьте условие", "relax"],
  relaxok: ["Допустимо — условие выполнено", "relax"],
  bad2: ["Не соответствует (условие допуска не выполнено)", "bad"],
  old: ["Ниже современной нормы (здание до 01.07.2016)", "old"],
  nonorm: ["Нет нормы в справке — внести", "nonorm"],
};
export function effKind(k: Kind, cond?: boolean | null): Kind {
  if (k === "relax") {
    if (cond === true) return "relaxok";
    if (cond === false) return "bad2";
  }
  return k;
}
export const BADK = ["bad", "bad2", "old", "relax"];
export const rnd = (o: Obj | null | undefined) => (o && o.round) || 1;
export const skipKey = (o, id) => rnd(o) + ":" + id;
export const hasNorm = (r: Rule) => r.min != null || r.max != null;
export const isGood = k => k === "ok" || k === "relaxok";
export const KINDS = [
  ["good", "Соответствует", "#1b7a3a"],
  ["cond", "Допустимо при условии", "#d4a017"],
  ["old", "Ниже нормы (до 2016)", "#e08a1e"],
  ["bad", "Не соответствует", "#c0352b"],
  ["nonorm", "Нет нормы", "#8a93a3"],
];
export const kindOf = k =>
  isGood(k)
    ? "good"
    : k === "relax"
      ? "cond"
      : k === "old"
        ? "old"
        : k === "bad" || k === "bad2"
          ? "bad"
          : "nonorm";
export function ruleBand(r: Rule) {
  const v = [r.min, r.max, r.amin, r.amax].filter(x => x != null && x > 0);
  if (!v.length || r.unit === "шт") return null;
  const lo = Math.min(...v),
    hi = Math.max(...v);
  return { lo: lo / 8, hi: hi * 8, c: Math.sqrt(lo * hi) };
}
export function plausible(r: Rule, v: number) {
  const b = ruleBand(r);
  if (!b) return true;
  if (v < 0) return false;
  if (v === 0) return true;
  return v >= b.lo && v <= b.hi;
}
export function plausFix(r, v) {
  const b = ruleBand(r);
  if (!b || !(v > 0)) return null;
  const cs = [v * 10, v / 10, v * 100, v / 100, v * 1000, v / 1000].filter(x => x >= b.lo && x <= b.hi);
  if (!cs.length) return null;
  cs.sort((a, c) => Math.abs(Math.log(a / b.c)) - Math.abs(Math.log(c / b.c)));
  return Math.round(cs[0] * 100) / 100;
}
export const ACCESS_IDS = new Set([
  "R150",
  "R151",
  "R152",
  "R153",
  "R154",
  "R155",
  "R156",
  "R157",
  "R158",
  "R159",
  "R160",
  "R161",
]);
